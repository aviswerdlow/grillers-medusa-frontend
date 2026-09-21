/** Shared with the backend/ingestion lane contract: 3–48 lowercase slug characters. */
export function isRehearsalId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{2,47}$/.test(value)
}
