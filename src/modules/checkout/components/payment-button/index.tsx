"use client"

import {
  submitOrderByInvoice,
  submitOrderWithSavedPaymentMethod,
  verifyCartInventoryForCheckout,
} from "@lib/data/cart"
import { reportClientOpsAlert } from "@lib/client-error-reporter"
import { jitsuTrack } from "@lib/jitsu"
import { HttpTypes } from "@medusajs/types"
import { useElements, useStripe } from "@stripe/react-stripe-js"
import React, { useRef, useState } from "react"
import Spinner from "@modules/common/icons/spinner"
import { isExpectedNextRedirect } from "@lib/util/next-redirect"
import { isCheckoutFulfillmentReadyForPayment } from "@lib/checkout-payment-readiness"

// Custom gold button matching btn-primary style
const GoldButton = ({
  children,
  disabled,
  isLoading,
  onClick,
  "data-testid": dataTestId,
}: {
  children: React.ReactNode
  disabled?: boolean
  isLoading?: boolean
  onClick?: () => void
  "data-testid"?: string
}) => (
  <button
    type="button"
    disabled={disabled || isLoading}
    onClick={onClick}
    data-testid={dataTestId}
    className="w-full py-[18px] px-[42px] rounded-[5px] border border-Charcoal bg-Gold text-Charcoal font-rexton text-h6 font-bold uppercase transition-opacity hover:opacity-95 disabled:bg-gray-300 disabled:border-gray-300 disabled:cursor-not-allowed inline-flex items-center justify-center text-center gap-[9px]"
  >
    {isLoading ? (
      <>
        <Spinner />
        PROCESSING...
      </>
    ) : (
      children
    )}
  </button>
)

type PaymentButtonProps = {
  cart: HttpTypes.StoreCart
  cardComplete?: boolean
  disabled?: boolean
  savedPaymentMethodId?: string | null
  setupIntentClientSecret?: string | null
  // #283: approved B2B accounts placing a no-card invoice order.
  payByInvoice?: boolean
  // #283 (Codex P2): report submit-in-flight up so the payment-mode toggle can lock.
  onSubmittingChange?: (submitting: boolean) => void
  "data-testid": string
}

const FINAL_CHARGE_CONSENT_VERSION = "catch-weight-final-charge-2026-05-31"
const FINAL_CHARGE_CONSENT_TEXT =
  "I agree that Griller's Pride will save my card today and charge the final order total when my order is packed and ready to leave."

type CheckoutPaymentMode = "saved_card" | "new_card" | "invoice"

function checkoutErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const record = error as Record<string, any>
    return (
      String(record.message || "").trim() ||
      String(record.error?.message || "").trim() ||
      String(record.error || "").trim() ||
      "Unknown checkout payment error"
    )
  }
  return "Unknown checkout payment error"
}

function redactCheckoutMessage(message: string) {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .slice(0, 500)
}

function reportCheckoutPaymentFailure({
  cart,
  paymentMode,
  stage,
  error,
  extra,
}: {
  cart: HttpTypes.StoreCart
  paymentMode: CheckoutPaymentMode
  stage: string
  error: unknown
  extra?: Record<string, unknown>
}) {
  if (isExpectedNextRedirect(error)) return

  const message = redactCheckoutMessage(checkoutErrorMessage(error))

  reportClientOpsAlert({
    kind: "checkout_segment_error",
    severity: "page",
    title: `Checkout payment ${stage} failed`,
    message,
    extra: {
      checkout_surface: "payment_button",
      payment_mode: paymentMode,
      stage,
      cart_id: cart.id,
      fulfillment_type: cart.metadata?.fulfillmentType || null,
      shipping_method_count: cart.shipping_methods?.length || 0,
      ...extra,
      error_message: message,
    },
  })
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  cardComplete = false,
  disabled = false,
  savedPaymentMethodId,
  setupIntentClientSecret,
  payByInvoice = false,
  onSubmittingChange,
  "data-testid": dataTestId,
}) => {
  // All fulfillment types (including pickup) now set a shipping method on the cart
  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    !cart.email ||
    !isCheckoutFulfillmentReadyForPayment(cart)

  if (payByInvoice) {
    return (
      <InvoicePaymentButton
        notReady={notReady || disabled}
        cart={cart}
        onSubmittingChange={onSubmittingChange}
        data-testid={dataTestId}
      />
    )
  }

  if (savedPaymentMethodId) {
    return (
      <SavedPaymentMethodButton
        notReady={notReady || disabled}
        cart={cart}
        savedPaymentMethodId={savedPaymentMethodId}
        onSubmittingChange={onSubmittingChange}
        data-testid={dataTestId}
      />
    )
  }

  if (setupIntentClientSecret) {
    return (
      <NewCardSetupPaymentButton
        notReady={notReady || disabled}
        cart={cart}
        cardComplete={cardComplete}
        setupIntentClientSecret={setupIntentClientSecret}
        onSubmittingChange={onSubmittingChange}
        data-testid={dataTestId}
      />
    )
  }

  return <GoldButton disabled>Select a payment method</GoldButton>
}

async function verifyAndPlaceOrder({
  cart,
  paymentMethodId,
  setupIntentId = null,
  setErrorMessage,
}: {
  cart: HttpTypes.StoreCart
  paymentMethodId: string
  setupIntentId?: string | null
  setErrorMessage: (message: string | null) => void
}) {
  await verifyCartInventoryForCheckout(cart.id)

  let result: Awaited<ReturnType<typeof submitOrderWithSavedPaymentMethod>>
  try {
    result = await submitOrderWithSavedPaymentMethod({
      paymentMethodId,
      setupIntentId,
      consentVersion: FINAL_CHARGE_CONSENT_VERSION,
      consentText: FINAL_CHARGE_CONSENT_TEXT,
    })
  } catch (err) {
    if (isExpectedNextRedirect(err)) return

    reportCheckoutPaymentFailure({
      cart,
      paymentMode: setupIntentId ? "new_card" : "saved_card",
      stage: "order_submit_throw",
      error: err,
      extra: {
        has_setup_intent: Boolean(setupIntentId),
      },
    })
    throw err
  }

  if (result?.error) {
    reportCheckoutPaymentFailure({
      cart,
      paymentMode: setupIntentId ? "new_card" : "saved_card",
      stage: "order_submit_result",
      error: result.error,
      extra: {
        has_setup_intent: Boolean(setupIntentId),
      },
    })
    setErrorMessage(result.error)
  }
}

const SavedPaymentMethodButton = ({
  cart,
  notReady,
  savedPaymentMethodId,
  onSubmittingChange,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  savedPaymentMethodId: string
  onSubmittingChange?: (submitting: boolean) => void
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const submittingRef = useRef(false)

  // #283 (Codex round-3 P2): report submit state SYNCHRONOUSLY (not via a passive effect) so the
  // parent locks the payment-mode toggle before the user can switch mode mid-submit.
  const reportSubmitting = (value: boolean) => {
    setSubmitting(value)
    onSubmittingChange?.(value)
  }

  const handlePayment = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    reportSubmitting(true)

    try {
      await verifyAndPlaceOrder({
        cart,
        paymentMethodId: savedPaymentMethodId,
        setErrorMessage,
      })
    } catch (err: any) {
      if (isExpectedNextRedirect(err)) return
      setErrorMessage(err.message || "Some items need inventory review.")
    } finally {
      submittingRef.current = false
      reportSubmitting(false)
    }
  }

  return (
    <>
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200/80 rounded-lg text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      <GoldButton
        disabled={notReady}
        onClick={handlePayment}
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Place Order
      </GoldButton>
    </>
  )
}

const NewCardSetupPaymentButton = ({
  cart,
  notReady,
  cardComplete = false,
  setupIntentClientSecret,
  onSubmittingChange,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  cardComplete?: boolean
  setupIntentClientSecret: string
  onSubmittingChange?: (submitting: boolean) => void
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const submittingRef = useRef(false)

  // #283 (Codex round-3 P2): report submit state SYNCHRONOUSLY so the parent toggle locks before
  // the user can switch mode mid-submit.
  const reportSubmitting = (value: boolean) => {
    setSubmitting(value)
    onSubmittingChange?.(value)
  }

  const stripe = useStripe()
  const elements = useElements()
  const card = elements?.getElement("card")

  const disabled =
    !stripe || !elements || !card || !cardComplete || !setupIntentClientSecret

  const handlePayment = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    reportSubmitting(true)

    // Codex round-3 P2: wrap the WHOLE body so a Stripe.js rejection (which throws rather than
    // returning result.error) can never leave submitting stuck-true and the toggles locked.
    try {
      if (!cart || !stripe || !elements || !card) {
        return
      }

      try {
        await verifyCartInventoryForCheckout(cart.id)
      } catch (err: any) {
        setErrorMessage(err.message || "Some items need inventory review.")
        return
      }

      let result: Awaited<ReturnType<typeof stripe.confirmCardSetup>>
      try {
        result = await stripe.confirmCardSetup(setupIntentClientSecret, {
          payment_method: {
            card,
            billing_details: {
              name:
                cart.billing_address?.first_name +
                " " +
                cart.billing_address?.last_name,
              address: {
                city: cart.billing_address?.city ?? undefined,
                country: cart.billing_address?.country_code ?? undefined,
                line1: cart.billing_address?.address_1 ?? undefined,
                line2: cart.billing_address?.address_2 ?? undefined,
                postal_code: cart.billing_address?.postal_code ?? undefined,
                state: cart.billing_address?.province ?? undefined,
              },
              email: cart.email,
              phone: cart.billing_address?.phone ?? undefined,
            },
          },
        })
      } catch (err) {
        if (isExpectedNextRedirect(err)) return

        reportCheckoutPaymentFailure({
          cart,
          paymentMode: "new_card",
          stage: "card_setup_throw",
          error: err,
        })
        throw err
      }

      if (result.error) {
        jitsuTrack("payment_setup_failed", {
          cart_id: cart.id,
          error_message: result.error.message,
          error_code: result.error.code,
          payment_type: "stripe_card_setup",
        })
        setErrorMessage(result.error.message || null)
        return
      }

      const setupIntent = result.setupIntent
      const paymentMethodId =
        typeof setupIntent?.payment_method === "string"
          ? setupIntent.payment_method
          : setupIntent?.payment_method?.id

      if (
        !setupIntent?.id ||
        !paymentMethodId ||
        setupIntent.status !== "succeeded"
      ) {
        reportCheckoutPaymentFailure({
          cart,
          paymentMode: "new_card",
          stage: "card_setup_incomplete",
          error: `SetupIntent status ${setupIntent?.status || "missing"}`,
          extra: {
            setup_intent_status: setupIntent?.status || null,
            has_setup_intent_id: Boolean(setupIntent?.id),
            has_payment_method_id: Boolean(paymentMethodId),
          },
        })
        setErrorMessage("Card setup did not complete. Please try again.")
        return
      }

      let orderResult: Awaited<
        ReturnType<typeof submitOrderWithSavedPaymentMethod>
      >
      try {
        orderResult = await submitOrderWithSavedPaymentMethod({
          paymentMethodId,
          setupIntentId: setupIntent.id,
          consentVersion: FINAL_CHARGE_CONSENT_VERSION,
          consentText: FINAL_CHARGE_CONSENT_TEXT,
        })
      } catch (err) {
        reportCheckoutPaymentFailure({
          cart,
          paymentMode: "new_card",
          stage: "order_submit_throw",
          error: err,
          extra: {
            has_setup_intent: true,
          },
        })
        throw err
      }

      if (orderResult?.error) {
        reportCheckoutPaymentFailure({
          cart,
          paymentMode: "new_card",
          stage: "order_submit_result",
          error: orderResult.error,
          extra: {
            has_setup_intent: true,
          },
        })
        setErrorMessage(orderResult.error)
      }
    } catch (err: any) {
      if (isExpectedNextRedirect(err)) return

      setErrorMessage(
        err?.message || "Could not place the order. Please try again."
      )
    } finally {
      submittingRef.current = false
      reportSubmitting(false)
    }
  }

  return (
    <>
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200/80 rounded-lg text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      <GoldButton
        disabled={disabled || notReady}
        onClick={handlePayment}
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Save Card & Place Order
      </GoldButton>
    </>
  )
}

const InvoicePaymentButton = ({
  cart,
  notReady,
  onSubmittingChange,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  onSubmittingChange?: (submitting: boolean) => void
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const submittingRef = useRef(false)

  // #283 (Codex round-3 P2): report submit state synchronously so the parent toggle locks.
  const reportSubmitting = (value: boolean) => {
    setSubmitting(value)
    onSubmittingChange?.(value)
  }

  const handlePayment = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    reportSubmitting(true)

    try {
      await verifyCartInventoryForCheckout(cart.id)
    } catch (err: any) {
      setErrorMessage(
        err.message || "Could not place the order. Please try again."
      )
      submittingRef.current = false
      reportSubmitting(false)
      return
    }

    try {
      const result = await submitOrderByInvoice({ cartId: cart.id })
      if (result?.error) {
        reportCheckoutPaymentFailure({
          cart,
          paymentMode: "invoice",
          stage: "invoice_submit_result",
          error: result.error,
        })
        setErrorMessage(result.error)
      }
    } catch (err: any) {
      if (isExpectedNextRedirect(err)) return

      reportCheckoutPaymentFailure({
        cart,
        paymentMode: "invoice",
        stage: "invoice_submit_throw",
        error: err,
      })
      setErrorMessage(
        err.message || "Could not place the order. Please try again."
      )
    } finally {
      submittingRef.current = false
      reportSubmitting(false)
    }
  }

  return (
    <>
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200/80 rounded-lg text-sm text-red-700">
          {errorMessage}
        </div>
      )}
      <GoldButton
        disabled={notReady}
        onClick={handlePayment}
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Place Order (Invoice)
      </GoldButton>
    </>
  )
}

export default PaymentButton
