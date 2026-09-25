import { render, screen } from "@testing-library/react"
import type { HttpTypes } from "@medusajs/types"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import CartTotals from "@modules/common/components/cart-totals"
import OrderSummary from "@modules/order/components/order-summary"

jest.mock("@lib/hooks/use-product-featured-image", () => ({
  useProductFeaturedImageSrc: () => "https://cdn.example.com/test.jpg",
}))
jest.mock("@lib/hooks/use-product-title", () => ({
  useProductTitle: () => "Test item",
}))
jest.mock("@modules/products/components/thumbnail", () => ({
  __esModule: true,
  default: () => <span>Thumbnail</span>,
}))
jest.mock("@modules/checkout/components/discount-code", () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock("@modules/common/components/fulfillment-progress", () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock("@modules/common/components/cart-helpers", () => ({
  FreeShippingHelper: () => null,
}))

const cart = {
  id: "cart_test",
  currency_code: "usd",
  item_subtotal: { numeric_: "19.99" },
  subtotal: { value: "24.99" },
  shipping_subtotal: { value: "5" },
  shipping_total: { numeric_: "5" },
  tax_total: { value: "4" },
  discount_total: { numeric_: "2" },
  total: { value: "26.99" },
  items: [
    {
      id: "line_test",
      product_id: "prod_test",
      product_title: "Test item",
      quantity: 1,
      unit_price: { numeric_: "19.99" },
      subtotal: { value: "19.99" },
      metadata: {},
    },
  ],
  promotions: [],
  metadata: {},
} as unknown as HttpTypes.StoreCart

it("renders serialized Medusa amounts throughout checkout summary", () => {
  const { container } = render(<CheckoutSummary cart={cart} />)

  expect(screen.getByText("Test item")).toBeInTheDocument()
  expect(container.textContent).toContain("$19.99")
  expect(container.textContent).toContain("$5.00")
  expect(container.textContent).toContain("$4.00")
  expect(container.textContent).toContain("$2.00")
  expect(container.textContent).toContain("$26.99")
  expect(container.textContent).not.toContain("NaN")
})

it("renders serialized amounts in cart and order summaries", () => {
  const { container, rerender } = render(<CartTotals totals={cart} />)
  expect(screen.getByTestId("cart-subtotal")).toHaveTextContent("$19.99")
  expect(screen.getByTestId("cart-total")).toHaveTextContent("$26.99")
  expect(container.textContent).not.toContain("NaN")

  rerender(
    <OrderSummary
      order={{
        currency_code: "usd",
        subtotal: { value: "19.99" },
        shipping_total: { numeric_: "5" },
        tax_total: "4",
        discount_total: { value: "2" },
        total: { numeric_: "26.99" },
      } as unknown as HttpTypes.StoreOrder}
    />
  )
  expect(container.textContent).toContain("$26.99")
  expect(container.textContent).not.toContain("NaN")
})
