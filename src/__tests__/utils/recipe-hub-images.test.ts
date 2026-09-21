jest.mock("graphql-request", () => ({
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (query, part, index) => `${query}${part}${values[index] ?? ""}`,
      ""
    ),
}))
jest.mock("@lib/strapi", () => ({ cachedStrapiRequest: jest.fn() }))

import { cachedStrapiRequest } from "@lib/strapi"
import { getRecipeHubImageMap } from "@lib/data/strapi/recipes"

const request = cachedStrapiRequest as jest.Mock
const page = (nodes: unknown[], pageCount = 1) => ({
  recipes_connection: { nodes, pageInfo: { pageCount } },
})

describe("getRecipeHubImageMap", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it("collects every page and skips recipes without an Image URL", async () => {
    request
      .mockResolvedValueOnce(page([{ Slug: "one", Image: { url: "one.jpg" } }], 2))
      .mockResolvedValueOnce(
        page([
          { Slug: "two", Image: { url: "two.jpg" } },
          { Slug: "missing", Image: null },
          { Slug: "empty", Image: { url: "" } },
        ], 2)
      )

    expect(await getRecipeHubImageMap()).toEqual(
      new Map([["one", "one.jpg"], ["two", "two.jpg"]])
    )
    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenNthCalledWith(
      2,
      "recipe-hub-images",
      expect.stringContaining("status: PUBLISHED"),
      { page: 2, pageSize: 100 }
    )
  })

  it("falls back completely and logs once if a later page fails", async () => {
    request
      .mockResolvedValueOnce(page([{ Slug: "one", Image: { url: "one.jpg" } }], 2))
      .mockRejectedValueOnce(new Error("Strapi unavailable"))

    expect(await getRecipeHubImageMap()).toEqual(new Map())
    expect(console.warn).toHaveBeenCalledTimes(1)
  })

  it("bounds the entire lookup and does not continue pagination after timeout", async () => {
    jest.useFakeTimers()
    let finishPage: (data: ReturnType<typeof page>) => void = () => {}
    request.mockReturnValueOnce(new Promise((resolve) => { finishPage = resolve }))
    const result = getRecipeHubImageMap()

    await jest.advanceTimersByTimeAsync(12_000)
    expect(await result).toEqual(new Map())
    finishPage(page([], 9))
    await jest.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
  })
})
