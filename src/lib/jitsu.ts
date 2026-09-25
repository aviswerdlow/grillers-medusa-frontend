/**
 * Jitsu analytics client — sends events to the Jitsu Classic server
 * via /api/v1/event endpoint with token-based auth.
 *
 * The @jitsu/js SDK uses the newer /api/s/ format which is incompatible
 * with our jitsucom/server:latest instance, so we use direct fetch.
 */

import { reportClientOpsAlert } from "@lib/client-ops-alert"
import { hasConsent } from "@lib/utils/cookies"
import {
  browserAnalyticsDestination,
  getBrowserAnalyticsContext,
  isServerOwnedAnalyticsEvent,
  type BrowserAnalyticsContext,
} from "@lib/analytics/browser-boundary"

const COOKIE_ANON_ID = "_gp_anon_id"
const COOKIE_USER_ID = "_gp_user_id"
const COOKIE_SESSION_ID = "_gp_session_id"
const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const ANALYTICS_FAILURE_ALERT_THROTTLE_MS = 5 * 60 * 1000

let globalContext: Record<string, string> = {
  experience_version: "medusa",
  route_market: "unknown",
  customer_type: "unknown",
}

let experimentContext: Record<string, any> = {}
let userTraits: Record<string, any> = {}
const analyticsFailureAlertLastSeen = new Map<string, number>()

type GpAnalyticsPayload = {
  event: string
  event_id: string
  event_timestamp_ms: number
  anonymous_id?: string
  user_id?: string
  session_id: string
  experience_version: "legacy" | "medusa"
  route_market: "atlanta_metro" | "southeast" | "national" | "unknown"
  fulfillment_tier?: string | null
  customer_type: "dtc" | "institutional" | "unknown"
  source: "client"
  properties: Record<string, any>
  context: Record<string, any>
}

const GP_ANALYTICS_CONTEXT_KEYS = new Set([
  "anonymous_id",
  "customer_type",
  "event_id",
  "event_timestamp_ms",
  "experience_version",
  "experiment_context",
  "fulfillment_tier",
  "locale",
  "page",
  "route_market",
  "screen",
  "session_id",
  "timezone",
  "user",
  "user_agent",
  "user_id",
])

function getUserId(): string | undefined {
  const id = getCookie(COOKIE_USER_ID)
  return id && !id.includes("@") ? id : undefined
}

// ── Cookie helpers ──────────────────────────────────────────────

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  try {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
    return match ? decodeURIComponent(match[2]) : null
  } catch {
    return null
  }
}

function setCookie(name: string, value: string, maxAgeSec: number) {
  if (typeof document === "undefined") return
  try {
    const secure =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? ";Secure"
        : ""
    document.cookie = `${name}=${encodeURIComponent(
      value
    )};path=/;max-age=${maxAgeSec};SameSite=Lax${secure}`
  } catch {
    // Analytics identifiers are optional. Storage failures must not affect UX.
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to a local fallback for constrained browser contexts.
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function eventName(payload: Record<string, any>): string {
  return String(payload.event_type || payload.event || "unknown").slice(0, 80)
}

function analyticsFailureReason(input: {
  status?: number | null
  stage: "non_2xx" | "request_failed" | "exception"
}) {
  if (typeof input.status === "number" && Number.isFinite(input.status)) {
    return `http_${Math.trunc(input.status)}`
  }
  return input.stage
}

function reportAnalyticsDeliveryFailure(input: {
  target: "jitsu_classic" | "communications_ingestion" | "gp_analytics"
  stage: "non_2xx" | "request_failed" | "exception"
  payload: Record<string, any>
  status?: number | null
  error?: unknown
}) {
  if (
    typeof window === "undefined" ||
    !hasConsent("analytics") ||
    input.payload.eventn_ctx?.analytics_environment !== "production"
  )
    return

  const reason = analyticsFailureReason({
    status: input.status,
    stage: input.stage,
  })
  const key = `${input.target}:${input.stage}:${reason}`
  const now = Date.now()
  const lastSeen = analyticsFailureAlertLastSeen.get(key) || 0
  if (now - lastSeen < ANALYTICS_FAILURE_ALERT_THROTTLE_MS) return
  analyticsFailureAlertLastSeen.set(key, now)

  reportClientOpsAlert({
    alertKind: "client_analytics_delivery_failed",
    title: `Storefront analytics delivery failed: ${input.target}`,
    surface: "analytics_delivery",
    action: input.target,
    reason,
    statusCode: input.status ?? null,
    target: input.target,
    eventName: eventName(input.payload),
    error: input.error,
  })
}

// ── Anonymous ID (persists across sessions, 1-year expiry) ──────

function getAnonymousId(): string {
  let id = getCookie(COOKIE_ANON_ID)
  if (!id) {
    id = randomId()
    setCookie(COOKIE_ANON_ID, id, 365 * 24 * 60 * 60)
  }
  return id
}

// ── Session ID (30-min sliding window) ──────────────────────────

function getSessionId(): string {
  let id = getCookie(COOKIE_SESSION_ID)
  if (!id) {
    id = randomId()
  }
  // Reset the sliding expiry on every call
  setCookie(COOKIE_SESSION_ID, id, SESSION_TIMEOUT_MS / 1000)
  return id
}

export function getJitsuIdentityContext(): {
  anonymous_id: string
  session_id: string
  user_id?: string
} {
  if (!getBrowserAnalyticsContext()) {
    if (!hasConsent("analytics")) {
      setCookie(COOKIE_ANON_ID, "", 0)
      setCookie(COOKIE_SESSION_ID, "", 0)
      setCookie(COOKIE_USER_ID, "", 0)
      userTraits = {}
    }
    return { anonymous_id: "", session_id: "" }
  }
  return {
    anonymous_id: getAnonymousId(),
    session_id: getSessionId(),
    user_id: getUserId(),
  }
}

export function getJitsuContextSnapshot(): Record<
  string,
  string | undefined
> & {
  anonymous_id: string
  session_id: string
  user_id?: string
} {
  return {
    ...globalContext,
    ...getJitsuIdentityContext(),
  }
}

// ── Send event to Jitsu Classic /api/v1/event ───────────────────

function sendEvent(
  payload: Record<string, any>,
  context: BrowserAnalyticsContext
) {
  if (typeof window === "undefined" || !getBrowserAnalyticsContext()) return

  const destination = browserAnalyticsDestination(context, "jitsu")
  const body = JSON.stringify(payload)

  if (destination) {
    const url = `${destination.url}?token=${encodeURIComponent(
      destination.key
    )}`
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      })
        .then((res) => {
          if (res && !res.ok) {
            reportAnalyticsDeliveryFailure({
              target: "jitsu_classic",
              stage: "non_2xx",
              payload,
              status: res.status,
            })
          }
        })
        .catch((error) => {
          reportAnalyticsDeliveryFailure({
            target: "jitsu_classic",
            stage: "request_failed",
            payload,
            error,
          })
          // Silent fail — don't break the app for analytics
        })
    } catch (error) {
      reportAnalyticsDeliveryFailure({
        target: "jitsu_classic",
        stage: "exception",
        payload,
        error,
      })
      // Silent fail
    }
  }

  const communicationsUrl = (
    process.env.NEXT_PUBLIC_COMMUNICATIONS_INGESTION_URL ||
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
    ""
  ).replace(/\/+$/, "")
  const communicationsKey = process.env.NEXT_PUBLIC_COMMUNICATIONS_API_KEY

  if (communicationsUrl && context.analytics_environment === "production") {
    try {
      fetch(`${communicationsUrl}/api/track`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(communicationsKey ? { "x-api-key": communicationsKey } : {}),
        },
        body,
        keepalive: true,
        redirect: "error",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      })
        .then((res) => {
          if (res && !res.ok) {
            reportAnalyticsDeliveryFailure({
              target: "communications_ingestion",
              stage: "non_2xx",
              payload,
              status: res.status,
            })
          }
        })
        .catch((error) => {
          reportAnalyticsDeliveryFailure({
            target: "communications_ingestion",
            stage: "request_failed",
            payload,
            error,
          })
          // Silent fail — first-party lifecycle capture must not affect UX.
        })
    } catch (error) {
      reportAnalyticsDeliveryFailure({
        target: "communications_ingestion",
        stage: "exception",
        payload,
        error,
      })
      // Silent fail
    }
  }

  sendGpAnalyticsMirror(payload, context)
}

function normalizeRouteMarket(
  value: unknown
): GpAnalyticsPayload["route_market"] {
  if (
    value === "atlanta_metro" ||
    value === "southeast" ||
    value === "national"
  ) {
    return value
  }
  if (value === "core") {
    return "atlanta_metro"
  }
  if (value === "scheduled_pod") {
    return "southeast"
  }
  return "unknown"
}

function normalizeCustomerType(
  value: unknown
): GpAnalyticsPayload["customer_type"] {
  return value === "dtc" || value === "institutional" ? value : "unknown"
}

function sendGpAnalyticsMirror(
  payload: Record<string, any>,
  context: BrowserAnalyticsContext
) {
  const destination = browserAnalyticsDestination(context, "gp")
  if (!destination) return

  try {
    const ctx = payload.eventn_ctx || {}
    const {
      eventn_ctx: _eventContext,
      event_type: _eventType,
      ...properties
    } = payload
    const eventProperties = Object.fromEntries(
      Object.entries(ctx).filter(([key]) => !GP_ANALYTICS_CONTEXT_KEYS.has(key))
    )
    const body: GpAnalyticsPayload = {
      event: String(payload.event_type || "unknown"),
      event_id: String(ctx.event_id || randomId()),
      event_timestamp_ms:
        typeof ctx.event_timestamp_ms === "number"
          ? ctx.event_timestamp_ms
          : Date.now(),
      anonymous_id:
        typeof ctx.anonymous_id === "string" ? ctx.anonymous_id : undefined,
      user_id: typeof ctx.user_id === "string" ? ctx.user_id : undefined,
      session_id:
        typeof ctx.session_id === "string" ? ctx.session_id : getSessionId(),
      experience_version:
        ctx.experience_version === "legacy" ? "legacy" : "medusa",
      route_market: normalizeRouteMarket(ctx.route_market),
      fulfillment_tier:
        typeof ctx.fulfillment_tier === "string" ? ctx.fulfillment_tier : null,
      customer_type: normalizeCustomerType(ctx.customer_type),
      source: "client",
      properties: {
        ...properties,
        ...eventProperties,
        ...(ctx.experiment_context
          ? { experiment_context: ctx.experiment_context }
          : {}),
      },
      context: {
        page: ctx.page,
        screen: ctx.screen,
        locale: ctx.locale,
        timezone: ctx.timezone,
        userAgent: ctx.user_agent,
        library: {
          name: "grillers-medusa-frontend-jitsu-dual-run",
          version: "0.1.0",
        },
      },
    }

    fetch(destination.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${destination.key}`,
      },
      body: JSON.stringify(body),
      keepalive: true,
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    })
      .then((res) => {
        if (res && !res.ok) {
          console.warn("[gp-analytics] mirror returned non-2xx", {
            status: res.status,
            statusText: res.statusText,
          })
          reportAnalyticsDeliveryFailure({
            target: "gp_analytics",
            stage: "non_2xx",
            payload,
            status: res.status,
          })
        }
      })
      .catch((error) => {
        reportAnalyticsDeliveryFailure({
          target: "gp_analytics",
          stage: "request_failed",
          payload,
          error,
        })
        // Dual-run analytics must never affect storefront UX.
      })
  } catch (error) {
    reportAnalyticsDeliveryFailure({
      target: "gp_analytics",
      stage: "exception",
      payload,
      error,
    })
    // Dual-run analytics must never affect storefront UX.
  }
}

// ── Build the event envelope ────────────────────────────────────

function buildEvent(
  eventType: string,
  properties?: Record<string, any>
): Record<string, any> {
  const anonymousId = getAnonymousId()
  const sessionId = getSessionId()
  const resolvedUserId = getUserId()
  const activeExperimentContext = Object.keys(experimentContext).length
    ? experimentContext
    : undefined

  return {
    event_type: eventType,
    eventn_ctx: {
      event_id: randomId(),
      event_timestamp_ms: Date.now(),
      anonymous_id: anonymousId,
      session_id: sessionId,
      user_id: resolvedUserId,
      ...globalContext,
      ...(activeExperimentContext
        ? { experiment_context: activeExperimentContext }
        : {}),
      user: resolvedUserId
        ? { ...userTraits, anonymous_id: anonymousId, id: resolvedUserId }
        : { anonymous_id: anonymousId },
      page: {
        url: window.location.href,
        path: window.location.pathname,
        referrer: document.referrer,
        title: document.title,
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
      },
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      user_agent: navigator.userAgent,
    },
    ...properties,
  }
}

// ── Public API ──────────────────────────────────────────────────

const OWNED_CONTEXT_KEYS = new Set([
  "event_id",
  "event_timestamp_ms",
  "anonymous_id",
  "session_id",
  "user_id",
  "user",
  "source",
  "src",
  "test_event",
  "test_order",
  "livemode",
  "analytics_environment",
  "rehearsal_id",
  "analytics_consent",
  "analytics_consent_at",
  "marketing_consent",
])

function measurementContext(): BrowserAnalyticsContext | null {
  const context = getBrowserAnalyticsContext()
  if (!context) getJitsuIdentityContext()
  return context
}

function eventProperties(properties?: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(properties || {}).filter(
      ([key]) => !OWNED_CONTEXT_KEYS.has(key)
    )
  )
}

/**
 * Track a named event with properties. Automatically injects global
 * parameters and context (anonymous_id, session_id, page, screen, etc.)
 */
export function jitsuTrack(event: string, properties?: Record<string, any>) {
  try {
    const context = measurementContext()
    if (!context || isServerOwnedAnalyticsEvent(event)) return
    const payload = buildEvent(event, { src: "jitsu_track" })
    payload.event_type = event
    if (properties) {
      payload.eventn_ctx = {
        ...payload.eventn_ctx,
        ...eventProperties(properties),
      }
    }
    Object.assign(payload.eventn_ctx, context)
    sendEvent(payload, context)
  } catch {
    // Silent fail — analytics should never trip a route error boundary.
  }
}

/**
 * Identify a known user. Call on login or account creation.
 * Subsequent events will include the user_id.
 */
export function jitsuIdentify(id: string, traits?: Record<string, any>) {
  try {
    const context = measurementContext()
    if (!context) return
    if (!id || id.includes("@")) {
      setCookie(COOKIE_USER_ID, "", 0)
      userTraits = {}
      return
    }
    // Only an opaque account ID can be an analytics user ID.
    setCookie(COOKIE_USER_ID, id, 365 * 24 * 60 * 60)
    if (traits) userTraits = { ...userTraits, ...traits }

    const payload = buildEvent("identify")
    payload.eventn_ctx.user = {
      ...userTraits,
      anonymous_id: getAnonymousId(),
      id,
    }
    Object.assign(payload.eventn_ctx, context)
    sendEvent(payload, context)
  } catch {
    // Silent fail
  }
}

/**
 * Track a page view. Called automatically by JitsuScript on route changes.
 */
export function jitsuPage(properties?: Record<string, any>) {
  try {
    const context = measurementContext()
    if (!context) return
    const payload = buildEvent("page_viewed")
    if (properties) {
      payload.eventn_ctx = {
        ...payload.eventn_ctx,
        ...eventProperties(properties),
      }
    }
    Object.assign(payload.eventn_ctx, context)
    sendEvent(payload, context)
  } catch {
    // Silent fail
  }
}

/**
 * Update global context that is attached to every subsequent event.
 * Call when delivery zone is selected (route_market) or customer
 * type becomes known (customer_type).
 */
export function setJitsuContext(ctx: Partial<typeof globalContext>) {
  const next = { ...globalContext }
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === "string" && !OWNED_CONTEXT_KEYS.has(key)) {
      next[key] = value
    }
  }
  globalContext = next
}

export function setJitsuExperimentContext(ctx: Record<string, any>) {
  experimentContext = { ...ctx }
}
