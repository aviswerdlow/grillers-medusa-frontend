export {}
const {
  publicOrigin,
  canonicalOrigin,
  isIndexableDeployment,
  isPublicPath,
  crawlerHeaders,
} = require("../../lib/util/site-policy.cjs")
const { getPathMatch } = require("next/dist/shared/lib/router/utils/path-match")
const originalEnv = process.env
const production = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_CANONICAL_BASE_URL: "https://www.grillerspride.com",
}
afterEach(() => {
  process.env = originalEnv
  jest.resetModules()
})

test("production canonical configuration takes precedence over a stale temporary base URL", () => {
  const env = {
    ...production,
    NEXT_PUBLIC_BASE_URL: "https://old.vercel.app",
    VERCEL_URL: "preview.vercel.app",
  }
  expect(publicOrigin(env)).toBe("https://www.grillerspride.com")
  expect(canonicalOrigin(env)).toBe("https://www.grillerspride.com")
  expect(isIndexableDeployment(env)).toBe(true)
})
test("preview URLs remain on the preview and cannot become indexable through production env values", () => {
  const env = {
    ...production,
    VERCEL_ENV: "preview",
    VERCEL_URL: "candidate.vercel.app",
    NEXT_PUBLIC_BASE_URL: "https://www.grillerspride.com",
  }
  expect(publicOrigin(env)).toBe("https://candidate.vercel.app")
  expect(isIndexableDeployment(env)).toBe(false)
  expect(crawlerHeaders(env)).toEqual([
    {
      source: "/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
  ])
  expect(isIndexableDeployment({ VERCEL_ENV: "production" })).toBe(false)
  expect(
    isIndexableDeployment({
      ...production,
      NEXT_PUBLIC_CANONICAL_BASE_URL: "https://alias.vercel.app",
    })
  ).toBe(false)
})
test.each([
  "/us/account",
  "/us/account/orders/123",
  "/us/cart",
  "/us/checkout",
  "/us/order/confirmation",
  "/account",
  "/api/customer",
  "/ca/account",
  "/us/%61ccount",
  "/CategoryProductList.jsp?cat=Beef",
  "/SPD/product.jsp",
  "/us/store?page=2",
])("excludes private, legacy and parameter URL %s", (path) => {
  expect(isPublicPath(path)).toBe(false)
})
test.each([
  "/us",
  "/us/store",
  "/us/products/steak",
  "/us/collections/kosher-beef",
  "/us/recipes/brisket",
  "/us/page/about-us",
])("retains public path %s", (path) => expect(isPublicPath(path)).toBe(true))
test("private response headers cover roots and nested localized paths using Next matcher", () => {
  const rules = crawlerHeaders(production)
  for (const path of [
    "/account",
    "/us/account",
    "/us/cart",
    "/us/checkout",
    "/us/order/x",
    "/ca/account/settings",
    "/Home.jsp",
  ]) {
    expect(
      rules.some((rule: { source: string }) => getPathMatch(rule.source)(path))
    ).toBe(true)
  }
})
test("invalid canonical origins fail explicitly", () => {
  for (const value of [
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?x=1",
  ])
    expect(() =>
      canonicalOrigin({ ...production, NEXT_PUBLIC_CANONICAL_BASE_URL: value })
    ).toThrow()
})
test("preview sitemap has no entries or data fetch and production transform rejects private routes", async () => {
  process.env = {
    ...originalEnv,
    ...production,
    VERCEL_ENV: "preview",
    VERCEL_URL: "candidate.vercel.app",
  }
  jest.resetModules()
  let config = require("../../../next-sitemap.config.js")
  expect(config.siteUrl).toBe("https://candidate.vercel.app")
  expect(await config.additionalPaths()).toEqual([])
  expect(await config.transform(config, "/us/products/steak")).toBeNull()
  expect(config.robotsTxtOptions.policies[0].disallow).toEqual(["/"])
  process.env = { ...originalEnv, ...production }
  jest.resetModules()
  config = require("../../../next-sitemap.config.js")
  expect(await config.transform(config, "/us/account")).toBeNull()
  expect(await config.transform(config, "/us/products/steak")).toMatchObject({
    loc: "/us/products/steak",
  })
  expect(config.robotsTxtOptions.policies[0].disallow).toContain(
    "/us/checkout/*"
  )
})
