jest.mock("server-only", () => ({}))

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
