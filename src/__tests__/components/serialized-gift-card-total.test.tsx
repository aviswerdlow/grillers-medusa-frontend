import { render, screen } from "@testing-library/react"
import Review from "@modules/checkout/components/review"

jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("step=review"),
}))
jest.mock("@modules/checkout/components/payment-button", () => {
  return function MockPaymentButton() {
    return <button data-testid="submit-order-button">Fixture payment button</button>
  }
})

it("recognizes a serialized zero total as fully gift-card covered", () => {
  render(<Review cart={{
    gift_cards: [{ id: "gift_test" }],
    total: { numeric_: 0, raw_: { value: "0.00", precision: 20 } },
    shipping_address: { address_1: "Fixture address" },
    shipping_methods: [{ id: "method_test" }],
    payment_collection: null,
  }} />)

  expect(screen.getByTestId("submit-order-button")).toBeInTheDocument()
})
