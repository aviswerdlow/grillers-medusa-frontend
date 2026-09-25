jest.mock("server-only", () => ({}))

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { submitInvoiceApplication } from "@lib/data/invoice-applications"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"

jest.mock("@lib/config", () => ({
  sdk: {
    client: {
      fetch: jest.fn(),
    },
  },
}))

jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(),
}))

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: jest.fn(async () => ({ ok: true, skipped: false })),
}))

const mockGetAuthHeaders = getAuthHeaders as jest.MockedFunction<
  typeof getAuthHeaders
>
const mockSdkFetch = sdk.client.fetch as jest.MockedFunction<
  typeof sdk.client.fetch
>
const mockEmitStorefrontOpsAlert =
  emitStorefrontOpsAlert as jest.MockedFunction<typeof emitStorefrontOpsAlert>

function validForm(overrides: Record<string, string | string[]> = {}) {
  const form = new FormData()
  form.set("business_name", "Acme Catering")
  form.set("contact_name", "Ari Cohen")
  form.set("contact_email", "ari@example.com")
  form.set("contact_phone", "404-555-0143")
  form.set("tax_id", "58-1234567")
  form.set("requested_credit_limit", "2500")
  form.set("notes", "Weekly catering orders")
  form.append("methods", "check")
  form.append("methods", "wire")

  for (const [key, value] of Object.entries(overrides)) {
    form.delete(key)
    const values = Array.isArray(value) ? value : [value]
    for (const item of values) {
      form.append(key, item)
    }
  }

  return form
}

describe("invoice application alerts", () => {
  const previousInstitutionalFlag = process.env.GP_INSTITUTIONAL_TERMS_ENABLED

  beforeEach(() => {
    process.env.GP_INSTITUTIONAL_TERMS_ENABLED = "true"
    jest.clearAllMocks()
    mockGetAuthHeaders.mockResolvedValue({ authorization: "Bearer customer" })
  })

  afterAll(() => {
    if (previousInstitutionalFlag === undefined) {
      delete process.env.GP_INSTITUTIONAL_TERMS_ENABLED
    } else {
      process.env.GP_INSTITUTIONAL_TERMS_ENABLED = previousInstitutionalFlag
    }
  })

  it("keeps applications off without calling auth or backend when the flag is unset", async () => {
    delete process.env.GP_INSTITUTIONAL_TERMS_ENABLED
    await expect(submitInvoiceApplication({ success: false, error: null }, validForm()))
      .resolves.toEqual({ success: false, error: "Invoice terms are unavailable." })
    expect(mockGetAuthHeaders).not.toHaveBeenCalled()
    expect(mockSdkFetch).not.toHaveBeenCalled()
  })

  it("alerts when invoice application submission fails after auth", async () => {
    mockSdkFetch.mockRejectedValueOnce({
      status: 503,
      message: "invoice failed for shopper@example.com cus_123",
    })

    const result = await submitInvoiceApplication(
      { success: false, error: null },
      validForm()
    )

    expect(result).toEqual({
      success: false,
      error: "invoice failed for shopper@example.com cus_123",
    })
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "invoice_application_failed",
        severity: "warn",
        title: "Invoice terms application failed",
        path: "src/lib/data/invoice-applications.ts:submitInvoiceApplication",
        source: "storefront-server",
        fingerprint: "invoice_application_failed:application_submit:503",
        meta: expect.objectContaining({
          account_surface: "invoice_application",
          route_dependency: "/store/grillers/invoice-applications",
          failure_stage: "application_submit",
          response_status: 503,
          has_auth: true,
          has_tax_id: true,
          has_requested_credit_limit: true,
          has_notes: true,
          method_count: 2,
          error_message:
            "invoice failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("alerts when auth headers fail before invoice application submission", async () => {
    mockGetAuthHeaders.mockRejectedValueOnce(
      new Error("cookies unavailable for shopper@example.com")
    )

    const result = await submitInvoiceApplication(
      { success: false, error: null },
      validForm({
        tax_id: "",
        requested_credit_limit: "",
        notes: "",
        methods: [],
      })
    )

    expect(result).toEqual({
      success: false,
      error: "cookies unavailable for shopper@example.com",
    })
    expect(mockSdkFetch).not.toHaveBeenCalled()
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "invoice_application_failed",
        fingerprint: "invoice_application_failed:auth_headers:transport",
        meta: expect.objectContaining({
          route_dependency: "storefront auth headers",
          failure_stage: "auth_headers",
          has_auth: false,
          has_tax_id: false,
          has_requested_credit_limit: false,
          has_notes: false,
          method_count: 0,
          error_message: "cookies unavailable for [redacted-email]",
        }),
      })
    )
  })

  it("does not alert for local validation, unsigned users, or backend validation errors", async () => {
    await expect(
      submitInvoiceApplication(
        { success: false, error: null },
        validForm({ business_name: "" })
      )
    ).resolves.toEqual({
      success: false,
      error: "Business name, contact name, and contact email are required.",
    })

    mockGetAuthHeaders.mockResolvedValueOnce({})
    await expect(
      submitInvoiceApplication({ success: false, error: null }, validForm())
    ).resolves.toEqual({
      success: false,
      error: "Please sign in to apply for invoice terms.",
    })

    mockSdkFetch.mockRejectedValueOnce({
      status: 400,
      data: { message: "Requested credit limit is invalid." },
    })
    await expect(
      submitInvoiceApplication({ success: false, error: null }, validForm())
    ).resolves.toEqual({
      success: false,
      error: "Requested credit limit is invalid.",
    })

    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })
})
