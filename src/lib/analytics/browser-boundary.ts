import { getStripePublishableKey } from "@lib/util/stripe-key"
import { getConsentCookie } from "@lib/utils/cookies"
import { isRehearsalId } from "./rehearsal-id"

export type BrowserAnalyticsContext = {
  analytics_environment: "production" | "rehearsal"
  analytics_consent: true
  analytics_consent_at: number
  marketing_consent: boolean
  test_event: boolean
  rehearsal_id?: string
}

export function getBrowserAnalyticsContext(): BrowserAnalyticsContext | null {
  if (typeof window === "undefined") return null
  const consent = getConsentCookie()
  if (!consent?.analytics) return null

  const key = getStripePublishableKey()
  const environment =
    process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT || "production"
  const rehearsalId = process.env.NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID
  const common = {
    analytics_consent: true as const,
    analytics_consent_at: consent.timestamp,
    marketing_consent: consent.marketing,
  }
  if (
    environment === "production" &&
    key?.startsWith("pk_live_") &&
    !rehearsalId
  ) {
    return { ...common, analytics_environment: "production", test_event: false }
  }
  if (
    environment === "rehearsal" &&
    key?.startsWith("pk_test_") &&
    isRehearsalId(rehearsalId)
  ) {
    return {
      ...common,
      analytics_environment: "rehearsal",
      test_event: true,
      rehearsal_id: rehearsalId,
    }
  }
  return null
}

function httpsBase(value?: string): URL | null {
  try {
    const url = new URL(value || "")
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
      ? url
      : null
  } catch {
    return null
  }
}

export function browserAnalyticsDestination(
  context: BrowserAnalyticsContext,
  target: "jitsu" | "gp"
): { url: string; key: string } | null {
  const productionHost =
    target === "jitsu"
      ? process.env.NEXT_PUBLIC_JITSU_HOST
      : process.env.NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT
  const productionKey =
    target === "jitsu"
      ? process.env.NEXT_PUBLIC_JITSU_WRITE_KEY
      : process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY
  if (
    target === "gp" &&
    process.env.NEXT_PUBLIC_GP_ANALYTICS_DUAL_RUN === "false"
  )
    return null

  if (context.analytics_environment === "production") {
    if (!productionHost || !productionKey) return null
    const base =
      target === "jitsu"
        ? productionHost
        : process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_PATH || "/a"
    return {
      url: `${base.replace(/\/+$/, "")}${
        target === "jitsu" ? "/api/v1/event" : "/v1/track"
      }`,
      key: productionKey,
    }
  }

  const testHost =
    target === "jitsu"
      ? process.env.NEXT_PUBLIC_REHEARSAL_JITSU_HOST
      : process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_ENDPOINT
  const testKey =
    target === "jitsu"
      ? process.env.NEXT_PUBLIC_REHEARSAL_JITSU_WRITE_KEY
      : process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_CLIENT_KEY
  const testUrl = httpsBase(testHost)
  // Without a known production comparison, separation has not been established.
  if (!testUrl || !httpsBase(productionHost) || !productionKey || !testKey)
    return null
  const productionOrigins = [
    process.env.NEXT_PUBLIC_JITSU_HOST,
    process.env.NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT,
    process.env.NEXT_PUBLIC_COMMUNICATIONS_INGESTION_URL,
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
    window.location.origin,
  ]
    .map((value) => httpsBase(value)?.origin)
    .filter(Boolean)
  const productionKeys = [
    process.env.NEXT_PUBLIC_JITSU_WRITE_KEY,
    process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY,
    process.env.NEXT_PUBLIC_COMMUNICATIONS_API_KEY,
  ]
  if (
    productionOrigins.includes(testUrl.origin) ||
    productionKeys.includes(testKey)
  )
    return null
  return {
    url: `${testUrl.href.replace(/\/+$/, "")}${
      target === "jitsu" ? "/api/v1/event" : "/v1/track"
    }`,
    key: testKey,
  }
}

const SERVER_EVENTS = new Set([
  "purchase",
  "refund",
  "order_completed",
  "order_placed",
  "order_finalized",
  "order_refunded",
  "order_refund_recorded",
  "order_refund_updated",
  "order_canceled",
  "order_cancelled",
  "order_fulfilled",
  "order_shipped",
  "order_delivered",
  "order_returned",
])

export function isServerOwnedAnalyticsEvent(event: string): boolean {
  return SERVER_EVENTS.has(event.toLowerCase())
}

export function canUseProductionGtm(): boolean {
  return (
    process.env.NEXT_PUBLIC_GTM_CONSENT_READY === "true" &&
    getBrowserAnalyticsContext()?.analytics_environment === "production"
  )
}

export function publishGtmConsentState(): void {
  if (typeof window === "undefined") return
  const preferences = getConsentCookie()
  const permitted = canUseProductionGtm()
  const state = {
    analytics_storage: permitted ? "granted" : "denied",
    ad_storage: permitted && preferences?.marketing ? "granted" : "denied",
    ad_user_data: permitted && preferences?.marketing ? "granted" : "denied",
    ad_personalization:
      permitted && preferences?.marketing ? "granted" : "denied",
  }
  ;(window as Window & { gpConsentState?: typeof state }).gpConsentState = state
  // This control event is consumed by the verified GTM consent template, not a
  // measurement event. It must still reach an already loaded container on denial.
  if (window.dataLayer)
    window.dataLayer.push({ event: "gp_consent_update", ...state })
}
