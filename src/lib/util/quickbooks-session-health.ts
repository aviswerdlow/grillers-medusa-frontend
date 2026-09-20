export type QuickBooksSessionHealth = {
  version: 1
  state: "fresh" | "stale" | "unknown" | "rejected"
  activity: "reported_open" | "idle" | "unconfirmed"
  observed_at: string
  max_age_seconds: number
  age_seconds: number | null
  last_auth_at: string | null
  last_auth_status: string
  last_accepted_auth_at: string | null
  expires_at: string | null
  issue: string | null
  completion_evidence: "not_recorded"
  owner: string | null
  monitor: {
    checked_at: string
    state: string
    delivery: string
    last_sink_accepted_at: string | null
    last_recovered_at: string | null
  } | null
}

/** Age from server evidence plus elapsed time; never trust the legacy active flag. */
export function quickBooksSessionView(
  health: QuickBooksSessionHealth | undefined,
  elapsedMs: number
) {
  if (
    !health ||
    health.version !== 1 ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0
  ) {
    return { state: "unknown", title: "Session status unavailable" }
  }
  let state = health.state
  if (state === "fresh") {
    if (
      health.age_seconds === null ||
      !Number.isFinite(health.age_seconds) ||
      !Number.isFinite(health.max_age_seconds) ||
      health.max_age_seconds <= 0 ||
      health.last_auth_status !== "success"
    )
      state = "unknown"
    else if (health.age_seconds + elapsedMs / 1000 >= health.max_age_seconds)
      state = "stale"
  }
  const title =
    state === "stale"
      ? "Web Connector session is stale"
      : state === "rejected"
      ? "Web Connector sign-in was rejected"
      : state === "fresh"
      ? health.activity === "reported_open"
        ? "Recent sign-in; session reported open"
        : "Recent sign-in; connector idle"
      : "Session status unavailable"
  return { state, title }
}
