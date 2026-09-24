jest.mock("server-only", () => ({}))

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheOptions } from "@lib/data/cookies"
import { enrichStrapiProductsWithMedusaPrices } from "@lib/data/products"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"

jest.mock("@lib/config", () => ({
  sdk: {
    client: {
      fetch: jest.fn(),
    },
  },
}))

jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(),
  getCacheOptions: jest.fn(),
}))

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: jest.fn(async () => ({ ok: true, skipped: false })),
}))

const mockSdkFetch = sdk.client.fetch as jest.MockedFunction<
  typeof sdk.client.fetch
>
const mockGetAuthHeaders = getAuthHeaders as jest.MockedFunction<
  typeof getAuthHeaders
>
const mockGetCacheOptions = getCacheOptions as jest.MockedFunction<
  typeof getCacheOptions
>
const mockEmitStorefrontOpsAlert =
  emitStorefrontOpsAlert as jest.MockedFunction<typeof emitStorefrontOpsAlert>

function strapiProduct(index: number) {
  return {
    id: `strapi-${index}`,
    Name: `Product ${index}`,
    MedusaProduct: {
      ProductId: `medusa-product-${index}`,
      Variants: [
        {
          VariantId: `variant-${index}`,
        },
      ],
    },
  } as any
}

describe("product enrichment alerts", () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    mockGetAuthHeaders.mockResolvedValue({})
    mockGetCacheOptions.mockResolvedValue({})
    mockSdkFetch.mockImplementation(async (input, options: any = {}) => {
      const path = String(input)
      if (path === "/store/regions") {
        return {
          regions: [
            {
              id: "reg_alert",
              countries: [{ iso_2: "zz-enrichment-alert" }],
            },
          ],
        } as any
      }

      if (path === "/store/products") {
        const ids = options.query?.id || []
        if (ids.includes("medusa-product-0")) {
          throw new Error("price lookup failed for shopper@example.com")
        }

        return {
          products: ids.map((id: string) => {
            const parts = id.split("-")
            const index = Number(parts[parts.length - 1])
            return {
              id,
              variants: [
                {
                  id: `variant-${index}`,
                  calculated_price: { calculated_amount: 1299 + index },
                  manage_inventory: true,
                  allow_backorder: false,
                  inventory_quantity: 7,
                },
              ],
            }
          }),
          count: ids.length,
        } as any
      }

      throw new Error(`Unexpected fetch path ${path}`)
    })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it("alerts when a Medusa price and inventory enrichment chunk fails", async () => {
    const products = Array.from({ length: 51 }, (_, index) =>
      strapiProduct(index)
    )

    const enriched = await enrichStrapiProductsWithMedusaPrices(
      products,
      "zz-enrichment-alert"
    )

    expect(enriched).toHaveLength(51)
    expect(enriched[50].MedusaProduct.Variants[0].Price).toEqual({
      CalculatedPriceNumber: 1349,
    })
    expect(enriched[0].MedusaProduct.Variants[0].Price).toBeUndefined()
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "product_enrichment_degraded",
        severity: "warn",
        fingerprint: "product_enrichment:medusa_price_inventory_chunk:transport",
        meta: expect.objectContaining({
          catalog_surface: "strapi_product_cards",
          failure_stage: "medusa_price_inventory_chunk",
          route_dependency: "/store/products",
          country_code: "zz-enrichment-alert",
          product_count: 51,
          chunk_index: 0,
          chunk_size: 50,
          error_message: expect.stringContaining("[redacted-email]"),
        }),
      })
    )
    expect(JSON.stringify(mockEmitStorefrontOpsAlert.mock.calls)).not.toContain(
      "shopper@example.com"
    )
  })

  it("replaces stale reorder prices only with exact live variant prices", async () => {
    const priced = strapiProduct(1)
    priced.MedusaProduct.Variants[0].Price = {
      CalculatedPriceNumber: 10,
    }
    priced.MedusaProduct.Variants.push({
      VariantId: "variant-missing",
      Price: { CalculatedPriceNumber: 11 },
    })
    const enriched = await enrichStrapiProductsWithMedusaPrices(
      [priced],
      "zz-enrichment-alert",
      { requireLivePrices: true }
    )
    expect(enriched[0].MedusaProduct.Variants[0].Price).toEqual({
      CalculatedPriceNumber: 1300,
    })
    expect(enriched[0].MedusaProduct.Variants[1].Price).toBeUndefined()

    const unavailable = strapiProduct(0)
    unavailable.MedusaProduct.Variants[0].Price = {
      CalculatedPriceNumber: 10,
    }
    const withoutLivePrice = await enrichStrapiProductsWithMedusaPrices(
      [unavailable],
      "zz-enrichment-alert",
      { requireLivePrices: true }
    )
    expect(withoutLivePrice[0].MedusaProduct.Variants[0].Price).toBeUndefined()
  })
})
