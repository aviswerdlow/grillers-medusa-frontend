#!/usr/bin/env node

// Read-only cutover preflight. Run against the approved canonical host after DNS
// and the production deployment are in place; this never changes either one.
const manifest = require("../src/lib/data/legacy-redirect-manifest.json")

const STATIC_CANONICAL_PATHS = [
  "/us",
  "/us/store",
  "/us/collections/kosher-beef",
  "/us/collections/kosher-chicken",
  "/us/recipes",
  "/us/learn",
  "/us/customer-service",
  "/us/page/about-us",
]

const ROBOTS_EXPECTATIONS = [
  ["/us", true],
  ["/us/store", true],
  ["/us/holidays/order-deadlines", true],
  ["/us/page/order-sms-terms", true],
  ["/us/account", false],
  ["/us/account/orders", false],
  ["/us/cart", false],
  ["/us/checkout", false],
  ["/us/order/example", false],
  ["/us/api/catalog", false],
]

function parseHost(value) {
  if (!value) throw new Error("Pass --host with the canonical site origin")
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("--host must be an HTTP(S) origin without credentials, path, query, or fragment")
  }
  return url.origin
}

function sampleRedirects(rows = manifest.rows) {
  const redirectRows = rows.filter((row) => row.disposition === "redirect")
  const selectors = [
    ["legacy home", (row) => row.source_path === "/Home.jsp"],
    ["legacy category", (row) => row.source_path === "/CategoryProductList.jsp"],
    ["legacy product", (row) => row.source_path.startsWith("/SPD/") && row.destination.startsWith("/us/products/")],
    ["legacy fallback", (row) => row.source_path.startsWith("/SPD/") && row.destination.startsWith("/us/collections/")],
    ["legacy information", (row) => row.source_path === "/WSWrapper.jsp"],
  ]
  return selectors.map(([label, select]) => {
    const row = redirectRows.find(select)
    if (!row) throw new Error(`Approved redirect manifest has no ${label} sample`)
    return { label, row }
  })
}

function normalizedPath(path) {
  return path === "/" ? path : path.replace(/\/+$/, "")
}

function sortedQuery(searchParams) {
  return [...searchParams.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")
}

async function checkRedirect(origin, row, request = fetch) {
  const source = new URL(row.source_path, origin)
  for (const [key, value] of Object.entries(row.source_query || {})) {
    source.searchParams.append(key, value)
  }
  const first = await request(source, { redirect: "manual" })
  if (![301, 308].includes(first.status)) {
    return { ok: false, detail: `first response ${first.status}; expected permanent 301 or 308` }
  }
  const location = first.headers.get("location")
  if (!location) return { ok: false, detail: "redirect has no Location" }
  const target = new URL(location, source)
  if (
    target.origin !== origin ||
    normalizedPath(target.pathname) !== normalizedPath(row.destination) ||
    target.hash ||
    (target.search && sortedQuery(target.searchParams) !== sortedQuery(source.searchParams))
  ) {
    return { ok: false, detail: `unexpected Location ${target.href}` }
  }
  const second = await request(target, { redirect: "manual" })
  if (second.status !== 200) {
    return { ok: false, detail: `target returned ${second.status}; expected 200 without another hop` }
  }
  return { ok: true, detail: `${first.status} → ${target.pathname}${target.search} → 200` }
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
  return match && (match[1] ?? match[2] ?? match[3])
}

function checkCanonical(origin, path, status, html) {
  if (status !== 200) return { ok: false, detail: `HTTP ${status}; expected 200` }
  const canonicalHrefs = [...html.matchAll(/<link\b[^>]*>/gi)]
    .filter(([tag]) => (attribute(tag, "rel") || "").toLowerCase().split(/\s+/).includes("canonical"))
    .map(([tag]) => attribute(tag, "href"))
  if (canonicalHrefs.length !== 1 || !canonicalHrefs[0]) {
    return { ok: false, detail: `${canonicalHrefs.length} canonical tags; expected exactly 1` }
  }
  const href = canonicalHrefs[0]
  if (!/^https?:\/\//i.test(href)) return { ok: false, detail: `canonical is not absolute: ${href}` }
  const canonical = new URL(href)
  if (
    canonical.origin !== origin ||
    normalizedPath(canonical.pathname) !== normalizedPath(path) ||
    canonical.search ||
    canonical.hash
  ) {
    return { ok: false, detail: `unexpected canonical ${href}` }
  }
  return { ok: true, detail: href }
}

function recipeDetailPath(origin, html) {
  for (const [, href] of html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const url = new URL(href, origin)
    if (url.origin === origin && /^\/us\/recipes\/[^/]+\/?$/.test(url.pathname) && !url.search) {
      return normalizedPath(url.pathname)
    }
  }
  return null
}

function defaultRobotsRules(text) {
  const groups = []
  let agents = []
  let rules = []
  function finish() {
    if (agents.length) groups.push({ agents, rules })
    agents = []
    rules = []
  }
  for (const sourceLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = sourceLine.replace(/#.*$/, "").trim()
    const match = line.match(/^(user-agent|allow|disallow):\s*(.*)$/i)
    if (!match) continue
    const directive = match[1].toLowerCase()
    const value = match[2].trim()
    if (directive === "user-agent") {
      if (rules.length) finish()
      agents.push(value.toLowerCase())
    } else if (agents.length && value) {
      rules.push({ allow: directive === "allow", pattern: value })
    }
  }
  finish()
  return groups.find(({ agents: groupAgents }) => groupAgents.includes("*"))?.rules || null
}

function robotsAllows(rules, path) {
  const matches = rules
    .filter(({ pattern }) => {
      const anchored = pattern.endsWith("$")
      const plain = anchored ? pattern.slice(0, -1) : pattern
      const regex = plain.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replace(/\*/g, ".*")
      return new RegExp(`^${regex}${anchored ? "$" : ""}`).test(path)
    })
    .sort((a, b) => b.pattern.replace(/\*/g, "").length - a.pattern.replace(/\*/g, "").length || Number(b.allow) - Number(a.allow))
  return matches.length ? matches[0].allow : true
}

async function runChecks(origin, request = fetch) {
  const results = []
  const fetchManual = (url) => request(url, {
    redirect: "manual",
    ...(typeof AbortSignal.timeout === "function" ? { signal: AbortSignal.timeout(15000) } : {}),
  })
  const cache = new Map()
  async function page(path) {
    if (!cache.has(path)) {
      const response = await fetchManual(new URL(path, origin))
      cache.set(path, { status: response.status, text: await response.text() })
    }
    return cache.get(path)
  }
  for (const { label, row } of sampleRedirects()) {
    try {
      results.push({ check: label, target: row.source_path, ...await checkRedirect(origin, row, fetchManual) })
    } catch (error) {
      results.push({ check: label, target: row.source_path, ok: false, detail: String(error.message || error) })
    }
  }
  let recipePath = null
  try {
    const recipes = await page("/us/recipes")
    if (recipes.status === 200) recipePath = recipeDetailPath(origin, recipes.text)
  } catch {
    // The recipe hub gets its own canonical failure below.
  }
  const productPath = sampleRedirects().find(({ label }) => label === "legacy product").row.destination
  for (const path of [...STATIC_CANONICAL_PATHS, productPath, recipePath]) {
    if (!path) {
      results.push({ check: "canonical", target: "recipe detail", ok: false, detail: "no recipe detail link found on /us/recipes" })
      continue
    }
    try {
      const response = await page(path)
      results.push({ check: "canonical", target: path, ...checkCanonical(origin, path, response.status, response.text) })
    } catch (error) {
      results.push({ check: "canonical", target: path, ok: false, detail: String(error.message || error) })
    }
  }
  try {
    const response = await page("/robots.txt")
    const rules = response.status === 200 ? defaultRobotsRules(response.text) : null
    for (const [path, expectedAllowed] of ROBOTS_EXPECTATIONS) {
      const allowed = rules && robotsAllows(rules, path)
      results.push({
        check: "robots",
        target: path,
        ok: allowed === expectedAllowed,
        detail: !rules ? `HTTP ${response.status} or no User-agent: * group` : `${allowed ? "allowed" : "blocked"}; expected ${expectedAllowed ? "allowed" : "blocked"}`,
      })
    }
  } catch (error) {
    results.push({ check: "robots", target: "/robots.txt", ok: false, detail: String(error.message || error) })
  }
  return results
}

function printTable(results) {
  const cell = (value, max) => value.length > max ? `${value.slice(0, max - 1)}…` : value
  const rows = [["Result", "Check", "Target", "Detail"], ...results.map((row) => [
    row.ok ? "PASS" : "FAIL", row.check, cell(row.target, 72), cell(row.detail, 110),
  ])]
  const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => row[index].length)))
  for (const row of rows) {
    console.log(row.map((value, index) => value.padEnd(widths[index])).join(" | "))
  }
  console.log(`${results.filter((row) => row.ok).length}/${results.length} checks passed`)
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("Usage: yarn cutover:check --host https://www.grillerspride.com")
    return
  }
  const hostIndex = argv.indexOf("--host")
  const host = hostIndex >= 0 ? argv[hostIndex + 1] : argv.find((arg) => arg.startsWith("--host="))?.slice(7)
  const origin = parseHost(host)
  const results = await runChecks(origin)
  printTable(results)
  if (results.some((row) => !row.ok)) process.exitCode = 1
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error)
    process.exitCode = 2
  })
}

module.exports = {
  parseHost,
  sampleRedirects,
  checkRedirect,
  checkCanonical,
  recipeDetailPath,
  defaultRobotsRules,
  robotsAllows,
  runChecks,
}
