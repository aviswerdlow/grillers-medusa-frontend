"use client"

import { HttpTypes } from "@medusajs/types"
import { convertToLocale, toMoneyAmount } from "@lib/util/money"
import { getItemsSubtotal } from "@lib/util/cart-totals"
import { useProductFeaturedImageSrc } from "@lib/hooks/use-product-featured-image"
import { useProductTitle } from "@lib/hooks/use-product-title"
import DiscountCode from "@modules/checkout/components/discount-code"
import Thumbnail from "@modules/products/components/thumbnail"
import type { FulfillmentType } from "@lib/data/cart"
import FulfillmentProgress from "@modules/common/components/fulfillment-progress"
import type { AtlantaZipDayConfig } from "@lib/util/eligible-arrival-dates"
import {
  getExcludedFreeDeliverySubtotal,
  getFreeDeliveryEligibleSubtotal,
  getLineItemFreeDeliveryExclusionReason,
  isLineItemFreeDeliveryEligible,
} from "@lib/util/free-delivery-eligibility"
import type {
  CartProductDetails,
  CartProductDetailsMap,
} from "@lib/util/cart-product-details"
import { normalizeFulfillmentAddress } from "@lib/util/fulfillment-address"

type CheckoutSummaryProps = {
  cart: HttpTypes.StoreCart
  atlantaZipConfig?: Record<string, AtlantaZipDayConfig>
  productDetailsMap?: CartProductDetailsMap
  deliveryZip?: string | null
  /** #266: Strapi-editable UPS free-shipping thresholds. Null → constants. */
  inRegionThreshold?: number | null
  nationalThreshold?: number | null
}

// Item component that fetches Strapi image and title
const CheckoutItem = ({
  item,
  currencyCode,
  productDetails,
}: {
  item: HttpTypes.StoreCartLineItem
  currencyCode: string
  productDetails?: CartProductDetails
}) => {
  const productId = item.product_id || item?.product?.id
  const countsTowardFreeDelivery = isLineItemFreeDeliveryEligible(item)
  const exclusionReason = getLineItemFreeDeliveryExclusionReason(item)
  const metadata = (item.metadata || {}) as Record<string, unknown>
  const isSubstituted = Boolean(metadata.substitution_status)
  const originalProductName =
    typeof metadata.original_product_name === "string"
      ? metadata.original_product_name
      : null
  const substitutionNote =
    typeof metadata.substitution_note === "string"
      ? metadata.substitution_note
      : null
  const imgSrc = useProductFeaturedImageSrc(
    productId,
    item.thumbnail || "https://placehold.co/64x64",
    productDetails?.image
  )
  const title = useProductTitle(
    productId,
    item.product_title,
    productDetails?.title
  )

  return (
    <div className="flex gap-4">
      {/* Thumbnail with quantity badge */}
      <div className="relative flex-shrink-0">
        <div className="w-16 h-16 rounded-md overflow-hidden bg-gray-700">
          <Thumbnail thumbnail={imgSrc} size="square" imageSizes="64px" />
        </div>
        {/* Quantity badge */}
        <span className="absolute -top-2 -right-2 w-5 h-5 bg-gray-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
          {item.quantity}
        </span>
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white line-clamp-2">{title}</p>
        {isSubstituted && (
          <p className="mt-1 text-xs leading-snug text-gray-400">
            Substituted
            {originalProductName ? ` for ${originalProductName}` : ""}
            {substitutionNote ? `: ${substitutionNote}` : "."}
          </p>
        )}
        {!countsTowardFreeDelivery && (
          <p className="mt-1 text-xs leading-snug text-gray-400">
            Does not count toward free delivery
            {exclusionReason ? `: ${exclusionReason}` : "."}
          </p>
        )}
      </div>

      {/* Price */}
      <div className="flex-shrink-0 text-right">
        <p className="text-sm font-medium text-white">
          {convertToLocale({
            // Use unit_price * quantity — Medusa's `item.total` rolls in
            // promotion discounts (including shipping promos) and ends up
            // wrong on a free-shipping cart.
            amount: (toMoneyAmount(item.unit_price) ?? 0) * item.quantity,
            currency_code: currencyCode,
          })}
        </p>
      </div>
    </div>
  )
}

function isFreeShipPromoApplied(cart: HttpTypes.StoreCart): boolean {
  const FREE_SHIP_CODES = ["GP_FREESHIP_INREGION", "GP_FREESHIP_NATIONAL"]
  return Boolean(
    cart.promotions?.some((p) => p.code && FREE_SHIP_CODES.includes(p.code))
  )
}

const CheckoutSummary = ({
  cart,
  atlantaZipConfig,
  productDetailsMap = {},
  deliveryZip,
  inRegionThreshold,
  nationalThreshold,
}: CheckoutSummaryProps) => {
  const items = cart.items || []
  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0)
  const eligibleSubtotal = getFreeDeliveryEligibleSubtotal(items)
  const excludedSubtotal = getExcludedFreeDeliverySubtotal(items)

  // Check if this is a pickup order (no shipping needed)
  const fulfillmentType = cart.metadata?.fulfillmentType as
    | FulfillmentType
    | undefined
  const isPickup =
    fulfillmentType === "plant_pickup" || fulfillmentType === "southeast_pickup"
  const shippingAddress = normalizeFulfillmentAddress(cart.shipping_address)

  const freeShipApplied = isFreeShipPromoApplied(cart)
  const shippingSavings = Math.max(
    0,
    (toMoneyAmount(cart.shipping_subtotal) ?? 0) -
      (toMoneyAmount(cart.shipping_total) ?? 0)
  )
  // Show any non-shipping discount as its own line. Shipping savings are
  // already reflected in the struck-through Shipping line.
  const itemDiscount = Math.max(
    0,
    (toMoneyAmount(cart.discount_total) ?? 0) - shippingSavings
  )
  // Trust Medusa's cart.total — that's what Stripe will charge. The line
  // items themselves are post-discount, so showing the same number here
  // keeps the math internally consistent for the customer.
  const displayTotal = (cart as any).total ?? 0

  return (
    <div className="small:sticky small:top-24 small:max-h-[calc(100vh-8rem)] small:overflow-y-auto">
      {/* Header */}
      <h2 className="text-xl font-semibold text-white mb-6">
        Order Summary
        <span className="ml-2 text-sm font-normal text-gray-400">
          ({totalItems} {totalItems === 1 ? "item" : "items"})
        </span>
      </h2>

      {/* Promo Code first — keeps it visible above the fold so customers
          can apply a code before scanning the line items. */}
      <div className="pb-6 border-b border-gray-700">
        <DiscountCode cart={cart as any} variant="dark" />
      </div>

      {/* Items */}
      <div className="space-y-4 py-6 border-b border-gray-700">
        {items
          .sort((a, b) =>
            (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
          )
          .map((item) => (
            <CheckoutItem
              key={item.id}
              item={item}
              currencyCode={cart.currency_code}
              productDetails={
                productDetailsMap[item.product_id || item.product?.id || ""]
              }
            />
          ))}
      </div>

      {/* Cost breakdown */}
      <div className="space-y-3 pb-6 border-b border-gray-700">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Subtotal</span>
          <span className="text-white">
            {convertToLocale({
              amount: getItemsSubtotal(cart),
              currency_code: cart.currency_code,
            })}
          </span>
        </div>

        <FulfillmentProgress
          subtotal={eligibleSubtotal}
          cartSubtotal={getItemsSubtotal(cart)}
          excludedSubtotal={excludedSubtotal}
          currencyCode={cart.currency_code}
          shipState={shippingAddress?.province}
          postalCode={shippingAddress?.postal_code || deliveryZip}
          fulfillmentType={fulfillmentType}
          variant="dark"
          atlantaZipConfig={atlantaZipConfig}
          inRegionThreshold={inRegionThreshold}
          nationalThreshold={nationalThreshold}
        />

        {/* Shipping line. When the free-shipping promo is on the cart, show
            the original rate struck through with a "FREE" pill so the
            customer can see exactly what we saved them. */}
        {!isPickup && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Shipping</span>
            {freeShipApplied && shippingSavings > 0 ? (
              <span className="flex items-center gap-2">
                <span className="text-xs text-gray-500 line-through">
                  {convertToLocale({
                    amount: cart.shipping_subtotal ?? shippingSavings,
                    currency_code: cart.currency_code,
                  })}
                </span>
                <span className="inline-flex items-center text-emerald-300 bg-emerald-900/40 border border-emerald-500/30 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  Free
                </span>
              </span>
            ) : (
              <span className="text-gray-300">
                {cart.shipping_total != null
                  ? convertToLocale({
                      amount: cart.shipping_total,
                      currency_code: cart.currency_code,
                    })
                  : "Calculated at checkout"}
              </span>
            )}
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Taxes (estimated)</span>
          <span className="text-white">
            {convertToLocale({
              amount: cart.tax_total ?? 0,
              currency_code: cart.currency_code,
            })}
          </span>
        </div>

        {itemDiscount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">
              {fulfillmentType === "plant_pickup" ||
              fulfillmentType === "southeast_pickup"
                ? "Pickup Credit"
                : "Discount"}
            </span>
            <span className="text-green-400">
              -
              {convertToLocale({
                amount: itemDiscount,
                currency_code: cart.currency_code,
              })}
            </span>
          </div>
        )}
      </div>

      {/* Total — recomputed locally so the Medusa free-shipping
          double-count (it subtracts discount_total even when shipping_total
          is already $0) doesn't reach the customer. */}
      <div className="flex justify-between py-4">
        <span className="text-lg font-semibold text-white">Total</span>
        <span className="text-lg font-semibold text-white">
          {convertToLocale({
            amount: displayTotal,
            currency_code: cart.currency_code,
          })}
        </span>
      </div>
    </div>
  )
}

export default CheckoutSummary
