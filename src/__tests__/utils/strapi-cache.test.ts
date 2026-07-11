/**
 * @jest-environment node
 */

const mockRequest = jest.fn(async (_query: string, variables: unknown) => ({
  variables,
}))
const mockUnstableCache = jest.fn(
  (loader: (variables: string) => Promise<unknown>) => loader
)
let mockGraphqlClientOptions: {
  fetch?: (url: string, init?: RequestInit) => Promise<unknown>
} = {}

jest.mock("graphql-request", () => ({
  GraphQLClient: jest.fn().mockImplementation((_url, options) => {
    mockGraphqlClientOptions = options
    return { request: mockRequest }
  }),
}))

jest.mock("next/cache", () => ({
  unstable_cache: mockUnstableCache,
}))

describe("cachedStrapiRequest", () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    mockGraphqlClientOptions = {}
  })

  it("keeps the raw GraphQL transport uncached beneath unstable_cache", async () => {
    const originalFetch = global.fetch
    global.fetch = jest.fn(async () => ({ ok: true })) as any

    try {
      await import("@lib/strapi")
      await mockGraphqlClientOptions.fetch?.("https://strapi.test/graphql", {
        method: "POST",
        cache: "force-cache",
        next: { tags: ["stale-inner-tag"] },
      } as RequestInit & { next: { tags: string[] } })

      expect(global.fetch).toHaveBeenCalledWith(
        "https://strapi.test/graphql",
        expect.objectContaining({
          method: "POST",
          cache: "no-store",
        })
      )
      const forwardedInit = (global.fetch as jest.Mock).mock.calls[0][1]
      expect(forwardedInit).not.toHaveProperty("next")
    } finally {
      global.fetch = originalFetch
    }
  })

  it("reuses one module-level cache wrapper for the same query", async () => {
    const { cachedStrapiRequest } = await import("@lib/strapi")
    const query = "query Product($id: String) { product(id: $id) { id } }"

    await cachedStrapiRequest("pdp-product", query, { id: "one" })
    await cachedStrapiRequest("pdp-product", query, { id: "two" })

    expect(mockUnstableCache).toHaveBeenCalledTimes(1)
    expect(mockUnstableCache).toHaveBeenCalledWith(
      expect.any(Function),
      expect.arrayContaining(["strapi-gql", "pdp-product"]),
      expect.objectContaining({
        tags: ["strapi:model:product"],
        revalidate: 3600,
      })
    )
    expect(mockRequest).toHaveBeenCalledTimes(2)
  })

  it("creates a new wrapper when query text changes under the same name", async () => {
    const { cachedStrapiRequest } = await import("@lib/strapi")

    await cachedStrapiRequest("pdp-product", "query One { one }")
    await cachedStrapiRequest("pdp-product", "query Two { two }")

    expect(mockUnstableCache).toHaveBeenCalledTimes(2)
  })
})
