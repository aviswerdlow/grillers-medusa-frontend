/**
 * @jest-environment node
 */

jest.mock("graphql-request", () => ({
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (result, part, index) => `${result}${part}${values[index] || ""}`,
      ""
    ),
}))

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}))

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status || 200,
    }),
  },
}))

jest.mock("@lib/strapi", () => ({
  __esModule: true,
  default: { request: jest.fn() },
  cachedStrapiRequest: jest.fn(),
}))

jest.mock("@lib/data/strapi/collections", () => ({
  getStoreProducts: jest.fn(),
}))

jest.mock("@lib/data/strapi/collection-page", () => ({
  getCollectionPageData: jest.fn(),
}))

import { POST } from "../../app/api/revalidate/route"
import { revalidateTag } from "next/cache"
import { getStoreProducts } from "@lib/data/strapi/collections"
import { getCollectionPageData } from "@lib/data/strapi/collection-page"
import { cachedStrapiRequest } from "@lib/strapi"

const mockRevalidateTag = revalidateTag as jest.MockedFunction<
  typeof revalidateTag
>
const mockGetStoreProducts = getStoreProducts as jest.MockedFunction<
  typeof getStoreProducts
>
const mockGetCollectionPageData = getCollectionPageData as jest.MockedFunction<
  typeof getCollectionPageData
>
const mockCachedStrapiRequest = cachedStrapiRequest as jest.MockedFunction<
  typeof cachedStrapiRequest
>

describe("Strapi revalidation route", () => {
  const originalSecret = process.env.REVALIDATE_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.REVALIDATE_SECRET = "revalidate-test-secret"
  })

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.REVALIDATE_SECRET
    } else {
      process.env.REVALIDATE_SECRET = originalSecret
    }
  })

  it("invalidates only the current model plus the legacy rollout tag", async () => {
    const result = (await POST(
      new Request("https://storefront.test/api/revalidate", {
        method: "POST",
        headers: {
          authorization: "Bearer revalidate-test-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          event: "entry.update",
          model: "api::product.product",
        }),
      })
    )) as unknown as { body: { tags: string[] }; status: number }

    expect(result.status).toBe(200)
    expect(result.body.tags).toEqual(["strapi:model:product", "strapi"])
    expect(mockRevalidateTag.mock.calls).toEqual([
      ["strapi:model:product"],
      ["strapi"],
    ])
  })

  it("warms the new deployment's store query without invalidating tags", async () => {
    mockGetStoreProducts.mockResolvedValueOnce([
      {
        documentId: "warm-store-product",
        Title: "Warm Store Product",
        FeaturedImage: { url: "https://example.com/product.jpg" },
      },
    ])
    const result = (await POST(
      new Request("https://storefront.test/api/revalidate", {
        method: "POST",
        headers: {
          authorization: "Bearer revalidate-test-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ event: "deployment.ready" }),
      })
    )) as unknown as {
      body: { warmed: boolean; visibleProductCount: number }
      status: number
    }

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ warmed: true, visibleProductCount: 1 })
    expect(mockGetStoreProducts).toHaveBeenCalledTimes(1)
    expect(mockRevalidateTag).not.toHaveBeenCalled()
  })

  it("fails the deployment warm-up when no visible products load", async () => {
    mockGetStoreProducts.mockResolvedValueOnce([])
    const result = (await POST(
      new Request("https://storefront.test/api/revalidate", {
        method: "POST",
        headers: {
          authorization: "Bearer revalidate-test-secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ event: "deployment.ready" }),
      })
    )) as unknown as { body: { warmed: boolean }; status: number }

    expect(result.status).toBe(503)
    expect(result.body.warmed).toBe(false)
    expect(mockRevalidateTag).not.toHaveBeenCalled()
  })

  it("warms homepage CMS data and a manifest collection without invalidation", async () => {
    mockCachedStrapiRequest
      .mockResolvedValueOnce({ home: { SEO: {} } })
      .mockResolvedValueOnce({ global: {} })
    const home = (await POST(
      new Request("https://storefront.test/api/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer revalidate-test-secret" },
        body: JSON.stringify({ event: "deployment.ready", surface: "home" }),
      })
    )) as unknown as { body: { warmed: boolean }; status: number }
    expect(home).toEqual({
      body: { warmed: true, surface: "home" },
      status: 200,
    })
    expect(mockCachedStrapiRequest.mock.calls.map(([name]) => name)).toEqual([
      "home-page",
      "home-global",
    ])

    mockGetCollectionPageData.mockResolvedValueOnce({
      status: "ready",
      content: {
        kind: "products",
        collection: { Name: "Beef", Slug: "kosher-beef" },
        products: [],
        tagSEODescription: "",
      },
      stale: false,
    })
    const collection = (await POST(
      new Request("https://storefront.test/api/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer revalidate-test-secret" },
        body: JSON.stringify({
          event: "deployment.ready",
          surface: "collection",
          handle: "kosher-beef",
        }),
      })
    )) as unknown as { body: { warmed: boolean }; status: number }
    expect(collection.status).toBe(200)
    expect(collection.body.warmed).toBe(true)
    expect(mockGetCollectionPageData).toHaveBeenCalledWith("kosher-beef", "us")
    expect(mockRevalidateTag).not.toHaveBeenCalled()
  })

  it("rejects an invalid or degraded collection warm-up", async () => {
    const invalid = (await POST(
      new Request("https://storefront.test/api/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer revalidate-test-secret" },
        body: JSON.stringify({
          event: "deployment.ready",
          surface: "collection",
          handle: "../store",
        }),
      })
    )) as unknown as { status: number }
    expect(invalid.status).toBe(400)
    expect(mockGetCollectionPageData).not.toHaveBeenCalled()

    mockGetCollectionPageData.mockResolvedValueOnce({
      status: "unavailable",
      stale: false,
    })
    const degraded = (await POST(
      new Request("https://storefront.test/api/revalidate", {
        method: "POST",
        headers: { authorization: "Bearer revalidate-test-secret" },
        body: JSON.stringify({
          event: "deployment.ready",
          surface: "collection",
          handle: "kosher-beef",
        }),
      })
    )) as unknown as { body: { warmed: boolean }; status: number }
    expect(degraded.status).toBe(503)
    expect(degraded.body.warmed).toBe(false)
  })
})
