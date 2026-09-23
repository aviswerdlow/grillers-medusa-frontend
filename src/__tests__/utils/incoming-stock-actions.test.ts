jest.mock("server-only", () => ({}))
jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomerForStaffAccess: jest.fn(),
}))
jest.mock("@lib/data/staff/admin", () => ({ adminFetch: jest.fn() }))
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { adminFetch } from "@lib/data/staff/admin"
import {
  getIncomingExceptions,
  getIncomingStock,
  saveIncomingStock,
  searchIncomingProducts,
} from "@lib/data/staff/incoming-stock"

const input = {
  action: "create" as const,
  request_id: "fixture-request",
  reason: "Receiving owner confirmed the record",
  variant_id: "variant_fixture",
  stock_unit: "pack",
  quantity: 10,
  source_system: "fixture",
  source_ref: "ref-1",
  usable_local: "2026-10-05T08:00",
  timezone: "America/New_York",
}
beforeEach(() => {
  jest.clearAllMocks()
  ;(retrieveAuthenticatedCustomerForStaffAccess as jest.Mock).mockResolvedValue(
    { id: "staff_fixture", metadata: { gp_staff_role: "super_admin" } }
  )
  ;(adminFetch as jest.Mock).mockResolvedValue({})
})
it("forwards only the allowed command fields and converts the explicit timezone", async () => {
  expect(
    (
      await saveIncomingStock({
        ...input,
        actor: { id: "forged" },
        qbd_list_id: "forged",
        inventory_applied: true,
      } as any)
    ).ok
  ).toBe(true)
  const [path, options] = (adminFetch as jest.Mock).mock.calls[0]
  expect(path).toBe("/admin/grillers/inventory/incoming")
  expect(JSON.parse(options.body)).toEqual({
    action: "create",
    request_id: input.request_id,
    reason: input.reason,
    variant_id: input.variant_id,
    stock_unit: "pack",
    source_system: "fixture",
    source_ref: "ref-1",
    expected_quantity: 10,
    usable_at: "2026-10-05T12:00:00.000Z",
  })
})
it("preserves an uncertain request but identifies an authoritative rejection", async () => {
  ;(adminFetch as jest.Mock).mockRejectedValueOnce(new Error("Response lost"))
  expect(await saveIncomingStock(input)).toMatchObject({
    ok: false,
    uncertain: true,
  })
  ;(adminFetch as jest.Mock).mockRejectedValueOnce(
    Object.assign(new Error("Batch changed"), { status: 409 })
  )
  expect(await saveIncomingStock(input)).toMatchObject({
    ok: false,
    uncertain: false,
    error: "Batch changed",
  })
})
it("does not contact the backend without staff access or with an ambiguous date", async () => {
  expect(
    await saveIncomingStock({ ...input, usable_local: "2026-11-01T01:30" })
  ).toMatchObject({ ok: false, uncertain: false })
  ;(retrieveAuthenticatedCustomerForStaffAccess as jest.Mock).mockResolvedValue(
    { metadata: { gp_staff_role: "customer" } }
  )
  expect((await getIncomingStock("v")).ok).toBe(false)
  expect((await getIncomingExceptions()).ok).toBe(false)
  expect((await searchIncomingProducts("pies")).ok).toBe(false)
  expect((await saveIncomingStock(input)).ok).toBe(false)
  expect(adminFetch).not.toHaveBeenCalled()
})
it("returns only product choices and excludes internal raw materials from receiving search", async () => {
  ;(adminFetch as jest.Mock).mockResolvedValue({
    products: [
      {
        id: "p",
        title: "Customer pie name",
        variants: [
          { id: "v", title: "Default", sku: "PIE" },
          { id: "raw", sku: "RM-TEST" },
        ],
      },
    ],
  })
  expect(await searchIncomingProducts("pie")).toEqual({
    ok: true,
    data: [{ variant_id: "v", title: "Customer pie name", sku: "PIE" }],
  })
})
it("carries final-delivery acknowledgement and current revision without a client actor", async () => {
  await saveIncomingStock({
    ...input,
    action: "stage_receipt",
    batch_id: "batch_fixture",
    expected_revision: 4,
    receipt_final_confirmed: true,
  })
  expect(
    JSON.parse((adminFetch as jest.Mock).mock.calls[0][1].body)
  ).toMatchObject({
    action: "stage_receipt",
    batch_id: "batch_fixture",
    expected_revision: 4,
    quantity: 10,
    receipt_final_confirmed: true,
  })
})
