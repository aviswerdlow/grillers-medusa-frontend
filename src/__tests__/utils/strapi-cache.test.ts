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

  it("keeps the twenty-second transport deadline for slower cached queries", async () => {
    const original = process.env.STRAPI_FETCH_TIMEOUT_MS
    const originalFetch = global.fetch
    delete process.env.STRAPI_FETCH_TIMEOUT_MS
    const deadline = jest.spyOn(AbortSignal, "timeout")
    global.fetch = jest.fn(async () => ({ ok: true })) as any
    try {
      await import("@lib/strapi")
      await mockGraphqlClientOptions.fetch?.("https://strapi.test/graphql", {
        method: "POST",
      })
      expect(deadline).toHaveBeenCalledWith(20000)
    } finally {
      deadline.mockRestore()
      global.fetch = originalFetch
      if (original === undefined) delete process.env.STRAPI_FETCH_TIMEOUT_MS
      else process.env.STRAPI_FETCH_TIMEOUT_MS = original
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

  it("recovers opt-in display reads from the last success but never policy reads", async () => {
    const { cachedStrapiRequest } = await import("@lib/strapi")
    const query = "query Home { home { title } }"
    mockRequest.mockResolvedValueOnce({
      variables: { title: "Approved title" },
    })
    const first = await cachedStrapiRequest(
      "home-page",
      query,
      {},
      { staleOnError: true }
    )
    mockRequest.mockRejectedValueOnce(new Error("unavailable"))
    await expect(
      cachedStrapiRequest("home-page", query, {}, { staleOnError: true })
    ).resolves.toEqual(first)
    mockRequest.mockRejectedValueOnce(new Error("unavailable"))
    await expect(cachedStrapiRequest("home-page", query)).rejects.toThrow(
      "unavailable"
    )
    mockRequest.mockRejectedValueOnce(new Error("different query"))
    await expect(
      cachedStrapiRequest(
        "home-page",
        "query Other { other }",
        {},
        { staleOnError: true }
      )
    ).rejects.toThrow("different query")
  })

  it("bounds a stalled homepage read and returns its cached content", async () => {
    const { cachedStrapiRequest } = await import("@lib/strapi")
    const query = "query Home { home { title } }"
    const options = { staleOnError: true, timeoutMs: 5, onError: jest.fn() }
    mockRequest.mockResolvedValueOnce({
      variables: { title: "Approved title" },
    })
    const first = await cachedStrapiRequest("home-page", query, {}, options)
    mockRequest.mockImplementationOnce(() => new Promise(() => {}))
    await expect(
      cachedStrapiRequest("home-page", query, {}, options)
    ).resolves.toEqual(first)
    expect(options.onError).toHaveBeenCalledWith(
      expect.objectContaining({ name: "TimeoutError" }),
      true
    )
  })

  it("creates a new wrapper when query text changes under the same name", async () => {
    const { cachedStrapiRequest } = await import("@lib/strapi")

    await cachedStrapiRequest("pdp-product", "query One { one }")
    await cachedStrapiRequest("pdp-product", "query Two { two }")

    expect(mockUnstableCache).toHaveBeenCalledTimes(2)
  })

  it("coalesces concurrent cold requests for the same query and variables", async () => {
    let resolveRequest: ((value: { variables: unknown }) => void) | undefined
    mockRequest.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        })
    )
    const { cachedStrapiRequest } = await import("@lib/strapi")
    const query = "query Header { header { id } }"

    const first = cachedStrapiRequest("header-nav", query, { locale: "en" })
    const second = cachedStrapiRequest("header-nav", query, { locale: "en" })

    expect(mockRequest).toHaveBeenCalledTimes(1)
    resolveRequest?.({ variables: { locale: "en" } })
    await expect(Promise.all([first, second])).resolves.toEqual([
      { variables: { locale: "en" } },
      { variables: { locale: "en" } },
    ])
  })
})
