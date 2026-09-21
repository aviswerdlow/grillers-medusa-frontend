# Recipe hub live images — preview verified, awaiting merge approval

Branch: `codex/recipe-hub-live-images`

Base: `origin/main` at `730989c3e724aad6749dfcb7db0dc035cce01796`.

Work is isolated in a new worktree. No existing worktree files were edited.

Verified implementation commit: `e9033800a08726b60430d26c8ea6e1299e03b73b`.

Preview: https://grillers-medusa-frontend-pylnrhzrr-griller-s-pride.vercel.app/us/recipes

Vercel project: `griller-s-pride/grillers-medusa-frontend`. Deployment `dpl_GvSxNxzaovWD2KXE77VJ2mRKfbH2` is Ready and its GitHub status is successful. This follow-up updates verification documentation only.

## Implemented

- Load published recipe `Slug` and `Image.url` through `recipes_connection`, in pages of 100, with the existing hub placeholder filters.
- Cache each page under `recipe-hub-images`, owned by the product cache tag already invalidated by recipe publish webhooks.
- Apply an exported, pure image overlay before filtering, pagination, JSON-LD generation, and both recipe collection props.
- Preserve snapshot images for missing live images and all lookup failures. Bound the whole lookup to 12 seconds, log once per failed lookup, and stop pagination on failure.
- Add overlay, pagination, failure, timeout, and cache-tag tests, plus a staff content-guide note.
- Leave the generated snapshot JSON, dependencies, route segments, and `revalidate = 300` unchanged.

## Completed checks

- `npm test -- --runInBand`, with the existing Vercel preview environment loaded: **144 suites / 664 tests passed** (15.686 seconds).
- Repository TypeScript gate, `npx tsc --noEmit`: **passed**.
- `git diff --check`: **passed**.
- Read-only Strapi pagination check: **801 images**, including **792** `gp_kitchen_20260909` URLs and **9** remaining `remediated` URLs. Nine small requests completed in **6.447 seconds**; the first response was approximately 25 KB.
- Both production and the verified preview build list the hub as `● /[countryCode]/recipes`, with `/us/recipes` generated, and detail pages as dynamic. The hub keeps `revalidate = 300`.
- Confirmed the active Vercel project is `griller-s-pride/grillers-medusa-frontend`; the similarly named personal project is stale. Preview configuration is available in ignored local files.

## Owner-waived lint gate

`npm run lint` fails before reporting source findings. The repository pins ESLint 8.10.0 while its Next.js plugin expects newer rule-context properties:

1. Initial failure: `@next/next/no-html-link-for-pages` — `The "path" argument must be of type string. Received undefined` (`context.cwd`).
2. One targeted configuration retry explicitly supplied the Next root directory. The next rule, `@next/next/no-img-element`, then failed with `Cannot read properties of undefined (reading 'replace')` (`context.filename`).

The unsuccessful configuration change was removed. No dependency or lint-rule changes are included. The owner subsequently waived this gate for this branch, confirmed it is already broken on main, and reported that changed files lint clean with ESLint 8.57.1 using the repository config. The separate repair is tracked at https://github.com/aviswerdlow/grillers-pride-strategy/issues/377.

## Preview browser and HTML verification

Checked with Chromium at 1440×900 and 375×812. All eight cases returned HTTP 200, showed the expected filter/page state, loaded every visible recipe image, produced no browser page errors, and had no horizontal overflow. Screenshots of every case were inspected.

| View | Rendered card images | Approved `gp_kitchen_20260909` images | Older images |
| --- | ---: | ---: | ---: |
| `/us/recipes` | 38 | 36 | 2 |
| `/us/recipes?page=5` | 38 | 36 | 2 |
| `/us/recipes?bucket=weeknight-dinner` | 10 | 9 | 1 |
| `/us/recipes?q=brisket` | 10 | 10 | 0 |

Counts are identical at both widths; the featured card is hidden on mobile, so visible-image counts are one lower there.

Across both viewports, **192 card-image occurrences and 384 JSON-LD recipe-image occurrences matched the published Strapi image map, with zero mismatches**. Six detail pages were checked in HTML, comparing the rendered hero image and Recipe JSON-LD with the corresponding card URL; all six matched.

The two older card images are **Aaron's Turkey Hot Dogs with Orange Carrot Slaw** and **Beef Boerewors Coil with Pap and Tomato Onion Smoor**. Their detail pages also still use those same `remediated` images. No checked card retained an old image where the detail page had a `gp_kitchen_20260909` image. Recipe slugs themselves may still contain `remediated`; the check compared image URLs, not slugs.

The preview's `/api/revalidate` read-only smoke also reports `secretConfigured: true`. No Strapi content was edited and no production cache was invalidated during verification.

## Local fail-open and cache verification

- Started the hub with `STRAPI_ENDPOINT=https://recipe-hub.invalid` and an empty recipe-image cache. `/us/recipes` returned **HTTP 200**, the hub heading and **38 snapshot card images**, with **zero** new kitchen image URLs and **one** recipe-image fallback warning.
- The default Turbopack development command hit an existing favicon decoder error before executing the route. The successful check used ordinary Next.js development mode with Webpack; no favicon or development configuration changes were made.
- Restarted with the real endpoint and a temporary external fetch observer that counted only the image-query operation, without recording credentials or request bodies. The first render issued **9** upstream recipe-image requests. A subsequent `/us/recipes?page=5` render issued **0** and still returned published kitchen images. Both returned HTTP 200; the second completed in 460 ms.
- The temporary development server and verification browser were stopped after checking.

## Adversarial diff review

No actionable findings remain. Reviewed the loader, cache wrapper/tag ownership, webhook mapping, page ordering, collection consumers, pure helper, timeout implementation, call sites, and tests. Confirmed published-only reads use `Image`, pagination is complete, failure/timeout returns an empty map with one warning, missing images preserve snapshots, inputs are not mutated, both collection props and JSON-LD receive overlaid data, and module imports remain on server paths. The preview build and local request-count check corroborate cache behavior.

No snapshot JSON, dependency, lint configuration, Next configuration, or dynamic-segment directory changes are included.

Local screenshots and detailed JSON evidence are preserved under:

`/Users/aviswerdlow/.codex/visualizations/2026/09/21/01a0c5f0-178c-7883-8ccf-3612c013187c/recipe-hub-live-images/`

Verification is complete under the owner's lint waiver. No merge or production deployment has been performed. Await the owner's explicit go-ahead before merging.
