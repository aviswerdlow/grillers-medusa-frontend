/**
 * Decide what the /store page should do when it resolves ZERO visible products.
 *
 * The catalog fetcher (`getStoreProducts`) returns an empty array in two very
 * different situations, and they must NOT be treated the same:
 *
 *  1. Strapi errored/timed out (its `onLoadFailure` fired with `recovered:false`).
 *     This is transient. Hard-failing here is what let a Strapi slowdown take the
 *     browse page down AND block every deploy (the build prerenders /store).
 *  2. Strapi responded fine but the catalog is genuinely empty. That IS a real
 *     problem worth failing loudly on — we should never ship an empty store.
 *
 * Outcomes:
 *  - "fail_empty"      → genuine empty catalog: throw (fail the build + error at
 *                        runtime) so a real catalog outage is loud and un-shippable.
 *  - "render_soft"     → transient failure without a cached catalogue: render
 *                        navigation and a retry state. The loader already uses
 *                        a last-successful catalogue when one is available.
 */
export type EmptyStoreCatalogDecision = "fail_empty" | "render_soft"

export function resolveEmptyStoreCatalogDecision(input: {
  /** True when getStoreProducts' onLoadFailure fired unrecovered (both queries failed). */
  loadFailed: boolean
  /** True during `next build` (process.env.NEXT_PHASE === "phase-production-build"). */
  isBuildPhase: boolean
}): EmptyStoreCatalogDecision {
  if (!input.loadFailed) {
    // Strapi answered; the catalog is really empty. Fail loudly everywhere.
    return "fail_empty"
  }
  // Strapi errored/timed out — transient. Never hard-fail on this.
  return "render_soft"
}

export { isProductionBuildPhase } from "@lib/util/build-context"
