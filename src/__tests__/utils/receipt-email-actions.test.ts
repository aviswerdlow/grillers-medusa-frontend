import { sdk } from "@lib/config"
import { updateReceiptEmail } from "@lib/data/receipt-email"
import { readStaffImpersonationCookie } from "@lib/data/staff/session-cookie"
jest.mock("@lib/config", () => ({ sdk: { client: { fetch: jest.fn() } } }))
jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: async () => ({ authorization: "Bearer synthetic" }),
  getCacheTag: async () => "customers",
}))
jest.mock("@lib/data/staff/impersonation", () => ({
  getStaffImpersonationSession: async () => null,
}))
jest.mock("@lib/data/staff/session-cookie", () => ({
  readStaffImpersonationCookie: jest.fn(async () => null),
}))
jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }))
const initial = { receipt: null, error: null, notice: null }
const form = (action = "request") => {
  const f = new FormData()
  f.set("action", action)
  f.set("email", "receipt@example.invalid")
  f.set("expected_revision", "2")
  f.set("request_id", "synthetic-request-0001")
  return f
}
beforeEach(() => {
  jest.clearAllMocks()
  ;(readStaffImpersonationCookie as jest.Mock).mockResolvedValue(null)
})
it("forwards a versioned authenticated request and describes pending rather than verified", async () => {
  ;(sdk.client.fetch as jest.Mock).mockResolvedValue({
    receipt: { revision: 3 },
  })
  const r = await updateReceiptEmail(initial, form())
  expect(r.error).toBeNull()
  expect(r.notice).toMatch(/stays active until verification/)
  expect(sdk.client.fetch).toHaveBeenCalledWith(
    "/store/customers/me/receipt-email",
    expect.objectContaining({
      headers: { authorization: "Bearer synthetic" },
      body: {
        action: "request",
        email: "receipt@example.invalid",
        expected_revision: 2,
        request_id: "synthetic-request-0001",
      },
    })
  )
})
it("denies staff-cookie context even when the verified helper returned null", async () => {
  ;(readStaffImpersonationCookie as jest.Mock).mockResolvedValue({
    customerId: "cus_test",
  })
  const r = await updateReceiptEmail(initial, form())
  expect(r.error).toBeTruthy()
  expect(sdk.client.fetch).not.toHaveBeenCalled()
})
it("keeps provider errors out of customer copy and reads current state for recovery", async () => {
  ;(sdk.client.fetch as jest.Mock)
    .mockRejectedValueOnce({ status: 429, message: "private provider detail" })
    .mockResolvedValueOnce({ receipt: { revision: 4 } })
  const r = await updateReceiptEmail(initial, form())
  expect(r.error).toMatch(/five codes/)
  expect(r.error).not.toMatch(/private/)
  expect(r.receipt?.revision).toBe(4)
})
