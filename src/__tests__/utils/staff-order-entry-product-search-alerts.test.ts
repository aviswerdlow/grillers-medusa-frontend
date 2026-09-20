jest.mock("@lib/data/cookies", () => ({
  ...jest.requireActual("@lib/data/cookies"),
  getAuthHeaders: jest.fn(async () => ({ authorization: "Bearer signed.fixture.staff" })),
}))

import {
  completeStaffPhoneOrder,
  prepareStaffPhoneOrder,
  searchStaffProducts,
} from "@lib/data/staff/order-entry"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { getRegion } from "@lib/data/regions"
import { checkStaffInventoryAvailability } from "@lib/data/inventory-allocation"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"

jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomerForStaffAccess: jest.fn(),
}))

jest.mock("@lib/data/regions", () => ({
  getRegion: jest.fn(),
}))

jest.mock("@lib/data/inventory-allocation", () => ({
  checkStaffInventoryAvailability: jest.fn(),
  inventoryLineMessage: jest.fn(() => "Inventory blocked."),
}))

jest.mock("@lib/util/staff-access", () => ({
  canUseOfficeConsole: jest.fn(() => true),
  staffDisplayName: jest.fn(() => "Avi Swerdlow"),
}))

jest.mock("@lib/config", () => ({
  sdk: {},
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
const mockGetRegion = getRegion as jest.MockedFunction<typeof getRegion>
const mockCheckStaffInventoryAvailability =
  checkStaffInventoryAvailability as jest.MockedFunction<
    typeof checkStaffInventoryAvailability
  >
const mockEmitStorefrontOpsAlert =
  emitStorefrontOpsAlert as jest.MockedFunction<typeof emitStorefrontOpsAlert>

describe("staff order-entry product search availability alerts", () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY = "pk_test"
    mockRetrieveAuthenticatedCustomer.mockResolvedValue({
      id: "cus_staff",
      email: "staff@example.com",
      first_name: "Avi",
      last_name: "Swerdlow",
      metadata: { gp_staff_role: "super_admin" },
    } as any)
    mockGetRegion.mockResolvedValue({
      id: "reg_us",
      currency_code: "usd",
    } as any)
    mockCheckStaffInventoryAvailability.mockRejectedValue(
      new Error("Inventory API timed out")
    )
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("/store/products")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            products: [
              {
                id: "prod_brisket",
                title: "First Cut Brisket",
                handle: "first-cut-brisket",
                thumbnail: "/brisket.jpg",
                metadata: { qbd_list_id: "800009C7-1502034505" },
                variants: [
                  {
                    id: "variant_brisket",
                    title: "4-5 lb",
                    sku: "1-03-15-2",
                    manage_inventory: true,
                    allow_backorder: false,
                    inventory_quantity: 4,
                    calculated_price: {
                      calculated_amount: 7295,
                      currency_code: "usd",
                    },
                    metadata: {},
                  },
                ],
              },
            ],
          }),
        } as Response
      }
      if (String(url).includes("/store/carts/cart_staff")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            cart: {
              id: "cart_staff",
              metadata: {
                source: "staff_phone_order",
                staff_actor_customer_id: "cus_staff",
                staff_selected_customer_id: "cus_customer",
                fulfillmentType: "plant_pickup",
                scheduledDate: "2026-07-03",
              },
              items: [
                {
                  variant_id: "variant_brisket",
                  quantity: 2,
                  variant: { id: "variant_brisket", sku: "1-03-15-2" },
                  metadata: { staff_line_title: "First Cut Brisket - 4-5 lb" },
                },
              ],
            },
          }),
        } as Response
      }

      throw new Error(`Unexpected fetch ${String(url)}`)
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it("returns product matches and alerts when ATP cannot be attached", async () => {
    const results = await searchStaffProducts("brisket", "us", {
      fulfillmentType: "ups_shipping",
      scheduledDate: "2026-07-02",
    })

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(
      expect.objectContaining({
        productId: "prod_brisket",
        variantId: "variant_brisket",
        sku: "1-03-15-2",
        availability: undefined,
      })
    )
    expect(mockCheckStaffInventoryAvailability).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillment_type: "ups_shipping",
        requested_fulfillment_date: "2026-07-02",
        source: "staff_phone_order",
        lines: [
          expect.objectContaining({
            product_id: "prod_brisket",
            variant_id: "variant_brisket",
            quantity: 1,
            sku: "1-03-15-2",
            title: "First Cut Brisket - 4-5 lb",
          }),
        ],
      })
    )
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_product_search_availability_failed",
        severity: "warn",
        title: "Staff product search availability check failed",
        path: "src/lib/data/staff/order-entry.ts",
        source: "medusa-server",
        fingerprint: "staff_phone_order:product_search_availability_failed",
        meta: expect.objectContaining({
          staff_module: "phone_order",
          action: "product_search",
          result_count: 1,
          fulfillment_type: "ups_shipping",
          scheduled_date_provided: true,
          error_message: "Inventory API timed out",
        }),
      })
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[staff-phone-order] inventory search availability failed",
      expect.any(Error)
    )
  })

  it("alerts when prepare-order ATP blocks staff cart creation", async () => {
    const result = await prepareStaffPhoneOrder({
      countryCode: "us",
      customer: {
        id: "cus_customer",
        email: "customer@example.com",
        firstName: "Test",
        lastName: "Customer",
      },
      shippingAddress: {
        firstName: "Test",
        lastName: "Customer",
        address1: "123 Main St",
        city: "Atlanta",
        province: "GA",
        postalCode: "30338",
        countryCode: "us",
        phone: "4045551212",
      },
      sameAsShipping: true,
      lines: [
        {
          variantId: "variant_brisket",
          quantity: 2,
          title: "First Cut Brisket - 4-5 lb",
          sku: "1-03-15-2",
        },
      ],
      fulfillmentType: "plant_pickup",
      customerVerified: true,
      paymentMode: "send_checkout_link",
      paymentConsent: false,
      sendConfirmation: false,
    })

    expect(result).toEqual({
      ok: false,
      error: "Inventory API timed out",
    })
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_order_availability_check_failed",
        severity: "page",
        title: "Staff order availability check failed",
        path: "src/lib/data/staff/order-entry.ts",
        source: "medusa-server",
        fingerprint: "staff_phone_order:prepare_order:availability_check_failed",
        meta: expect.objectContaining({
          staff_module: "phone_order",
          action: "prepare_order",
          line_count: 1,
          fulfillment_type: "plant_pickup",
          scheduled_date_provided: false,
          cart_id: "",
          error_message: "Inventory API timed out",
        }),
      })
    )
  })

  it("alerts when complete-order ATP blocks payment completion", async () => {
    const result = await completeStaffPhoneOrder("cart_staff")

    expect(result).toEqual({
      ok: false,
      error: "Inventory API timed out",
    })
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_order_availability_check_failed",
        severity: "page",
        title: "Staff order availability check failed",
        path: "src/lib/data/staff/order-entry.ts",
        source: "medusa-server",
        fingerprint: "staff_phone_order:complete_order:availability_check_failed",
        meta: expect.objectContaining({
          staff_module: "phone_order",
          action: "complete_order",
          line_count: 1,
          fulfillment_type: "plant_pickup",
          scheduled_date_provided: true,
          cart_id: "cart_staff",
          error_message: "Inventory API timed out",
        }),
      })
    )
  })
})
