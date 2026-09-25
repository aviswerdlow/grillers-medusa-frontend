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

async function warm(
  surface,
  handle,
  { deployment, revalidateSecret, fetchImpl = fetch }
) {
  const context = `surface=${surface}, handle=${handle ?? "<none>"}`
  let response
  try {
    response = await fetchImpl(new URL("/api/revalidate", deployment), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${revalidateSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: "deployment.ready", surface, handle }),
      signal: AbortSignal.timeout(70_000),
    })
  } catch (error) {
    throw new Error(
      `Warm-up request failed (${context}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }

  let result
  try {
    result = await response.json()
  } catch (error) {
    throw new Error(
      `Warm-up response failed (${context}, status=${response.status}): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    )
  }
  if (!response.ok || !result?.warmed) {
    throw new Error(
      `Warm-up failed (${context}, status=${response.status})`
    )
  }
  return result
}

module.exports = { warmRoute, warm }
