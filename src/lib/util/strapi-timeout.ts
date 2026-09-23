export function strapiTransportTimeoutMs(): number {
  const configured = Number(process.env.STRAPI_FETCH_TIMEOUT_MS)
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : 20_000
}

export function isStrapiTimeout(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 3) return false
  const value = error as {
    name?: string
    code?: string
    cause?: unknown
    response?: { status?: number }
  }
  return (
    value.name === "TimeoutError" ||
    value.name === "AbortError" ||
    value.code === "ETIMEDOUT" ||
    value.code === "UND_ERR_CONNECT_TIMEOUT" ||
    value.response?.status === 504 ||
    isStrapiTimeout(value.cause, depth + 1)
  )
}

export function withStrapiTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `${stage} Strapi query timed out after ${timeoutMs}ms`
      )
      error.name = "TimeoutError"
      reject(error)
    }, timeoutMs)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}
