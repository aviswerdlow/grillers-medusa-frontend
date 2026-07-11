/**
 * A successful Next.js server-action redirect crosses the action bridge as a
 * rejected promise. Server-side errors normally carry a digest; browser-side
 * deserialization can retain only the canonical message.
 */
export function isExpectedNextRedirect(error: unknown): boolean {
  if (!error) return false

  const record =
    typeof error === "object" ? (error as Record<string, unknown>) : null
  const digest = String(record?.digest || "").trim()
  const message =
    error instanceof Error
      ? error.message.trim()
      : typeof error === "string"
      ? error.trim()
      : String(record?.message || "").trim()

  return (
    digest === "NEXT_REDIRECT" ||
    digest.startsWith("NEXT_REDIRECT;") ||
    message === "NEXT_REDIRECT"
  )
}
