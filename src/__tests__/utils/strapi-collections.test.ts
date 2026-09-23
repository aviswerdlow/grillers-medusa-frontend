jest.mock("graphql-request", () => ({
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (acc, part, index) => `${acc}${part}${values[index] ?? ""}`,
      ""
    ),
}))

// Every test here injects its own mock client (which takes the uncached
// client.request path in collections.ts), but the module still imports
// @lib/strapi, whose unstable_cache import can't load under Jest.
jest.mock("@lib/strapi", () => ({
  __esModule: true,
  default: { request: jest.fn() },
  cachedStrapiRequest: jest.fn(),
}))

import {
  getAllProductsWithImages,
  getStoreProducts,
  getProductsByCollectionSlug,
  getProductsByCollectionSlugStrict,
  getProductsByTag,
  getProductsByTagStrict,
} from "@lib/data/strapi/collections"

describe("Strapi collection product loaders", () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env = originalEnv
  })

  it("falls back to the legacy collection query when the primary collection query fails", async () => {
    const products = [{ documentId: "prod_1", Title: "Chuck Roast" }]
    const client = {
      request: jest
        .fn()
        .mockRejectedValueOnce(new Error("field not available"))
        .mockResolvedValueOnce({ products }),
    }

    await expect(
      getProductsByCollectionSlugStrict("kosher-roasts-prime-rib", client)
    ).resolves.toEqual(products)
    expect(client.request).toHaveBeenCalledTimes(2)
  })

  it("throws in strict collection mode instead of returning an empty category on fetch failure", async () => {
    const client = {
      request: jest.fn().mockRejectedValue(new Error("Strapi unavailable")),
    }

    await expect(
      getProductsByCollectionSlugStrict("kosher-roasts-prime-rib", client)
    ).rejects.toThrow("Strapi unavailable")
    await expect(
      getProductsByCollectionSlug("kosher-roasts-prime-rib", client)
    ).resolves.toEqual([])
  })

  it("throws in strict tag mode instead of returning an empty tag page on fetch failure", async () => {
    const client = {
      request: jest.fn().mockRejectedValue(new Error("Strapi unavailable")),
    }

    await expect(getProductsByTagStrict("L2: Roasts", client)).rejects.toThrow(
      "Strapi unavailable"
    )
    await expect(getProductsByTag("L2: Roasts", client)).resolves.toEqual([])
  })

  it("loads the store catalog directly from Strapi with a lean product-card query", async () => {
    const products = [
      {
        documentId: "doc_1",
        Title: "Kosher Chuck Roast",
        FeaturedImage: { url: "https://example.com/chuck.jpg" },
        MedusaProduct: {
          ProductId: "prod_1",
          Handle: "kosher-chuck-roast",
          Description: "A long customer-facing PDP description.",
          ShortDescription: "A short customer-facing PLP description.",
          Variants: [
            {
              VariantId: "var_1",
              Sku: "1-01-01-1",
              Price: { CalculatedPriceNumber: 12.34 },
            },
          ],
        },
      },
    ]
    const client = {
      request: jest.fn().mockResolvedValue({ products }),
    }
    const onLoadFailure = jest.fn()

    await expect(getStoreProducts(client, { onLoadFailure })).resolves.toEqual([
      expect.objectContaining({
        Title: "Kosher Chuck Roast",
        MedusaProduct: expect.objectContaining({
          ProductId: "prod_1",
          Description: "A long customer-facing PDP description.",
          ShortDescription: "A short customer-facing PLP description.",
        }),
      }),
    ])
    expect(client.request).toHaveBeenCalledTimes(1)
    expect(client.request.mock.calls[0][0]).not.toContain(
      "IngredientDisclosures"
    )
    expect(client.request.mock.calls[0][0]).not.toContain("GalleryImages")
    expect(client.request.mock.calls[0][1]).toEqual({
      limit: 1000,
      start: 0,
    })
    expect(onLoadFailure).not.toHaveBeenCalled()
  })

  it("alerts when the store catalog primary query fails but the legacy query recovers", async () => {
    const products = [
      {
        documentId: "doc_legacy",
        Title: "Kosher Legacy Roast",
        FeaturedImage: { url: "https://example.com/legacy-roast.jpg" },
        MedusaProduct: {
          ProductId: "prod_legacy",
          Handle: "kosher-legacy-roast",
          ShortDescription: "Legacy query recovered.",
          Variants: [
            {
              VariantId: "var_legacy",
              Sku: "1-01-99-1",
              Price: { CalculatedPriceNumber: 22.99 },
            },
          ],
        },
      },
    ]
    const primaryError = new Error("GraphQL 504")
    const client = {
      request: jest
        .fn()
        .mockRejectedValueOnce(primaryError)
        .mockResolvedValueOnce({ products }),
    }
    const onLoadFailure = jest.fn()

    await expect(getStoreProducts(client, { onLoadFailure })).resolves.toEqual([
      expect.objectContaining({ Title: "Kosher Legacy Roast" }),
    ])
    expect(onLoadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "primary",
        error: primaryError,
        recovered: true,
      })
    )
  })

  it("alerts when the store catalog primary and legacy queries both fail", async () => {
    const primaryError = new Error("primary unavailable")
    const legacyError = new Error("legacy unavailable")
    const client = {
      request: jest
        .fn()
        .mockRejectedValueOnce(primaryError)
        .mockRejectedValueOnce(legacyError),
    }
    const onLoadFailure = jest.fn()

    await expect(getStoreProducts(client, { onLoadFailure })).resolves.toEqual(
      []
    )
    expect(onLoadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "legacy",
        error: legacyError,
        primaryError,
        recovered: false,
      })
    )
  })

  it("returns the cached catalogue after primary timeout without a legacy call", async () => {
    process.env.STRAPI_STORE_CATALOG_TIMEOUT_MS = "5"
    const products = [
      {
        documentId: "doc_timeout",
        Title: "Kosher Timeout Recovery",
        FeaturedImage: { url: "https://example.com/timeout.jpg" },
        MedusaProduct: {
          ProductId: "prod_timeout",
          Handle: "kosher-timeout-recovery",
          ShortDescription: "Timeout fallback.",
          Variants: [
            {
              VariantId: "var_timeout",
              Sku: "1-00-99-1",
              Price: { CalculatedPriceNumber: 11.23 },
            },
          ],
        },
      },
    ]
    const never = new Promise(() => {})
    const client = {
      request: jest
        .fn()
        .mockResolvedValueOnce({ products })
        .mockReturnValueOnce(never),
    }
    const onLoadFailure = jest.fn()

    await getStoreProducts(client)
    client.request.mockClear()

    await expect(getStoreProducts(client, { onLoadFailure })).resolves.toEqual([
      expect.objectContaining({ Title: "Kosher Timeout Recovery" }),
    ])
    expect(client.request).toHaveBeenCalledTimes(1)
    expect(onLoadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "primary",
        recovered: true,
        timeoutMs: 5,
      })
    )
  })

  it("lets a cold miss pass the stale bound and fills the catalogue cache", async () => {
    process.env.STRAPI_STORE_CATALOG_TIMEOUT_MS = "5"
    process.env.STRAPI_FETCH_TIMEOUT_MS = "40"
    const products = [{ documentId: "cold-filled", Title: "Cold catalogue" }]
    const client = {
      request: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ products }), 15)
            })
        )
        .mockReturnValueOnce(new Promise(() => {})),
    }

    await expect(getStoreProducts(client)).resolves.toEqual([
      expect.objectContaining({ documentId: "cold-filled" }),
    ])

    const onLoadFailure = jest.fn()
    await expect(getStoreProducts(client, { onLoadFailure })).resolves.toEqual([
      expect.objectContaining({ documentId: "cold-filled" }),
    ])
    expect(client.request).toHaveBeenCalledTimes(2)
    expect(onLoadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "primary",
        recovered: true,
        timeoutMs: 5,
      })
    )
  })

  it("does not retry a transport timeout and cannot reuse a different client's catalogue", async () => {
    const warmClient = {
      request: jest
        .fn()
        .mockResolvedValue({
          products: [{ documentId: "only-warm", Title: "Warm" }],
        }),
    }
    await getStoreProducts(warmClient)
    const error = Object.assign(new Error("The operation was aborted"), {
      name: "TimeoutError",
    })
    const client = { request: jest.fn().mockRejectedValue(error) }
    const onLoadFailure = jest.fn()
    await expect(getStoreProducts(client, { onLoadFailure })).resolves.toEqual(
      []
    )
    expect(client.request).toHaveBeenCalledTimes(1)
    expect(onLoadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "primary",
        recovered: false,
        timeoutMs: 20000,
      })
    )
  })

  it("recovers both failed queries from the same client's last successful catalogue", async () => {
    const products = [{ documentId: "saved", Title: "Saved" }]
    const client = {
      request: jest
        .fn()
        .mockResolvedValueOnce({ products })
        .mockRejectedValue(new Error("unavailable")),
    }
    const cached = await getStoreProducts(client)
    await expect(getStoreProducts(client)).resolves.toEqual(cached)
    expect(client.request).toHaveBeenCalledTimes(3)
  })

  it("retries direct Strapi product pagination before rendering an empty catalog", async () => {
    const products = [
      {
        documentId: "doc_retry",
        Title: "Kosher Ground Beef",
        FeaturedImage: { url: "https://example.com/ground-beef.jpg" },
        MedusaProduct: {
          ProductId: "prod_retry",
          Handle: "kosher-ground-beef",
          ShortDescription: "Fresh ground beef.",
          Variants: [
            {
              VariantId: "var_retry",
              Sku: "1-00-11-1",
              Price: { CalculatedPriceNumber: 12.3 },
            },
          ],
        },
      },
    ]
    const client = {
      request: jest
        .fn()
        .mockRejectedValueOnce(new Error("transient Strapi failure"))
        .mockResolvedValueOnce({ products }),
    }

    await expect(getAllProductsWithImages(client)).resolves.toEqual([
      expect.objectContaining({
        Title: "Kosher Ground Beef",
      }),
    ])
    expect(client.request).toHaveBeenCalledTimes(2)
  })
})
