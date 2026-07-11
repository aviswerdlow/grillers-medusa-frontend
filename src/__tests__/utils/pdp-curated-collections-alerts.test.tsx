import {
  getCuratedCollectionCards,
  getCuratedCollectionsBySlugs,
} from "@lib/data/strapi/curated-collections"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import PairsWellWith from "@modules/products/components/pairs-well-with"

jest.mock("@lib/data/strapi/curated-collections", () => ({
  getCuratedCollectionCards: jest.fn(),
  getCuratedCollectionsBySlugs: jest.fn(),
  getCollectionProducts: jest.fn(() => []),
  MAX_CURATED_COLLECTION_CANDIDATES: 6,
}))

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: jest.fn(async () => ({ ok: true, skipped: false })),
}))

jest.mock(
  "@modules/products/components/pairs-well-with/add-bundle-button",
  () => ({
    __esModule: true,
    default: () => null,
  })
)

const mockGetCuratedCollectionCards =
  getCuratedCollectionCards as jest.MockedFunction<
    typeof getCuratedCollectionCards
  >
const mockGetCuratedCollectionsBySlugs =
  getCuratedCollectionsBySlugs as jest.MockedFunction<
    typeof getCuratedCollectionsBySlugs
  >
const mockEmitStorefrontOpsAlert =
  emitStorefrontOpsAlert as jest.MockedFunction<typeof emitStorefrontOpsAlert>

describe("PDP curated collections alerting", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("alerts and suppresses only the PDP rail when curated collection rendering fails", async () => {
    mockGetCuratedCollectionCards.mockRejectedValueOnce(
      new Error("render failed for shopper@example.com prod_bundle")
    )

    const result = await PairsWellWith({
      countryCode: "us",
      recommendationVariant: "single_best_match",
      product: {
        id: "prod_current",
        handle: "ground-beef",
        title: "Ground Beef",
        description: "Ground beef",
      } as any,
    })

    expect(result).toBeNull()
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "curated_collections_render_failed",
        severity: "warn",
        title: "Curated collections render failed on pdp",
        fingerprint: "curated_collections:render:pdp:failed",
        meta: expect.objectContaining({
          content_surface: "curated_collections",
          operation: "render",
          surface: "pdp",
          country_code: "us",
          product_handle: "ground-beef",
          recommendation_variant: "single_best_match",
          error_message: "render failed for [redacted-email] [redacted-id]",
        }),
      })
    )
    const alertCalls = JSON.stringify(mockEmitStorefrontOpsAlert.mock.calls)
    expect(alertCalls).not.toContain("shopper@example.com")
    expect(alertCalls).not.toContain("prod_bundle")
  })

  it("passes a ranked candidate window so invalid top cards can be replaced", async () => {
    mockGetCuratedCollectionCards.mockResolvedValueOnce([
      {
        documentId: "generic",
        Name: "Generic",
        Slug: "generic",
        ShortDescription: "Generic",
        CollectionType: "sku_backed",
        Occasion: "starter",
        IsActive: true,
        SortOrder: 1,
      },
      {
        documentId: "ground",
        Name: "Ground picks",
        Slug: "ground-picks",
        ShortDescription: "Ground picks",
        CollectionType: "sku_backed",
        Occasion: "starter",
        IsActive: true,
        SortOrder: 20,
        PdpMatchKeywords: ["ground beef"],
      },
    ] as any)
    mockGetCuratedCollectionsBySlugs.mockResolvedValueOnce([])

    await PairsWellWith({
      countryCode: "us",
      recommendationVariant: "single_best_match",
      product: {
        id: "prod_current",
        handle: "ground-beef",
        title: "Ground Beef",
        description: "Ground beef",
      } as any,
    })

    expect(mockGetCuratedCollectionsBySlugs).toHaveBeenCalledWith({
      slugs: ["ground-picks", "generic"],
      countryCode: "us",
      currentProductHandle: "ground-beef",
      targetCount: 1,
      alertSurface: "pdp",
    })
  })
})
