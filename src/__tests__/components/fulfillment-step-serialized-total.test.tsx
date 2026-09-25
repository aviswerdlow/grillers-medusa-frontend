import { render, screen } from "@testing-library/react"
import type { HttpTypes } from "@medusajs/types"
import FulfillmentStep from "@modules/checkout/components/fulfillment-step"

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))

jest.mock("@modules/checkout/context/fulfillment-edit-context", () => ({
  useFulfillmentEdit: () => ({ setIsEditingFulfillment: jest.fn() }),
}))

jest.mock("@lib/data/cart", () => ({
  clearFulfillmentDetails: jest.fn(),
  setFulfillmentDetails: jest.fn(),
  setShippingMethod: jest.fn(),
}))

jest.mock("@lib/data/customer", () => ({
  saveAddressToProfileAndCart: jest.fn(),
}))

jest.mock("@lib/data/fulfillment", () => ({
  findShippingOptionByType: jest.fn(),
}))

jest.mock(
  "@modules/checkout/components/fulfillment-selector/scheduling/plant-pickup",
  () => ({ __esModule: true, default: () => null })
)
jest.mock(
  "@modules/checkout/components/fulfillment-selector/scheduling/southeast-pickup",
  () => ({ __esModule: true, default: () => null })
)
jest.mock(
  "@modules/checkout/components/fulfillment-selector/scheduling/atlanta-delivery",
  () => ({ __esModule: true, default: () => null })
)

const address = {
  address_1: "123 Test Street",
  city: "Atlanta",
  province: "GA",
  postal_code: "30328",
  country_code: "us",
}

const checkoutConfig = {
  AtlantaDeliveryZipCodes: ["30328"],
  SoutheastPickupLocations: [],
  MinimumOrderThresholds: {
    UPSShipping: 40,
    AtlantaDelivery: 100,
    PlantPickup: 0,
    SoutheastPickup: 0,
  },
} as any

const renderFulfillment = (total: unknown) =>
  render(
    <FulfillmentStep
      cart={{
        id: "cart_test",
        total,
        currency_code: "usd",
        items: [],
        shipping_address: address,
        shipping_methods: [],
        metadata: {},
      } as unknown as HttpTypes.StoreCart}
      customer={null}
      config={checkoutConfig}
      availableFulfillmentTypes={[
        "ups_shipping",
        "atlanta_delivery",
        "plant_pickup",
        "southeast_pickup",
      ]}
      pickupCreditConfig={{ threshold: 250, creditAmount: 7.5, promoCode: "TEST" }}
    />
  )

it.each([
  { total: { numeric_: "6.38", value: "6.38" }, atlanta: false },
  { total: { value: "125" }, atlanta: true },
])("uses serialized cart total for fulfillment minimums: %j", ({ total, atlanta }) => {
  renderFulfillment(total)

  expect(screen.getByRole("button", { name: /Plant Pickup/ })).toBeEnabled()
  expect(screen.getByRole("button", { name: /Atlanta Delivery/ })).toHaveProperty("disabled", !atlanta)
  expect(screen.getByRole("button", { name: /Ship to Me/ })).toBeDisabled()
  expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
})
