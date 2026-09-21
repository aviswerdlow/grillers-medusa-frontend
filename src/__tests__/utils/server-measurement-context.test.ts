jest.mock("server-only", () => ({}))
jest.mock("@lib/util/stripe-key", () => ({
  getStripePublishableKey: jest.fn(() => "pk_live_fixture"),
}))
jest.mock("@lib/experiments/assignment-evidence", () => ({
  verifiedStoredAssignment: jest.fn(() => false),
}))
jest.mock("next/headers", () => ({ cookies: jest.fn() }))
import { serverMeasurementHeaders } from "@lib/analytics/server-measurement-context"
import { getStripePublishableKey } from "@lib/util/stripe-key"
import { verifiedStoredAssignment } from "@lib/experiments/assignment-evidence"
import { getAuthHeaders } from "@lib/data/cookies"
import { cookies } from "next/headers"
const env = { ...process.env }
const uuid = "00000000-0000-4000-8000-000000000001"
const reader = (patch: Record<string, string | undefined> = {}) => {
  const values: Record<string, string | undefined> = {
    cookie_consent: encodeURIComponent(
      JSON.stringify({
        analytics: true,
        marketing: false,
        timestamp: Date.now() - 1000,
      })
    ),
    _gp_anon_id: uuid,
    _gp_session_id: uuid,
    _gp_exp_assignments: "{}",
    ...patch,
  }
  return {
    get: jest.fn((key: string) =>
      values[key] === undefined ? undefined : { value: values[key]! }
    ),
  }
}
const decode = (result: Record<string, string>) =>
  JSON.parse(
    Buffer.from(result["x-gp-measurement-context"], "base64url").toString()
  )
beforeEach(() => {
  process.env = {
    ...env,
    NEXT_PUBLIC_ANALYTICS_ENVIRONMENT: "production",
    NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID: "",
  }
  jest.clearAllMocks()
  ;(getStripePublishableKey as jest.Mock).mockReturnValue("pk_live_fixture")
  ;(verifiedStoredAssignment as jest.Mock).mockReturnValue(false)
})
afterEach(() => {
  process.env = { ...env }
})
it("carries cart cookie choices without identifiers when analytics is declined", () => {
  const c = reader({
    cookie_consent: JSON.stringify({
      analytics: false,
      marketing: true,
      timestamp: Date.now() - 1000,
      email_consent: true,
    }),
  })
  const value = decode(serverMeasurementHeaders(c, { cartActivity: true }))
  expect(value).toMatchObject({
    analytics_consent: false,
    marketing_consent: true,
    experiment_context_status: "unverified",
  })
  expect(value).not.toHaveProperty("anonymous_id")
  expect(value).not.toHaveProperty("email_consent")
  expect(c.get.mock.calls).toEqual([["cookie_consent"]])
})
it("preserves account authorization with a cart-specific denied-analytics envelope", async () => {
  ;(cookies as jest.Mock).mockResolvedValue(
    reader({
      _medusa_jwt: "account-fixture",
      cookie_consent: JSON.stringify({
        analytics: false,
        marketing: false,
        timestamp: Date.now() - 1000,
      }),
    })
  )
  const result = await getAuthHeaders({ cartMeasurement: true })
  expect(result.authorization).toBe("Bearer account-fixture")
  expect(decode(result).analytics_consent).toBe(false)
  expect(await getAuthHeaders()).toEqual({
    authorization: "Bearer account-fixture",
  })
})
it("forwards explicit choice and existing opaque IDs without account/PII identity", () => {
  const c = decode(
    serverMeasurementHeaders(
      reader({
        _gp_user_id: "private@example.test",
        email: "private@example.test",
      })
    )
  )
  expect(c).toMatchObject({
    analytics_consent: true,
    marketing_consent: false,
    test_event: false,
    anonymous_id: uuid,
    session_id: uuid,
    experiment_context_status: "complete",
  })
  expect(JSON.stringify(c)).not.toContain("private")
})
it.each([
  undefined,
  "bad-json",
  JSON.stringify({ analytics: false, marketing: true, timestamp: Date.now() }),
  JSON.stringify({ analytics: true, marketing: true }),
  JSON.stringify({
    analytics: true,
    marketing: false,
    timestamp: Date.now() + 86400000,
  }),
])(
  "does not collect identifiers when consent is missing/denied/malformed %#",
  (value) => {
    const c = reader({ cookie_consent: value })
    expect(serverMeasurementHeaders(c)).toEqual({})
    expect(c.get.mock.calls).toEqual([["cookie_consent"]])
  }
)
it("cannot silently use a test key in the production lane", () => {
  ;(getStripePublishableKey as jest.Mock).mockReturnValue("pk_test_fixture")
  expect(serverMeasurementHeaders(reader())).toEqual({})
  process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT = "rehearsal"
  process.env.NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID = "launch-fixture"
  expect(decode(serverMeasurementHeaders(reader()))).toMatchObject({
    test_event: true,
    rehearsal_id: "launch-fixture",
  })
})
it("keeps missing and unverified assignment history explicit", () => {
  expect(
    decode(serverMeasurementHeaders(reader({ _gp_exp_assignments: undefined })))
      .experiment_context_status
  ).toBe("unverified")
  const value = JSON.stringify({
    exp: {
      variantKey: "control",
      assignmentId: "assigned",
      assignedAt: "2026-09-21",
    },
  })
  expect(
    decode(serverMeasurementHeaders(reader({ _gp_exp_assignments: value })))
      .experiment_context_status
  ).toBe("unverified")
  ;(verifiedStoredAssignment as jest.Mock).mockReturnValue(true)
  expect(
    decode(serverMeasurementHeaders(reader({ _gp_exp_assignments: value })))
      .experiment_context_status
  ).toBe("complete")
})
it("keeps email-shaped IDs out and makes oversize or unreadable context unavailable", () => {
  expect(
    decode(
      serverMeasurementHeaders(reader({ _gp_anon_id: "private@example.test" }))
    )
  ).not.toHaveProperty("anonymous_id")
  expect(
    serverMeasurementHeaders({
      get: () => {
        throw new Error("cookies unavailable")
      },
    })
  ).toEqual({})
  const huge = JSON.stringify({
    exp: {
      variantKey: "x".repeat(14000),
      assignmentId: "id",
      assignedAt: "2026-09-21",
    },
  })
  expect(
    serverMeasurementHeaders(reader({ _gp_exp_assignments: huge }))
  ).toEqual({})
})
it("preserves the existing auth header even if measurement is unavailable", async () => {
  ;(cookies as jest.Mock).mockResolvedValue(
    reader({ _medusa_jwt: "auth-fixture", cookie_consent: "invalid" })
  )
  expect(await getAuthHeaders()).toEqual({
    authorization: "Bearer auth-fixture",
  })
  ;(cookies as jest.Mock).mockResolvedValue(reader({ _medusa_jwt: undefined }))
  expect(await getAuthHeaders({ customerMeasurement: true })).toHaveProperty(
    "x-gp-measurement-context"
  )
})
