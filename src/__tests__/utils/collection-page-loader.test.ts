jest.mock("@lib/strapi", () => ({
  __esModule: true,
  default: { request: jest.fn() },
}))

jest.mock("@lib/data/strapi/collections", () => ({
  extractTagValue: jest.fn(),
  getProductCollectionByHandle: jest.fn(),
  getProductTagBySlugStrict: jest.fn(),
  getProductsByCollectionSlugStrict: jest.fn(),
  getProductsByTagStrict: jest.fn(),
}))

jest.mock("@lib/data/strapi/curated-collections", () => ({
  getCuratedCollectionBySlug: jest.fn(),
}))

import {
  getCollectionPageData,
  withLastGoodCollection,
} from "@lib/data/strapi/collection-page"
import {
  getProductCollectionByHandle,
  getProductTagBySlugStrict,
  getProductsByCollectionSlugStrict,
} from "@lib/data/strapi/collections"
import { getCuratedCollectionBySlug } from "@lib/data/strapi/curated-collections"

const mockCurated = getCuratedCollectionBySlug as jest.Mock
const mockCollection = getProductCollectionByHandle as jest.Mock
const mockTag = getProductTagBySlugStrict as jest.Mock
const mockProducts = getProductsByCollectionSlugStrict as jest.Mock

const content = (name: string) => ({
  kind: "products" as const,
  collection: { Name: name, Slug: "kosher-beef" },
  products: [],
  tagSEODescription: "",
})

describe("collection last-good loading", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("lets a cold miss outlive the stale bound and fills the copy", async () => {
    const client = {}
    const first = await withLastGoodCollection(
      client,
      "kosher-beef",
      "us",
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(content("Fresh beef")), 15)
        ),
      5
    )
    expect(first).toEqual({
      status: "ready",
      content: content("Fresh beef"),
      stale: false,
    })

    const second = await withLastGoodCollection(
      client,
      "kosher-beef",
      "us",
      () => new Promise(() => {}),
      5
    )
    expect(second).toEqual({
      status: "ready",
      content: content("Fresh beef"),
      stale: true,
    })
  })

  it("keeps background refresh alive after a bounded stale return", async () => {
    const client = {}
    await withLastGoodCollection(
      client,
      "kosher-beef",
      "us",
      async () => content("First"),
      5
    )
    let finish!: (value: ReturnType<typeof content>) => void
    const refresh = new Promise<ReturnType<typeof content>>((resolve) => {
      finish = resolve
    })
    const stale = await withLastGoodCollection(
      client,
      "kosher-beef",
      "us",
      () => refresh,
      5
    )
    expect(stale.status).toBe("ready")
    if (stale.status === "ready")
      expect(stale.content.collection.Name).toBe("First")

    finish(content("Refreshed"))
    await refresh
    await Promise.resolve()
    const recovered = await withLastGoodCollection(
      client,
      "kosher-beef",
      "us",
      async () => {
        throw new Error("Strapi unavailable")
      },
      5
    )
    expect(recovered.status).toBe("ready")
    if (recovered.status === "ready") {
      expect(recovered.content.collection.Name).toBe("Refreshed")
      expect(recovered.stale).toBe(true)
    }
  })

  it("never reuses another handle, country or client's copy", async () => {
    const client = {}
    await withLastGoodCollection(
      client,
      "kosher-beef",
      "us",
      async () => content("US beef"),
      5
    )
    for (const [otherClient, handle, countryCode] of [
      [{}, "kosher-beef", "us"],
      [client, "kosher-chicken", "us"],
      [client, "kosher-beef", "ca"],
    ] as const) {
      const result = await withLastGoodCollection(
        otherClient,
        handle,
        countryCode,
        async () => {
          throw new Error("Strapi unavailable")
        },
        5
      )
      expect(result).toEqual({ status: "unavailable", stale: false })
    }
  })

  it("drops an old copy after a confirmed not-found response", async () => {
    const client = {}
    await withLastGoodCollection(
      client,
      "kosher-beef",
      "us",
      async () => content("Beef"),
      5
    )
    await expect(
      withLastGoodCollection(client, "kosher-beef", "us", async () => null, 5)
    ).resolves.toEqual({ status: "not_found", stale: false })
    await expect(
      withLastGoodCollection(
        client,
        "kosher-beef",
        "us",
        async () => {
          throw new Error("Strapi unavailable")
        },
        5
      )
    ).resolves.toEqual({ status: "unavailable", stale: false })
  })

  it("uses a real product collection if only curated CMS lookup fails", async () => {
    mockCurated.mockRejectedValueOnce(new Error("Curated query failed"))
    mockCollection.mockResolvedValueOnce({
      Name: "Roasts",
      Slug: "kosher-roasts-fallback-test",
    })
    mockProducts.mockResolvedValueOnce([{ documentId: "roast-1" }])

    const result = await getCollectionPageData(
      "kosher-roasts-fallback-test",
      "us"
    )
    expect(result.status).toBe("ready")
    expect(mockCurated).toHaveBeenCalledWith(
      "kosher-roasts-fallback-test",
      "us",
      "collection_page",
      true
    )
    expect(mockProducts).toHaveBeenCalledWith(
      "kosher-roasts-fallback-test",
      expect.anything()
    )
  })

  it("does not turn a failed curated lookup into a false 404", async () => {
    mockCurated.mockRejectedValueOnce(new Error("Curated query failed"))
    mockCollection.mockResolvedValueOnce(null)
    mockTag.mockResolvedValueOnce(null)

    await expect(
      getCollectionPageData("kosher-missing-fallback-test", "us")
    ).resolves.toEqual({ status: "unavailable", stale: false })
  })
})
