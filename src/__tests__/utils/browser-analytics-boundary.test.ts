import {
  getJitsuIdentityContext,
  jitsuIdentify,
  jitsuPage,
  jitsuTrack,
  setJitsuContext,
} from "@lib/jitsu"
import {
  getBrowserAnalyticsContext,
  publishGtmConsentState,
} from "@lib/analytics/browser-boundary"
import {
  getConsentCookie,
  rejectAllCookies,
  setConsentCookie,
} from "@lib/utils/cookies"
import { pushToDataLayer, trackPurchase } from "@lib/gtm"

const originalEnv = { ...process.env }
const productionHosts = [
  "https://jitsu.example.com",
  "https://analytics.example.com",
  "https://medusa.example.com",
]

function grant(marketing = false) {
  setConsentCookie({ analytics: true, marketing, timestamp: Date.now() })
}
function rehearsal() {
  process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT = "rehearsal"
  process.env.NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID = "launch-20260924"
  process.env.NEXT_PUBLIC_STRIPE_MODE_OVERRIDE = "test"
  process.env.NEXT_PUBLIC_STRIPE_KEY_TEST = "pk_test_fixture"
  process.env.NEXT_PUBLIC_REHEARSAL_JITSU_HOST =
    "https://test-jitsu.example.com"
  process.env.NEXT_PUBLIC_REHEARSAL_JITSU_WRITE_KEY = "isolated-jitsu-key"
  process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_ENDPOINT =
    "https://test-analytics.example.com"
  process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_CLIENT_KEY = "isolated-gp-key"
}

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_ANALYTICS_ENVIRONMENT: "production",
    NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID: "",
    NEXT_PUBLIC_STRIPE_MODE_OVERRIDE: "live",
    NEXT_PUBLIC_STRIPE_KEY_LIVE: "pk_live_fixture",
    NEXT_PUBLIC_STRIPE_KEY_TEST: "",
    NEXT_PUBLIC_STRIPE_KEY: "",
    NEXT_PUBLIC_JITSU_HOST: productionHosts[0],
    NEXT_PUBLIC_JITSU_WRITE_KEY: "prod-jitsu-key",
    NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT: productionHosts[1],
    NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY: "prod-gp-key",
    NEXT_PUBLIC_GP_ANALYTICS_DUAL_RUN: "true",
    NEXT_PUBLIC_GP_ANALYTICS_CLIENT_PATH: "/a",
    NEXT_PUBLIC_COMMUNICATIONS_INGESTION_URL: productionHosts[2],
    NEXT_PUBLIC_MEDUSA_BACKEND_URL: productionHosts[2],
    NEXT_PUBLIC_COMMUNICATIONS_API_KEY: "prod-comms-key",
    NEXT_PUBLIC_GTM_CONSENT_READY: "true",
  }
  rejectAllCookies()
  getJitsuIdentityContext()
  grant()
  window.dataLayer = []
  global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any
})
afterEach(() => {
  process.env = { ...originalEnv }
  jest.restoreAllMocks()
})

it.each([
  undefined,
  "broken",
  JSON.stringify({ analytics: "true", marketing: false, timestamp: 123 }),
  JSON.stringify({ analytics: true }),
])(
  "holds direct tracking and identifier creation for missing or malformed consent (%s)",
  (value) => {
    document.cookie =
      value === undefined
        ? "cookie_consent=;path=/;max-age=0"
        : `cookie_consent=${encodeURIComponent(value)};path=/`
    expect(getConsentCookie()).toBeNull()
    jitsuTrack("product_added_to_cart", { analytics_consent: true })
    jitsuPage()
    jitsuIdentify("cus_example")
    pushToDataLayer({ event: "add_to_cart" })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(window.dataLayer).toEqual([])
    expect(document.cookie).not.toMatch(/_gp_(anon|session|user)_id=/)
  }
)

it("does not replay declined browsing after grant; revocation clears owned identities", () => {
  rejectAllCookies()
  jitsuTrack("product_viewed", { product_id: "before_consent" })
  grant()
  jitsuIdentify("cus_example", { email: "fixture@example.test" })
  jitsuTrack("cart_viewed")
  expect(global.fetch).toHaveBeenCalledTimes(6)
  expect(JSON.stringify((global.fetch as jest.Mock).mock.calls)).not.toContain(
    "before_consent"
  )
  expect(document.cookie).toContain("_gp_user_id=")
  rejectAllCookies()
  jitsuPage()
  expect(global.fetch).toHaveBeenCalledTimes(6)
  expect(getJitsuIdentityContext()).toEqual({
    anonymous_id: "",
    session_id: "",
  })
  expect(document.cookie).not.toMatch(/_gp_(anon|session|user)_id=/)
})

it("shares one event identity and trusted classification across production destinations", () => {
  setJitsuContext({
    event_id: "forged-global",
    analytics_environment: "rehearsal",
  })
  jitsuTrack("product_added_to_cart", {
    product_id: "prod_fixture",
    event_id: "forged",
    anonymous_id: "forged",
    test_event: true,
    test_order: true,
    analytics_consent: false,
    analytics_environment: "rehearsal",
    rehearsal_id: "forged",
  })
  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls).toHaveLength(3)
  const jitsu = JSON.parse(calls[0][1].body).eventn_ctx
  const communications = JSON.parse(calls[1][1].body).eventn_ctx
  const gp = JSON.parse(calls[2][1].body)
  expect(jitsu).toMatchObject({
    analytics_consent: true,
    marketing_consent: false,
    test_event: false,
    analytics_environment: "production",
    product_id: "prod_fixture",
  })
  expect(jitsu.event_id).not.toMatch(/forged/)
  expect(jitsu.anonymous_id).not.toBe("forged")
  expect(jitsu).not.toHaveProperty("test_order")
  expect(jitsu).not.toHaveProperty("rehearsal_id")
  expect(communications.event_id).toBe(jitsu.event_id)
  expect(gp.event_id).toBe(jitsu.event_id)
  expect(gp.properties.test_event).toBe(false)
  for (const [, init] of calls)
    expect(init).toMatchObject({
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    })
})

it.each([
  "test",
  "missing",
  "unknown",
  "mode_mismatch",
  "unknown_lane",
  "production_with_rehearsal_id",
])("never sends unknown or test traffic into production (%s)", (scenario) => {
  if (scenario === "test") {
    process.env.NEXT_PUBLIC_STRIPE_MODE_OVERRIDE = "test"
    process.env.NEXT_PUBLIC_STRIPE_KEY_TEST = "pk_test_fixture"
  }
  if (scenario === "missing") process.env.NEXT_PUBLIC_STRIPE_KEY_LIVE = ""
  if (scenario === "unknown")
    process.env.NEXT_PUBLIC_STRIPE_KEY_LIVE = "not-a-stripe-key"
  if (scenario === "mode_mismatch")
    process.env.NEXT_PUBLIC_STRIPE_KEY_LIVE = "pk_test_fixture"
  if (scenario === "unknown_lane")
    process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT = "staging"
  if (scenario === "production_with_rehearsal_id")
    process.env.NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID = "launch-test"
  jitsuTrack("checkout_started")
  jitsuIdentify("cus_example")
  pushToDataLayer({ event: "begin_checkout" })
  expect(global.fetch).not.toHaveBeenCalled()
  expect(window.dataLayer).toEqual([])
})

it("routes rehearsal only to isolated destinations with immutable test markers", () => {
  rehearsal()
  jitsuTrack("checkout_started", {
    test_event: false,
    analytics_environment: "production",
  })
  pushToDataLayer({ event: "begin_checkout" })
  const calls = (global.fetch as jest.Mock).mock.calls
  expect(calls.map(([url]) => url)).toEqual([
    "https://test-jitsu.example.com/api/v1/event?token=isolated-jitsu-key",
    "https://test-analytics.example.com/v1/track",
  ])
  const jitsu = JSON.parse(calls[0][1].body).eventn_ctx
  const gp = JSON.parse(calls[1][1].body)
  expect(jitsu).toMatchObject({
    test_event: true,
    rehearsal_id: "launch-20260924",
    analytics_consent: true,
    analytics_environment: "rehearsal",
  })
  expect(gp.properties).toMatchObject({
    test_event: true,
    rehearsal_id: "launch-20260924",
    analytics_consent: true,
    analytics_environment: "rehearsal",
  })
  expect(gp.event_id).toBe(jitsu.event_id)
  expect(window.dataLayer).toEqual([])
})

it.each([
  "missing_targets",
  "same_origin",
  "same_key",
  "cross_target_origin",
  "cross_target_key",
  "http",
  "credentials",
  "missing_production_comparison",
])("holds unsafe rehearsal targets without falling back (%s)", (scenario) => {
  rehearsal()
  if (scenario === "missing_targets") {
    process.env.NEXT_PUBLIC_REHEARSAL_JITSU_HOST = ""
    process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_ENDPOINT = ""
  }
  if (scenario === "same_origin") {
    process.env.NEXT_PUBLIC_REHEARSAL_JITSU_HOST = `${productionHosts[0]}/test`
    process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_ENDPOINT = `${productionHosts[1]}/test`
  }
  if (scenario === "same_key") {
    process.env.NEXT_PUBLIC_REHEARSAL_JITSU_WRITE_KEY = "prod-jitsu-key"
    process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_CLIENT_KEY = "prod-gp-key"
  }
  if (scenario === "cross_target_origin") {
    process.env.NEXT_PUBLIC_REHEARSAL_JITSU_HOST = productionHosts[1]
    process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_ENDPOINT = productionHosts[2]
  }
  if (scenario === "cross_target_key") {
    process.env.NEXT_PUBLIC_REHEARSAL_JITSU_WRITE_KEY = "prod-gp-key"
    process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_CLIENT_KEY = "prod-comms-key"
  }
  if (scenario === "http" || scenario === "credentials") {
    const host =
      scenario === "http"
        ? "http://isolated.example.com"
        : "https://user:password@isolated.example.com"
    process.env.NEXT_PUBLIC_REHEARSAL_JITSU_HOST = host
    process.env.NEXT_PUBLIC_REHEARSAL_GP_ANALYTICS_ENDPOINT = host
  }
  if (scenario === "missing_production_comparison") {
    process.env.NEXT_PUBLIC_JITSU_HOST = ""
    process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY = ""
  }
  jitsuPage()
  expect(global.fetch).not.toHaveBeenCalled()
})

it.each(["bad id", "ab", "A-B-C", "a".repeat(49)])(
  "holds an invalid rehearsal ID %s",
  (id) => {
    rehearsal()
    process.env.NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID = id
    expect(getBrowserAnalyticsContext()).toBeNull()
    jitsuPage()
    expect(global.fetch).not.toHaveBeenCalled()
  }
)

it("does not send production ops alerts when a rehearsal destination fails", async () => {
  rehearsal()
  jest.spyOn(console, "warn").mockImplementation(() => {})
  ;(global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 503 })
  jitsuTrack("cart_viewed")
  await Promise.resolve()
  await Promise.resolve()
  expect(global.fetch).toHaveBeenCalledTimes(2)
})

it("refuses browser purchase and refund owners even after consent", () => {
  for (const event of [
    "order_completed",
    "purchase",
    "order_finalized",
    "order_refund_updated",
    "refund",
  ]) {
    jitsuTrack(event)
    pushToDataLayer({ event })
  }
  trackPurchase({
    id: "order_fixture",
    total: 100,
    currency_code: "usd",
    items: [],
  })
  expect(global.fetch).not.toHaveBeenCalled()
  expect(window.dataLayer).toEqual([])
})

it("does not use an email address as user ID or let traits replace an opaque ID", () => {
  jitsuIdentify("fixture@example.test")
  expect(global.fetch).not.toHaveBeenCalled()
  expect(document.cookie).not.toContain("_gp_user_id=")
  jitsuIdentify("cus_fixture", { id: "forged", anonymous_id: "forged" })
  const ctx = JSON.parse(
    (global.fetch as jest.Mock).mock.calls[0][1].body
  ).eventn_ctx
  expect(ctx.user_id).toBe("cus_fixture")
  expect(ctx.user.id).toBe("cus_fixture")
  expect(ctx.user.anonymous_id).toBe(ctx.anonymous_id)
})

it("publishes consent controls independently of marketing permission and rejects unverified GTM", () => {
  process.env.NEXT_PUBLIC_GTM_CONSENT_READY = "false"
  pushToDataLayer({ event: "view_item" })
  expect(window.dataLayer).toEqual([])
  process.env.NEXT_PUBLIC_GTM_CONSENT_READY = "true"
  publishGtmConsentState()
  expect(window.dataLayer.at(-1)).toMatchObject({
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  })
  grant(true)
  publishGtmConsentState()
  expect(window.dataLayer.at(-1)).toMatchObject({
    analytics_storage: "granted",
    ad_storage: "granted",
  })
  rejectAllCookies()
  publishGtmConsentState()
  expect(window.dataLayer.at(-1)).toMatchObject({
    analytics_storage: "denied",
    ad_storage: "denied",
  })
})

it("holds tracking when a consent write cannot be read back", () => {
  const getter = jest.spyOn(document, "cookie", "get").mockReturnValue("")
  grant()
  getter.mockRestore()
  expect(getConsentCookie()).toBeNull()
  jitsuTrack("cart_viewed")
  expect(global.fetch).not.toHaveBeenCalled()
})
