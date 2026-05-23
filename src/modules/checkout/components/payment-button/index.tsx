"use client"

import { isStripe } from "@lib/constants"
import { placeOrder } from "@lib/data/cart"
import { jitsuTrack } from "@lib/jitsu"
import { HttpTypes } from "@medusajs/types"
import { useElements, useStripe } from "@stripe/react-stripe-js"
import React, { useRef, useState } from "react"
import Spinner from "@modules/common/icons/spinner"

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
  savedPaymentMethodId?: string | null
  "data-testid": string
}

const PaymentButton: React.FC<PaymentButtonProps> = ({
  cart,
  cardComplete = false,
  savedPaymentMethodId,
  "data-testid": dataTestId,
}) => {
  // All fulfillment types (including pickup) now set a shipping method on the cart
  const notReady =
    !cart ||
    !cart.shipping_address ||
    !cart.billing_address ||
    !cart.email ||
    (cart.shipping_methods?.length ?? 0) < 1

  const paymentSession = cart.payment_collection?.payment_sessions?.find(
    (session) => session.status === "pending" && isStripe(session.provider_id)
  )

  switch (true) {
    case isStripe(paymentSession?.provider_id):
      return (
        <StripePaymentButton
          notReady={notReady}
          cart={cart}
          cardComplete={cardComplete}
          savedPaymentMethodId={savedPaymentMethodId}
          data-testid={dataTestId}
        />
      )
    default:
      return <GoldButton disabled>Select a payment method</GoldButton>
  }
}

const StripePaymentButton = ({
  cart,
  notReady,
  cardComplete = false,
  savedPaymentMethodId,
  "data-testid": dataTestId,
}: {
  cart: HttpTypes.StoreCart
  notReady: boolean
  cardComplete?: boolean
  savedPaymentMethodId?: string | null
  "data-testid"?: string
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const submittingRef = useRef(false)

  const onPaymentCompleted = async () => {
    await placeOrder()
      .catch((err) => {
        setErrorMessage(err.message)
      })
      .finally(() => {
        submittingRef.current = false
        setSubmitting(false)
      })
  }

  const stripe = useStripe()
  const elements = useElements()
  const card = elements?.getElement("card")

  const session = cart.payment_collection?.payment_sessions?.find(
    (s) => s.status === "pending"
  )

  const disabled = savedPaymentMethodId
    ? !stripe
    : !stripe || !elements || !card || !cardComplete

  const handlePayment = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)

    if (!stripe || !cart || (!savedPaymentMethodId && (!elements || !card))) {
      submittingRef.current = false
      setSubmitting(false)
      return
    }

    const paymentMethod = savedPaymentMethodId
      ? savedPaymentMethodId
      : {
          card: card!,
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
        }

    await stripe
      .confirmCardPayment(session?.data.client_secret as string, {
        payment_method: paymentMethod,
      })
      .then(({ error, paymentIntent }) => {
        if (error) {
          const pi = error.payment_intent

          if (
            (pi && pi.status === "requires_capture") ||
            (pi && pi.status === "succeeded")
          ) {
            onPaymentCompleted()
          } else {
            jitsuTrack("payment_failed", {
              cart_id: cart.id,
              error_message: error.message,
              error_code: error.code,
              payment_type: "stripe_card",
              value: (cart.total || 0) / 100,
              currency: cart.currency_code?.toUpperCase() || "USD",
            })
          }

          setErrorMessage(error.message || null)
          return
        }

        if (
          (paymentIntent && paymentIntent.status === "requires_capture") ||
          paymentIntent.status === "succeeded"
        ) {
          return onPaymentCompleted()
        }

        return
      })
  }

  return (
    <>
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200/80 rounded-lg text-sm text-red-700">
          {errorMessage}. Please verify your payment details and try again.
        </div>
      )}
      <GoldButton
        disabled={disabled || notReady}
        onClick={handlePayment}
        isLoading={submitting}
        data-testid={dataTestId}
      >
        Complete Purchase
      </GoldButton>
    </>
  )
}

export default PaymentButton
