import { readFile } from "node:fs/promises"
import warmRouteModule from "./warm-route.cjs"

const { warmRoute } = warmRouteModule

const {
  DEPLOY_SHA,
  DEPLOYMENT_URL,
  GITHUB_REPOSITORY,
  GH_TOKEN,
  REVALIDATE_SECRET,
} = process.env

if (
  !DEPLOY_SHA ||
  !DEPLOYMENT_URL ||
  !GITHUB_REPOSITORY ||
  !GH_TOKEN ||
  !REVALIDATE_SECRET
) {
  throw new Error("Missing production deployment warm-up configuration")
}

const deployment = new URL(DEPLOYMENT_URL)
const productionAliases = new Set([
  "grillers-medusa-frontend.vercel.app",
  "www.grillerspride.com",
])
if (
  deployment.protocol !== "https:" ||
  deployment.username ||
  deployment.password ||
  deployment.port ||
  !(
    /^grillers-medusa-frontend-[a-z0-9]+-griller-s-pride\.vercel\.app$/.test(
      deployment.hostname
    ) || productionAliases.has(deployment.hostname)
  )
) {
  throw new Error("Unexpected production deployment URL")
}
console.log(`Production warm-up target: ${deployment.hostname}`)

const branchResponse = await fetch(
  `https://api.github.com/repos/${GITHUB_REPOSITORY}/branches/main`,
  {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GH_TOKEN}`,
    },
    signal: AbortSignal.timeout(10_000),
  }
)
if (!branchResponse.ok) {
  throw new Error(`Could not read storefront main (${branchResponse.status})`)
}
const main = await branchResponse.json()
if (main.commit?.sha !== DEPLOY_SHA) {
  console.log(`Skipping superseded deployment ${DEPLOY_SHA}`)
  process.exit(0)
}

async function warm(surface, handle) {
  const response = await fetch(new URL("/api/revalidate", deployment), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REVALIDATE_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event: "deployment.ready", surface, handle }),
    signal: AbortSignal.timeout(70_000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.warmed) {
    throw new Error(
      `${surface}${handle ? `/${handle}` : ""} warm-up failed (${
        response.status
      })`
    )
  }
  return result
}

const store = await warm("store")
if (store.visibleProductCount < 1) {
  throw new Error("Store catalog warm-up returned no visible products")
}
console.log(
  `Warmed ${store.visibleProductCount} visible store products on ${DEPLOY_SHA}`
)

const manifest = JSON.parse(
  await readFile(
    new URL(
      "../../src/lib/data/legacy-redirect-manifest.json",
      import.meta.url
    ),
    "utf8"
  )
)
const handles = Array.from(
  new Set(
    manifest.rows
      .map(
        (row) =>
          row.destination?.match(/^\/us\/collections\/([a-z0-9-]+)$/)?.[1]
      )
      .filter(Boolean)
  )
).sort()
if (handles.length === 0) {
  throw new Error("No collection handles found in the redirect manifest")
}

const failures = []
try {
  await warm("home")
  await warmRoute("/us", deployment)
  console.log("Warmed homepage CMS queries and route")
} catch (error) {
  failures.push(String(error.message || error))
}

// Keep Strapi traffic bounded while filling every distinct manifest handle.
let cursor = 0
let collectionsWarmed = 0
const worker = async () => {
  while (cursor < handles.length) {
    const handle = handles[cursor++]
    try {
      await warm("collection", handle)
      await warmRoute(`/us/collections/${handle}`, deployment)
      collectionsWarmed++
    } catch (error) {
      failures.push(String(error.message || error))
    }
  }
}
await Promise.all(Array.from({ length: 4 }, () => worker()))
console.log(`Warmed ${collectionsWarmed}/${handles.length} manifest collections`)

// These are the published routes handled by customer-service/page.tsx and
// page/[slug]/page.tsx. These visits fill the CMS result cache for published
// pages; a 404 can also mean an entry is not published yet.
const informationPaths = [
  "/us/customer-service",
  ...[
    "about-us",
    "our-mission",
    "careers",
    "catch-weight-pricing",
    "wholesale",
    "specialty",
    "privacy-policy",
    "terms-of-sale",
    "terms-of-use",
    "sms-terms",
    "order-sms-terms",
    "order-sms-privacy",
  ].map((slug) => `/us/page/${slug}`),
]
let informationCursor = 0
let informationWarmed = 0
let informationSkipped = 0
const informationWorker = async () => {
  while (informationCursor < informationPaths.length) {
    const path = informationPaths[informationCursor++]
    try {
      const result = await warmRoute(path, deployment, {
        allowNotFound: path.startsWith("/us/page/"),
      })
      if (result === "not_found") informationSkipped++
      else informationWarmed++
    } catch (error) {
      failures.push(String(error.message || error))
    }
  }
}
await Promise.all(Array.from({ length: 4 }, () => informationWorker()))
console.log(`Warmed ${informationWarmed}/${informationPaths.length - informationSkipped} available information routes; skipped ${informationSkipped} 404 routes`)
if (failures.length) {
  throw new Error(`Production warm-up incomplete: ${failures.join(", ")}`)
}
