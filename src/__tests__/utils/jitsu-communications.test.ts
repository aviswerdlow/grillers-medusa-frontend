import {
  jitsuTrack,
  setJitsuContext,
  setJitsuExperimentContext,
} from "@lib/jitsu"
import { setConsentCookie } from "@lib/utils/cookies"

describe("jitsu first-party communications ingestion", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT = "production"
    process.env.NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID = ""
    process.env.NEXT_PUBLIC_STRIPE_MODE_OVERRIDE = "live"
    process.env.NEXT_PUBLIC_STRIPE_KEY_LIVE = "pk_live_fixture"
    setConsentCookie({
      analytics: true,
      marketing: false,
      timestamp: Date.now(),
    })
    process.env.NEXT_PUBLIC_JITSU_HOST = ""
    process.env.NEXT_PUBLIC_JITSU_WRITE_KEY = ""
    process.env.NEXT_PUBLIC_COMMUNICATIONS_INGESTION_URL =
      "https://medusa.example.com/"
    process.env.NEXT_PUBLIC_COMMUNICATIONS_API_KEY = "public-ingestion-key"
    process.env.NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT = ""
    process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY = ""
    process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_PATH = ""
    process.env.NEXT_PUBLIC_GP_ANALYTICS_DUAL_RUN = "true"
    setJitsuContext({
      experience_version: "medusa",
      route_market: "unknown",
      customer_type: "unknown",
    })
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as any
  })

  afterEach(() => {
    setJitsuExperimentContext({})
    process.env = { ...originalEnv }
    jest.restoreAllMocks()
  })

  it("dual-writes storefront events to the communications ingestion API", () => {
    jitsuTrack("product_viewed", {
      product_id: "prod_123",
      customer_type: "dtc",
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith(
      "https://medusa.example.com/api/track",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-api-key": "public-ingestion-key",
        }),
      })
    )

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.event_type).toBe("product_viewed")
    expect(body.eventn_ctx.product_id).toBe("prod_123")
    expect(body.eventn_ctx.customer_type).toBe("dtc")
    expect(body.eventn_ctx.anonymous_id).toBeTruthy()
    expect(body.eventn_ctx.session_id).toBeTruthy()
  })

  it("includes experiment assignment context in communications events", () => {
    setJitsuExperimentContext({
      checkout_shipping_cards: {
        variant: "compact",
        assignment_id: "assign_123",
      },
    })

    jitsuTrack("checkout_started", {
      cart_id: "cart_123",
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)

    expect(body.event_type).toBe("checkout_started")
    expect(body.eventn_ctx.cart_id).toBe("cart_123")
    expect(body.eventn_ctx.experiment_context).toEqual({
      checkout_shipping_cards: {
        variant: "compact",
        assignment_id: "assign_123",
      },
    })
  })

  it("mirrors events to the GP analytics endpoint without disabling communications", () => {
    process.env.NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT =
      "https://analytics.example.com/"
    process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY = "client-key"
    setJitsuContext({
      route_market: "core",
      customer_type: "dtc",
    })

    jitsuTrack("product_added_to_cart", {
      product_id: "prod_123",
      variant_id: "variant_123",
      fulfillment_tier: "pickup",
    })

    expect(global.fetch).toHaveBeenCalledTimes(2)
    const gpCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).startsWith("/a/v1/track")
    )

    expect(gpCall).toBeTruthy()
    const [, init] = gpCall
    const body = JSON.parse(init.body)

    expect(init.headers.Authorization).toBe("Bearer client-key")
    expect(body.event).toBe("product_added_to_cart")
    expect(body.source).toBe("client")
    expect(body.route_market).toBe("atlanta_metro")
    expect(body.customer_type).toBe("dtc")
    expect(body.fulfillment_tier).toBe("pickup")
    expect(body.properties).toEqual(
      expect.objectContaining({
        product_id: "prod_123",
        variant_id: "variant_123",
        src: "jitsu_track",
      })
    )
    expect(body.anonymous_id).toBeTruthy()
    expect(body.session_id).toBeTruthy()
  })

  it("can disable the GP analytics dual-run mirror independently", () => {
    process.env.NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT =
      "https://analytics.example.com/"
    process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY = "client-key"
    process.env.NEXT_PUBLIC_GP_ANALYTICS_DUAL_RUN = "false"

    jitsuTrack("cart_viewed", {
      cart_id: "cart_123",
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "https://medusa.example.com/api/track"
    )
  })

  it("keeps the GP analytics mirror default-off when flags are unset", () => {
    process.env.NEXT_PUBLIC_COMMUNICATIONS_INGESTION_URL = ""
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL = ""
    process.env.NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT = ""
    process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY = ""

    jitsuTrack("page_viewed")

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("warns without throwing when the GP analytics mirror returns non-2xx", async () => {
    process.env.NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT =
      "https://analytics.example.com/"
    process.env.NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY = "client-key"
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
      })

    expect(() => {
      jitsuTrack("cart_viewed", {
        cart_id: "cart_123",
      })
    }).not.toThrow()

    await Promise.resolve()
    await Promise.resolve()

    expect(warnSpy).toHaveBeenCalledWith(
      "[gp-analytics] mirror returned non-2xx",
      {
        status: 503,
        statusText: "Service Unavailable",
      }
    )

    const alertCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).startsWith("/api/ops-alert")
    )
    expect(alertCall).toBeTruthy()
    const alertBody = JSON.parse(alertCall[1].body)
    expect(alertBody).toMatchObject({
      alert_kind: "client_analytics_delivery_failed",
      severity: "warn",
      path: "browser:analytics_delivery:gp_analytics",
      extra: {
        surface: "analytics_delivery",
        action: "gp_analytics",
        reason: "http_503",
        status_code: 503,
        target: "gp_analytics",
        event_name: "cart_viewed",
      },
    })
    expect(JSON.stringify(alertBody)).not.toContain("cart_123")
  })

  it("alerts without throwing when communications ingestion returns non-2xx", async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    })

    expect(() => {
      jitsuTrack("checkout_started", {
        cart_id: "cart_sensitive",
      })
    }).not.toThrow()

    await Promise.resolve()
    await Promise.resolve()

    const alertCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).startsWith("/api/ops-alert")
    )
    expect(alertCall).toBeTruthy()
    const alertBody = JSON.parse(alertCall[1].body)
    expect(alertBody).toMatchObject({
      alert_kind: "client_analytics_delivery_failed",
      severity: "warn",
      path: "browser:analytics_delivery:communications_ingestion",
      extra: {
        surface: "analytics_delivery",
        action: "communications_ingestion",
        reason: "http_502",
        status_code: 502,
        target: "communications_ingestion",
        event_name: "checkout_started",
      },
    })
    expect(JSON.stringify(alertBody)).not.toContain("cart_sensitive")
  })
})
