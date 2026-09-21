import { cookies as nextCookies } from "next/headers"
import { HttpTypes } from "@medusajs/types"
import { convertToLocale } from "@lib/util/money"
import { formatPhone, stripPhone } from "@lib/util/format-phone"

import OnboardingCta from "@modules/order/components/onboarding-cta"
import OrderItems from "@modules/order/components/items"
import FulfillmentDetails from "@modules/order/components/fulfillment-details"
import type { FulfillmentType } from "@lib/data/cart"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type OrderCompletedTemplateProps = {
  order: HttpTypes.StoreOrder
  plantPickupNote?: string
}

export default async function OrderCompletedTemplate({
  order,
  plantPickupNote,
}: OrderCompletedTemplateProps) {
  const cookies = await nextCookies()
  const isOnboarding = cookies.get("_medusa_onboarding")?.value === "true"

  const payment = order.payment_collections?.[0]?.payments?.[0]
  const shippingMethod = order.shipping_methods?.[0]
  const fulfillmentType = order.metadata?.fulfillmentType as FulfillmentType | undefined
  const isPickup =
    fulfillmentType === "plant_pickup" || fulfillmentType === "southeast_pickup"
  const addressCardTitle = isPickup
    ? "Pickup Contact"
    : fulfillmentType === "atlanta_delivery"
      ? "Delivery Address"
      : "Shipping Address"

  const firstName = order.shipping_address?.first_name || "there"

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#FAFAF8]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {isOnboarding && <OnboardingCta orderId={order.id} />}

        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-5">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-rexton font-bold text-Charcoal uppercase tracking-wide mb-2">
            Order Confirmed
          </h1>
          <p className="text-lg font-maison-neue text-Charcoal/70">
            Thank you, {firstName}!
          </p>
          <p className="text-sm font-maison-neue text-Charcoal/50 mt-1">
            Order #{order.display_id} &middot;{" "}
            {new Date(order.created_at).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
          <p className="text-sm font-maison-neue text-Charcoal/50 mt-2">
            A confirmation has been sent to{" "}
            <span className="font-semibold text-Charcoal/70">{order.email}</span>
          </p>
        </div>

        {/* Fulfillment details */}
        <FulfillmentDetails order={order} plantPickupNote={plantPickupNote} />

        {/* Items card */}
        <div className="bg-white rounded-xl border border-Charcoal/10 shadow-sm mb-6 overflow-hidden">
          <div className="px-6 py-4 border-b border-Charcoal/10">
            <h2 className="text-sm font-maison-neue-mono uppercase tracking-wider text-Charcoal/60">
              Items Ordered
            </h2>
          </div>
          <OrderItems order={order} />
        </div>

        {/* Two-column: Delivery + Payment */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          {/* Delivery card */}
          <div className="bg-white rounded-xl border border-Charcoal/10 shadow-sm p-6">
            <h3 className="text-sm font-maison-neue-mono uppercase tracking-wider text-Charcoal/60 mb-4">
              {addressCardTitle}
            </h3>
            <div className="space-y-1 text-sm font-maison-neue text-Charcoal">
              <p className="font-semibold">
                {order.shipping_address?.first_name}{" "}
                {order.shipping_address?.last_name}
              </p>
              <p>{order.shipping_address?.address_1}</p>
              {order.shipping_address?.address_2 && (
                <p>{order.shipping_address.address_2}</p>
              )}
              <p>
                {order.shipping_address?.city},{" "}
                {order.shipping_address?.province}{" "}
                {order.shipping_address?.postal_code}
              </p>
            </div>

            {(order.shipping_address?.phone || order.email) && (
              <div className="mt-4 pt-4 border-t border-Charcoal/10 space-y-1 text-sm font-maison-neue text-Charcoal/70">
                {order.shipping_address?.phone && (
                  <p>{formatPhone(stripPhone(order.shipping_address.phone))}</p>
                )}
                <p>{order.email}</p>
              </div>
            )}

            {shippingMethod && (
              <div className="mt-4 pt-4 border-t border-Charcoal/10">
                <p className="text-xs font-maison-neue-mono uppercase tracking-wider text-Charcoal/50 mb-1">
                  Method
                </p>
                <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                  {shippingMethod.name}
                </p>
                <p className="text-sm font-maison-neue text-Charcoal/60">
                  {convertToLocale({
                    amount: shippingMethod.total ?? 0,
                    currency_code: order.currency_code,
                  })}
                </p>
              </div>
            )}
          </div>

          {/* Payment card */}
          <div className="bg-white rounded-xl border border-Charcoal/10 shadow-sm p-6">
            <h3 className="text-sm font-maison-neue-mono uppercase tracking-wider text-Charcoal/60 mb-4">
              Payment
            </h3>
            {payment && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-7 bg-Charcoal/5 rounded">
                    <svg className="w-6 h-4 text-Charcoal/60" viewBox="0 0 24 16" fill="currentColor">
                      <rect width="24" height="16" rx="2" fill="currentColor" opacity="0.1" />
                      <rect x="2" y="4" width="8" height="2" rx="1" fill="currentColor" opacity="0.3" />
                      <rect x="2" y="8" width="5" height="1.5" rx="0.75" fill="currentColor" opacity="0.2" />
                      <rect x="14" y="10" width="8" height="2" rx="1" fill="currentColor" opacity="0.3" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                      {(payment as any).data?.card_last4
                        ? `Card ending in ${(payment as any).data.card_last4}`
                        : "Credit Card"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Order totals */}
            <div className="mt-5 pt-4 border-t border-Charcoal/10 space-y-2 text-sm font-maison-neue">
              <div className="flex justify-between text-Charcoal/70">
                <span>Subtotal</span>
                <span>
                  {convertToLocale({
                    amount: order.subtotal ?? 0,
                    currency_code: order.currency_code,
                  })}
                </span>
              </div>
              {(order.discount_total ?? 0) > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>
                    -
                    {convertToLocale({
                      amount: order.discount_total ?? 0,
                      currency_code: order.currency_code,
                    })}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-Charcoal/70">
                <span>Shipping</span>
                <span>
                  {convertToLocale({
                    amount: order.shipping_total ?? 0,
                    currency_code: order.currency_code,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-Charcoal/70">
                <span>Taxes (estimated)</span>
                <span>
                  {convertToLocale({
                    amount: order.tax_total ?? 0,
                    currency_code: order.currency_code,
                  })}
                </span>
              </div>
              <div className="flex justify-between font-bold text-Charcoal pt-2 border-t border-Charcoal/10 text-base">
                <span>Total</span>
                <span>
                  {convertToLocale({
                    amount: order.total ?? 0,
                    currency_code: order.currency_code,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Help / CTA */}
        <div className="text-center mt-10">
          <p className="text-sm font-maison-neue text-Charcoal/50 mb-4">
            Questions about your order? <LocalizedClientLink href="/contact" className="text-Gold hover:underline font-semibold">Contact us</LocalizedClientLink>
          </p>
          <LocalizedClientLink
            href="/store"
            className="inline-block px-8 py-3 rounded-[5px] border border-Charcoal bg-Gold text-Charcoal font-rexton text-sm font-bold uppercase tracking-wide text-center transition-opacity hover:opacity-90"
          >
            Continue Shopping
          </LocalizedClientLink>
        </div>
      </div>
    </div>
  )
}
