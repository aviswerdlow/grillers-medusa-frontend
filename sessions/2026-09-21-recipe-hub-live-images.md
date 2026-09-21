# Recipe hub live images — blocked verification checkpoint

Branch: `codex/recipe-hub-live-images`

Base: `origin/main` at `730989c3e724aad6749dfcb7db0dc035cce01796`.

Work is isolated in a new worktree. No existing worktree files were edited.

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
- Existing production build logs show the hub as `● /[countryCode]/recipes`, with `/us/recipes` generated, and detail pages as dynamic. The changed branch still needs a build to verify preservation of the hub rendering mode.
- Confirmed the active Vercel project is `griller-s-pride/grillers-medusa-frontend`; the similarly named personal project is stale. Preview configuration is available in ignored local files.

## Blocking required gate

`npm run lint` fails before reporting source findings. The repository pins ESLint 8.10.0 while its Next.js plugin expects newer rule-context properties:

1. Initial failure: `@next/next/no-html-link-for-pages` — `The "path" argument must be of type string. Received undefined` (`context.cwd`).
2. One targeted configuration retry explicitly supplied the Next root directory. The next rule, `@next/next/no-img-element`, then failed with `Cannot read properties of undefined (reading 'replace')` (`context.filename`).

The unsuccessful configuration change was removed. No dependency or lint-rule changes are included. Work stopped under the repository instruction to stop after a repeated or substantially similar blocker.

## Remaining before merge approval

Resolve the existing ESLint/plugin compatibility issue, then run the lint gate and any checks invalidated by that fix. Obtain and inspect the branch preview, verify the hub on page 1, page 5, a bucket and search at 1440 px and 375 px, compare card/detail URLs in HTML, check the invalid-host local fallback, confirm rendering/cache behavior, and complete the adversarial review.

This is a checkpoint, not a merge-ready or production-verified result. No merge or production deployment is authorized by this checkpoint.
