import { FINAL_CHARGE_CONSENT_TEXT, FINAL_CHARGE_CONSENT_VERSION } from "@lib/order-review"
import { reviewAcceptance } from "../../test-fixtures/order-review"
import { acceptCheckoutReview } from "@lib/data/order-review"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import PaymentButton from "@modules/checkout/components/payment-button"
import {
  submitOrderByInvoice,
  submitOrderWithSavedPaymentMethod,
  verifyCartInventoryForCheckout,
  verifyCartCalendarForCheckout,
} from "@lib/data/cart"
import { reportClientOpsAlert } from "@lib/client-error-reporter"
import { useElements, useStripe } from "@stripe/react-stripe-js"

jest.mock("@lib/data/order-review", () => ({ acceptCheckoutReview: jest.fn() }))
jest.mock("@lib/utils/cookies", () => ({ getConsentCookie: () => null }))

jest.mock("@lib/data/cart", () => ({
  submitOrderByInvoice: jest.fn(),
  submitOrderWithSavedPaymentMethod: jest.fn(),
  verifyCartInventoryForCheckout: jest.fn(),
  verifyCartCalendarForCheckout: jest.fn(),
}))

jest.mock("@lib/client-error-reporter", () => ({
  reportClientOpsAlert: jest.fn(),
}))

jest.mock("@lib/jitsu", () => ({
  jitsuTrack: jest.fn(),
}))

jest.mock("@stripe/react-stripe-js", () => ({
  useElements: jest.fn(),
  useStripe: jest.fn(),
}))

const mockPlaceOrder = submitOrderWithSavedPaymentMethod as jest.MockedFunction<
  typeof submitOrderWithSavedPaymentMethod
>
const mockSubmitOrderByInvoice = submitOrderByInvoice as jest.MockedFunction<
  typeof submitOrderByInvoice
>
const mockVerifyInventory =
  verifyCartInventoryForCheckout as jest.MockedFunction<
    typeof verifyCartInventoryForCheckout
  >
const mockReportClientOpsAlert = reportClientOpsAlert as jest.MockedFunction<
  typeof reportClientOpsAlert
>
const mockUseStripe = useStripe as jest.MockedFunction<typeof useStripe>
const mockUseElements = useElements as jest.MockedFunction<typeof useElements>

const readyCart = {
  id: "cart_test",
  email: "customer@example.com",
  shipping_address: { address_1: "220 Glen Meadow Ct" },
  billing_address: { address_1: "220 Glen Meadow Ct" },
  shipping_methods: [{ id: "ship_pickup" }],
  metadata: {
    fulfillmentType: "plant_pickup",
    fulfillmentSelectionStatus: "settled",
  },
} as any

describe("PaymentButton", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(acceptCheckoutReview as jest.Mock).mockResolvedValue({ error: null })
    ;(verifyCartCalendarForCheckout as jest.Mock).mockResolvedValue(undefined)
    mockVerifyInventory.mockResolvedValue(undefined as never)
    mockPlaceOrder.mockResolvedValue(undefined as never)
    mockSubmitOrderByInvoice.mockResolvedValue(undefined as never)
    mockUseStripe.mockReturnValue(null)
    mockUseElements.mockReturnValue(null)
  })

  it("does not create a card setup or order when the selected date expired", async () => {
    const user = userEvent.setup()
    const confirmCardSetup = jest.fn()
    mockUseStripe.mockReturnValue({ confirmCardSetup } as any)
    mockUseElements.mockReturnValue({ getElement: () => ({}) } as any)
    ;(verifyCartCalendarForCheckout as jest.Mock).mockRejectedValue(
      new Error("Please confirm an available date.")
    )
    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={readyCart}
        cardComplete
        setupIntentClientSecret="seti_test_secret"
        data-testid="submit-order-button"
      />
    )
    await user.click(
      screen.getByRole("button", { name: /Save Card & Place Order/i })
    )
    expect(
      await screen.findByText("Please confirm an available date.")
    ).toBeVisible()
    expect(confirmCardSetup).not.toHaveBeenCalled()
    expect(mockPlaceOrder).not.toHaveBeenCalled()
  })

  it("places a catch-weight order with a saved card without requiring Stripe Elements", async () => {
    const user = userEvent.setup()

    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={readyCart}
        savedPaymentMethodId="pm_test_123"
        data-testid="submit-order-button"
      />
    )

    await user.click(screen.getByRole("button", { name: /place order/i }))

    await waitFor(() => {
      expect(mockVerifyInventory).toHaveBeenCalledWith("cart_test")
      expect(mockPlaceOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethodId: "pm_test_123",
          setupIntentId: null,
          consentVersion: FINAL_CHARGE_CONSENT_VERSION,
          consentText: FINAL_CHARGE_CONSENT_TEXT,
          acceptance: reviewAcceptance,
        })
      )
    })
  })

  it("treats a saved-card NEXT_REDIRECT message as successful navigation", async () => {
    const user = userEvent.setup()
    mockPlaceOrder.mockRejectedValue(new Error("NEXT_REDIRECT"))

    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={readyCart}
        savedPaymentMethodId="pm_test_123"
        data-testid="submit-order-button"
      />
    )

    await user.click(screen.getByRole("button", { name: /place order/i }))

    await waitFor(() => {
      expect(mockPlaceOrder).toHaveBeenCalledTimes(1)
      expect(screen.getByRole("button", { name: /place order/i })).toBeEnabled()
    })
    expect(mockReportClientOpsAlert).not.toHaveBeenCalled()
    expect(screen.queryByText("NEXT_REDIRECT")).not.toBeInTheDocument()
  })

  it("treats a new-card NEXT_REDIRECT digest as successful navigation", async () => {
    const user = userEvent.setup()
    const confirmCardSetup = jest.fn().mockResolvedValue({
      setupIntent: {
        id: "seti_123",
        status: "succeeded",
        payment_method: "pm_new_card",
      },
    })
    mockUseStripe.mockReturnValue({ confirmCardSetup } as any)
    mockUseElements.mockReturnValue({ getElement: jest.fn(() => ({})) } as any)
    mockPlaceOrder.mockRejectedValue({
      digest: "NEXT_REDIRECT;replace;/us/order/order_123/confirmed;307;",
    })

    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={readyCart}
        cardComplete
        setupIntentClientSecret="seti_secret"
        data-testid="submit-order-button"
      />
    )

    await user.click(
      screen.getByRole("button", { name: /save card & place order/i })
    )

    await waitFor(() => {
      expect(mockPlaceOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethodId: "pm_new_card",
          setupIntentId: "seti_123",
          consentVersion: FINAL_CHARGE_CONSENT_VERSION,
          consentText: FINAL_CHARGE_CONSENT_TEXT,
        })
      )
      expect(
        screen.getByRole("button", { name: /save card & place order/i })
      ).toBeEnabled()
    })
    expect(mockReportClientOpsAlert).not.toHaveBeenCalled()
    expect(
      screen.queryByText(/could not place the order/i)
    ).not.toBeInTheDocument()
  })

  it("does not place an order while an external checkout requirement is pending", async () => {
    const user = userEvent.setup()

    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={readyCart}
        disabled
        savedPaymentMethodId="pm_test_123"
        data-testid="submit-order-button"
      />
    )

    const placeOrder = screen.getByRole("button", { name: /place order/i })
    expect(placeOrder).toBeDisabled()

    await user.click(placeOrder)
    expect(mockVerifyInventory).not.toHaveBeenCalled()
    expect(mockPlaceOrder).not.toHaveBeenCalled()
  })

  it("does not place an order while fulfillment attachment is pending", async () => {
    const user = userEvent.setup()

    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={{
          ...readyCart,
          metadata: {
            ...readyCart.metadata,
            fulfillmentSelectionStatus: "pending",
          },
        }}
        savedPaymentMethodId="pm_test_123"
        data-testid="submit-order-button"
      />
    )

    const placeOrder = screen.getByRole("button", { name: /place order/i })
    expect(placeOrder).toBeDisabled()

    await user.click(placeOrder)
    expect(mockVerifyInventory).not.toHaveBeenCalled()
    expect(mockPlaceOrder).not.toHaveBeenCalled()
  })

  it("pages ops when saved-card order submission returns an error", async () => {
    const user = userEvent.setup()
    mockPlaceOrder.mockResolvedValue({
      error: "Medusa order complete failed for customer@example.com",
    } as never)

    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={readyCart}
        savedPaymentMethodId="pm_test_123"
        data-testid="submit-order-button"
      />
    )

    await user.click(screen.getByRole("button", { name: /place order/i }))

    await waitFor(() => {
      expect(mockReportClientOpsAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "checkout_segment_error",
          severity: "page",
          title: "Checkout payment order_submit_result failed",
          message: "Medusa order complete failed for [email]",
          extra: expect.objectContaining({
            checkout_surface: "payment_button",
            payment_mode: "saved_card",
            stage: "order_submit_result",
            cart_id: "cart_test",
            fulfillment_type: "plant_pickup",
            error_message: "Medusa order complete failed for [email]",
          }),
        })
      )
    })
  })

  it("pages ops when Stripe setup throws before order submit", async () => {
    const user = userEvent.setup()
    const confirmCardSetup = jest
      .fn()
      .mockRejectedValue(new Error("Stripe.js unavailable"))
    mockUseStripe.mockReturnValue({ confirmCardSetup } as any)
    mockUseElements.mockReturnValue({ getElement: jest.fn(() => ({})) } as any)

    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={readyCart}
        cardComplete
        setupIntentClientSecret="seti_secret"
        data-testid="submit-order-button"
      />
    )

    await user.click(
      screen.getByRole("button", { name: /save card & place order/i })
    )

    await waitFor(() => {
      expect(mockReportClientOpsAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "checkout_segment_error",
          severity: "page",
          title: "Checkout payment card_setup_throw failed",
          message: "Stripe.js unavailable",
          extra: expect.objectContaining({
            checkout_surface: "payment_button",
            payment_mode: "new_card",
            stage: "card_setup_throw",
            cart_id: "cart_test",
          }),
        })
      )
    })
    expect(mockPlaceOrder).not.toHaveBeenCalled()
  })

  it("pages ops when new-card order submission returns an error after setup", async () => {
    const user = userEvent.setup()
    const confirmCardSetup = jest.fn().mockResolvedValue({
      setupIntent: {
        id: "seti_123",
        status: "succeeded",
        payment_method: "pm_new_card",
      },
    })
    mockUseStripe.mockReturnValue({ confirmCardSetup } as any)
    mockUseElements.mockReturnValue({ getElement: jest.fn(() => ({})) } as any)
    mockPlaceOrder.mockResolvedValue({
      error: "Order completion failed",
    } as never)

    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={readyCart}
        cardComplete
        setupIntentClientSecret="seti_secret"
        data-testid="submit-order-button"
      />
    )

    await user.click(
      screen.getByRole("button", { name: /save card & place order/i })
    )

    await waitFor(() => {
      expect(mockPlaceOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethodId: "pm_new_card",
          setupIntentId: "seti_123",
        })
      )
      expect(mockReportClientOpsAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "checkout_segment_error",
          severity: "page",
          title: "Checkout payment order_submit_result failed",
          message: "Order completion failed",
          extra: expect.objectContaining({
            payment_mode: "new_card",
            stage: "order_submit_result",
            cart_id: "cart_test",
            has_setup_intent: true,
          }),
        })
      )
    })
  })

  it("pages ops when invoice order submission returns an error", async () => {
    const user = userEvent.setup()
    mockSubmitOrderByInvoice.mockResolvedValue({
      error: "Invoice order failed",
    } as never)

    render(
      <PaymentButton
        acceptance={reviewAcceptance}
        cart={readyCart}
        payByInvoice
        data-testid="submit-order-button"
      />
    )

    await user.click(
      screen.getByRole("button", { name: /place order \(invoice\)/i })
    )

    await waitFor(() => {
      expect(mockReportClientOpsAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "checkout_segment_error",
          severity: "page",
          title: "Checkout payment invoice_submit_result failed",
          message: "Invoice order failed",
          extra: expect.objectContaining({
            payment_mode: "invoice",
            stage: "invoice_submit_result",
            cart_id: "cart_test",
          }),
        })
      )
    })
  })
})

test("does not reach Stripe when the accepted review changes", async () => {
  const confirmCardSetup = jest.fn()
  ;(useStripe as jest.Mock).mockReturnValue({ confirmCardSetup })
  ;(useElements as jest.Mock).mockReturnValue({ getElement: () => ({}) })
  ;(verifyCartInventoryForCheckout as jest.Mock).mockResolvedValue(undefined)
  ;(verifyCartCalendarForCheckout as jest.Mock).mockResolvedValue(undefined)
  ;(acceptCheckoutReview as jest.Mock).mockResolvedValue({
    error: "Address changed. Review again.",
  })
  const invalidate = jest.fn()
  render(
    <PaymentButton
      cart={readyCart}
      acceptance={reviewAcceptance}
      onReviewRequired={invalidate}
      cardComplete
      setupIntentClientSecret="seti_fixture"
      data-testid="place"
    />
  )
  await userEvent.click(
    screen.getByRole("button", { name: /Save Card & Place Order/i })
  )
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith("Address changed. Review again.")
  )
  expect(confirmCardSetup).not.toHaveBeenCalled()
})
