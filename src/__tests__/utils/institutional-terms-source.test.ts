jest.mock("server-only", () => ({}))

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { getCustomerInstitutionalTerms } from "@lib/data/institutional-terms"

jest.mock("@lib/config", () => ({ sdk: { client: { fetch: jest.fn() } } }))
jest.mock("@lib/data/cookies", () => ({ getAuthHeaders: jest.fn() }))

const fetch = sdk.client.fetch as jest.Mock
const auth = getAuthHeaders as jest.Mock
const prior = process.env.GP_INSTITUTIONAL_TERMS_ENABLED

afterAll(() => {
  if (prior === undefined) delete process.env.GP_INSTITUTIONAL_TERMS_ENABLED
  else process.env.GP_INSTITUTIONAL_TERMS_ENABLED = prior
})
beforeEach(() => {
  jest.clearAllMocks()
  process.env.GP_INSTITUTIONAL_TERMS_ENABLED = "true"
  auth.mockResolvedValue({ authorization: "Bearer fixture" })
})

it("makes no source request with the flag off", async () => {
  delete process.env.GP_INSTITUTIONAL_TERMS_ENABLED
  expect((await getCustomerInstitutionalTerms()).status).toBe("disabled")
  expect(fetch).not.toHaveBeenCalled()
})

it("uses the authenticated source response for the customer's approved terms", async () => {
  fetch.mockResolvedValue({
    status: "approved", reason: null,
    terms: { name: "Net 10", creditLimitCents: 100000, openInvoiceCents: 20000 },
    source: { revision: "test_rev_01", lastSuccess: "2026-09-24T22:00:00Z" },
  })
  const status = await getCustomerInstitutionalTerms()
  expect(status.status).toBe("approved")
  expect(status.terms?.name).toBe("Net 10")
  expect(fetch).toHaveBeenCalledWith(
    "/store/customers/me/institutional-terms",
    expect.objectContaining({ method: "GET", cache: "no-store" })
  )
})

it("holds malformed approval and a failed read instead of enabling invoice checkout", async () => {
  fetch.mockResolvedValueOnce({
    status: "approved", terms: { name: "Net 10", creditLimitCents: 100000 },
  }).mockRejectedValueOnce(new Error("source unavailable"))
  expect((await getCustomerInstitutionalTerms()).status).toBe("held")
  expect((await getCustomerInstitutionalTerms()).status).toBe("held")
})

it("requires a customer auth header before a source read", async () => {
  auth.mockResolvedValue({})
  expect((await getCustomerInstitutionalTerms()).status).toBe("held")
  expect(fetch).not.toHaveBeenCalled()
})
