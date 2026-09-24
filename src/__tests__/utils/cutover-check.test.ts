export {}
const assert = require("node:assert/strict")
const {
  checkCanonical,
  checkRedirect,
  defaultRobotsRules,
  parseHost,
  recipeDetailPath,
  robotsAllows,
  runChecks,
  sampleRedirects,
} = require("../../../scripts/check-cutover.cjs")

const origin = "https://www.grillerspride.com"
const privateRoots = ["account", "cart", "checkout", "order", "api"]
const robots = [
  "User-agent: *",
  "Allow: /",
  ...privateRoots.flatMap((root) => [`Disallow: /us/${root}$`, `Disallow: /us/${root}/*`]),
].join("\n")
const response = (status: number, body = "", location?: string) => ({
  status,
  headers: { get: (name: string) => name.toLowerCase() === "location" ? location || null : null },
  text: async () => body,
})

test("the preflight selects five distinct approved redirect types", () => {
  const samples = sampleRedirects()
  assert.equal(samples.length, 5)
  assert.equal(new Set(samples.map(({ label }: { label: string }) => label)).size, 5)
  assert.ok(samples.every(({ row }: { row: { disposition: string } }) => row.disposition === "redirect"))
  assert.equal(parseHost("www.grillerspride.com"), origin)
  assert.throws(() => parseHost("https://www.grillerspride.com/us"), /origin/)
})

test("legacy redirects must reach their approved destination in one permanent hop", async () => {
  const row = sampleRedirects().find(({ label }: { label: string }) => label === "legacy category").row
  const calls: string[] = []
  const request = async (url: URL) => {
    calls.push(url.href)
    return calls.length === 1
      ? response(308, "", `${row.destination}?cat=Burgers`)
      : response(200, "ok")
  }
  assert.equal((await checkRedirect(origin, row, request)).ok, true)
  assert.equal(calls.length, 2)

  calls.length = 0
  const extraHop = async (url: URL) => {
    calls.push(url.href)
    return response(308, "", row.destination)
  }
  assert.match((await checkRedirect(origin, row, extraHop)).detail, /without another hop/)
})

test("canonical validation requires one absolute same-host URL", () => {
  const path = "/us/recipes/example"
  const canonical = `<link rel="canonical" href="${origin}${path}/">`
  assert.equal(checkCanonical(origin, path, 200, canonical).ok, true)
  assert.equal(checkCanonical(origin, path, 200, canonical + canonical).ok, false)
  assert.equal(checkCanonical(origin, path, 200, '<link rel="canonical" href="https://other.example/us/recipes/example">').ok, false)
  assert.equal(recipeDetailPath(origin, '<a href="/us/recipes/example">Recipe</a>'), path)
})

test("robots evaluation distinguishes public and locale-prefixed private paths", () => {
  const rules = defaultRobotsRules(robots)
  assert.ok(rules)
  assert.equal(robotsAllows(rules, "/us/holidays/order-deadlines"), true)
  assert.equal(robotsAllows(rules, "/us/account"), false)
  assert.equal(robotsAllows(rules, "/us/account/orders"), false)
  assert.equal(robotsAllows(defaultRobotsRules("User-agent: *\nDisallow: /") || [], "/us"), false)
  assert.equal(robotsAllows(defaultRobotsRules("User-agent: *\nDisallow: /account") || [], "/us/account"), true)
})

test("a passing cutover produces five redirect, ten canonical, and ten robots rows", async () => {
  type RedirectFixture = { source_path: string; source_query: Record<string, string>; destination: string }
  const redirects: RedirectFixture[] = sampleRedirects().map(({ row }: { row: RedirectFixture }) => row)
  const request = async (input: URL) => {
    const url = new URL(input)
    const row = redirects.find(({ source_path, source_query }) =>
      url.pathname === source_path && Object.entries(source_query).every(([key, value]) => url.searchParams.get(key) === value)
    )
    if (row) return response(308, "", row.destination)
    if (url.pathname === "/robots.txt") return response(200, robots)
    const recipeLink = url.pathname === "/us/recipes" ? '<a href="/us/recipes/example">Recipe</a>' : ""
    return response(200, `<link rel="canonical" href="${origin}${url.pathname}">${recipeLink}`)
  }
  const results = await runChecks(origin, request)
  assert.equal(results.length, 25)
  assert.ok(results.every(({ ok }: { ok: boolean }) => ok), JSON.stringify(results.filter(({ ok }: { ok: boolean }) => !ok)))
})
