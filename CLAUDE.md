# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 15 e-commerce storefront for Grillers, built with the Medusa.js v2 backend. It integrates with Strapi CMS for content management and Algolia for search functionality.

## Development Commands

```bash
yarn dev                # Start dev server with Turbopack on port 8000
yarn build              # Build production bundle (runs next-sitemap postbuild)
yarn start              # Start production server on port 8000
yarn lint               # Run ESLint
yarn analyze            # Analyze bundle size (sets ANALYZE=true)
```

### Testing

```bash
yarn test               # Run Jest unit tests
yarn test:watch         # Run Jest in watch mode
yarn test:coverage      # Run Jest with coverage (50% threshold for branches/functions/lines/statements)
yarn test:e2e           # Run Playwright E2E tests (auto-starts dev server)
yarn test:e2e:ui        # Playwright with interactive UI
yarn test:e2e:headed    # Playwright in headed browser mode
```

Running a single Jest test:
```bash
npx jest path/to/file.test.tsx              # by file path
npx jest --testPathPattern=ComponentName    # by pattern match
```

- Jest config: `jest.config.js` (jsdom environment, path aliases mapped in moduleNameMapper)
- Jest setup: `jest.setup.js` (mocks Next.js Navigation, Image, IntersectionObserver)
- Playwright config: `playwright.config.ts` (tests in `/e2e/`, multi-browser: Chromium, Firefox, WebKit, mobile)

## Required Environment Variables

Critical variables that must be set:
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` - Medusa publishable API key (enforced at build time by `check-env-variables.js`)
- `MEDUSA_BACKEND_URL` - Medusa backend URL (defaults to http://localhost:9000)
- `STRAPI_ENDPOINT` - Strapi CMS endpoint
- `STRAPI_API_TOKEN` - Strapi authentication token
- `ALGOLIA_APPLICATION_ID` - Algolia app ID
- `ALGOLIA_SEARCH_API_KEY` - Algolia search API key
- `NEXT_PUBLIC_STRIPE_KEY` - Stripe public key for payment processing
- `NEXT_PUBLIC_DEFAULT_REGION` - Default country code fallback (defaults to "us")
- `NEXT_PUBLIC_BASE_URL` - Storefront URL for metadata/SEO
- `REVALIDATE_SECRET` - On-demand ISR revalidation secret

## Architecture Overview

### Routing Structure
The app uses Next.js 15 App Router with all storefront routes nested under `[countryCode]`:

- `src/app/[countryCode]/(main)/` - Public storefront (store, collections, products, recipes, account, wishlist)
- `src/app/[countryCode]/(checkout)/` - Checkout flow with separate layout (checkout, fulfillment steps)
- Account section uses **parallel routes** (`@dashboard` and `@login`) for conditional rendering based on auth state

### Medusa SDK
The SDK singleton is initialized in `src/lib/config.ts` — import as `import { sdk } from "@lib/config"`. Middleware runs on Edge Runtime and **cannot** use the SDK; it uses raw `fetch` against `MEDUSA_BACKEND_URL` instead.

### Server Actions Pattern
All data fetching functions in `src/lib/data/*.ts` use the `"use server"` directive. This is the primary data access pattern — every Medusa SDK call and external API interaction goes through server actions. Key files:
- `cart.ts`, `products.ts`, `customer.ts`, `orders.ts`, `payment.ts`, `fulfillment.ts`, `regions.ts`, `favorites.ts`, `wishlist.ts`
- `cookies.ts` — helpers for cart ID, auth headers, and cache tag management
- All Strapi fetchers in `src/lib/data/strapi/` (15+ files for collections, recipes, PDPs, SEO, analytics, etc.)

### Caching Strategy
- Cookie-based session management (`_medusa_cache_id` for region, cart ID for cart)
- `force-cache` with cache tags for revalidation (e.g., `regions-{cacheId}`, `carts`)
- On-demand revalidation via `revalidateTag()` after mutations

### Middleware (`src/middleware.ts`)
Country detection priority:
1. URL path first segment (if valid region)
2. Vercel IP header `x-vercel-ip-country`
3. `NEXT_PUBLIC_DEFAULT_REGION` env var (defaults to "us")
4. First available region as fallback

Uses in-memory region map with 1-hour TTL. Skips static assets (files with dots).

### Key Integration Points

1. **Medusa Backend** — Product catalog, cart, checkout, customer accounts, orders, region/country management
2. **Strapi CMS** (GraphQL via `graphql-request`) — Homepage, collections metadata, recipes, PDP enriched content, header/footer, SEO, analytics config, testimonials, announcements, cookie consent
3. **Algolia** — Product search with faceted filtering, collection page search
4. **Stripe** — Launch checkout exposes Stripe credit cards only. Do not add iDEAL, Bancontact, PayPal, manual/offline payment, or wallet messaging unless the backend contract and launch decision explicitly change. The current provider gate is `isStripe()` in `src/lib/constants.tsx`.
5. **Jitsu + GTM/Analytics** — First-party Jitsu eventing lives in `src/lib/jitsu.ts`; GTM/GA4 helpers live in `src/lib/gtm.ts`. Preserve server-side `order_completed` as the purchase source rather than firing it from confirmation-page client code.

### Module Organization

- `src/modules/` — Feature-based modules, each with `components/` and `templates/` subdirectories. Templates compose components into page-level layouts.
- `src/lib/data/` — Server action data fetchers organized by domain
- `src/lib/hooks/` — Custom React hooks (add-to-cart, product metadata, form persistence, in-view, etc.)
- `src/lib/util/` — Utilities (price formatting, SEO, GTM, product helpers, address comparison, etc.)
- `src/lib/context/` — React contexts (modal, analytics, cookie consent, fulfillment edit)

### Styling and UI

- **Tailwind CSS** with `@medusajs/ui-preset` as base preset and `tailwindcss-radix` plugin
- **Custom brand colors**: IsraelBlue, RichGold, Teal, Crimson, VibrantRed, etc. (14 brand colors)
- **Custom fonts**: rexton, maison-neue, maison-neue-mono (in `src/styles/fonts/`)
- **Extended breakpoints**: 2xsmall (320px) through 2xlarge (1920px)
- **@medusajs/ui** and **@headlessui/react** component libraries

### TypeScript Configuration

- Strict mode enabled
- Path aliases: `@lib/*` → `src/lib/*`, `@modules/*` → `src/modules/*`, `@pages/*` → `src/pages/*`
- Build errors are ignored (`ignoreBuildErrors: true` in next.config.js)
- ESLint errors are ignored during builds (`ignoreDuringBuilds: true`)

### Error Handling

- Error boundaries at multiple levels: `src/app/error.tsx`, `src/app/global-error.tsx`, checkout-specific error boundary
- Medusa error utility at `src/lib/util/medusa-error.ts` for API error handling
