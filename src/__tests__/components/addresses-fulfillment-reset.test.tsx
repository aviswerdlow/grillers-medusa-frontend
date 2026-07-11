import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import Addresses from "@modules/checkout/components/addresses"

jest.mock("next/navigation", () => ({
  usePathname: () => "/us/checkout",
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams("step=address"),
}))

jest.mock("@lib/data/cart", () => ({
  clearFulfillmentDetails: jest.fn(),
  setAddresses: jest.fn(),
  setOrderNotes: jest.fn(),
}))

jest.mock("@lib/gtm", () => ({
  trackBeginCheckout: jest.fn(),
}))

jest.mock("@lib/jitsu", () => ({
  jitsuTrack: jest.fn(),
}))

jest.mock("@lib/hooks/use-cart-title-map", () => ({
  useCartTitleMap: () => ({}),
}))

jest.mock("@modules/checkout/components/shipping-address", () =>
  function ShippingAddressMock({
    onPostalCodeChange,
  }: {
    onPostalCodeChange?: (zip: string) => void
  }) {
    return (
      <button
        type="button"
        onClick={() => onPostalCodeChange?.("02453")}
      >
        Enter outside ZIP
      </button>
    )
  }
)

jest.mock("@modules/checkout/components/billing_address", () => () => null)

const cart = {
  id: "cart_123",
  currency_code: "usd",
  total: 12000,
  items: [],
  promotions: [],
  email: "customer@example.com",
  metadata: {
    fulfillmentType: "atlanta_delivery",
    fulfillmentSelectionStatus: "settled",
  },
  shipping_address: {
    first_name: "Avi",
    last_name: "Swerdlow",
    address_1: "220 Glen Meadow Ct",
    city: "Sandy Springs",
    province: "GA",
    postal_code: "30328",
    country_code: "us",
  },
  billing_address: {
    first_name: "Avi",
    last_name: "Swerdlow",
    address_1: "220 Glen Meadow Ct",
    city: "Sandy Springs",
    province: "GA",
    postal_code: "30328",
    country_code: "us",
  },
  shipping_methods: [{ id: "atlanta_method" }],
} as any

describe("checkout address fulfillment reset", () => {
  it("allows an Atlanta selection to transition to an out-of-region address", async () => {
    const user = userEvent.setup()
    render(
      <Addresses
        cart={cart}
        customer={{ id: "cus_123", addresses: [] } as any}
        atlantaZipCodes={["30328"]}
      />
    )

    await user.click(screen.getByRole("button", { name: "Enter outside ZIP" }))

    expect(
      screen.getByText(/Continuing will save the changed address/i)
    ).toBeInTheDocument()
    expect(screen.getByTestId("submit-address-button")).toBeEnabled()
  })
})
