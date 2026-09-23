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

const response = await fetch(new URL("/api/revalidate", deployment), {
  method: "POST",
  headers: {
    Authorization: `Bearer ${REVALIDATE_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ event: "deployment.ready" }),
  signal: AbortSignal.timeout(45_000),
})
const result = await response.json()
if (!response.ok || !result.warmed || result.visibleProductCount < 1) {
  throw new Error(`Store catalog warm-up failed (${response.status})`)
}
console.log(
  `Warmed ${result.visibleProductCount} visible store products on ${DEPLOY_SHA}`
)
