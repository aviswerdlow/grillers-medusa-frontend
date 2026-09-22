function origin(value) {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Site URL must be an HTTP(S) origin without credentials, path, query or fragment"
    )
  }
  return url.origin
}
function configuredCanonical(env = process.env) {
  return (
    env.NEXT_PUBLIC_CANONICAL_BASE_URL || env.NEXT_PUBLIC_PRODUCTION_BASE_URL
  )
}
function canonicalOrigin(env = process.env) {
  return origin(
    configuredCanonical(env) ||
      env.NEXT_PUBLIC_BASE_URL ||
      "https://grillers-medusa-frontend.vercel.app"
  )
}
function publicOrigin(env = process.env) {
  if (env.VERCEL_ENV === "production") return canonicalOrigin(env)
  const preview = env.NEXT_PUBLIC_VERCEL_URL || env.VERCEL_URL
  if (env.VERCEL_ENV === "preview" && preview) return origin(preview)
  return origin(env.NEXT_PUBLIC_BASE_URL || preview || "http://localhost:8000")
}
function isIndexableDeployment(env = process.env) {
  if (env.VERCEL_ENV !== "production" || !configuredCanonical(env)) return false
  const url = new URL(canonicalOrigin(env))
  return (
    url.protocol === "https:" &&
    !url.hostname.endsWith(".vercel.app") &&
    url.hostname !== "localhost"
  )
}
const privateRoots = ["account", "cart", "checkout", "order", "api"]
const privatePaths = privateRoots.flatMap((root) => [
  `/${root}`,
  `/${root}/*`,
  `/us/${root}`,
  `/us/${root}/*`,
  `/*/${root}`,
  `/*/${root}/*`,
])
function isPublicPath(value) {
  try {
    const parsed = new URL(value, "https://path.invalid")
    const path = decodeURIComponent(parsed.pathname).toLowerCase()
    return (
      !parsed.search &&
      !parsed.hash &&
      !/^\/(?:[a-z]{2}\/)?(?:account|cart|checkout|order|api)(?:\/|$)/.test(
        path
      ) &&
      !/\.jsp(?:\/|$)/.test(path) &&
      !/^\/spd(?:\/|$)/.test(path)
    )
  } catch {
    return false
  }
}
function crawlerHeaders(env = process.env) {
  if (!isIndexableDeployment(env))
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ]
  return [
    ...privateRoots.flatMap((root) => [
      `/${root}/:path*`,
      `/:countryCode([a-z]{2})/${root}/:path*`,
    ]),
    "/:legacy(.*\\.jsp)",
  ].map((source) => ({
    source,
    headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
  }))
}
module.exports = {
  origin,
  canonicalOrigin,
  publicOrigin,
  isIndexableDeployment,
  privatePaths,
  isPublicPath,
  crawlerHeaders,
}
