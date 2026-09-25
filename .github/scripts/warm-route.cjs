async function warmRoute(path, deployment, { allowNotFound = false, fetchImpl = fetch } = {}) {
  let response
  try {
    response = await fetchImpl(new URL(path, deployment), {
      redirect: "error",
      signal: AbortSignal.timeout(70_000),
    })
  } catch (error) {
    throw new Error(`Route ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (allowNotFound && response.status === 404) return "not_found"

  let html
  try {
    html = await response.text()
  } catch (error) {
    throw new Error(`Route ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!response.ok || html.includes("Collection temporarily unavailable")) {
    throw new Error(`Route ${path}: warm-up failed (${response.status})`)
  }
  return "warmed"
}

module.exports = { warmRoute }
