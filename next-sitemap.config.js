/** @type {import('next-sitemap').IConfig} */

const fs = require("node:fs")
const path = require("node:path")
const { createHash, randomUUID } = require("node:crypto")

const {
  publicOrigin,
  privatePaths,
  privateSitemapPaths,
  isPublicPath,
  isIndexableDeployment,
} = require("./src/lib/util/site-policy.cjs")
const siteUrl = publicOrigin()
const excludedPaths = [
  ...privateSitemapPaths,
  "/opengraph-image.jpg",
  "/twitter-image.jpg",
  "/*.jsp",
  "/SPD/*",
]

const crawlerUserAgents = [
  "*",
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
]

const staticPublicPaths = [
  { path: "/us", priority: 1.0, changefreq: "daily" },
  { path: "/us/store", priority: 0.9, changefreq: "daily" },
  { path: "/us/collections", priority: 0.8, changefreq: "weekly" },
  { path: "/us/recipes", priority: 0.8, changefreq: "weekly" },
  { path: "/us/learn", priority: 0.9, changefreq: "weekly" },
  { path: "/us/customer-service", priority: 0.6, changefreq: "monthly" },
  { path: "/us/shipping/ups", priority: 0.7, changefreq: "monthly" },
  { path: "/us/shipping/local-delivery", priority: 0.7, changefreq: "monthly" },
  {
    path: "/us/shipping/southeast-pickup",
    priority: 0.7,
    changefreq: "monthly",
  },
  { path: "/us/shipping/plant-pickup", priority: 0.7, changefreq: "monthly" },
  { path: "/us/shipping/pallet-program", priority: 0.6, changefreq: "monthly" },
  { path: "/us/holidays/order-deadlines", priority: 0.7, changefreq: "weekly" },
  { path: "/us/kashruth/passover", priority: 0.8, changefreq: "monthly" },
  { path: "/us/kashruth/hechsherim", priority: 0.8, changefreq: "monthly" },
  { path: "/us/kashruth/supervision", priority: 0.8, changefreq: "monthly" },
  { path: "/us/page/about-us", priority: 0.5, changefreq: "monthly" },
  { path: "/us/page/our-mission", priority: 0.5, changefreq: "monthly" },
  { path: "/us/page/wholesale", priority: 0.6, changefreq: "monthly" },
  { path: "/us/careers", priority: 0.4, changefreq: "monthly" },
]

const learnSlugs = [
  "kosher-meat-101",
  "cuts",
  "cuts/beef",
  "cuts/lamb",
  "cuts/poultry",
  "cuts/veal",
  "cuts/prepared-specialty",
  "guides/how-much-meat-per-person",
  "guides/brisket-first-cut-deckel-whole",
  "guides/best-cuts-for-slow-cooking",
  "guides/best-cuts-for-grilling",
  "guides/thawing-frozen-kosher-meat",
  "guides/shabbos-meat-order",
]

const { isInternalMedusaProduct } = require("./src/lib/util/public-catalog.cjs")

function errorMessage(error) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function buildOpsAlertFingerprint(source, alertKind, title) {
  const normalizedTitle = String(title || "")
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, "#")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()

  return createHash("sha1")
    .update(`${source}:${alertKind}:${normalizedTitle}`)
    .digest("hex")
}

function resolveOpsAlertIngestion() {
  const endpoint = (
    process.env.GP_ANALYTICS_ENDPOINT ||
    process.env.NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT ||
    ""
  ).replace(/\/+$/, "")
  const key =
    process.env.GP_ANALYTICS_SERVER_KEY ||
    process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY ||
    ""

  if (!endpoint || !key) return null
  return { url: `${endpoint}/v1/track`, key }
}

async function emitSitemapSourceFailureAlert({
  source,
  error,
  fallbackCount,
  willThrow,
}) {
  const ingestion = resolveOpsAlertIngestion()
  if (!ingestion) return

  const alertKind = willThrow
    ? "sitemap_source_failed"
    : "sitemap_source_degraded"
  const title = willThrow
    ? `Sitemap ${source} source failed without fallback`
    : `Sitemap ${source} source failed; ${
        fallbackCount ? "using previous entries" : "omitting unverified entries"
      }`
  const alertSource = "storefront-build"

  try {
    await fetch(ingestion.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ingestion.key}`,
      },
      body: JSON.stringify({
        event: "ops_alert",
        event_id: randomUUID(),
        event_timestamp_ms: Date.now(),
        source: alertSource,
        properties: {
          alert_kind: alertKind,
          severity: willThrow ? "page" : "warn",
          fingerprint: buildOpsAlertFingerprint(alertSource, alertKind, title),
          path: "next-sitemap.config.js",
          title,
          url: null,
          release: process.env.NEXT_PUBLIC_RELEASE_SHA || null,
          env: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
          sitemap_source: source,
          fallback_entry_count: fallbackCount,
          error_message: errorMessage(error).slice(0, 300),
        },
        context: {
          library: {
            name: "grillers-medusa-frontend-sitemap-alert",
            version: "0.1.0",
          },
        },
      }),
    })
  } catch (alertError) {
    console.warn("[next-sitemap] Sitemap source alert failed:", alertError)
  }
}

function sitemapFallbackPath() {
  return (
    process.env.NEXT_SITEMAP_FALLBACK_FILE ||
    path.join(process.cwd(), "public", "sitemap-0.xml")
  )
}

function existingSitemapEntries(kind) {
  const filePath = sitemapFallbackPath()
  if (!fs.existsSync(filePath)) return []

  const xml = fs.readFileSync(filePath, "utf8")
  const entryPattern = /<url>([\s\S]*?)<\/url>/g
  const entries = []
  let match

  while ((match = entryPattern.exec(xml))) {
    const block = match[1]
    const loc = block.match(/<loc>([\s\S]*?)<\/loc>/)?.[1] || ""
    let pathname = loc
    try {
      pathname = new URL(loc).pathname
    } catch {
      pathname = loc.replace(siteUrl, "")
    }

    const isMatch =
      kind === "products"
        ? pathname.startsWith("/us/products/")
        : pathname.startsWith("/us/recipes/")

    if (!isMatch) continue

    const lastmod = block.match(/<lastmod>([\s\S]*?)<\/lastmod>/)?.[1]
    const changefreq =
      block.match(/<changefreq>([\s\S]*?)<\/changefreq>/)?.[1] ||
      (kind === "products" ? "weekly" : "weekly")
    const priorityText = block.match(/<priority>([\s\S]*?)<\/priority>/)?.[1]
    const priority =
      priorityText && Number.isFinite(Number(priorityText))
        ? Number(priorityText)
        : kind === "products"
        ? 0.8
        : 0.75

    entries.push({
      loc: pathname,
      changefreq,
      priority,
      ...(lastmod ? { lastmod } : {}),
    })
  }

  return entries
}

function shouldFailClosedWithoutSitemapFallback() {
  if (process.env.NEXT_SITEMAP_FAIL_CLOSED === "false") return false
  return (
    process.env.NEXT_SITEMAP_FAIL_CLOSED === "true" ||
    process.env.VERCEL_ENV === "production"
  )
}

async function dynamicSitemapEntries({ source, load, fallbackKind }) {
  try {
    return await load()
  } catch (error) {
    // Old product URLs have no current eligibility proof. Reusing them can
    // publish an item that has since become an internal production input.
    const fallbackEntries =
      fallbackKind === "products" ? [] : existingSitemapEntries(fallbackKind)
    const willThrow =
      fallbackEntries.length === 0 && shouldFailClosedWithoutSitemapFallback()

    console.warn(`[next-sitemap] ${source} sitemap fetch failed:`, error)
    await emitSitemapSourceFailureAlert({
      source,
      error,
      fallbackCount: fallbackEntries.length,
      willThrow,
    })

    if (fallbackEntries.length > 0) {
      console.warn(
        `[next-sitemap] Using ${fallbackEntries.length} previous ${source} sitemap entries.`
      )
      return fallbackEntries
    }

    if (willThrow) {
      throw error
    }

    return []
  }
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return response.json()
}

async function fetchGraphql(query, variables) {
  const endpoint = process.env.STRAPI_ENDPOINT
  const token = process.env.STRAPI_API_TOKEN
  if (!endpoint || !token) {
    throw new Error(
      "Recipe sitemap source not configured: STRAPI_ENDPOINT/STRAPI_API_TOKEN missing."
    )
  }

  const response = await fetch(`${endpoint.replace(/\/$/, "")}/graphql`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  if (data.errors?.length) {
    throw new Error(data.errors.map((error) => error.message).join("; "))
  }

  return data.data
}

async function getUsRegionId(headers) {
  const backendUrl = process.env.MEDUSA_BACKEND_URL
  if (!backendUrl) return null

  const data = await fetchJson(`${backendUrl}/store/regions`, headers)
  const region = data.regions?.find((candidate) =>
    candidate.countries?.some((country) => country.iso_2 === "us")
  )

  return region?.id || null
}

async function getProductSitemapEntries() {
  const backendUrl = process.env.MEDUSA_BACKEND_URL
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

  if (!backendUrl || !publishableKey) {
    throw new Error(
      "Product sitemap source not configured: MEDUSA_BACKEND_URL/NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY missing."
    )
  }

  const headers = { "x-publishable-api-key": publishableKey }
  const regionId = await getUsRegionId(headers)
  const limit = 100
  let offset = 0
  let count = 0
  const entries = []

  do {
    const url = new URL(`${backendUrl}/store/products`)
    url.searchParams.set("limit", String(limit))
    url.searchParams.set("offset", String(offset))
    url.searchParams.set("fields", "handle,updated_at,*variants,+metadata")
    if (regionId) url.searchParams.set("region_id", regionId)

    const data = await fetchJson(url.toString(), headers)
    const products = data.products || []
    count = data.count || products.length

    entries.push(
      ...products
        .filter((product) => product.handle)
        .filter((product) => !isInternalMedusaProduct(product))
        .map((product) => ({
          loc: `/us/products/${product.handle}`,
          changefreq: "weekly",
          priority: 0.8,
          lastmod: product.updated_at || new Date().toISOString(),
        }))
    )

    offset += limit
  } while (offset < count)

  return entries
}

const recipeSitemapQuery = `
  query RecipeSitemap($page: Int!, $pageSize: Int!) {
    recipes_connection(
      pagination: { page: $page, pageSize: $pageSize }
      sort: ["PublishedDate:desc"]
      status: PUBLISHED
      filters: {
        Title: { notContainsi: "Recipe Title" }
        ShortDescription: { notContainsi: "Etiam id nisi" }
      }
    ) {
      nodes {
        Slug
        PublishedDate
        updatedAt
      }
      pageInfo {
        page
        pageCount
        total
      }
    }
  }
`

async function getRecipeSitemapEntries() {
  const pageSize = 100
  let page = 1
  let pageCount = 1
  const entries = []

  do {
    const data = await fetchGraphql(recipeSitemapQuery, { page, pageSize })
    const connection = data?.recipes_connection
    const recipes = connection?.nodes || []

    entries.push(
      ...recipes
        .filter((recipe) => recipe.Slug)
        .map((recipe) => ({
          loc: `/us/recipes/${recipe.Slug}`,
          changefreq: "weekly",
          priority: 0.75,
          lastmod:
            recipe.updatedAt ||
            (recipe.PublishedDate
              ? new Date(recipe.PublishedDate).toISOString()
              : new Date().toISOString()),
        }))
    )

    pageCount = connection?.pageInfo?.pageCount || pageCount
    page += 1
  } while (page <= pageCount)

  return entries
}

module.exports = {
  siteUrl,
  generateRobotsTxt: true,
  generateIndexSitemap: true,
  exclude: excludedPaths,
  changefreq: "daily",
  priority: 0.7,
  sitemapSize: 5000,
  robotsTxtOptions: {
    policies: crawlerUserAgents.map((userAgent) => ({
      userAgent,
      ...(isIndexableDeployment()
        ? { allow: "/", disallow: privatePaths }
        : { disallow: ["/"] }),
    })),
    additionalSitemaps: [
      // Add any additional sitemaps here if needed
    ],
  },
  additionalPaths: async () => {
    if (!isIndexableDeployment()) return []
    const now = new Date().toISOString()
    const staticEntries = staticPublicPaths.map((entry) => ({
      loc: entry.path,
      changefreq: entry.changefreq,
      priority: entry.priority,
      lastmod: now,
    }))
    const learnEntries = learnSlugs.map((slug) => ({
      loc: `/us/learn/${slug}`,
      changefreq: "weekly",
      priority: slug === "cuts" ? 0.9 : 0.8,
      lastmod: now,
    }))

    const productEntries = await dynamicSitemapEntries({
      source: "product",
      load: getProductSitemapEntries,
      fallbackKind: "products",
    })
    const recipeEntries = await dynamicSitemapEntries({
      source: "recipe",
      load: getRecipeSitemapEntries,
      fallbackKind: "recipes",
    })

    return [
      ...staticEntries,
      ...learnEntries,
      ...productEntries,
      ...recipeEntries,
    ].filter(
      (entry, index, entries) =>
        isPublicPath(entry.loc) &&
        entries.findIndex((other) => other.loc === entry.loc) === index
    )
  },
  // Transform function to customize sitemap entries
  transform: async (config, path) => {
    if (!isIndexableDeployment() || !isPublicPath(path)) return null
    // Higher priority for main pages
    let priority = config.priority
    let changefreq = config.changefreq

    if (path === "/" || path.match(/^\/[a-z]{2}$/)) {
      priority = 1.0
      changefreq = "daily"
    } else if (path.includes("/products/")) {
      priority = 0.8
      changefreq = "weekly"
    } else if (path.includes("/collections/")) {
      priority = 0.8
      changefreq = "weekly"
    } else if (path.includes("/recipes/")) {
      priority = 0.7
      changefreq = "weekly"
    } else if (path.includes("/store")) {
      priority = 0.9
      changefreq = "daily"
    }

    return {
      loc: path,
      changefreq,
      priority,
      lastmod: config.autoLastmod ? new Date().toISOString() : undefined,
    }
  },
}
