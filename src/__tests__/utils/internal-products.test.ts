import { hitToProduct } from "@lib/algolia/hit-to-product"
import {
  isInternalRawMaterialSku,
  isInternalMedusaProduct,
  isInternalStrapiProduct,
} from "@lib/util/internal-products"
import { compactCollectionProducts } from "@lib/util/collection-product"
import { buildAgenticCommerceProductFeed } from "@lib/agentic-commerce/feed"
import {
  isWaitlistEligible,
  isCatalogLifecyclePurchasable,
} from "@lib/util/waitlist-eligibility"

describe("internal raw-material products", () => {
  it("retains internal lifecycle through collection and search compaction after SKU renames", () => {
    for (const parent of [true, false]) {
      const p: any = {
        documentId: "internal",
        Title: "Renamed",
        MedusaProduct: {
          ProductId: "prod_1",
          Handle: "renamed",
          ...(parent ? { AvailabilityLifecycle: "internal_only" } : {}),
          Variants: [
            {
              VariantId: "variant_1",
              Sku: "retail-name",
              AvailabilityLifecycle: parent ? "active" : "internal_only",
            },
          ],
        },
      }
      expect(compactCollectionProducts([p])).toEqual([])
      expect(hitToProduct({ objectID: "internal", ...p })).toBeNull()
    }
  })

  it("internal lifecycle at either level defeats conflicting aliases and explicit waitlist flags", () => {
    const metadata = {
      availability_lifecycle: "active",
      AvailabilityLifecycle: "internal_only",
      waitlist_enabled: true,
    }
    expect(
      isWaitlistEligible({
        productMetadata: metadata,
        variantMetadata: { availability_lifecycle: "active" },
      })
    ).toBe(false)
    expect(isCatalogLifecyclePurchasable({ variantMetadata: metadata })).toBe(
      false
    )
    expect(
      isWaitlistEligible({
        strapiProduct: { AvailabilityLifecycle: "internal_only" },
        strapiVariant: { WaitlistEnabled: true },
      })
    ).toBe(false)
  })

  it("omits whole mixed and renamed internal products from feeds while retaining retail OOS and identity", () => {
    const retail: any = {
      id: "retail",
      title: "Beef",
      handle: "beef",
      metadata: { qbd_list_id: "stable" },
      variants: [
        { id: "v1", sku: "01", inventory_quantity: 0, manage_inventory: true },
      ],
    }
    const mixed = {
      ...retail,
      id: "mixed",
      variants: [...retail.variants, { id: "raw", sku: " RM-raw " }],
    }
    const renamed = {
      ...retail,
      id: "renamed",
      metadata: { availability_lifecycle: "internal_only" },
    }
    const original = JSON.stringify(retail)
    const feed = buildAgenticCommerceProductFeed([retail, mixed, renamed], {
      baseUrl: "https://example.com",
      countryCode: "us",
    })
    expect(feed.products.map((p) => p.product_id)).toEqual(["retail"])
    expect(feed.products[0].availability).toBe("out_of_stock")
    expect(JSON.stringify(retail)).toBe(original)
  })
  it("recognizes RM SKUs case-insensitively", () => {
    expect(isInternalRawMaterialSku("RM-05-MVMR")).toBe(true)
    expect(isInternalRawMaterialSku(" rm-as-1750 ")).toBe(true)
    expect(isInternalRawMaterialSku("10-17-03-1")).toBe(false)
    expect(isInternalRawMaterialSku(null)).toBe(false)
  })

  it("detects RM SKUs on Medusa products and Strapi products", () => {
    expect(
      isInternalMedusaProduct({
        variants: [{ sku: "RM-91-BS" }],
      } as any)
    ).toBe(true)
    expect(
      isInternalStrapiProduct({
        MedusaProduct: { Variants: [{ Sku: "RM-91-BS" }] },
      } as any)
    ).toBe(true)
  })

  it("filters RM products out of collection adapters", () => {
    const products = compactCollectionProducts([
      {
        documentId: "customer-facing",
        Title: "Ground Beef",
        MedusaProduct: {
          ProductId: "prod_1",
          Handle: "ground-beef",
          Variants: [{ VariantId: "variant_1", Sku: "1-01-01-1" }],
        },
      },
      {
        documentId: "raw-material",
        Title: "Raw Material",
        MedusaProduct: {
          ProductId: "prod_rm",
          Handle: "raw-material",
          Variants: [{ VariantId: "variant_rm", Sku: "RM-05-MVMR" }],
        },
      },
    ] as any)

    expect(products.map((product) => product.documentId)).toEqual([
      "customer-facing",
    ])
  })

  it("drops RM Algolia hits", () => {
    expect(
      hitToProduct({
        objectID: "raw-material",
        Title: "Raw Material",
        MedusaProduct: {
          ProductId: "prod_rm",
          Handle: "raw-material",
          Variants: [{ VariantId: "variant_rm", Sku: "RM-AS-1750" }],
        },
      })
    ).toBeNull()
  })
})
