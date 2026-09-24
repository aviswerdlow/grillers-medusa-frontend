import {
  buildOpsAlertFingerprint,
  emitStorefrontOpsAlert,
} from "@lib/ops-alert"

describe("emitStorefrontOpsAlert", () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it("coalesces each CMS stage for five minutes without suppressing another stage", async () => {
    process.env = {
      ...originalEnv,
      GP_ANALYTICS_ENDPOINT: "https://ingest.example.com",
      GP_ANALYTICS_SERVER_KEY: "test",
    }
    global.fetch = jest.fn().mockResolvedValue({ ok: true })
    const now = jest.spyOn(Date, "now").mockReturnValue(1000)
    const alert = {
      alertKind: "cms_test",
      title: "CMS",
      path: "test",
      fingerprint: "cms-test:primary",
      dedupeWindowMs: 300000,
    }
    await Promise.all([
      emitStorefrontOpsAlert(alert),
      emitStorefrontOpsAlert(alert),
    ])
    expect(global.fetch).toHaveBeenCalledTimes(1)
    await emitStorefrontOpsAlert({ ...alert, fingerprint: "cms-test:legacy" })
    expect(global.fetch).toHaveBeenCalledTimes(2)
    now.mockReturnValue(301000)
    await emitStorefrontOpsAlert(alert)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  it("skips without gp-analytics endpoint/key", async () => {
    process.env = {
      ...originalEnv,
      GP_ANALYTICS_ENDPOINT: "",
      GP_ANALYTICS_SERVER_KEY: "",
      NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT: "",
      NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY: "",
    }
    const fetchMock = jest.fn()
    global.fetch = fetchMock as any

    const result = await emitStorefrontOpsAlert({
      alertKind: "unit_test",
      title: "Unit test",
      path: "src/lib/ops-alert.ts",
    })

    expect(result).toEqual({ ok: false, skipped: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends ops_alert events to the gp-analytics ingestion /v1/track", async () => {
    process.env = {
      ...originalEnv,
      GP_ANALYTICS_ENDPOINT: "https://ingest.example.com/",
      GP_ANALYTICS_SERVER_KEY: "server-key",
      VERCEL_ENV: "production",
      NEXT_PUBLIC_RELEASE_SHA: "abc1234",
    }
    const fetchMock = jest.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    const result = await emitStorefrontOpsAlert({
      alertKind: "data_fetch_soft_fail",
      title: "retrieveCart failed",
      path: "src/lib/data/cart.ts:retrieveCart",
      severity: "warn",
      meta: { cart_id: "cart_123" },
    })

    expect(result).toEqual({ ok: true, skipped: false })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ingest.example.com/v1/track",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer server-key",
        }),
      })
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.event).toBe("ops_alert")
    expect(body.properties).toMatchObject({
      alert_kind: "data_fetch_soft_fail",
      severity: "warn",
      path: "src/lib/data/cart.ts:retrieveCart",
      title: "retrieveCart failed",
      cart_id: "cart_123",
      release: "abc1234",
      env: "production",
    })
    expect(typeof body.properties.fingerprint).toBe("string")
    expect(body.properties.fingerprint.length).toBeGreaterThan(0)
  })

  it("includes every ingestion-schema-required field so events aren't rejected with 400", async () => {
    // Regression: the storefront emitter omitted session_id + anonymous_id + the
    // experience_version/route_market/customer_type enums, so the ingestion API
    // 400'd EVERY storefront ops-alert (store-catalog outages included) — they
    // never reached the warehouse or Slack.
    process.env = {
      ...originalEnv,
      GP_ANALYTICS_ENDPOINT: "https://ingest.example.com",
      GP_ANALYTICS_SERVER_KEY: "server-key",
    }
    const fetchMock = jest.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    await emitStorefrontOpsAlert({
      alertKind: "store_catalog_load_failure",
      title: "Store catalog Strapi load failed",
      path: "src/app/[countryCode]/(main)/store/page.tsx",
      severity: "page",
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    // Top-level required by services/ingestion-api/src/schema/event.schema.json
    for (const key of [
      "event",
      "event_id",
      "event_timestamp_ms",
      "session_id",
      "experience_version",
      "route_market",
      "customer_type",
      "source",
    ]) {
      expect(body[key]).toBeDefined()
    }
    // anyOf: must carry an identity (anonymous_id OR user_id)
    expect(body.anonymous_id || body.user_id).toBeDefined()
    // enum constraints the ingestion API validates
    expect(["client", "medusa-server", "admin"]).toContain(body.source)
    expect(["legacy", "medusa"]).toContain(body.experience_version)
    expect(["atlanta_metro", "southeast", "national", "unknown"]).toContain(
      body.route_market
    )
    expect(["dtc", "institutional", "unknown"]).toContain(body.customer_type)
  })

  it("coerces an out-of-enum source to the storefront default 'client'", async () => {
    process.env = {
      ...originalEnv,
      GP_ANALYTICS_ENDPOINT: "https://ingest.example.com",
      GP_ANALYTICS_SERVER_KEY: "server-key",
    }
    const fetchMock = jest.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    await emitStorefrontOpsAlert({
      alertKind: "unit_test",
      title: "Unit test",
      path: "src/lib/ops-alert.ts",
      source: "storefront", // not a valid ingestion enum value
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.source).toBe("client")
  })

  it("falls back to the public client endpoint/key", async () => {
    process.env = {
      ...originalEnv,
      GP_ANALYTICS_ENDPOINT: "",
      GP_ANALYTICS_SERVER_KEY: "",
      NEXT_PUBLIC_GP_ANALYTICS_ENDPOINT: "https://ingest.example.com",
      NEXT_PUBLIC_GP_ANALYTICS_CLIENT_KEY: "client-key",
    }
    const fetchMock = jest.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    await emitStorefrontOpsAlert({
      alertKind: "unit_test",
      title: "Unit test",
      path: "src/lib/ops-alert.ts",
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ingest.example.com/v1/track",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer client-key",
        }),
      })
    )
  })
})

describe("buildOpsAlertFingerprint", () => {
  it("collapses ids/digits so the same error class shares a fingerprint", () => {
    // Two distinct hex-ish ids and two distinct bare-digit order numbers
    // should normalize to the same fingerprint.
    const a = buildOpsAlertFingerprint(
      "client",
      "checkout_segment_error",
      "Failed to load cart abc123def456 order 1001"
    )
    const b = buildOpsAlertFingerprint(
      "client",
      "checkout_segment_error",
      "Failed to load cart fed654cba321 order 2002"
    )
    expect(a).toBe(b)
  })

  it("differs by source and kind", () => {
    const base = buildOpsAlertFingerprint("client", "kind_a", "same title")
    expect(base).not.toBe(
      buildOpsAlertFingerprint("medusa-server", "kind_a", "same title")
    )
    expect(base).not.toBe(
      buildOpsAlertFingerprint("client", "kind_b", "same title")
    )
  })
})
