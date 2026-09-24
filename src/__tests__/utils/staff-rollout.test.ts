/** @jest-environment node */
import { backgroundAdminToken, communicationsAdminToken } from "@lib/data/background-admin-token"
import { createStaffCart } from "@lib/data/staff/cart-authority"
import { StaffApiError, adminFetch } from "@lib/data/staff/admin"
import { retrieveCustomer } from "@lib/data/customer"
import { sdk } from "@lib/config"
jest.mock("@lib/data/staff/admin", () => ({ ...jest.requireActual("@lib/data/staff/admin"), adminFetch: jest.fn() }))
jest.mock("@lib/data/customer", () => ({ retrieveCustomer: jest.fn() }))
jest.mock("@lib/config", () => ({ sdk: { store: { cart: { create: jest.fn(async () => ({ cart: { id: "cart_fixture" } })) } } } }))
const originalEnv = { ...process.env }
beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.MEDUSA_READ_ONLY_API_TOKEN; delete process.env.MEDUSA_ADMIN_API_TOKEN; delete process.env.MEDUSA_COMMUNICATIONS_API_TOKEN
  ;(retrieveCustomer as jest.Mock).mockResolvedValue({ id: "cus_staff", metadata: { gp_staff_role: "office" } })
})
afterAll(() => { process.env = originalEnv })
it("accepts both deployed cron names and gives dedicated credentials priority", () => {
  expect(backgroundAdminToken()).toBe("")
  process.env.MEDUSA_ADMIN_API_TOKEN = "legacy"; expect(backgroundAdminToken()).toBe("legacy")
  process.env.MEDUSA_READ_ONLY_API_TOKEN = "reader"; expect(backgroundAdminToken()).toBe("reader")
  expect(communicationsAdminToken()).toBe("reader")
  process.env.MEDUSA_COMMUNICATIONS_API_TOKEN = "markers"; expect(communicationsAdminToken()).toBe("markers")
})
it.each(["old", "log"])("keeps authorized legacy staff cart preparation with %s backend", async mode => {
  ;(adminFetch as jest.Mock).mockRejectedValueOnce(new StaffApiError("missing", 404))
  if (mode === "old") (adminFetch as jest.Mock).mockRejectedValueOnce(new StaffApiError("missing", 404))
  else (adminFetch as jest.Mock).mockResolvedValueOnce({ staff_boundary_mode: "log" })
  await createStaffCart({ email: "fixture@example.test", metadata: { staff_phone_order: true } }, "staff_phone_order", "cus_buyer")
  expect(sdk.store.cart.create).toHaveBeenCalledWith(expect.objectContaining({ customer_id: "cus_buyer" }), {}, {})
})
it.each([401,403,409,500,503])("never falls back after staff endpoint HTTP %s", async status => {
  ;(adminFetch as jest.Mock).mockRejectedValueOnce(new StaffApiError("blocked", status))
  await expect(createStaffCart({}, "staff_phone_order")).rejects.toThrow("blocked")
  expect(sdk.store.cart.create).not.toHaveBeenCalled()
})
it.each([{ staff_boundary_mode: "enforce" }, {}, { staff_boundary_mode: "unknown" }])("rejects required or unknown staff capability %p", async capability => {
  ;(adminFetch as jest.Mock).mockRejectedValueOnce(new StaffApiError("missing",404)).mockResolvedValueOnce(capability)
  await expect(createStaffCart({}, "staff_phone_order")).rejects.toThrow("required")
  expect(sdk.store.cart.create).not.toHaveBeenCalled()
})
it.each([null, { metadata: { gp_staff_role: "customer" } }, { metadata: { gp_staff_role: "office" }, staff_access: { role: "office", session_current: true } }])("refuses legacy cart creation for missing/unprivileged/activated authority %p", async customer => {
  ;(adminFetch as jest.Mock).mockRejectedValueOnce(new StaffApiError("missing",404))
  ;(retrieveCustomer as jest.Mock).mockResolvedValueOnce(customer)
  await expect(createStaffCart({}, "staff_phone_order")).rejects.toThrow("Office")
  expect(sdk.store.cart.create).not.toHaveBeenCalled()
})
