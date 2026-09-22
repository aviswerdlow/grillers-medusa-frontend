# Indexing and canonical policy — #328

Tracking: https://github.com/aviswerdlow/grillers-pride-strategy/issues/328

Production uses `NEXT_PUBLIC_CANONICAL_BASE_URL` (or `NEXT_PUBLIC_PRODUCTION_BASE_URL`) as the authoritative origin for page metadata, social URLs and sitemap entries. That setting wins over a stale temporary `NEXT_PUBLIC_BASE_URL`. Values must be HTTP(S) origins without credentials, path, query or fragment. The .com apex-versus-www decision remains Avi's #339 configuration input; this source change does not choose it.

A Vercel preview uses its own environment URL, even if production values were copied into its environment. Preview/non-production responses have `X-Robots-Tag: noindex, nofollow`, robots disallows `/`, and sitemap generation publishes no URLs. This response header also covers child pages that supply their own index metadata. A production deployment becomes indexable only with an explicit HTTPS canonical host outside vercel.app.

Production robots and response headers exclude account, cart, checkout, order and API paths, including `/us/` and other two-letter locales. Sitemap filtering rejects those paths, percent-encoded private names, legacy JSP/SPD paths, query/fragment URLs and duplicates. Authentication and existing private-page noindex metadata are retained. Public sitemap product eligibility still uses the existing lifecycle/internal-item filters and source-failure rules.

Validation: 26 focused tests passed, covering canonical precedence, preview isolation, private and public URL matrices, Next header-route matching, malformed origins, preview empty sitemap, production private filtering and existing catalogue failure behavior. TypeScript passed. Preview HTTP evidence is linked from the issue after deployment; Search Console and the approved real host remain #339 execution checks.
