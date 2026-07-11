import {
  isCheckoutFulfillmentReadyForPayment,
  isFulfillmentSelectionSettled,
} from "@lib/checkout-payment-readiness"

describe("checkout payment readiness", () => {
  it("requires both a settled selection and an attached shipping method", () => {
    expect(
      isCheckoutFulfillmentReadyForPayment({
        metadata: {
          fulfillmentType: "plant_pickup",
          fulfillmentSelectionStatus: "settled",
        },
        shipping_methods: [{ id: "sm_123" }],
      } as any)
    ).toBe(true)

    expect(
      isCheckoutFulfillmentReadyForPayment({
        metadata: {
          fulfillmentType: "plant_pickup",
          fulfillmentSelectionStatus: "pending",
        },
        shipping_methods: [{ id: "sm_123" }],
      } as any)
    ).toBe(false)

    expect(
      isCheckoutFulfillmentReadyForPayment({
        metadata: {
          fulfillmentType: "plant_pickup",
          fulfillmentSelectionStatus: "settled",
        },
        shipping_methods: [],
      } as any)
    ).toBe(false)

    expect(
      isCheckoutFulfillmentReadyForPayment({
        metadata: { fulfillmentSelectionStatus: "settled" },
        shipping_methods: [{ id: "orphaned_method" }],
      } as any)
    ).toBe(false)
  })

  it("supports attached legacy methods but not missing or explicitly cleared state", () => {
    expect(
      isFulfillmentSelectionSettled({
        metadata: {},
        shipping_methods: [{ id: "legacy_method" }],
      } as any)
    ).toBe(true)
    expect(
      isFulfillmentSelectionSettled({
        metadata: {},
        shipping_methods: [],
      } as any)
    ).toBe(false)
    expect(
      isFulfillmentSelectionSettled({
        metadata: { fulfillmentSelectionStatus: "" },
        shipping_methods: [{ id: "stale_method" }],
      } as any)
    ).toBe(false)
  })
})
