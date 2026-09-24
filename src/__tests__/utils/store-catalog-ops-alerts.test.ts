import {
  emitStoreCatalogEmptyAlert,
  emitStoreCatalogInventoryMissingAlert,
  emitStoreCatalogLoadFailureAlert,
} from "@lib/store-catalog-ops-alerts"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: jest.fn(async () => ({ ok: true, skipped: false })),
}))

const mockEmitStorefrontOpsAlert =
  emitStorefrontOpsAlert as jest.MockedFunction<typeof emitStorefrontOpsAlert>

describe("store catalog ops alerts", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("emits a warn alert when the legacy query recovers the store catalog", async () => {
    await emitStoreCatalogLoadFailureAlert({
      stage: "primary",
      error: new Error("GraphQL 504"),
      timeoutMs: 8000,
      recovered: true,
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "store_catalog_load_degraded",
        severity: "warn",
        fingerprint: "store_catalog:primary:degraded",
        dedupeWindowMs: 300000,
        path: "src/lib/data/strapi/collections.ts",
        meta: expect.objectContaining({
          catalog_surface: "store",
          stage: "primary",
          recovered: true,
          timeout_ms: 8000,
          error_message: "Error: GraphQL 504",
        }),
      })
    )
  })

  it("emits a page alert when every store catalog query fails", async () => {
    await emitStoreCatalogLoadFailureAlert({
      stage: "legacy",
      error: new Error("legacy unavailable"),
      primaryError: new Error("primary unavailable"),
      timeoutMs: 8000,
      recovered: false,
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "store_catalog_load_failed",
        severity: "page",
        fingerprint: "store_catalog:legacy:failed",
        dedupeWindowMs: 300000,
        meta: expect.objectContaining({
          stage: "legacy",
          recovered: false,
          primary_error_message: "Error: primary unavailable",
        }),
      })
    )
  })

  it("does not let a recovered warning suppress an unrecovered page for the same stage", async () => {
    const input = {
      stage: "primary" as const,
      error: new Error("Strapi unavailable"),
      timeoutMs: 8000,
    }
    await emitStoreCatalogLoadFailureAlert({ ...input, recovered: true })
    await emitStoreCatalogLoadFailureAlert({ ...input, recovered: false })
    expect(mockEmitStorefrontOpsAlert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fingerprint: "store_catalog:primary:degraded",
        severity: "warn",
      })
    )
    expect(mockEmitStorefrontOpsAlert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fingerprint: "store_catalog:primary:failed",
        severity: "page",
      })
    )
  })

  it("emits a page alert when the store catalog resolves empty", async () => {
    await emitStoreCatalogEmptyAlert({
      rawCount: 0,
      visibleCount: 0,
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "store_catalog_empty",
        severity: "page",
        fingerprint: "store_catalog:empty",
        path: "src/app/[countryCode]/(main)/store/page.tsx",
        meta: expect.objectContaining({
          catalog_surface: "store",
          raw_product_count: 0,
          visible_product_count: 0,
        }),
      })
    )
  })

  it("emits a warn alert when store cards are missing live inventory observations", async () => {
    await emitStoreCatalogInventoryMissingAlert({
      productCount: 1,
      variantCount: 2,
      examples: [
        {
          productId: "prod_123",
          productTitle: "Kosher Chuck Roast",
          variantId: "variant_123",
          sku: "1-01-01-1",
        },
      ],
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "store_catalog_inventory_missing",
        severity: "warn",
        fingerprint: "store_catalog:inventory_missing",
        path: "src/app/[countryCode]/(main)/store/page.tsx",
        meta: expect.objectContaining({
          catalog_surface: "store",
          product_count: 1,
          variant_count: 2,
          examples: [
            expect.objectContaining({
              productId: "prod_123",
              variantId: "variant_123",
            }),
          ],
        }),
      })
    )
  })
})
