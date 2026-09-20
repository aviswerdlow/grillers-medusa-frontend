import { reviewAcceptance } from "../../test-fixtures/order-review"
import { acceptCheckoutReview } from "@lib/data/order-review"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import StaffChargeCard from "@modules/staff/components/phone-order-card"
import {
  completeStaffPhoneOrder,
  verifyStaffPhoneOrderForPayment,
} from "@lib/data/staff/order-entry"

jest.mock("@lib/data/order-review", () => ({ acceptCheckoutReview: jest.fn() }))
jest.mock("@modules/checkout/components/order-review", () => ({
  __esModule: true,
  default: ({ children }: any) =>
    children({
      acceptance: require("../../test-fixtures/order-review").reviewAcceptance,
      invalidate: jest.fn(),
    }),
}))
const confirm = jest.fn()
jest.mock("@lib/data/staff/order-entry", () => ({
  completeStaffPhoneOrder: jest.fn(),
  verifyStaffPhoneOrderForPayment: jest.fn(),
}))
jest.mock("@stripe/react-stripe-js", () => ({
  useStripe: () => ({ confirmCardPayment: confirm }),
  useElements: () => ({ getElement: () => ({}) }),
  CardElement: ({ onChange }: any) => (
    <button onClick={() => onChange({ complete: true })}>
      Enter fixture card
    </button>
  ),
}))
jest.mock("@modules/common/components/button", () => ({
  __esModule: true,
  default: ({ isLoading, ...props }: any) => <button {...props} />,
}))
const props = () => ({
  result: {
    ok: true,
    cartId: "cart_test",
    paymentClientSecret: "synthetic_secret",
    cart: { email: "fixture@example.test" } as any,
  },
  billingAddress: {
    firstName: "Test",
    lastName: "Caller",
    address1: "1 Fixture",
    city: "Atlanta",
    province: "GA",
    postalCode: "30340",
    countryCode: "us",
  },
  onComplete: jest.fn(),
  onReviewRequired: jest.fn(),
})
beforeEach(() => {
  jest.clearAllMocks()
  ;(acceptCheckoutReview as jest.Mock).mockResolvedValue({ error: null })
  ;(verifyStaffPhoneOrderForPayment as jest.Mock).mockResolvedValue({
    ok: true,
  })
  ;(completeStaffPhoneOrder as jest.Mock).mockResolvedValue({
    ok: true,
    orderId: "order_test",
  })
  confirm.mockResolvedValue({ paymentIntent: { status: "succeeded" } })
})
const charge = () => {
  fireEvent.click(screen.getByText("Enter fixture card"))
  fireEvent.click(
    screen.getByRole("button", { name: "Charge Card and Place Order" })
  )
}
test("expiry, invalid inventory or lost authority cannot reach Stripe", async () => {
  const p = props()
  ;(verifyStaffPhoneOrderForPayment as jest.Mock).mockResolvedValue({
    ok: false,
    error: "Date expired. Confirm a current date.",
  })
  render(<StaffChargeCard {...p} />)
  charge()
  await waitFor(() =>
    expect(p.onReviewRequired).toHaveBeenCalledWith(
      "Date expired. Confirm a current date."
    )
  )
  expect(confirm).not.toHaveBeenCalled()
  expect(completeStaffPhoneOrder).not.toHaveBeenCalled()
})
test("checks the server before Stripe and completes only after confirmation", async () => {
  const p = props()
  render(<StaffChargeCard {...p} />)
  charge()
  await waitFor(() =>
    expect(p.onComplete).toHaveBeenCalledWith({
      ok: true,
      orderId: "order_test",
    })
  )
  expect(
    (verifyStaffPhoneOrderForPayment as jest.Mock).mock.invocationCallOrder[0]
  ).toBeLessThan(confirm.mock.invocationCallOrder[0])
  expect(confirm.mock.invocationCallOrder[0]).toBeLessThan(
    (completeStaffPhoneOrder as jest.Mock).mock.invocationCallOrder[0]
  )
  fireEvent.click(
    screen.getByRole("button", { name: "Charge Card and Place Order" })
  )
  expect(confirm).toHaveBeenCalledTimes(1)
})
test("a duplicate click or draft edit during the server check does not charge an old draft", async () => {
  let resolve!: (value: unknown) => void
  ;(verifyStaffPhoneOrderForPayment as jest.Mock).mockReturnValue(
    new Promise((r) => {
      resolve = r
    })
  )
  const view = render(<StaffChargeCard {...props()} />)
  charge()
  fireEvent.click(
    screen.getByRole("button", { name: "Charge Card and Place Order" })
  )
  expect(verifyStaffPhoneOrderForPayment).toHaveBeenCalledTimes(1)
  view.unmount()
  await act(async () => resolve({ ok: true }))
  expect(confirm).not.toHaveBeenCalled()
})
test("a provider error does not attempt completion", async () => {
  confirm.mockResolvedValue({ error: { message: "Fixture card declined" } })
  render(<StaffChargeCard {...props()} />)
  charge()
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Fixture card declined"
  )
  expect(completeStaffPhoneOrder).not.toHaveBeenCalled()
})
test("completion failure after confirmed payment requires reconciliation, not a second charge", async () => {
  ;(completeStaffPhoneOrder as jest.Mock).mockResolvedValue({
    ok: false,
    error: "Calendar changed",
  })
  const p = props()
  render(<StaffChargeCard {...p} />)
  charge()
  await waitFor(() =>
    expect(p.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.stringContaining("Check order support"),
      })
    )
  )
  expect(
    screen.getByRole("button", { name: "Charge Card and Place Order" })
  ).toBeDisabled()
  expect(confirm).toHaveBeenCalledTimes(1)
})
