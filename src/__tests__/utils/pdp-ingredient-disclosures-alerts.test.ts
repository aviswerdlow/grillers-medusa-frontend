/**
 * @jest-environment node
 */

jest.mock("graphql-request", () => ({
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (acc, part, index) => `${acc}${part}${values[index] ?? ""}`,
      ""
    ),
}))

import { getProductIngredientDisclosures } from "@lib/data/strapi/pdp"

describe("PDP ingredient disclosure alert seam", () => {
  const originalEnv = process.env
  const originalFetch = global.fetch
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRAPI_ENDPOINT: "https://strapi.example.com",
      STRAPI_API_TOKEN: "strapi-token",
    }
    consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    consoleErrorSpy.mockRestore()
  })

  it("reports non-2xx REST fallback failures without throwing", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => "Strapi maintenance",
    })) as any
    const onLoadFailure = jest.fn()

    await expect(
      getProductIngredientDisclosures("prod_123", { onLoadFailure })
    ).resolves.toEqual([])

    expect(onLoadFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "non_2xx",
        status: 503,
      })
    )
  })

  it("reports missing Strapi endpoint configuration for known products", async () => {
    delete process.env.STRAPI_ENDPOINT
    global.fetch = jest.fn() as any
    const onLoadFailure = jest.fn()

    await expect(
      getProductIngredientDisclosures("prod_123", { onLoadFailure })
    ).resolves.toEqual([])

    expect(global.fetch).not.toHaveBeenCalled()
    expect(onLoadFailure).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "missing_config" })
    )
  })

  it("uses the product cache tag for successful REST recovery reads", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ IngredientDisclosures: [] }] }),
    })) as any

    await expect(getProductIngredientDisclosures("prod_123")).resolves.toEqual(
      []
    )

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("filters%5BMedusaProduct%5D"),
      expect.objectContaining({
        cache: "force-cache",
        next: {
          tags: ["strapi:model:product"],
          revalidate: 3600,
        },
      })
    )
  })
})
