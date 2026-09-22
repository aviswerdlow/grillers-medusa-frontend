import {
  resolveEmptyStoreCatalogDecision,
  isProductionBuildPhase,
} from "@lib/store-catalog-resolution"

describe("resolveEmptyStoreCatalogDecision", () => {
  it("fails loudly when Strapi responded but the catalog is genuinely empty", () => {
    // loadFailed=false → onLoadFailure never fired → Strapi returned a real empty set.
    expect(
      resolveEmptyStoreCatalogDecision({
        loadFailed: false,
        isBuildPhase: false,
      })
    ).toBe("fail_empty")
    expect(
      resolveEmptyStoreCatalogDecision({
        loadFailed: false,
        isBuildPhase: true,
      })
    ).toBe("fail_empty")
  })

  it("renders a retry state when a cold runtime has no cached catalogue", () => {
    expect(
      resolveEmptyStoreCatalogDecision({
        loadFailed: true,
        isBuildPhase: false,
      })
    ).toBe("render_soft")
  })

  it("renders the shell (does NOT fail the build) on a transient Strapi failure at build time", () => {
    // A Strapi outage during `next build` must not block the deploy; ISR repopulates
    // /store within `revalidate` once Strapi recovers.
    expect(
      resolveEmptyStoreCatalogDecision({ loadFailed: true, isBuildPhase: true })
    ).toBe("render_soft")
  })
})

describe("isProductionBuildPhase", () => {
  it("is true only during a Next production build", () => {
    expect(
      isProductionBuildPhase({ NEXT_PHASE: "phase-production-build" })
    ).toBe(true)
    expect(
      isProductionBuildPhase({ NEXT_PHASE: "phase-production-server" })
    ).toBe(false)
    expect(isProductionBuildPhase({})).toBe(false)
  })
})
