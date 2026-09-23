/**
 * @jest-environment node
 */

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
}))

jest.mock("@lib/data/strapi/collections", () => ({
  getStoreProducts: jest.fn(),
}))

import { POST } from "../../app/api/revalidate/route"
import { revalidateTag } from "next/cache"
import { getStoreProducts } from "@lib/data/strapi/collections"

const mockRevalidateTag = revalidateTag as jest.MockedFunction<
  typeof revalidateTag
>
const mockGetStoreProducts = getStoreProducts as jest.MockedFunction<
  typeof getStoreProducts
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
})
