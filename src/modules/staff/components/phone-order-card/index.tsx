"use client"

import { useEffect, useRef, useState } from "react"
import { CardElement, useElements, useStripe } from "@stripe/react-stripe-js"
import CheckoutOrderReview from "@modules/checkout/components/order-review"
import { acceptCheckoutReview } from "@lib/data/order-review"
import type { OrderAcceptance } from "@lib/order-review"
import Button from "@modules/common/components/button"
import {
  completeStaffPhoneOrder,
  verifyStaffPhoneOrderForPayment,
  type StaffPrepareOrderResult,
  type StaffCompleteOrderResult,
  type StaffAddressInput,
} from "@lib/data/staff/order-entry"

export default function StaffChargeCard({
  result,
  billingAddress,
  onComplete,
  onReviewRequired,
}: {
  result: StaffPrepareOrderResult
  billingAddress: StaffAddressInput
  onComplete: (result: StaffCompleteOrderResult) => void
  onReviewRequired: (message: string) => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [cardComplete, setCardComplete] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const [isCharging, setIsCharging] = useState(false)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [confirmationPending, setConfirmationPending] = useState(false)
  const acceptedPayment = useRef<OrderAcceptance | null>(null)
  const busy = useRef(false)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  async function chargeCard(
    acceptance: OrderAcceptance,
    invalidate: (message: string) => void
  ) {
    if (busy.current || paymentConfirmed) return
    if (!stripe || !elements || !result.paymentClientSecret || !result.cartId) {
      setCardError("Payment form is not ready.")
      return
    }

    const card = elements.getElement(CardElement)
    if (!card) {
      setCardError("Card field is not ready.")
      return
    }

    busy.current = true
    setIsCharging(true)
    setCardError(null)
    let confirmed = false
    try {
      const review = await verifyStaffPhoneOrderForPayment(result.cartId!)
      if (!active.current) return
      if (!review.ok) {
        onReviewRequired(
          review.error || "Confirm the order date and inventory before payment."
        )
        return
      }
      const accepted = await acceptCheckoutReview({
        cartId: result.cartId!,
        paymentMode: "card_at_placement",
        acceptance,
        staffPhone: true,
      })
      if (accepted.error) {
        invalidate(accepted.error)
        return
      }
      if (!active.current) return
      const payment = await stripe.confirmCardPayment(
        result.paymentClientSecret!,
        {
          payment_method: {
            card,
            billing_details: {
              name: [billingAddress.firstName, billingAddress.lastName]
                .filter(Boolean)
                .join(" "),
              email: result.cart?.email || undefined,
              phone: billingAddress.phone || undefined,
              address: {
                line1: billingAddress.address1 || undefined,
                line2: billingAddress.address2 || undefined,
                city: billingAddress.city || undefined,
                state: billingAddress.province || undefined,
                postal_code: billingAddress.postalCode || undefined,
                country: billingAddress.countryCode || undefined,
              },
            },
          },
        }
      )

      if (payment.error) {
        setCardError(
          payment.error.message || "Stripe could not authorize the card."
        )
        return
      }

      if (
        !payment.paymentIntent ||
        !["succeeded", "requires_capture"].includes(
          payment.paymentIntent.status
        )
      ) {
        setCardError(
          "The card payment has not been confirmed. Check its status before trying another payment."
        )
        return
      }
      confirmed = true
      acceptedPayment.current = acceptance
      setPaymentConfirmed(true)
      setConfirmationPending(true)
      const completion = await completeStaffPhoneOrder(
        result.cartId!,
        acceptance
      )
      setConfirmationPending(!completion.ok)
      onComplete(
        completion.ok
          ? completion
          : {
              ...completion,
              error: `Card payment was confirmed, but the order could not be confirmed. Check order support before taking any further payment. ${
                completion.error || ""
              }`,
            }
      )
    } catch (error) {
      setCardError(
        confirmed
          ? "Card payment was confirmed. Check order support before taking any further payment."
          : error instanceof Error
          ? error.message
          : "Payment could not be confirmed. Review the order before trying again."
      )
    } finally {
      busy.current = false
      setIsCharging(false)
    }
  }

  return (
    <div className="mt-4 rounded-md border border-Gold/35 bg-Gold/10 p-4">
      <p className="mb-2 text-sm font-maison-neue font-semibold text-Charcoal">
        Card collection
      </p>
      <CheckoutOrderReview
        cart={result.cart}
        paymentMode="card_at_placement"
        staffPhone
        disabled={isCharging || paymentConfirmed}
        onEditStaff={() =>
          onReviewRequired(
            "Review the order details before preparing payment again."
          )
        }
      >
        {({ acceptance, invalidate }) => (
          <>
            <div className="rounded-md border border-gray-200 bg-white px-3 py-3">
              <CardElement
                onChange={(event) => {
                  setCardComplete(event.complete)
                  setCardError(event.error?.message || null)
                }}
              />
            </div>
            {cardError && (
              <p
                role="alert"
                className="mt-2 text-sm font-maison-neue text-red-700"
              >
                {cardError}
              </p>
            )}
            <Button
              className="mt-3 min-h-[44px] w-full rounded-md bg-Charcoal px-4 text-sm font-rexton font-bold uppercase text-white"
              disabled={
                !acceptance || !cardComplete || isCharging || paymentConfirmed
              }
              isLoading={isCharging}
              onClick={() => {
                if (acceptance) void chargeCard(acceptance, invalidate)
              }}
              type="button"
            >
              Charge Card and Place Order
            </Button>
          </>
        )}
      </CheckoutOrderReview>
      {confirmationPending && (
        <Button
          type="button"
          disabled={isCharging}
          onClick={async () => {
            if (busy.current || !acceptedPayment.current) return
            busy.current = true
            setIsCharging(true)
            try {
              const completion = await completeStaffPhoneOrder(
                result.cartId!,
                acceptedPayment.current
              )
              setConfirmationPending(!completion.ok)
              onComplete(completion)
            } finally {
              busy.current = false
              setIsCharging(false)
            }
          }}
        >
          Retry order confirmation — payment already confirmed
        </Button>
      )}
    </div>
  )
}
