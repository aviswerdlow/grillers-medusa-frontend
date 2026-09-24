jest.mock("server-only", () => ({}))

import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { sdk } from "@lib/config"
import {
  addCustomerAddress,
  retrieveCustomer,
} from "@lib/data/customer"
import { submitContactVerification } from "@lib/data/contact-verification"
import { getStaffImpersonationSession } from "@lib/data/staff/impersonation"
import { collectPhoneCandidates } from "@lib/util/contact-verification"

jest.mock("@lib/config", () => ({
  sdk: { client: { fetch: jest.fn() } },
}))

jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(async () => ({ authorization: "Bearer test" })),
  getCacheTag: jest.fn(async () => "customers-test"),
}))

jest.mock("@lib/data/customer", () => ({
  retrieveCustomer: jest.fn(),
  addCustomerAddress: jest.fn(),
}))

jest.mock("@lib/data/staff/impersonation", () => ({
  getStaffImpersonationSession: jest.fn(),
}))

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: jest.fn(async () => ({ ok: true, skipped: false })),
}))

jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }))

const mockedRetrieveCustomer = retrieveCustomer as jest.MockedFunction<
  typeof retrieveCustomer
>
const mockedGetStaffImpersonationSession =
  getStaffImpersonationSession as jest.MockedFunction<
    typeof getStaffImpersonationSession
  >
const mockedAddCustomerAddress = addCustomerAddress as jest.MockedFunction<
  typeof addCustomerAddress
>
const mockedFetch = sdk.client.fetch as jest.MockedFunction<
  typeof sdk.client.fetch
>

const migratedCustomer = {
  id: "cus_migrated",
  email: "customer@example.com",
  created_at: "2025-01-01T00:00:00.000Z",
  phone: "4045550100",
  metadata: { legacy_source: "legacy_site_customers", legacy_customer_id: "source-1" },
  addresses: [],
} as any

describe("first-login SMS phone integrity", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetStaffImpersonationSession.mockResolvedValue(null)
    mockedRetrieveCustomer.mockResolvedValue(migratedCustomer)
  })

  it("omits malformed stored phones instead of turning them into candidates", () => {
    expect(
      collectPhoneCandidates({
        ...migratedCustomer,
        phone: "4045550100123",
        addresses: [
          {
            phone: "7705550100",
            address_1: "1 Main Street",
            city: "Atlanta",
          },
        ],
      })
    ).toEqual([
      {
        value: "7705550100",
        sources: ["saved address (1 Main Street, Atlanta)"],
      },
    ])
  })

  it.each([
    ["new number", "other", "4045550100123"],
    ["forged saved choice", "4045550100123", ""],
  ])("rejects extra digits from %s before consent is written", async (
    _label,
    choice,
    other
  ) => {
    const form = new FormData()
    form.set("primary_phone", choice)
    form.set("primary_phone_other", other)
    form.set("sms_marketing_opt_in", "on")

    const result = await submitContactVerification(null, form)

    expect(result?.success).toBe(false)
    expect(result?.error).toMatch(/mobile|choose which number/i)
    expect(mockedFetch).not.toHaveBeenCalled()
    expect(mockedAddCustomerAddress).not.toHaveBeenCalled()
  })
})


describe("contact endpoint rollout alerts", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetStaffImpersonationSession.mockResolvedValue(null)
    mockedRetrieveCustomer.mockResolvedValue({ ...migratedCustomer, addresses: [{ id: "addr_test" }] })
  })
  it.each([404, 503])("contact submit %s alerts only on an unexpected outage", async status => {
    mockedFetch.mockImplementation(async (path) => {
      if (path === "/store/customers/me/contact") throw { response: { status } }
      return {} as any
    })
    const form = new FormData()
    form.set("primary_phone", "4045550100")
    form.set("primary_address_id", "addr_test")
    form.set("contact_revision", "0")
    form.set("contact_request_id", "synthetic-contact-request-01")
    const result = await submitContactVerification(null, form)
    expect(result?.success).toBe(false)
    if (status === 404) {
      expect(emitStorefrontOpsAlert).not.toHaveBeenCalled()
      expect(result?.error).toMatch(/Do this later/)
    } else expect(emitStorefrontOpsAlert).toHaveBeenCalledTimes(1)
  })
  it("still alerts on an address 404 rather than suppressing unrelated failures", async () => {
    mockedFetch.mockRejectedValue({ status: 404 })
    const form = new FormData()
    form.set("primary_phone", "4045550100")
    form.set("primary_address_id", "addr_test")
    await submitContactVerification(null, form)
    expect(emitStorefrontOpsAlert).toHaveBeenCalledTimes(1)
  })
})
