jest.mock("@lib/data/cookies", () => ({
  ...jest.requireActual("@lib/data/cookies"),
  getAuthHeaders: jest.fn(async () => ({ authorization: "Bearer signed.fixture.staff" })),
}))

import {
  applyStaffCustomerAccountAction,
  getStaffCustomerContext,
  searchStaffCustomers,
  saveStaffCustomerAddress,
  updateStaffCustomerProfile,
} from "@lib/data/staff/order-entry"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"

jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomerForStaffAccess: jest.fn(),
}))

jest.mock("@lib/util/staff-access", () => ({
  canUseOfficeConsole: jest.fn(() => true),
  staffDisplayName: jest.fn(() => "Avi Swerdlow"),
}))

jest.mock("@lib/config", () => ({
  sdk: {
    auth: {
      register: jest.fn(),
      resetPassword: jest.fn(),
    },
    store: {
      cart: {},
      customer: {
        create: jest.fn(),
      },
    },
  },
}))

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: jest.fn(async () => ({ ok: true, skipped: false })),
}))

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}))

const mockRetrieveAuthenticatedCustomer =
  retrieveAuthenticatedCustomerForStaffAccess as jest.MockedFunction<
    typeof retrieveAuthenticatedCustomerForStaffAccess
  >
const mockEmitStorefrontOpsAlert =
  emitStorefrontOpsAlert as jest.MockedFunction<typeof emitStorefrontOpsAlert>

function response(
  ok: boolean,
  status: number,
  body: Record<string, unknown>
): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Service Unavailable",
    json: async () => body,
  } as Response
}

function currentCustomerResponse() {
  return response(true, 200, {
    customer: {
      id: "cus_target",
      email: "customer@example.com",
      metadata: {},
      addresses: [],
    },
  })
}

describe("staff order-entry customer context mutation alerts", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.MEDUSA_ADMIN_API_TOKEN = "admin-token"
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test"
    mockRetrieveAuthenticatedCustomer.mockResolvedValue({
      id: "cus_staff",
      email: "staff@example.com",
      first_name: "Avi",
      last_name: "Swerdlow",
      metadata: { gp_staff_role: "super_admin" },
    } as any)
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("alerts when a staff customer profile write fails", async () => {
    global.fetch = jest.fn(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === "POST") {
        return response(false, 503, {
          message: "Medusa write failed for customer@example.com cus_target",
        })
      }
      return currentCustomerResponse()
    }) as unknown as typeof fetch

    const result = await updateStaffCustomerProfile({
      customerId: "cus_target",
      email: "customer@example.com",
      firstName: "Test",
      lastName: "Customer",
    })

    expect(result).toEqual({
      ok: false,
      error: "Medusa write failed for customer@example.com cus_target",
    })
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_customer_context_mutation_failed",
        severity: "warn",
        title: "Staff customer profile update failed",
        path: "src/lib/data/staff/order-entry.ts",
        source: "medusa-server",
        fingerprint: "staff_customer_context:profile_update:failed",
        meta: expect.objectContaining({
          staff_module: "phone_order",
          action: "profile_update",
          has_customer_id: true,
          has_address_id: false,
          has_amount: false,
          has_related_order: false,
          qbd_posting_required: false,
          error_message:
            "Medusa write failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("alerts when staff customer search loses recent and legacy order context", async () => {
    global.fetch = jest.fn(async (url) => {
      const href = String(url)
      if (href.includes("/admin/customers")) {
        return response(true, 200, {
          customers: [
            {
              id: "cus_target",
              email: "customer@example.com",
              first_name: "Test",
              last_name: "Customer",
              metadata: {},
              addresses: [],
            },
          ],
        })
      }
      if (href.includes("/admin/orders")) {
        return response(false, 503, {
          message: "Order search failed for customer@example.com order_123",
        })
      }
      if (href.includes("/admin/legacy-orders")) {
        return response(false, 503, {
          message: "Legacy search failed for customer@example.com legacy_123",
        })
      }
      throw new Error(`Unexpected fetch ${href}`)
    }) as unknown as typeof fetch

    const results = await searchStaffCustomers("customer@example.com")

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(
      expect.objectContaining({
        id: "cus_target",
        source: "customer",
      })
    )
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledTimes(2)
    expect(mockEmitStorefrontOpsAlert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        alertKind: "staff_customer_context_data_degraded",
        severity: "warn",
        fingerprint: "staff_customer_context:search_recent_orders:degraded",
        meta: expect.objectContaining({
          staff_module: "phone_order",
          surface: "search",
          stage: "search_recent_orders",
          query_kind: "email",
          has_customer_id: false,
          result_count: 1,
          include_legacy_order_requested: false,
          error_message:
            "Order search failed for [redacted-email] [redacted-id]",
        }),
      })
    )
    expect(mockEmitStorefrontOpsAlert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        alertKind: "staff_customer_context_data_degraded",
        fingerprint: "staff_customer_context:search_legacy_orders:degraded",
        meta: expect.objectContaining({
          surface: "search",
          stage: "search_legacy_orders",
          query_kind: "email",
          result_count: 1,
          error_message:
            "Legacy search failed for [redacted-email] [redacted-id]",
        }),
      })
    )
    const alertJson = JSON.stringify(mockEmitStorefrontOpsAlert.mock.calls)
    expect(alertJson).not.toContain("customer@example.com")
    expect(alertJson).not.toContain("order_123")
    expect(alertJson).not.toContain("legacy_123")
  })

  it("alerts when selected customer context loses recent and legacy detail data", async () => {
    global.fetch = jest.fn(async (url) => {
      const href = String(url)
      if (href.includes("/admin/customers/cus_target")) {
        return response(true, 200, {
          customer: {
            id: "cus_target",
            email: "customer@example.com",
            first_name: "Test",
            last_name: "Customer",
            metadata: {},
            addresses: [],
          },
        })
      }
      if (href.includes("/admin/orders")) {
        return response(false, 503, {
          message: "Recent orders failed for customer@example.com order_123",
        })
      }
      if (href.includes("/admin/legacy-orders/legacy_123")) {
        return response(false, 503, {
          message: "Legacy detail failed for legacy_123",
        })
      }
      if (href.includes("/admin/legacy-orders")) {
        return response(true, 200, {
          orders: [
            {
              id: "legacy_123",
              customer_name: "Test Customer",
              line_count: 0,
              lines: [],
            },
          ],
        })
      }
      throw new Error(`Unexpected fetch ${href}`)
    }) as unknown as typeof fetch

    const context = await getStaffCustomerContext("cus_target")

    expect(context.id).toBe("cus_target")
    expect(context.recentOrders).toEqual([])
    expect(context.legacyOrders).toHaveLength(1)
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledTimes(2)
    expect(mockEmitStorefrontOpsAlert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        alertKind: "staff_customer_context_data_degraded",
        fingerprint: "staff_customer_context:context_recent_orders:degraded",
        meta: expect.objectContaining({
          surface: "context",
          stage: "context_recent_orders",
          query_kind: null,
          has_customer_id: true,
          error_message:
            "Recent orders failed for [redacted-email] [redacted-id]",
        }),
      })
    )
    expect(mockEmitStorefrontOpsAlert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        alertKind: "staff_customer_context_data_degraded",
        fingerprint: "staff_customer_context:context_legacy_order_detail:degraded",
        meta: expect.objectContaining({
          surface: "context",
          stage: "context_legacy_order_detail",
          has_customer_id: true,
          failure_count: 1,
          error_message: "Legacy detail failed for [redacted-id]",
        }),
      })
    )
  })

  it("alerts when selected customer context loses the legacy order list", async () => {
    global.fetch = jest.fn(async (url) => {
      const href = String(url)
      if (href.includes("/admin/customers/cus_target")) {
        return response(true, 200, {
          customer: {
            id: "cus_target",
            email: "customer@example.com",
            first_name: "Test",
            last_name: "Customer",
            metadata: {},
            addresses: [],
          },
        })
      }
      if (href.includes("/admin/orders")) {
        return response(true, 200, { orders: [] })
      }
      if (href.includes("/admin/legacy-orders")) {
        return response(false, 503, {
          message: "Legacy list failed for customer@example.com legacy_123",
        })
      }
      throw new Error(`Unexpected fetch ${href}`)
    }) as unknown as typeof fetch

    const context = await getStaffCustomerContext("cus_target", {
      includeLegacyOrderId: "legacy_123",
    })

    expect(context.id).toBe("cus_target")
    expect(context.legacyOrders).toHaveLength(1)
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_customer_context_data_degraded",
        fingerprint: "staff_customer_context:context_legacy_order_list:degraded",
        meta: expect.objectContaining({
          surface: "context",
          stage: "context_legacy_order_list",
          has_customer_id: true,
          include_legacy_order_requested: true,
          error_message:
            "Legacy list failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("alerts when a staff customer address write fails", async () => {
    global.fetch = jest.fn(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === "POST") {
        return response(false, 503, {
          message: "Address write failed for customer@example.com addr_123",
        })
      }
      return currentCustomerResponse()
    }) as unknown as typeof fetch

    const result = await saveStaffCustomerAddress({
      customerId: "cus_target",
      address: {
        id: "addr_123",
        firstName: "Test",
        lastName: "Customer",
        address1: "123 Main St",
        city: "Atlanta",
        province: "GA",
        postalCode: "30338",
        countryCode: "us",
        phone: "4045551212",
      },
    })

    expect(result.ok).toBe(false)
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_customer_context_mutation_failed",
        severity: "warn",
        fingerprint: "staff_customer_context:address_update:failed",
        meta: expect.objectContaining({
          action: "address_update",
          has_customer_id: true,
          has_address_id: true,
          error_message: "Address write failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("does not alert on local address validation errors", async () => {
    global.fetch = jest.fn() as unknown as typeof fetch

    const result = await saveStaffCustomerAddress({
      customerId: "cus_target",
      address: {
        firstName: "Test",
        lastName: "",
        address1: "",
        city: "Atlanta",
        province: "GA",
        postalCode: "30338",
        countryCode: "us",
      },
    })

    expect(result).toEqual({
      ok: false,
      error: "Customer address needs a first and last name.",
    })
    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })

  it("pages when a staff customer credit write fails", async () => {
    global.fetch = jest.fn(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === "POST") {
        return response(false, 503, {
          message: "Credit write failed for customer@example.com cus_target",
        })
      }
      return currentCustomerResponse()
    }) as unknown as typeof fetch

    const result = await applyStaffCustomerAccountAction({
      customerId: "cus_target",
      action: "customer_credit",
      amount: 12.5,
      reasonCode: "other",
      staffNote: "Make good credit",
      relatedOrderId: "order_123",
    })

    expect(result.ok).toBe(false)
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_customer_context_mutation_failed",
        severity: "page",
        title: "Staff customer customer credit failed",
        fingerprint: "staff_customer_context:customer_credit:failed",
        meta: expect.objectContaining({
          action: "customer_credit",
          has_customer_id: true,
          has_amount: true,
          has_related_order: true,
          qbd_posting_required: true,
          error_message: "Credit write failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })
})
