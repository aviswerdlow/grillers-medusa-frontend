import {
  applyStaffOrderException,
  getStaffExceptionOrderDetail,
  searchStaffExceptionOrdersResult,
} from "@lib/data/staff/order-exceptions"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { adminFetch } from "@lib/data/staff/admin"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"

jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomerForStaffAccess: jest.fn(),
}))

jest.mock("@lib/util/staff-access", () => ({
  canManageOrderSupport: jest.fn(() => true),
  staffAccessRole: jest.fn(() => "super_admin"),
  staffDisplayName: jest.fn(() => "Avi Swerdlow"),
}))

jest.mock("@lib/data/staff/admin", () => ({
  adminFetch: jest.fn(),
  appendStaffAuditLog: jest.fn((metadata, entry) => ({
    ...(metadata || {}),
    staff_audit_log: JSON.stringify([entry]),
  })),
}))

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: jest.fn(async () => ({ ok: true, skipped: false })),
}))

const mockRetrieveAuthenticatedCustomer =
  retrieveAuthenticatedCustomerForStaffAccess as jest.MockedFunction<
    typeof retrieveAuthenticatedCustomerForStaffAccess
  >
const mockAdminFetch = adminFetch as jest.MockedFunction<typeof adminFetch>
const mockEmitStorefrontOpsAlert =
  emitStorefrontOpsAlert as jest.MockedFunction<typeof emitStorefrontOpsAlert>

const order = {
  id: "order_123",
  display_id: 123,
  status: "pending",
  fulfillment_status: "not_fulfilled",
  payment_status: "authorized",
  currency_code: "usd",
  total: 7500,
  created_at: "2026-06-28T00:00:00.000Z",
  updated_at: "2026-06-28T00:00:00.000Z",
  metadata: {},
  customer: {
    first_name: "Test",
    last_name: "Customer",
  },
  items: [],
  fulfillments: [],
  payment_collections: [],
}

describe("staff order-support ops alerts", () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    mockRetrieveAuthenticatedCustomer.mockResolvedValue({
      id: "cus_staff",
      email: "staff@example.com",
      first_name: "Avi",
      last_name: "Swerdlow",
      metadata: { gp_staff_role: "super_admin" },
    } as any)
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it("alerts when order-support search backends all fail", async () => {
    mockAdminFetch.mockRejectedValue(new Error("Medusa order search timed out"))

    const result = await searchStaffExceptionOrdersResult({
      query: "customer@example.com",
      queue: "open",
      page: 2,
      pageSize: 25,
    })

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        orders: [],
        page: 2,
        pageSize: 25,
      })
    )
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_order_support_search_failed",
        severity: "warn",
        title: "Staff order support search failed",
        path: "src/lib/data/staff/order-exceptions.ts",
        source: "medusa-server",
        fingerprint: "staff_order_support:search_failed",
        meta: expect.objectContaining({
          staff_module: "order_support",
          action: "search_orders",
          query_kind: "email",
          query_length_bucket: 20,
          queue: "open",
          page: 2,
          page_size: 25,
          error_message: "Medusa order search timed out",
        }),
      })
    )
    expect(
      JSON.stringify(mockEmitStorefrontOpsAlert.mock.calls[0][0].meta)
    ).not.toContain("customer@example.com")
  })

  it("alerts when a downstream cancel action fails after audit", async () => {
    mockAdminFetch.mockImplementation(async (path, init = {}) => {
      if (path === "/admin/orders/order_123/cancel") {
        throw new Error("Medusa cancel API timed out")
      }
      if (path === "/admin/orders/order_123") {
        return { order } as any
      }
      if (path === "/admin/grillers/orders/order_123/accounting-action") {
        return init.method === "POST" ? { order } as any : { actions: [] } as any
      }
      throw new Error(`Unexpected adminFetch ${path} ${init.method || "GET"}`)
    })

    const result = await applyStaffOrderException({
      orderId: "order_123",
      action: "cancel_order",
      reasonCode: "customer_request",
      staffNote: "Customer asked to cancel before picking.",
      customerConsentMethod: "phone",
      typedConfirmation: "CANCEL",
    })

    expect(result).toEqual({
      ok: false,
      error: "Medusa cancel API timed out",
    })
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_order_support_action_failed",
        severity: "warn",
        title: "Staff order support action failed",
        path: "src/lib/data/staff/order-exceptions.ts",
        source: "medusa-server",
        fingerprint: "staff_order_support:cancel_order:medusa_cancel:failed",
        meta: expect.objectContaining({
          staff_module: "order_support",
          action: "cancel_order",
          stage: "medusa_cancel",
          order_id: "order_123",
          order_display_id: "#123",
          moves_money: false,
          mutates_medusa: true,
          qbd_reconciliation_needed: true,
          error_message: "Medusa cancel API timed out",
        }),
      })
    )
  })

  it("keeps refund accounting in the backend and preserves one request identity per submitted action", async () => {
    const paidOrder = { ...order, payment_status: "captured", payment_collections: [{ payments: [
      { id: "pay_test", provider_id: "pp_stripe_stripe", amount: 75, captured_amount: 75, currency_code: "usd", refunds: [] },
    ] }] }
    mockAdminFetch.mockImplementation(async (path, init = {}) => {
      if (path === "/admin/orders/order_123") return { order: paidOrder } as any
      if (path === "/admin/grillers/orders/order_123/accounting-action") return init.method === "POST" ? { order: paidOrder } as any : { actions: [] } as any
      if (path === "/admin/grillers/payments/pay_test/refund") return { payment: { id: "pay_test", refunds: [{ id: "refund_test", amount: 5 }] } } as any
      throw new Error(`Unexpected path ${path}`)
    })
    const input = { orderId: "order_123", action: "refund_payment" as const, reasonCode: "customer_request" as const,
      staffNote: "Synthetic refund", amount: 5, paymentId: "pay_test", customerConsentMethod: "phone" as const, typedConfirmation: "REFUND", requestId: "intent_one" }
    expect((await applyStaffOrderException(input)).ok).toBe(true)
    expect((await applyStaffOrderException(input)).ok).toBe(true)
    expect((await applyStaffOrderException({ ...input, requestId: "intent_two" })).ok).toBe(true)
    const refundCalls = mockAdminFetch.mock.calls.filter(([path]) => path.endsWith("/payments/pay_test/refund"))
    const keys = refundCalls.map(([, init]) => (init?.headers as Record<string, string>)["Idempotency-Key"])
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
    const audits = mockAdminFetch.mock.calls.filter(([path, init]) => path.endsWith("/accounting-action") && init?.method === "POST")
    for (const [, init] of audits) {
      const payload = JSON.parse(String(init?.body))
      expect(Object.keys(payload.patch).some((key) => key.startsWith("qbd_posting_") || key.startsWith("stripe_refund_"))).toBe(false)
    }
    expect(mockAdminFetch.mock.calls.filter(([path, init]) => path === "/admin/orders/order_123" && init?.method === "POST")).toHaveLength(0)
  })

  it("returns the older action history independently of the latest order metadata", async () => {
    const actions = [{ id: "action_old", request_key: "invoice:old", action: "invoice_ar_accounting_record", status: "failed", currency_code: "usd", amount_minor: 3000, created_at: "2026-09-19" }]
    mockAdminFetch.mockImplementation(async (path) => path.endsWith("/accounting-action") ? { actions } as any : { order } as any)
    expect((await getStaffExceptionOrderDetail(order.id)).accountingActions).toEqual(actions)
  })
})
