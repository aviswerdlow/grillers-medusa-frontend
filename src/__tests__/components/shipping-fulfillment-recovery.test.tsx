import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import Shipping from "@modules/checkout/components/shipping"
import {
  clearFulfillmentDetails,
  setFulfillmentDetails,
  setShippingMethod,
} from "@lib/data/cart"
import { findShippingOptionByType } from "@lib/data/fulfillment"

const routerReplace = jest.fn()
const routerRefresh = jest.fn()

jest.mock("next/navigation", () => ({
  usePathname: () => "/us/checkout",
  useRouter: () => ({
    push: jest.fn(),
    replace: routerReplace,
    refresh: routerRefresh,
  }),
  useSearchParams: () => new URLSearchParams("step=delivery"),
}))

jest.mock("@lib/data/cart", () => ({
  clearFulfillmentDetails: jest.fn(),
  setFulfillmentDetails: jest.fn(),
  setShippingMethod: jest.fn(),
}))

jest.mock("@lib/data/fulfillment", () => ({
  calculatePriceForShippingOption: jest.fn(),
  findShippingOptionByType: jest.fn(),
}))

jest.mock("@lib/gtm", () => ({
  trackAddShippingInfo: jest.fn(),
}))

jest.mock("@lib/jitsu", () => ({
  jitsuTrack: jest.fn(),
}))

jest.mock("@lib/hooks/use-cart-title-map", () => ({
  useCartTitleMap: () => ({}),
}))

jest.mock("@modules/checkout/components/arrival-calendar", () => () => null)

const clearFulfillmentDetailsMock =
  clearFulfillmentDetails as jest.MockedFunction<
    typeof clearFulfillmentDetails
  >
const setFulfillmentDetailsMock =
  setFulfillmentDetails as jest.MockedFunction<typeof setFulfillmentDetails>
const setShippingMethodMock = setShippingMethod as jest.MockedFunction<
  typeof setShippingMethod
>
const findShippingOptionByTypeMock =
  findShippingOptionByType as jest.MockedFunction<
    typeof findShippingOptionByType
  >

const upsDeadEndCart = {
  id: "cart_123",
  currency_code: "usd",
  total: 12000,
  items: [],
  promotions: [],
  email: "customer@example.com",
  metadata: {
    fulfillmentType: "ups_shipping",
    fulfillmentSelectionStatus: "pending",
  },
  shipping_address: {
    first_name: "Avi",
    address_1: "220 Glen Meadow Ct",
    city: "Sandy Springs",
    province: "GA",
    postal_code: "30328",
    country_code: "us",
  },
  billing_address: {
    first_name: "Avi",
    address_1: "220 Glen Meadow Ct",
  },
  shipping_methods: [],
} as any

describe("UPS dead-end fulfillment recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearFulfillmentDetailsMock.mockResolvedValue(undefined as never)
    setFulfillmentDetailsMock.mockResolvedValue(undefined as never)
    setShippingMethodMock.mockResolvedValue(undefined as never)
    findShippingOptionByTypeMock.mockResolvedValue({
      id: "plant_pickup_option",
    } as never)
  })

  it("returns Atlanta customers to normal scheduling instead of creating a pending selection", async () => {
    const user = userEvent.setup()
    render(
      <Shipping
        cart={upsDeadEndCart}
        availableShippingMethods={[]}
      />
    )

    await user.click(
      await screen.findByRole("button", { name: "Choose Atlanta Delivery" })
    )

    await waitFor(() => {
      expect(clearFulfillmentDetailsMock).toHaveBeenCalledWith("cart_123")
      expect(routerReplace).toHaveBeenCalledWith("/us/checkout", {
        scroll: false,
      })
      expect(routerRefresh).toHaveBeenCalled()
    })
    expect(setFulfillmentDetailsMock).not.toHaveBeenCalled()
    expect(setShippingMethodMock).not.toHaveBeenCalled()
  })

  it("preserves direct plant-pickup recovery and settles it through method attachment", async () => {
    const user = userEvent.setup()
    render(
      <Shipping
        cart={upsDeadEndCart}
        availableShippingMethods={[]}
      />
    )

    await user.click(
      await screen.findByRole("button", { name: "Switch to Plant Pickup" })
    )

    await waitFor(() => {
      expect(setFulfillmentDetailsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cartId: "cart_123",
          fulfillmentType: "plant_pickup",
          fulfillmentZip: "00000",
        })
      )
      expect(findShippingOptionByTypeMock).toHaveBeenCalledWith(
        "cart_123",
        "plant_pickup"
      )
      expect(setShippingMethodMock).toHaveBeenCalledWith({
        cartId: "cart_123",
        shippingMethodId: "plant_pickup_option",
      })
    })
    expect(clearFulfillmentDetailsMock).not.toHaveBeenCalled()
  })
})
