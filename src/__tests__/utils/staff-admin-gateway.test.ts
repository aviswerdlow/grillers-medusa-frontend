/** @jest-environment node */
import { adminFetch } from "@lib/data/staff/admin"
import { getAuthHeaders } from "@lib/data/cookies"
jest.mock("@lib/data/cookies", () => ({ getAuthHeaders: jest.fn() }))

describe("staff admin gateway", () => {
  const originalEnv = { ...process.env }, originalFetch = global.fetch
  beforeEach(() => {
    process.env.MEDUSA_ADMIN_API_TOKEN = "sk_fixture_gateway"
    ;(getAuthHeaders as jest.Mock).mockResolvedValue({ authorization: "Bearer original.signed.staff" })
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })) as any
  })
  afterAll(() => { process.env = originalEnv; global.fetch = originalFetch })

  it("binds every request to the original cookie token and prevents header substitution", async () => {
    await adminFetch("/admin/orders/order_fixture", { headers: new Headers({ Authorization: "Bearer forged-admin", "X-GP-Staff-Authorization": "Bearer forged-person", "Idempotency-Key": "intent-fixture" }), query: { fields: ["id", "metadata"] } })
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = new Headers(options.headers)
    expect(headers.get("authorization")).toBe(`Basic ${Buffer.from("sk_fixture_gateway:").toString("base64")}`)
    expect(headers.get("x-gp-staff-authorization")).toBe("Bearer original.signed.staff")
    expect(headers.get("idempotency-key")).toBe("intent-fixture")
    expect(url).toContain("/admin/orders/order_fixture?fields%5B%5D=id&fields%5B%5D=metadata")
    expect(options).toMatchObject({ cache: "no-store", redirect: "error" })
    expect(options.query).toBeUndefined()
  })
  it("does not send the service credential without a signed-in person's token", async () => {
    ;(getAuthHeaders as jest.Mock).mockResolvedValue({})
    await expect(adminFetch("/admin/orders")).rejects.toThrow("Sign in again")
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it.each(["https://example.test/admin/orders", "//example.test/admin/orders", "/store/customers", "/admin/../store/customers", "/admin/%2e%2e/store/customers", "/admin/orders?redirect=elsewhere", "/admin\\orders"])("rejects paths outside the admin gateway: %s", async path => {
    await expect(adminFetch(path)).rejects.toThrow("Invalid staff API path")
    expect(global.fetch).not.toHaveBeenCalled()
  })
  it("preserves the backend denial as an action failure", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({ message: "Staff access changed. Sign in again." }) })) as any
    await expect(adminFetch("/admin/orders")).rejects.toThrow("Staff access changed")
  })
})
