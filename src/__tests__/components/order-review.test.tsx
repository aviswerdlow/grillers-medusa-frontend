import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import CheckoutOrderReview from "@modules/checkout/components/order-review"
import {
  loadCheckoutReview,
  recoverReviewedCheckout,
} from "@lib/data/order-review"
import { checkoutReviewFixture } from "../fixtures/order-review"
jest.mock("@lib/data/order-review", () => ({
  loadCheckoutReview: jest.fn(),
  recoverReviewedCheckout: jest.fn(),
}))
jest.mock("@lib/utils/cookies", () => ({ getConsentCookie: () => null }))
const cart = {
  id: "cart_test",
  total: 72,
  items: [{ id: "line_fixture", quantity: 2 }],
  shipping_address: { country_code: "us" },
}
const child = ({ acceptance, invalidate }: any) => (
  <>
    <button disabled={!acceptance}>Place fixture order</button>
    <button onClick={() => invalidate("Review changed")}>
      Invalidate fixture
    </button>
  </>
)
beforeEach(() => {
  jest.clearAllMocks()
  Object.defineProperty(global.crypto, "randomUUID", {
    configurable: true,
    value: () => "d98224fb-c599-4a63-92ba-22189c505126",
  })
  ;(loadCheckoutReview as jest.Mock).mockResolvedValue({
    review: checkoutReviewFixture(),
    error: null,
  })
})
test("displays server amounts, contacts and pricing basis with direct edit paths", async () => {
  render(
    <CheckoutOrderReview cart={cart} paymentMode="card">
      {child}
    </CheckoutOrderReview>
  )
  expect(
    screen.getByRole("button", { name: "Place fixture order" })
  ).toBeDisabled()
  expect(await screen.findByText("2 × Fixture roast")).toBeVisible()
  expect(screen.getByText(/about 6 lb total/)).toBeVisible()
  expect(screen.getByText(/receipt@example.invalid/)).toBeVisible()
  expect(screen.getByText("Thursday, September 24")).toBeVisible()
  expect(screen.getByRole("link", { name: "Edit date" })).toHaveAttribute(
    "href",
    "/us/checkout?step=delivery"
  )
  expect(screen.getByRole("link", { name: "Terms of Sale" })).toHaveAttribute(
    "href",
    "/us/page/terms-of-sale"
  )
  expect(
    screen.getByRole("button", { name: "Place fixture order" })
  ).toBeEnabled()
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
})
test("a basket change disables the old review before its replacement resolves", async () => {
  const view = render(
    <CheckoutOrderReview cart={cart} paymentMode="card">
      {child}
    </CheckoutOrderReview>
  )
  await screen.findByText("2 × Fixture roast")
  ;(loadCheckoutReview as jest.Mock).mockReturnValue(new Promise(() => {}))
  view.rerender(
    <CheckoutOrderReview cart={{ ...cart, total: 80 }} paymentMode="card">
      {child}
    </CheckoutOrderReview>
  )
  expect(
    screen.getByRole("button", { name: "Place fixture order" })
  ).toBeDisabled()
})
test("a late old response cannot restore a superseded review", async () => {
  let resolve!: (value: any) => void
  ;(loadCheckoutReview as jest.Mock).mockReturnValueOnce(
    new Promise((r) => {
      resolve = r
    })
  )
  const view = render(
    <CheckoutOrderReview cart={cart} paymentMode="card">
      {child}
    </CheckoutOrderReview>
  )
  const invoice = checkoutReviewFixture()
  invoice.terms.payment_mode = "invoice"
  invoice.terms.invoice_terms = "Approved Net 20"
  ;(loadCheckoutReview as jest.Mock).mockResolvedValueOnce({
    review: invoice,
    error: null,
  })
  view.rerender(
    <CheckoutOrderReview cart={cart} paymentMode="invoice">
      {child}
    </CheckoutOrderReview>
  )
  await screen.findByText(/Invoice terms: Approved Net 20/)
  await act(async () =>
    resolve({ review: checkoutReviewFixture(), error: null })
  )
  expect(screen.getByText(/Invoice terms: Approved Net 20/)).toBeVisible()
})
test("expired review disables placement and offers refresh", async () => {
  const review = checkoutReviewFixture()
  review.expires_at = new Date(Date.now() - 1000).toISOString()
  ;(loadCheckoutReview as jest.Mock).mockResolvedValue({ review, error: null })
  render(
    <CheckoutOrderReview cart={cart} paymentMode="card">
      {child}
    </CheckoutOrderReview>
  )
  expect(
    await screen.findByRole("button", { name: "Refresh order review" })
  ).toBeVisible()
  expect(
    screen.getByRole("button", { name: "Place fixture order" })
  ).toBeDisabled()
})
test("a missing review gives actionable feedback, never an enabled order button", async () => {
  ;(loadCheckoutReview as jest.Mock).mockResolvedValue({
    review: null,
    error: "Invoice terms need office approval.",
  })
  render(
    <CheckoutOrderReview cart={cart} paymentMode="invoice">
      {child}
    </CheckoutOrderReview>
  )
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Invoice terms need office approval."
  )
  expect(
    screen.getByRole("button", { name: "Place fixture order" })
  ).toBeDisabled()
})
test("recovery keeps the original acceptance ID and cannot initiate payment", async () => {
  ;(recoverReviewedCheckout as jest.Mock).mockResolvedValue({
    orderId: null,
    error: "No completed order was confirmed.",
  })
  render(
    <CheckoutOrderReview cart={cart} paymentMode="card">
      {child}
    </CheckoutOrderReview>
  )
  await screen.findByText("2 × Fixture roast")
  fireEvent.click(screen.getByRole("button", { name: "Invalidate fixture" }))
  fireEvent.click(screen.getByRole("button", { name: /Check order status/ }))
  await waitFor(() =>
    expect(recoverReviewedCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        cartId: "cart_test",
        acceptance: expect.objectContaining({ reviewId: "gpor_fixture" }),
      })
    )
  )
  expect(
    await screen.findByText("No completed order was confirmed.")
  ).toBeVisible()
})
