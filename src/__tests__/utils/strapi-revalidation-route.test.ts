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

import { POST } from "../../app/api/revalidate/route"
import { revalidateTag } from "next/cache"

const mockRevalidateTag = revalidateTag as jest.MockedFunction<
  typeof revalidateTag
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
})
