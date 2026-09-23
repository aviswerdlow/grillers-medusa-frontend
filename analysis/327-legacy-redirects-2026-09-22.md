# Legacy redirect manifest — #327

Tracking: https://github.com/aviswerdlow/grillers-pride-strategy/issues/327

A read-only graph crawl started at `https://www.grillerspride.com/Home.jsp` on September 22, 18:50 UTC and completed at 19:04 UTC. It enumerated 639 URLs: 375 product URLs (including alternate slugs for the same ListID), 201 category URLs and 63 informational/alias URLs. All product and category pages returned HTTP 200. Thirteen malformed relative `/SPD/WSWrapper.jsp` links returned HTTP 500; their correctly rooted informational pages returned 200. These failures remain in the inventory rather than being erased.

`src/lib/data/legacy-redirect-manifest.json` contains every URL, query, source hash, ListID, disposition, destination or specific owner/input. `legacy-listid-sku-map.json` bundles the current CMS identity and SKU map, cross-checked against public Medusa membership. The join uses ListID, never a guessed product title or a seasonal SKU prefix. The loader refuses duplicate identities, internal/RM items, absent public membership and disagreeing CMS/Medusa handles or ListIDs.

The prepared rules redirect 307 product URLs, 45 equivalent categories and 21 home/informational aliases directly to current routes. The crawled `/Home.jsp?refresh=true` row remains in the 639-URL inventory as `covered`: the unconditional `/Home.jsp` rule already redirects it, so no shadowed rule is emitted. The remaining 265 rows are explicit holds: 68 product successors require Peter/catalogue-owner resolution; 156 category subsets require an equivalent destination preserving their brand, certification or offer scope; 41 additional informational/legacy recipe/local-schedule paths require a content-identity decision. Holding a row is not a declaration that it is retired. No blanket homepage fallback or invented 410 is emitted.

`next.config.js` consumes only resolved rows. Fixture tests exercise all emitted paths with Next's own route matcher, exact query semantics under both URL encodings, mixed case, stable identities, holds, unsafe destinations, duplicates and loops. Rules use permanent redirects. Existing current handles and unrelated redirects are retained.

Rebuild using the strategy repository's `scripts/launch-redirects/build_manifest.py` and its checked-in public crawl/catalogue snapshots. Complete the remaining owner decisions in that generator, regenerate both files and rerun the fixtures. Preview and final-host destination/canonical checks are separate acceptance evidence. The manifest is complete as an inventory, not approved for whole-site cutover.
