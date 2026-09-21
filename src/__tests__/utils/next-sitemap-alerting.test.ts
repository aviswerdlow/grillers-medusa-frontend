const originalEnv = process.env
const originalFetch = global.fetch

function loadConfig() {
  jest.resetModules()
  return require("../../../next-sitemap.config.js")
}

describe("next sitemap source failure handling", () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it("omits mixed and renamed internal items from a successful live catalog read", async () => {
    process.env.MEDUSA_BACKEND_URL = "https://medusa.example"
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test"
    delete process.env.STRAPI_ENDPOINT
    delete process.env.STRAPI_API_TOKEN
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        count: 3,
        products: [
          {
            handle: "retail",
            variants: [{ sku: "01", inventory_quantity: 0 }],
          },
          {
            handle: "renamed",
            metadata: { availability_lifecycle: "internal_only" },
            variants: [{ sku: "02" }],
          },
          {
            handle: "mixed",
            variants: [{ sku: "03" }, { sku: " RM-hidden " }],
          },
        ],
      }),
    })) as any
    const entries = await loadConfig().additionalPaths()
    expect(
      entries
        .filter((e: any) => e.loc.startsWith("/us/products/"))
        .map((e: any) => e.loc)
    ).toEqual(["/us/products/retail"])
  })

  it("alerts and omits unverified previous product URLs when Medusa sitemap fetch fails", async () => {
    process.env.MEDUSA_BACKEND_URL = "https://medusa.example"
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test"
    process.env.GP_ANALYTICS_ENDPOINT = "https://analytics.example"
    process.env.GP_ANALYTICS_SERVER_KEY = "server_key"
    delete process.env.STRAPI_ENDPOINT
    delete process.env.STRAPI_API_TOKEN

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/v1/track")) {
        return { ok: true, status: 200, statusText: "OK" } as Response
      }
      return {
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({ message: "backend unavailable" }),
      } as Response
    })
    global.fetch = fetchMock as typeof fetch

    const config = loadConfig()
    const entries = await config.additionalPaths()
    const productEntries = entries.filter((entry: { loc: string }) =>
      entry.loc.startsWith("/us/products/")
    )

    expect(productEntries).toEqual([])

    const alertCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("https://analytics.example/v1/track")
    )
    expect(alertCall).toBeTruthy()
    const payload = JSON.parse(String(alertCall?.[1]?.body || "{}"))

    expect(payload).toEqual(
      expect.objectContaining({
        event: "ops_alert",
        source: "storefront-build",
        properties: expect.objectContaining({
          alert_kind: "sitemap_source_degraded",
          severity: "warn",
          path: "next-sitemap.config.js",
          sitemap_source: "product",
          fallback_entry_count: productEntries.length,
        }),
      })
    )
  })

  it("fails closed in production when no previous sitemap fallback exists", async () => {
    process.env.MEDUSA_BACKEND_URL = "https://medusa.example"
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test"
    process.env.GP_ANALYTICS_ENDPOINT = "https://analytics.example"
    process.env.GP_ANALYTICS_SERVER_KEY = "server_key"
    process.env.NEXT_SITEMAP_FALLBACK_FILE = "/tmp/grillers-missing-sitemap.xml"
    process.env.NEXT_SITEMAP_FAIL_CLOSED = "true"
    delete process.env.STRAPI_ENDPOINT
    delete process.env.STRAPI_API_TOKEN

    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/v1/track")) {
        return { ok: true, status: 200, statusText: "OK" } as Response
      }
      return {
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => ({ message: "backend unavailable" }),
      } as Response
    })
    global.fetch = fetchMock as typeof fetch

    const config = loadConfig()
    await expect(config.additionalPaths()).rejects.toThrow("502 Bad Gateway")

    const alertCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("https://analytics.example/v1/track")
    )
    const payload = JSON.parse(String(alertCall?.[1]?.body || "{}"))
    expect(payload.properties).toEqual(
      expect.objectContaining({
        alert_kind: "sitemap_source_failed",
        severity: "page",
        sitemap_source: "product",
        fallback_entry_count: 0,
      })
    )
  })
})
