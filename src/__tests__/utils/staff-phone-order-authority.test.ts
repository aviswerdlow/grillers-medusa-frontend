import {
  prepareStaffPhoneOrder,
  prepareStaffPhoneOrderPayment,
  completeStaffPhoneOrder,
  getStaffPhoneOrderCalendar,
  saveStaffPhoneOrderCalendar,
  verifyStaffPhoneOrderForPayment,
} from "@lib/data/staff/order-entry"
import {
  staffCartHeaders,
  createStaffCart,
} from "@lib/data/staff/cart-authority"
import { adminFetch } from "@lib/data/staff/admin"
import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { checkStaffInventoryAvailability } from "@lib/data/inventory-allocation"
import { sendEmail } from "@lib/postmark"
import { sdk } from "@lib/config"

jest.mock("@lib/data/staff/admin", () => ({
  adminFetch: jest.fn(),
  queryString: () => "",
}))
jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(),
  getCacheTag: jest.fn(async (value: string) => value),
}))
jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomerForStaffAccess: jest.fn(),
}))
jest.mock("@lib/data/regions", () => ({
  getRegion: jest.fn(async () => ({ id: "reg_fixture" })),
}))
jest.mock("@lib/data/inventory-allocation", () => ({
  checkStaffInventoryAvailability: jest.fn(),
  inventoryLineMessage: () => "Review inventory",
}))
jest.mock("@lib/ops-alert", () => ({ emitStorefrontOpsAlert: jest.fn() }))
jest.mock("@lib/postmark", () => ({
  sendEmail: jest.fn(async () => ({ ok: true, messageId: "fixture_email" })),
}))
jest.mock("@lib/data/staff/order-token", () => ({
  signStaffCartHandoff: jest.fn(() => "synthetic-handoff"),
}))
jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }))
jest.mock("@lib/config", () => ({
  sdk: {
    store: {
      cart: {
        create: jest.fn(),
        createLineItem: jest.fn(),
        updateLineItem: jest.fn(),
        addShippingMethod: jest.fn(),
        update: jest.fn(),
        complete: jest.fn(),
      },
      payment: { initiatePaymentSession: jest.fn() },
    },
  },
}))

const input = {
  countryCode: "us",
  customer: { id: "cus_customer", email: "customer@example.test" },
  shippingAddress: {
    firstName: "Fixture",
    lastName: "Customer",
    address1: "123 Fixture St",
    city: "Atlanta",
    province: "GA",
    postalCode: "30329",
    countryCode: "us",
    phone: "4045550100",
  },
  sameAsShipping: true,
  lines: [{ variantId: "variant_1", quantity: 2, title: "Fixture item" }],
  fulfillmentType: "plant_pickup" as const,
  customerVerified: true,
  paymentMode: "collect_card_now" as const,
  paymentConsent: true,
  sendConfirmation: false,
}
const choice = {
  arrivalDate: "2026-10-08",
  windowId: "window_fixture",
  contextRevision: "fixture_revision",
  shippingOptionId: "ship_fixture",
}
const page = {
  calendar: {
    choices: [{ arrivalDate: choice.arrivalDate }],
    generatedAt: "2026-10-05T18:00:00Z",
    expiresAt: "2026-10-05T18:10:00Z",
  },
  contextRevision: "fixture_revision",
}

describe("Phone orders preserve staff authority across draft, date and payment", () => {
  const originalFetch = global.fetch
  const signedHeaders = {
    "x-gp-staff-authorization": "Bearer original.staff.jwt",
  }
  let cart: any,
    calendarFailure: string | null,
    changed: boolean,
    events: string[]
  beforeEach(() => {
    jest.clearAllMocks()
    calendarFailure = null
    changed = false
    events = []
    ;(getAuthHeaders as jest.Mock).mockResolvedValue({
      authorization: "Bearer original.staff.jwt",
    })
    ;(
      retrieveAuthenticatedCustomerForStaffAccess as jest.Mock
    ).mockResolvedValue({
      id: "cus_office",
      email: "office@example.test",
      staff_access: { role: "office", session_current: true },
    })
    ;(checkStaffInventoryAvailability as jest.Mock).mockResolvedValue({
      lines: [{ variant_id: "variant_1", decision: "available" }],
    })
    cart = {
      id: "cart_fixture",
      region_id: "reg_fixture",
      customer_id: "cus_customer",
      email: "customer@example.test",
      metadata: {},
      items: [],
      shipping_methods: [],
    }
    ;(adminFetch as jest.Mock).mockImplementation(async (_path, options) => {
      Object.assign(cart, JSON.parse(options.body))
      return { cart }
    })
    ;(sdk.store.cart.createLineItem as jest.Mock).mockImplementation(
      async (_id, line) => {
        cart.items.push({ ...line, id: "line_1" })
      }
    )
    ;(sdk.store.cart.addShippingMethod as jest.Mock).mockImplementation(
      async () => {
        events.push("shipping")
        cart.shipping_methods = [{ shipping_option_id: "ship_fixture" }]
      }
    )
    ;(sdk.store.cart.update as jest.Mock).mockImplementation(
      async (_id, patch) => {
        events.push("cart_update")
        Object.assign(cart.metadata, patch.metadata)
      }
    )
    ;(sdk.store.cart.updateLineItem as jest.Mock).mockImplementation(
      async () => {
        events.push("override_receipt")
      }
    )
    ;(sdk.store.payment.initiatePaymentSession as jest.Mock).mockImplementation(
      async () => {
        events.push("payment")
        cart.payment_collection = {
          payment_sessions: [
            {
              status: "pending",
              provider_id: "pp_stripe_stripe",
              data: { client_secret: "synthetic_client_secret" },
            },
          ],
        }
      }
    )
    ;(sdk.store.cart.complete as jest.Mock).mockResolvedValue({
      type: "order",
      order: { id: "order_fixture", email: cart.email, items: [] },
    })
    global.fetch = jest.fn(async (url, options: any) => {
      let body: any
      if (String(url).includes("fulfillment-calendar")) {
        const request = JSON.parse(options.body)
        events.push(request.action)
        if (calendarFailure)
          return { ok: false, json: async () => ({ message: calendarFailure }) }
        body =
          request.action === "validate"
            ? { state: "valid", summary: { arrivalDate: choice.arrivalDate } }
            : request.action === "list"
            ? { state: "available", ...page, regionalLocations: [] }
            : changed
            ? {
                state: "changed",
                ...page,
                replacementQuote: "fixture_replacement",
              }
            : {
                state: "selected",
                metadata: {
                  fulfillment_calendar_selection_v1: "signed_fixture",
                  scheduledDate: choice.arrivalDate,
                  requestedDeliveryDate: choice.arrivalDate,
                },
              }
      } else if (String(url).includes("shipping-options")) {
        const service = {
          plant_pickup: "PICKUP",
          atlanta_delivery: "ATLANTA_DELIVERY",
          southeast_pickup: "SCHEDULED_DELIVERY",
          ups_shipping: "GROUND",
        }[cart.metadata.fulfillmentType as typeof input.fulfillmentType]
        body = {
          shipping_options: [
            { id: "ship_fixture", data: { service_code: service } },
          ],
        }
      } else if (String(url).includes("payment-providers"))
        body = { payment_providers: [{ id: "pp_stripe_stripe" }] }
      else body = { cart }
      return { ok: true, json: async () => body }
    }) as any
  })
  afterAll(() => {
    global.fetch = originalFetch
  })

  it.each([
    "plant_pickup",
    "atlanta_delivery",
    "southeast_pickup",
    "ups_shipping",
  ] as const)(
    "creates only a draft for %s; date precedes payment and every mutation keeps staff identity",
    async (fulfillmentType) => {
      expect(
        await prepareStaffPhoneOrder({ ...input, fulfillmentType })
      ).toMatchObject({ ok: true, phase: "draft", cartId: cart.id })
      expect(sdk.store.cart.create).not.toHaveBeenCalled()
      expect(sdk.store.payment.initiatePaymentSession).not.toHaveBeenCalled()
      expect(sendEmail).not.toHaveBeenCalled()
      expect(
        await getStaffPhoneOrderCalendar({ cartId: cart.id, fulfillmentType })
      ).toMatchObject({ ok: true, data: { shippingOptionId: "ship_fixture" } })
      expect(
        await saveStaffPhoneOrderCalendar({ cartId: cart.id, choice })
      ).toMatchObject({ ok: true, data: { state: "selected" } })
      expect(await prepareStaffPhoneOrderPayment(cart.id)).toMatchObject({
        ok: true,
        phase: "ready",
        paymentClientSecret: "synthetic_client_secret",
      })
      expect(events.indexOf("select")).toBeLessThan(events.indexOf("validate"))
      expect(events.indexOf("validate")).toBeLessThan(events.indexOf("payment"))
      for (const action of [
        sdk.store.cart.createLineItem,
        sdk.store.cart.addShippingMethod,
        sdk.store.cart.update,
        sdk.store.payment.initiatePaymentSession,
      ])
        for (const call of (action as jest.Mock).mock.calls)
          expect(call[3]).toEqual(signedHeaders)
      for (const [url, options] of (global.fetch as jest.Mock).mock.calls)
        if (
          String(url).includes("/store/carts/") ||
          String(url).includes("fulfillment-calendar")
        )
          expect(options).toMatchObject({
            headers: signedHeaders,
            redirect: "error",
            cache: "no-store",
          })
      expect(checkStaffInventoryAvailability).toHaveBeenLastCalledWith(
        expect.objectContaining({
          requested_fulfillment_date: "2026-10-08",
          customer_id: "cus_customer",
        })
      )
    }
  )
  it("rejects stale free-form date clients before creating a cart", async () => {
    expect(
      await prepareStaffPhoneOrder({ ...input, scheduledDate: "2026-10-08" })
    ).toMatchObject({ ok: false })
    expect(adminFetch).not.toHaveBeenCalled()
    expect(sdk.store.payment.initiatePaymentSession).not.toHaveBeenCalled()
  })
  it("expired or unavailable dates block payment setup, pre-charge and native completion", async () => {
    await prepareStaffPhoneOrder(input)
    calendarFailure = "The date expired. Refresh dates."
    for (const action of [
      prepareStaffPhoneOrderPayment,
      verifyStaffPhoneOrderForPayment,
      completeStaffPhoneOrder,
    ])
      expect(await action(cart.id)).toMatchObject({
        ok: false,
        error: calendarFailure,
      })
    expect(sdk.store.payment.initiatePaymentSession).not.toHaveBeenCalled()
    expect(sdk.store.cart.complete).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })
  it("changed carrier quotes require reconfirmation before any cart write", async () => {
    await prepareStaffPhoneOrder(input)
    changed = true
    expect(
      await saveStaffPhoneOrderCalendar({ cartId: cart.id, choice })
    ).toMatchObject({
      ok: true,
      data: {
        state: "changed",
        page: { replacementQuote: "fixture_replacement" },
      },
    })
    expect(sdk.store.cart.update).not.toHaveBeenCalled()
    expect(sdk.store.payment.initiatePaymentSession).not.toHaveBeenCalled()
  })
  it("keeps approved exceptions bound to the explicitly reviewed date", async () => {
    await prepareStaffPhoneOrder(input)
    cart.items[0].metadata.inventory_override_reason = "confirmed_receipt"
    cart.items[0].metadata.inventory_override_note =
      "Office approval for fixture only"
    expect(
      await saveStaffPhoneOrderCalendar({ cartId: cart.id, choice })
    ).toMatchObject({ ok: false })
    expect(sdk.store.cart.update).not.toHaveBeenCalled()
    expect(
      await saveStaffPhoneOrderCalendar({
        cartId: cart.id,
        choice: { ...choice, staffOverrideConfirmed: true },
      })
    ).toMatchObject({ ok: true })
    expect(events.indexOf("cart_update")).toBeLessThan(
      events.indexOf("override_receipt")
    )
    expect(sdk.store.cart.updateLineItem).toHaveBeenCalledWith(
      cart.id,
      "line_1",
      expect.objectContaining({
        metadata: {
          inventory_override_reason: "confirmed_receipt",
          inventory_override_note: "Office approval for fixture only",
        },
      }),
      {},
      signedHeaders
    )
  })
  it.each(["blocked", "inactive", "missing"])(
    "%s inventory stops before payment even with a current calendar",
    async (decision) => {
      await prepareStaffPhoneOrder(input)
      ;(checkStaffInventoryAvailability as jest.Mock).mockResolvedValue({
        lines:
          decision === "missing" ? [] : [{ variant_id: "variant_1", decision }],
      })
      expect(await prepareStaffPhoneOrderPayment(cart.id)).toMatchObject({
        ok: false,
      })
      expect(await verifyStaffPhoneOrderForPayment(cart.id)).toMatchObject({
        ok: false,
      })
      expect(sdk.store.payment.initiatePaymentSession).not.toHaveBeenCalled()
    }
  )
  it("sends no checkout link before date validation and does not resend a confirmed email", async () => {
    await prepareStaffPhoneOrder({
      ...input,
      paymentMode: "send_checkout_link",
      sendConfirmation: true,
    })
    expect(sendEmail).not.toHaveBeenCalled()
    calendarFailure = "Date unavailable"
    expect(await prepareStaffPhoneOrderPayment(cart.id)).toMatchObject({
      ok: false,
    })
    expect(sendEmail).not.toHaveBeenCalled()
    calendarFailure = null
    expect(await prepareStaffPhoneOrderPayment(cart.id)).toMatchObject({
      ok: true,
      phase: "ready",
    })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    await prepareStaffPhoneOrderPayment(cart.id)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sdk.store.payment.initiatePaymentSession).not.toHaveBeenCalled()
  })
  it("preserves native completion replay without rechecking already consumed date or inventory", async () => {
    await prepareStaffPhoneOrder(input)
    expect(await completeStaffPhoneOrder(cart.id)).toMatchObject({
      ok: true,
      orderId: "order_fixture",
    })
    expect(sdk.store.cart.complete).toHaveBeenCalledWith(
      cart.id,
      {},
      signedHeaders
    )
    cart.completed_at = "2026-10-05T18:00:00Z"
    calendarFailure = "expired"
    ;(checkStaffInventoryAvailability as jest.Mock).mockRejectedValue(
      new Error("stock now reserved")
    )
    expect(await completeStaffPhoneOrder(cart.id)).toMatchObject({
      ok: true,
      orderId: "order_fixture",
    })
    expect(await prepareStaffPhoneOrderPayment(cart.id)).toMatchObject({
      ok: false,
    })
  })
  it("rejects a different staff actor, lost access, different option or completed cart", async () => {
    await prepareStaffPhoneOrder(input)
    expect(
      await saveStaffPhoneOrderCalendar({
        cartId: cart.id,
        choice: { ...choice, shippingOptionId: "other" },
      })
    ).toMatchObject({ ok: false })
    cart.metadata.staff_actor_customer_id = "other"
    expect(await prepareStaffPhoneOrderPayment(cart.id)).toMatchObject({
      ok: false,
    })
    expect(
      await getStaffPhoneOrderCalendar({
        cartId: cart.id,
        fulfillmentType: "plant_pickup",
      })
    ).toMatchObject({ ok: false })
    ;(
      retrieveAuthenticatedCustomerForStaffAccess as jest.Mock
    ).mockResolvedValue(null)
    expect(await verifyStaffPhoneOrderForPayment(cart.id)).toMatchObject({
      ok: false,
    })
    expect(sdk.store.payment.initiatePaymentSession).not.toHaveBeenCalled()
  })
  it("stops before lines or payment when backend preparation is denied", async () => {
    ;(adminFetch as jest.Mock).mockRejectedValueOnce(
      new Error("Staff access changed.")
    )
    expect(await prepareStaffPhoneOrder(input)).toMatchObject({
      ok: false,
      error: "Staff access changed.",
    })
    expect(sdk.store.cart.createLineItem).not.toHaveBeenCalled()
    expect(sdk.store.payment.initiatePaymentSession).not.toHaveBeenCalled()
  })
  it("creates customer-context carts through the same backend authority", async () => {
    await createStaffCart(
      { region_id: "reg_fixture", email: "customer@example.test" },
      "staff_impersonation",
      "cus_customer"
    )
    expect(JSON.parse((adminFetch as jest.Mock).mock.calls[0][1].body)).toEqual(
      {
        region_id: "reg_fixture",
        email: "customer@example.test",
        source: "staff_impersonation",
        customer_id: "cus_customer",
      }
    )
  })
  it("does not turn a missing staff cookie into an anonymous privileged request", async () => {
    ;(getAuthHeaders as jest.Mock).mockResolvedValue({})
    await expect(staffCartHeaders()).rejects.toThrow("Sign in again")
  })
})
