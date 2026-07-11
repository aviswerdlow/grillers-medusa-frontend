import {
  checkoutFulfillmentAddressKey,
  clearedCheckoutFulfillmentMetadata,
  fulfillmentAddressChanged,
  planCheckoutAddressFulfillmentTransition,
  shouldResetFulfillmentForAddressChange,
} from "@lib/checkout-fulfillment-state"

const originalAddress = {
  address_1: "220 Glen Meadow Ct",
  address_2: "",
  city: "Sandy Springs",
  province: "GA",
  postal_code: "30328-1234",
  country_code: "US",
} as any

describe("checkout fulfillment state", () => {
  it("normalizes harmless address formatting differences", () => {
    expect(
      checkoutFulfillmentAddressKey({
        ...originalAddress,
        address_1: "  220   GLEN MEADOW CT ",
        province: "ga",
        postal_code: "30328",
      })
    ).toBe(checkoutFulfillmentAddressKey(originalAddress))
  })

  it("detects changes to carrier and region-relevant address fields", () => {
    expect(
      fulfillmentAddressChanged(originalAddress, {
        ...originalAddress,
        postal_code: "02453",
        province: "MA",
      })
    ).toBe(true)
    expect(
      fulfillmentAddressChanged(originalAddress, {
        ...originalAddress,
        address_1: "222 Glen Meadow Ct",
      })
    ).toBe(true)
  })

  it("resets address-dependent fulfillment but preserves plant pickup", () => {
    const changedAddress = {
      ...originalAddress,
      postal_code: "02453",
      province: "MA",
    }

    expect(
      shouldResetFulfillmentForAddressChange(
        {
          metadata: { fulfillmentType: "atlanta_delivery" },
          shipping_address: originalAddress,
        } as any,
        changedAddress
      )
    ).toBe(true)

    expect(
      shouldResetFulfillmentForAddressChange(
        {
          metadata: { fulfillmentType: "plant_pickup" },
          shipping_address: originalAddress,
        } as any,
        changedAddress
      )
    ).toBe(false)
  })

  it("clears every fulfillment-owned metadata field", () => {
    expect(clearedCheckoutFulfillmentMetadata()).toEqual(
      expect.objectContaining({
        fulfillmentType: "",
        fulfillmentZip: "",
        scheduledDate: "",
        requestedDeliveryDate: "",
        qbdDueDate: "",
        scheduledTimeWindow: "",
        pickupLocationId: "",
        pickupLocationName: "",
        pickupLocationCity: "",
        pickupLocationState: "",
        fulfillmentSelectionStatus: "",
      })
    )
  })

  it("retires an old Atlanta choice before validating the new address", () => {
    const atlantaCart = {
      metadata: { fulfillmentType: "atlanta_delivery" },
      shipping_address: originalAddress,
    } as any
    const newAddress = {
      ...originalAddress,
      city: "Waltham",
      province: "MA",
      postal_code: "02453",
    }

    expect(
      planCheckoutAddressFulfillmentTransition(atlantaCart, newAddress)
    ).toEqual(
      expect.objectContaining({
        reset: true,
        retainedFulfillmentType: null,
        metadata: expect.objectContaining({
          fulfillmentType: "",
          fulfillmentSelectionStatus: "",
        }),
      })
    )
  })

  it("retains the selection for validation when the address did not change", () => {
    expect(
      planCheckoutAddressFulfillmentTransition(
        {
          metadata: { fulfillmentType: "atlanta_delivery" },
          shipping_address: originalAddress,
        } as any,
        { ...originalAddress }
      )
    ).toEqual({
      reset: false,
      retainedFulfillmentType: "atlanta_delivery",
      metadata: undefined,
    })
  })
})
