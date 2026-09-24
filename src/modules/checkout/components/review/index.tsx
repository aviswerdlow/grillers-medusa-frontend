"use client"

import Link from "next/link"

import { clx } from "@medusajs/ui"

import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"

// Net-weight final charge disclosure
const NetWeightDisclaimer = () => (
  <div className="bg-Gold/10 border border-Gold/20 rounded-lg p-4 mb-5">
    <div className="flex gap-3">
      <div className="shrink-0">
        <svg
          className="w-5 h-5 text-Gold"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 mb-1">
          About Your Order Total
        </p>
        <p className="text-sm text-gray-600 leading-relaxed">
          Your card is saved today. We charge the final total when your order is
          packed and ready to leave.{" "}
          <Link
            href="/page/catch-weight-pricing"
            className="text-Gold hover:text-Gold/80 underline"
          >
            Learn more
          </Link>
        </p>
      </div>
    </div>
  </div>
)

const Review = ({ cart }: { cart: any }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const previousStepsCompleted =
    cart.shipping_address &&
    cart.shipping_methods.length > 0 &&
    (cart.payment_collection || paidByGiftcard)

  // For now, assume all carts may contain net-weight items
  const hasNetWeightItems = true

  return (
    <div>
      {/* Step header */}
      <div className="flex items-center gap-3 mb-4">
        <span
          className={clx(
            "flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold",
            {
              "bg-Gold text-white": isOpen,
              "bg-gray-200 text-gray-400": !isOpen,
            }
          )}
        >
          4
        </span>
        <h2
          className={clx("text-lg font-semibold", {
            "text-gray-900": isOpen,
            "text-gray-400": !isOpen,
          })}
        >
          Review & Place Order
        </h2>
      </div>

      {isOpen && previousStepsCompleted && (
        <>
          {hasNetWeightItems && <NetWeightDisclaimer />}

          <p className="text-sm text-gray-500 mb-5 leading-relaxed">
            By clicking Place Order, you agree to our{" "}
            <Link href="/terms" className="text-Gold hover:underline">
              Terms of Use
            </Link>
            ,{" "}
            <Link href="/terms-of-sale" className="text-Gold hover:underline">
              Terms of Sale
            </Link>
            , and{" "}
            <Link href="/privacy" className="text-Gold hover:underline">
              Privacy Policy
            </Link>
            .
          </p>

          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review
