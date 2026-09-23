import { revalidateTag } from "next/cache"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheTag } from "@lib/data/cookies"
import { retrieveAuthenticatedCustomer } from "@lib/data/customer"
import {
  retrieveSmsMarketingStatus,
  submitSmsMarketingOptIn,
} from "@lib/data/sms-marketing"
import { readStaffImpersonationCookie } from "@lib/data/staff/session-cookie"
import {
  SMS_MARKETING_CONSENT_METHOD,
  SMS_MARKETING_CONSENT_PURPOSE,
  SMS_MARKETING_CONSENT_VERSION,
  SMS_MARKETING_DISCLOSURE,
  SMS_MARKETING_PROGRAM,
  SMS_MARKETING_PROVIDER,
} from "@lib/util/sms-consent"

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }))

jest.mock("@lib/config", () => ({
  sdk: {
    client: {
      fetch: jest.fn(),
    },
    store: {
      customer: {
        update: jest.fn(),
      },
    },
  },
}))

jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(),
  getCacheTag: jest.fn(),
}))

jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomer: jest.fn(),
}))

jest.mock("@lib/data/staff/session-cookie", () => ({
  readStaffImpersonationCookie: jest.fn(),
}))

const mockedReadStaffImpersonationCookie =
  readStaffImpersonationCookie as jest.MockedFunction<
    typeof readStaffImpersonationCookie
  >
const mockedRetrieveAuthenticatedCustomer =
  retrieveAuthenticatedCustomer as jest.MockedFunction<
    typeof retrieveAuthenticatedCustomer
  >
const mockedGetAuthHeaders = getAuthHeaders as jest.MockedFunction<
  typeof getAuthHeaders
>
const mockedGetCacheTag = getCacheTag as jest.MockedFunction<typeof getCacheTag>
const mockedUpdate = sdk.store.customer.update as jest.MockedFunction<
  typeof sdk.store.customer.update
>
const mockedFetch = sdk.client.fetch as jest.MockedFunction<
  typeof sdk.client.fetch
>

function optedInForm(phone = "(404) 555-0100") {
  const form = new FormData()
  form.set("contact_revision", "0")
  form.set("contact_request_id", "synthetic-contact-request-01")
  form.set("phone", phone)
  form.set("sms_marketing_opt_in", "on")
  return form
}

describe("signed-in SMS marketing action", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedReadStaffImpersonationCookie.mockResolvedValue(null)
    mockedRetrieveAuthenticatedCustomer.mockResolvedValue({
      id: "cus_profile",
      email: "customer@example.com",
      phone: "4045559999",
      metadata: { favorite_cut: "brisket" },
    } as any)
    mockedGetAuthHeaders.mockResolvedValue({
      authorization: "Bearer customer-token",
    })
    mockedGetCacheTag.mockResolvedValue("customers-tag")
    mockedUpdate.mockResolvedValue({} as any)
    mockedFetch.mockImplementation(async (_path, options) => {
      if (options?.method === "POST") throw { status: 404 }
      return {
      status: "not_subscribed",
      phone: null,
      consented_at: null,
      opted_out_at: null,
    } as any
    })
  })

  it("hard-blocks staff impersonation before any customer read or write", async () => {
    mockedReadStaffImpersonationCookie.mockResolvedValue({
      staffCustomerId: "cus_staff",
      targetCustomerId: "cus_target",
    } as any)

    const result = await submitSmsMarketingOptIn(null, optedInForm())

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/only be provided by the customer/i),
      })
    )
    expect(mockedRetrieveAuthenticatedCustomer).not.toHaveBeenCalled()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it("fails closed when the impersonation check itself fails", async () => {
    mockedReadStaffImpersonationCookie.mockRejectedValue(
      new Error("cookie check unavailable")
    )

    const result = await submitSmsMarketingOptIn(null, optedInForm())

    expect(result?.success).toBe(false)
    expect(result?.error).toMatch(/only be provided by the customer/i)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it("requires the explicit checkbox on the server", async () => {
    const form = new FormData()
    form.set("phone", "4045550100")

    const result = await submitSmsMarketingOptIn(null, form)

    expect(result?.success).toBe(false)
    expect(result?.error).toMatch(/check the marketing text box/i)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it("rejects phone values that would otherwise be silently truncated", async () => {
    const result = await submitSmsMarketingOptIn(
      null,
      optedInForm("4045550100123")
    )

    expect(result?.success).toBe(false)
    expect(result?.error).toMatch(/valid 10-digit US mobile number/i)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it("requires carrier START before re-opting the stopped phone", async () => {
    mockedFetch.mockResolvedValueOnce({
      status: "unsubscribed",
      phone: "4045550100",
      consented_at: null,
      opted_out_at: "2026-07-14T12:00:00.000Z",
    } as any)

    const result = await submitSmsMarketingOptIn(null, optedInForm())

    expect(result?.success).toBe(false)
    expect(result?.error).toMatch(/text START.*then resubmit/i)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it("allows fresh consent for a different phone than the carrier-stopped phone", async () => {
    mockedFetch.mockResolvedValueOnce({
      status: "unsubscribed",
      phone: "4045550100",
      consented_at: null,
      opted_out_at: "2026-07-14T12:00:00.000Z",
    } as any)

    const result = await submitSmsMarketingOptIn(
      null,
      optedInForm("(770) 555-0100")
    )

    expect(result?.success).toBe(true)
    expect(mockedUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ phone: "7705550100" }),
      {},
      expect.any(Object)
    )
  })

  it("fails closed before writing when authoritative status is unavailable", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("status service unavailable"))

    const result = await submitSmsMarketingOptIn(null, optedInForm())

    expect(result?.success).toBe(false)
    expect(result?.error).toMatch(/status is temporarily unavailable/i)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it("atomically saves the edited phone and exact account-profile v3 evidence", async () => {
    const result = await submitSmsMarketingOptIn(null, optedInForm())

    expect(result).toEqual({
      success: true,
      error: null,
      phone: "4045550100",
      receipt: expect.any(String),
    })
    expect(mockedUpdate).toHaveBeenCalledTimes(1)

    const [body, query, headers] = mockedUpdate.mock.calls[0]
    expect(query).toEqual({})
    expect(headers).toEqual({ authorization: "Bearer customer-token" })
    expect(body).toMatchObject({
      phone: "4045550100",
      metadata: {
        sms_marketing_opt_in: true,
        sms_consent: true,
        sms_consent_status: "subscribed",
        sms_consent_source: "account_profile",
        sms_consent_version: SMS_MARKETING_CONSENT_VERSION,
        sms_consent_text: SMS_MARKETING_DISCLOSURE,
        sms_consent_phone: "4045550100",
        sms_consent_provider: SMS_MARKETING_PROVIDER,
        sms_program: SMS_MARKETING_PROGRAM,
        sms_consent_purpose: SMS_MARKETING_CONSENT_PURPOSE,
        sms_consent_method: SMS_MARKETING_CONSENT_METHOD,
      },
    })
    expect(
      Number.isNaN(
        new Date(String((body.metadata as any).sms_consent_at)).getTime()
      )
    ).toBe(false)
    expect((body.metadata as any).sms_consent_at).toBe(result?.receipt)
    expect(revalidateTag).toHaveBeenCalledWith("customers-tag")
  })

  it("keeps the original submission timestamp when status returns later", async () => {
    jest.useFakeTimers()
    const submittedAt = new Date("2026-07-14T12:00:00.000Z")
    const stopArrivedAt = new Date("2026-07-14T12:00:03.000Z")
    jest.setSystemTime(submittedAt)
    mockedFetch.mockImplementationOnce(async () => {
      // Model a status response whose database read happened before STOP, but
      // which only reaches the action after STOP has committed.
      jest.setSystemTime(new Date("2026-07-14T12:00:05.000Z"))
      return {
        status: "not_subscribed",
        phone: null,
        consented_at: null,
        opted_out_at: null,
      } as any
    })

    try {
      const result = await submitSmsMarketingOptIn(null, optedInForm())
      const [body] = mockedUpdate.mock.calls[0]
      const recordedAt = String((body.metadata as any).sms_consent_at)

      expect(recordedAt).toBe(submittedAt.toISOString())
      expect(result?.receipt).toBe(submittedAt.toISOString())
      expect(new Date(recordedAt).getTime()).toBeLessThan(
        stopArrivedAt.getTime()
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it("never replays staff or unrelated profile metadata in the legacy fallback", async () => {
    mockedRetrieveAuthenticatedCustomer
      .mockResolvedValueOnce({
        id: "cus_profile",
        email: "customer@example.com",
        phone: "4045559999",
        metadata: { preference: "old", stale_only: true },
      } as any)
      .mockResolvedValueOnce({
        id: "cus_profile",
        email: "customer@example.com",
        phone: "4045559999",
        metadata: { preference: "new", concurrent_update: true, created_by_staff_id: "staff_existing", gp_credit_limit: 500 },
      } as any)

    await submitSmsMarketingOptIn(null, optedInForm())

    const [body] = mockedUpdate.mock.calls[0]
    expect(body.metadata).toEqual(
      expect.objectContaining({
        sms_consent_source: "account_profile",
      })
    )
    for (const key of ["stale_only", "preference", "concurrent_update", "created_by_staff_id", "gp_credit_limit"]) expect(body.metadata).not.toHaveProperty(key)
  })

  it("uses the contact transaction with the displayed revision and request identity", async () => {
    mockedFetch.mockImplementation(async (_path, options) => options?.method === "POST"
      ? { ok: true, revision: 1 } as any
      : { status: "not_subscribed", phone: null, consented_at: null, opted_out_at: null } as any)
    expect((await submitSmsMarketingOptIn(null, optedInForm()))?.success).toBe(true)
    expect(mockedFetch).toHaveBeenCalledWith("/store/customers/me/contact", expect.objectContaining({
      method: "POST", body: { phone: "4045550100", expected_revision: 0, request_id: "synthetic-contact-request-01", sms_marketing_opt_in: true },
    }))
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it.each([401, 403, 409, 500, 503])("never downgrades a contact failure %s", async status => {
    mockedFetch.mockImplementation(async (_path, options) => {
      if (options?.method === "POST") throw { status }
      return { status: "not_subscribed", phone: null, consented_at: null, opted_out_at: null } as any
    })
    expect((await submitSmsMarketingOptIn(null, optedInForm()))?.success).toBe(false)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it("never downgrades a previously attested primary contact on 404", async () => {
    mockedRetrieveAuthenticatedCustomer.mockResolvedValue({ id: "cus_profile", metadata: { primary_contact_v1: { revision: 1 } } } as any)
    expect((await submitSmsMarketingOptIn(null, optedInForm()))?.success).toBe(false)
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it("reads authenticated status without caching and rejects malformed payloads", async () => {
    mockedFetch.mockResolvedValueOnce({
      status: "subscribed",
      phone: "4045550100",
      consented_at: "2026-07-14T12:00:00.000Z",
      opted_out_at: null,
    } as any)

    await expect(retrieveSmsMarketingStatus()).resolves.toMatchObject({
      status: "subscribed",
      phone: "4045550100",
    })
    expect(mockedFetch).toHaveBeenCalledWith(
      "/store/grillers/communications/sms-marketing-status",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: { authorization: "Bearer customer-token" },
      })
    )

    mockedFetch.mockResolvedValueOnce({ status: "invented" } as any)
    await expect(retrieveSmsMarketingStatus()).resolves.toBeNull()
  })
})
