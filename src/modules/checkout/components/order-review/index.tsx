"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  loadCheckoutReview,
  recoverReviewedCheckout,
} from "@lib/data/order-review"
import { getConsentCookie } from "@lib/utils/cookies"
import { FINAL_CHARGE_CONSENT_TEXT } from "@lib/order-review"
import { convertToLocale, toMoneyAmount } from "@lib/util/money"
import type {
  CheckoutReview,
  OrderAcceptance,
  ReviewedAddress,
  ReviewPaymentMode,
} from "@lib/order-review"

const modes: Record<string, string> = {
  ups_shipping: "Shipped to your address",
  plant_pickup: "Pickup at Griller’s Pride",
  atlanta_delivery: "Atlanta delivery",
  southeast_pickup: "Regional pickup",
}
const money = (value: unknown) =>
  convertToLocale({ amount: value, currency_code: "usd" })
const civilDate = (value: string): string | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null
  const date = new Date(value + "T12:00:00Z")
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return null
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}
function Address({ value }: { value: ReviewedAddress }) {
  return (
    <p className="text-sm leading-6 text-gray-700">
      {value.first_name} {value.last_name}
      <br />
      {value.company && (
        <>
          {value.company}
          <br />
        </>
      )}
      {value.address_1}
      {value.address_2 && <>, {value.address_2}</>}
      <br />
      {value.city}, {value.province} {value.postal_code}
    </p>
  )
}

/** Lives in the active payment step and staff card form, not the unused legacy
 * review component. Only IDs are submitted; the displayed review is server data. */
export default function CheckoutOrderReview({
  cart,
  paymentMode,
  disabled = false,
  staffPhone = false,
  onEditStaff,
  children,
}: {
  cart: any
  paymentMode: ReviewPaymentMode
  disabled?: boolean
  staffPhone?: boolean
  onEditStaff?: () => void
  children: (state: {
    acceptance: OrderAcceptance | null
    review: CheckoutReview | null
    invalidate: (message: string) => void
  }) => ReactNode
}) {
  const [state, setState] = useState<{
    review: CheckoutReview | null
    acceptance: OrderAcceptance | null
    error: string | null
    loading: boolean
  }>({ review: null, acceptance: null, error: null, loading: true })
  const [refresh, setRefresh] = useState(0)
  const sequence = useRef(0)
  const recoveryReceipt = useRef<OrderAcceptance | null>(null)
  const [recovering, setRecovering] = useState(false)
  const country = cart?.shipping_address?.country_code || "us"
  const identity = JSON.stringify([
    cart?.id,
    paymentMode,
    cart?.customer_id,
    cart?.email,
    cart?.total,
    cart?.shipping_total,
    cart?.tax_total,
    cart?.discount_total,
    cart?.shipping_address,
    cart?.billing_address,
    cart?.items?.map((i: any) => [
      i.id,
      i.variant_id,
      i.quantity,
      i.unit_price,
      i.total,
    ]),
    cart?.metadata?.gp_order_promise_snapshot_id,
    cart?.metadata?.fulfillmentCalendarQuoteId,
    cart?.metadata?.requestedDeliveryDate,
    cart?.metadata?.scheduledTimeWindow,
    cart?.shipping_methods,
  ])
  // Render-time identity check disables submission immediately, before effects
  // run, when an address/date/basket/payment-mode prop changes.
  const loadedIdentity = useRef("")
  useEffect(() => {
    const current = ++sequence.current
    let cancelled = false
    setState({ review: null, acceptance: null, error: null, loading: true })
    const consent = staffPhone ? null : getConsentCookie()?.analytics ?? null
    void loadCheckoutReview({
      cartId: cart.id,
      paymentMode,
      requestId: crypto.randomUUID(),
      analyticsConsent: consent,
      staffPhone,
    })
      .then((result) => {
        if (cancelled || current !== sequence.current) return
        loadedIdentity.current = identity
        if (
          result.review &&
          (!civilDate(result.review.fulfillment?.arrival_date) ||
            !Number.isFinite(Date.parse(result.review.expires_at)))
        ) {
          setState({
            review: null,
            acceptance: null,
            error:
              "The order date could not be confirmed. Refresh the review before placing this order.",
            loading: false,
          })
          return
        }
        const acceptance: OrderAcceptance | null = result.review
          ? {
              reviewId: result.review.id,
              requestId: crypto.randomUUID(),
              analyticsConsent: consent,
            }
          : result.legacy &&
            cart?.metadata?.gp_order_promise_snapshot_id == null
          ? { legacy: true, analyticsConsent: consent }
          : null
        if (acceptance && !acceptance.legacy)
          recoveryReceipt.current = acceptance
        else recoveryReceipt.current = null
        setState({
          review: result.review,
          acceptance,
          error: result.error,
          loading: false,
        })
      })
      .catch(() => {
        if (!cancelled && current === sequence.current)
          setState({
            review: null,
            acceptance: null,
            error: "We could not review the order. Please try again.",
            loading: false,
          })
      })
    return () => {
      cancelled = true
    }
  }, [identity, refresh, staffPhone])
  useEffect(() => {
    if (!state.review) return
    const timer = setTimeout(
      () =>
        setState((s) => ({
          ...s,
          acceptance: null,
          error:
            "This review expired. Check the current order before placing it.",
        })),
      Math.max(0, Date.parse(state.review.expires_at) - Date.now())
    )
    return () => clearTimeout(timer)
  }, [state.review])
  const invalidate = (message: string) =>
    setState((s) => ({ ...s, acceptance: null, error: message }))
  const review = state.review
  const acceptance =
    !disabled &&
    loadedIdentity.current === identity &&
    (state.acceptance?.legacy ||
      (review && Date.parse(review.expires_at) > Date.now()))
      ? state.acceptance
      : null
  const edit = (label: string, path: string) =>
    staffPhone ? (
      <button
        type="button"
        disabled={disabled}
        onClick={onEditStaff}
        className="text-sm underline underline-offset-4 disabled:opacity-50"
      >
        {label}
      </button>
    ) : disabled ? (
      <span className="text-sm text-gray-400">{label}</span>
    ) : (
      <a
        href={`/${country}/${path}`}
        className="text-sm underline underline-offset-4"
      >
        {label}
      </a>
    )
  return (
    <section
      aria-labelledby="order-review-title"
      className="space-y-5 text-Charcoal"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="order-review-title" className="text-xl font-semibold">
          Review your order
        </h3>
        {edit("Edit items", "cart")}
      </div>
      {state.loading && (
        <p role="status" className="text-sm text-gray-600">
          Checking your order details…
        </p>
      )}
      {state.error && (
        <div
          role="alert"
          className="border-l-2 border-red-600 pl-3 text-sm text-red-800"
        >
          <p>{state.error}</p>
          <button
            type="button"
            disabled={disabled || state.loading}
            onClick={() => setRefresh((n) => n + 1)}
            className="mt-2 min-h-[44px] underline"
          >
            Refresh order review
          </button>
        </div>
      )}
      {!staffPhone && state.error && recoveryReceipt.current && (
        <button
          type="button"
          disabled={disabled || recovering}
          className="min-h-[44px] text-left text-xs underline"
          onClick={async () => {
            setRecovering(true)
            try {
              const result = await recoverReviewedCheckout({
                cartId: cart.id,
                paymentMode,
                acceptance: recoveryReceipt.current!,
              })
              if (result.orderId)
                window.location.assign(
                  `/${country}/order/${encodeURIComponent(
                    result.orderId
                  )}/confirmed`
                )
              else
                invalidate(
                  result.error ||
                    "No completed order was confirmed. Refresh your review or contact the office."
                )
            } finally {
              setRecovering(false)
            }
          }}
        >
          Already tried to place this order? Check order status
        </button>
      )}
      {state.acceptance?.legacy && (
        <p className="text-sm leading-6">
          {paymentMode === "card"
            ? FINAL_CHARGE_CONSENT_TEXT
            : paymentMode === "card_at_placement"
            ? "The customer authorizes the card payment for the order total shown above."
            : "This order will be invoiced using your approved account terms. No card is charged at checkout."}
        </p>
      )}
      {(review || state.acceptance?.legacy) && (
        <p className="text-xs leading-5 text-gray-600">
          By placing this order,{" "}
          {staffPhone ? "confirm the customer's agreement" : "you agree"} to the{" "}
          <a
            href={`/${country}/page/terms-of-sale`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Terms of Sale
          </a>
          ,{" "}
          <a
            href={`/${country}/page/terms-of-use`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Terms of Use
          </a>{" "}
          and{" "}
          <a
            href={`/${country}/page/privacy-policy`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Privacy Policy
          </a>
          .
        </p>
      )}
      {review && (
        <>
          <div className="grid gap-5 border-y border-gray-200 py-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className="font-medium">
                  {modes[review.fulfillment.mode] || "Fulfillment"}
                </h4>
                {edit("Edit date", "checkout?step=delivery")}
              </div>
              <p className="text-sm text-gray-600">
                {review.fulfillment.service_label}
                {review.fulfillment.pickup_location
                  ? ` · ${review.fulfillment.pickup_location}`
                  : ""}
              </p>
              <p className="text-sm leading-6">
                {civilDate(review.fulfillment.arrival_date)}
                {review.fulfillment.window_label && (
                  <>
                    <br />
                    {review.fulfillment.window_label}
                  </>
                )}
              </p>
              {review.fulfillment.window_label && (
                <p className="text-xs text-gray-500">
                  Times in {review.fulfillment.timezone.replace(/_/g, " ")}
                </p>
              )}
              <div className="mt-3">
                {["ups_shipping", "atlanta_delivery"].includes(
                  review.fulfillment.mode
                ) ? (
                  <Address value={review.shipping_address} />
                ) : (
                  <p className="text-sm text-gray-600">
                    {review.fulfillment.pickup_location ||
                      review.fulfillment.service_label}
                  </p>
                )}
              </div>
              {edit("Edit address", "checkout?step=address")}
            </div>
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h4 className="font-medium">Billing address</h4>
                {edit("Edit billing", "checkout?step=address")}
              </div>
              <Address value={review.billing_address} />
              <h4 className="mt-3 font-medium">Order contact</h4>
              <p className="break-words text-sm leading-6">
                {review.contact.receipt_email}
                <br />
                {review.contact.phone}
              </p>
              {edit("Edit receipt email", "account/profile")}
            </div>
          </div>
          <ul className="divide-y divide-gray-200">
            {review.lines.map((line) => (
              <li key={line.id} className="flex justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {line.quantity} × {line.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-600">
                    {line.pricing_mode === "per_lb" ? (
                      <>
                        {money(line.rate_per_lb!)} per lb · about{" "}
                        {line.estimated_weight_lb} lb total. Final price follows
                        the packed food weight.
                      </>
                    ) : (
                      <>
                        {money(line.estimated_unit_price)} per item · fixed
                        price
                      </>
                    )}
                  </p>
                </div>
                <span className="shrink-0 text-sm tabular-nums">
                  {money(line.estimated_line_total)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t border-gray-200 pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Items</dt>
              <dd>{money(review.item_total)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Shipping / delivery</dt>
              <dd>{money(review.shipping_total)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-gray-600">
              <dt>Tax included</dt>
              <dd>{money(review.tax_total)}</dd>
            </div>
            {(toMoneyAmount(review.discount_total) ?? 0) > 0 && (
              <div className="flex justify-between gap-3 text-gray-600">
                <dt>Discounts included</dt>
                <dd>{money(review.discount_total)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 pt-2 text-lg font-semibold">
              <dt>
                {paymentMode === "card_at_placement"
                  ? "Payment total"
                  : "Estimated order total"}
              </dt>
              <dd>{money(review.placement_total)}</dd>
            </div>
          </dl>
          {review.shipping_policy && (
            <p className="text-sm leading-6 text-gray-600">
              {review.shipping_policy}
            </p>
          )}
          <p className="text-sm leading-6">
            {review.terms.payment_mode === "invoice"
              ? `Invoice terms: ${review.terms.invoice_terms}. No card is charged at checkout. The final food total is determined when packed.`
              : review.terms.consent_text}
          </p>
        </>
      )}
      {children({ acceptance, review, invalidate })}
    </section>
  )
}
