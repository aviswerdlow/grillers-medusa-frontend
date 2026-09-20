import { prepareStaffPhoneOrder, completeStaffPhoneOrder } from "@lib/data/staff/order-entry"
import { staffCartHeaders, createStaffCart } from "@lib/data/staff/cart-authority"
import { adminFetch } from "@lib/data/staff/admin"
import { getAuthHeaders } from "@lib/data/cookies"
import { sdk } from "@lib/config"

jest.mock("@lib/data/staff/admin", () => ({ adminFetch: jest.fn(), queryString: () => "" }))
jest.mock("@lib/data/cookies", () => ({ getAuthHeaders: jest.fn(), getCacheTag: jest.fn(async (value: string) => value) }))
jest.mock("@lib/data/customer", () => ({ retrieveAuthenticatedCustomerForStaffAccess: jest.fn(async () => ({ id: "cus_office", email: "office@example.test", staff_access: { role: "office", session_current: true } })) }))
jest.mock("@lib/data/regions", () => ({ getRegion: jest.fn(async () => ({ id: "reg_fixture" })) }))
jest.mock("@lib/data/inventory-allocation", () => ({ checkStaffInventoryAvailability: jest.fn(async () => ({ lines: [{ variant_id: "variant_1", decision: "available" }] })), inventoryLineMessage: () => "Review inventory" }))
jest.mock("@lib/ops-alert", () => ({ emitStorefrontOpsAlert: jest.fn() }))
jest.mock("@lib/postmark", () => ({ sendEmail: jest.fn(async () => ({ ok: true, messageId: "fixture_email" })) }))
jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }))
jest.mock("@lib/config", () => ({ sdk: { store: { cart: { create: jest.fn(), createLineItem: jest.fn(), addShippingMethod: jest.fn(), update: jest.fn(), complete: jest.fn() }, payment: { initiatePaymentSession: jest.fn() } } } }))

describe("Phone orders preserve signed staff context and the customer buyer", () => {
  const originalFetch = global.fetch
  const signedHeaders = { "x-gp-staff-authorization": "Bearer original.staff.jwt" }
  let cart: any
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAuthHeaders as jest.Mock).mockResolvedValue({ authorization: "Bearer original.staff.jwt" })
    cart = { id: "cart_fixture", customer_id: "cus_customer", email: "customer@example.test", metadata: { source: "staff_phone_order", staff_actor_customer_id: "cus_office" },
      items: [{ id: "line_1", variant_id: "variant_1", quantity: 2, title: "Fixture item", metadata: {} }], payment_collection: { payment_sessions: [{ status: "pending", provider_id: "pp_stripe_stripe", data: { client_secret: "synthetic_client_secret" } }] } }
    ;(adminFetch as jest.Mock).mockResolvedValue({ cart })
    ;(sdk.store.cart.complete as jest.Mock).mockResolvedValue({ type: "order", order: { ...cart, id: "order_fixture" } })
    global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => String(url).includes("shipping-options")
      ? { shipping_options: [{ id: "ship_fixture", data: { service_code: "PICKUP" } }] }
      : String(url).includes("payment-providers") ? { payment_providers: [{ id: "pp_stripe_stripe" }] } : { cart } })) as any
  })
  afterAll(() => { global.fetch = originalFetch })
  const input = { countryCode: "us", customer: { id: "cus_customer", email: "customer@example.test" },
    shippingAddress: { firstName: "Fixture", lastName: "Customer", address1: "123 Fixture St", city: "Atlanta", province: "GA", postalCode: "30329", countryCode: "us", phone: "4045550100" },
    sameAsShipping: true, lines: [{ variantId: "variant_1", quantity: 2, title: "Fixture item" }], fulfillmentType: "plant_pickup" as const,
    customerVerified: true, paymentMode: "collect_card_now" as const, paymentConsent: true, sendConfirmation: false }

  it("prepares through the backend staff action and passes the original token to every native mutation", async () => {
    const result = await prepareStaffPhoneOrder(input)
    expect(result).toMatchObject({ ok: true, cartId: "cart_fixture", paymentClientSecret: "synthetic_client_secret" })
    expect(adminFetch).toHaveBeenCalledWith("/admin/grillers/staff-carts", expect.objectContaining({ method: "POST" }))
    expect(JSON.parse((adminFetch as jest.Mock).mock.calls[0][1].body)).toMatchObject({ source: "staff_phone_order", customer_id: "cus_customer", email: "customer@example.test" })
    expect(sdk.store.cart.create).not.toHaveBeenCalled()
    for (const action of [sdk.store.cart.createLineItem, sdk.store.cart.addShippingMethod, sdk.store.payment.initiatePaymentSession]) {
      expect((action as jest.Mock).mock.calls[0][3]).toEqual(signedHeaders)
    }
    const cartReads = (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).includes("/store/carts/"))
    expect(cartReads.length).toBeGreaterThan(0)
    for (const [, options] of cartReads) expect(options).toMatchObject({ headers: signedHeaders, redirect: "error" })
  })
  it("preserves staff context during the final update and completion", async () => {
    expect(await completeStaffPhoneOrder("cart_fixture")).toMatchObject({ ok: true, orderId: "order_fixture" })
    expect((sdk.store.cart.update as jest.Mock).mock.calls[0][3]).toEqual(signedHeaders)
    expect(sdk.store.cart.complete).toHaveBeenCalledWith("cart_fixture", {}, signedHeaders)
  })
  it("stops before lines or payment when backend preparation is denied", async () => {
    ;(adminFetch as jest.Mock).mockRejectedValueOnce(new Error("Staff access changed."))
    expect(await prepareStaffPhoneOrder(input)).toMatchObject({ ok: false, error: "Staff access changed." })
    expect(sdk.store.cart.createLineItem).not.toHaveBeenCalled()
    expect(sdk.store.payment.initiatePaymentSession).not.toHaveBeenCalled()
  })
  it("creates customer-context carts through the same backend authority", async () => {
    await createStaffCart({ region_id: "reg_fixture", email: "customer@example.test" }, "staff_impersonation", "cus_customer")
    expect(JSON.parse((adminFetch as jest.Mock).mock.calls[0][1].body)).toEqual({ region_id: "reg_fixture", email: "customer@example.test", source: "staff_impersonation", customer_id: "cus_customer" })
  })
  it("does not turn a missing staff cookie into an anonymous privileged request", async () => {
    ;(getAuthHeaders as jest.Mock).mockResolvedValue({})
    await expect(staffCartHeaders()).rejects.toThrow("Sign in again")
  })
})
