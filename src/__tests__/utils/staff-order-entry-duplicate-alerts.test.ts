jest.mock("@lib/data/cookies", () => ({
  ...jest.requireActual("@lib/data/cookies"),
  getAuthHeaders: jest.fn(async () => ({ authorization: "Bearer signed.fixture.staff" })),
}))

import { createStaffCustomer } from "@lib/data/staff/order-entry"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { sdk } from "@lib/config"

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
const mockRegister = sdk.auth.register as jest.MockedFunction<
  typeof sdk.auth.register
>

describe("staff order-entry duplicate guard alerts", () => {
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
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/admin/customers")) {
        return {
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          json: async () => ({ message: "Medusa customers unavailable" }),
        } as Response
      }

      throw new Error(`Unexpected fetch ${String(url)}`)
    }) as unknown as typeof fetch
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("fails closed and alerts when duplicate customer checks all fail", async () => {
    await expect(
      createStaffCustomer({
        email: "new@example.com",
        firstName: "New",
        lastName: "Customer",
        phone: "4045551212",
      })
    ).rejects.toThrow(
      "Could not verify duplicate customers. Try again before creating this customer."
    )

    expect(mockRegister).not.toHaveBeenCalled()
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_customer_duplicate_check_failed",
        severity: "warn",
        title: "Staff customer duplicate check failed",
        path: "src/lib/data/staff/order-entry.ts",
        source: "medusa-server",
        fingerprint: "staff_customer_create:duplicate_check_failed",
        meta: expect.objectContaining({
          staff_module: "phone_order",
          action: "create_customer",
          attempt_count: 5,
          error_message: "Medusa customers unavailable",
        }),
      })
    )
  })
})
