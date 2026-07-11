const mockStrapiRequest = jest.fn()
const mockEmitCuratedCollectionsStrapiFailureAlert = jest.fn()
const mockEnrichStrapiProductsWithMedusaPrices = jest.fn(
  async (products: unknown[]) => products
)

jest.mock("graphql-request", () => ({
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (result, part, index) => `${result}${part}${values[index] || ""}`,
      ""
    ),
}))

jest.mock("@lib/strapi", () => ({
  __esModule: true,
  default: {
    request: mockStrapiRequest,
  },
  // cachedStrapiRequest(name, query, variables) → the same underlying
  // request mock, so failure-path assertions keep exercising the alerts.
  cachedStrapiRequest: (_name: string, query: unknown, variables?: unknown) =>
    mockStrapiRequest(query, variables),
}))

jest.mock("@lib/data/products", () => ({
  enrichStrapiProductsWithMedusaPrices:
    mockEnrichStrapiProductsWithMedusaPrices,
}))

jest.mock("@lib/curated-collections-ops-alerts", () => ({
  emitCuratedCollectionsStrapiFailureAlert:
    mockEmitCuratedCollectionsStrapiFailureAlert,
}))

function curatedCollection(overrides: Record<string, unknown> = {}) {
  return {
    documentId: "curated_1",
    Name: "Starter box",
    Slug: "starter-box",
    ShortDescription: "A starter collection.",
    CollectionType: "sku_backed",
    Occasion: "starter",
    CustomerStateFilter: "all",
    IsActive: true,
    SurfacePlacements: ["homepage", "pdp"],
    Items: [],
    SortOrder: 1,
    ...overrides,
  }
}

function curatedProduct(handle: string) {
  return {
    documentId: `document_${handle}`,
    Title: handle,
    MedusaProduct: {
      ProductId: `product_${handle}`,
      Handle: handle,
      Variants: [{ VariantId: `variant_${handle}`, Sku: `SKU-${handle}` }],
    },
  }
}

function curatedItems(slug: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    Quantity: 1,
    Product: curatedProduct(`${slug}-${index + 1}`),
  }))
}

describe("curated collection Strapi alerting", () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    mockEmitCuratedCollectionsStrapiFailureAlert.mockResolvedValue(undefined)
  })

  it("tops up invalid ranked details until three usable collections are found", async () => {
    mockStrapiRequest.mockImplementation(
      async (_query: unknown, variables?: { slug?: string }) => ({
        curatedCollections: [
          curatedCollection({
            documentId: `curated_${variables?.slug}`,
            Name: variables?.slug,
            Slug: variables?.slug,
            Items: curatedItems(
              variables?.slug || "missing",
              variables?.slug === "first" ? 1 : 2
            ),
          }),
        ],
      })
    )

    const { getCuratedCollectionsBySlugs } = await import(
      "@lib/data/strapi/curated-collections"
    )

    const result = await getCuratedCollectionsBySlugs({
      slugs: ["first", "second", "third", "fourth", "fifth"],
      countryCode: "us",
      currentProductHandle: "current-product",
      targetCount: 3,
    })

    expect(result.map((collection) => collection.Slug)).toEqual([
      "second",
      "third",
      "fourth",
    ])
    expect(mockStrapiRequest).toHaveBeenCalledTimes(5)
    expect(mockStrapiRequest.mock.calls.map((call) => call[1])).toEqual([
      { slug: "first" },
      { slug: "second" },
      { slug: "third" },
      { slug: "fourth" },
      { slug: "fifth" },
    ])
    expect(mockEmitCuratedCollectionsStrapiFailureAlert).not.toHaveBeenCalled()
  })

  it("never reads more than the six-candidate hard bound", async () => {
    mockStrapiRequest.mockImplementation(
      async (_query: unknown, variables?: { slug?: string }) => ({
        curatedCollections: [
          curatedCollection({
            Slug: variables?.slug,
            Items: curatedItems(variables?.slug || "missing", 1),
          }),
        ],
      })
    )

    const { getCuratedCollectionsBySlugs } = await import(
      "@lib/data/strapi/curated-collections"
    )

    const result = await getCuratedCollectionsBySlugs({
      slugs: ["one", "two", "three", "four", "five", "six", "seven"],
      countryCode: "us",
      currentProductHandle: "current-product",
      targetCount: 3,
    })

    expect(result).toEqual([])
    expect(mockStrapiRequest).toHaveBeenCalledTimes(6)
    expect(mockStrapiRequest.mock.calls.map((call) => call[1])).toEqual(
      ["one", "two", "three", "four", "five", "six"].map((slug) => ({
        slug,
      }))
    )
  })

  it("alerts when collection cards degrade to an empty list", async () => {
    const error = new Error("Strapi cards query failed")
    mockStrapiRequest.mockRejectedValueOnce(error)

    const { getCuratedCollectionCards } = await import(
      "@lib/data/strapi/curated-collections"
    )

    const result = await getCuratedCollectionCards({
      surface: "homepage",
      customerState: "guest_or_no_orders",
      limit: 8,
    })

    expect(result).toEqual([])
    expect(mockEmitCuratedCollectionsStrapiFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "cards",
        stage: "primary",
        surface: "homepage",
        customerState: "guest_or_no_orders",
        limit: 8,
        recovered: false,
        error,
      })
    )
  })

  it("alerts when primary and legacy detail queries both fail", async () => {
    const primaryError = new Error("Primary detail query failed")
    const legacyError = new Error("Legacy detail query failed")
    mockStrapiRequest
      .mockRejectedValueOnce(primaryError)
      .mockRejectedValueOnce(legacyError)

    const { getCuratedCollectionBySlug } = await import(
      "@lib/data/strapi/curated-collections"
    )

    const result = await getCuratedCollectionBySlug("starter-box", "us")

    expect(result).toBeNull()
    expect(mockEmitCuratedCollectionsStrapiFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "detail",
        stage: "legacy",
        surface: "collection_page",
        countryCode: "us",
        slug: "starter-box",
        recovered: false,
        error: legacyError,
      })
    )
  })
})

export {}
