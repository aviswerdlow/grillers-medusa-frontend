"use client"

import { convertToLocale, toMoneyAmount } from "@lib/util/money"
import React, { useState } from "react"
import { FreeShippingHelper } from "@modules/common/components/cart-helpers"
import { getItemsSubtotal } from "@lib/util/cart-totals"
import type { FulfillmentType } from "@lib/data/cart"

type CartTotalsProps = {
  totals: {
    total?: number | null
    subtotal?: number | null
    item_subtotal?: number | null
    item_total?: number | null
    tax_total?: number | null
    shipping_total?: number | null
    discount_total?: number | null
    gift_card_total?: number | null
    currency_code: string
    shipping_subtotal?: number | null
  }
  hasNetWeightItems?: boolean
  shipState?: string | null
  fulfillmentType?: FulfillmentType
  /**
   * Free-shipping-eligible subtotal (excludes SKUs flagged
   * `QualifiesForFreeDeliveryOffers = false`). When provided, the free-shipping
   * progress message uses this instead of the raw `subtotal` so excluded items
   * (bulk/institutional packs, large turkeys, etc.) don't advance the threshold
   * — issue #265. Falls back to `subtotal` when omitted.
   */
  freeShippingSubtotal?: number | null
  /** #266: Strapi-editable UPS free-shipping thresholds. Null → constants. */
  inRegionThreshold?: number | null
  nationalThreshold?: number | null
}

// Net-weight info tooltip component
const NetWeightTooltip = () => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="ml-1 text-Charcoal/50 hover:text-Charcoal transition-colors"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Learn about estimated pricing"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-Charcoal text-white text-xs rounded-lg shadow-lg">
          <p className="mb-2">
            <strong>Why estimated?</strong>
          </p>
          <p className="text-white/80">
            Some items in your cart are priced by weight. The final charge will
            be based on the actual weight when your order is fulfilled and may
            vary slightly.
          </p>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full">
            <div className="border-8 border-transparent border-t-Charcoal" />
          </div>
        </div>
      )}
    </div>
  )
}

const CartTotals: React.FC<CartTotalsProps> = ({
  totals,
  hasNetWeightItems = false,
  shipState,
  fulfillmentType,
  freeShippingSubtotal,
  inRegionThreshold,
  nationalThreshold,
}) => {
  const {
    currency_code,
    total,
    tax_total,
    discount_total,
    gift_card_total,
    shipping_total,
    shipping_subtotal,
  } = totals
  const shippingAmount =
    toMoneyAmount(shipping_total) ?? toMoneyAmount(shipping_subtotal) ?? 0
  const discountAmount = toMoneyAmount(discount_total) ?? 0
  const giftCardAmount = toMoneyAmount(gift_card_total) ?? 0
  const itemsSubtotal = getItemsSubtotal(totals)

  return (
    <div>
      <div className="flex flex-col gap-y-2 txt-medium text-ui-fg-subtle ">
        <FreeShippingHelper
          subtotal={freeShippingSubtotal ?? itemsSubtotal}
          currencyCode={currency_code}
          shipState={shipState}
          fulfillmentType={fulfillmentType}
          inRegionThreshold={inRegionThreshold}
          nationalThreshold={nationalThreshold}
          className="mb-1"
        />
        <div className="flex items-center justify-between">
          <span className="flex gap-x-1 items-center">
            Subtotal (excl. shipping and taxes)
          </span>
          <span data-testid="cart-subtotal" data-value={itemsSubtotal}>
            {convertToLocale({ amount: itemsSubtotal, currency_code })}
          </span>
        </div>
        {discountAmount > 0 && (
          <div className="flex items-center justify-between">
            <span>Discount</span>
            <span
              className="text-ui-fg-interactive"
              data-testid="cart-discount"
              data-value={discountAmount}
            >
              -{" "}
              {convertToLocale({ amount: discountAmount, currency_code })}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span>Shipping</span>
          <span data-testid="cart-shipping" data-value={shippingAmount}>
            {convertToLocale({ amount: shippingAmount, currency_code })}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="flex gap-x-1 items-center ">Taxes (estimated)</span>
          <span data-testid="cart-taxes" data-value={toMoneyAmount(tax_total) ?? 0}>
            {convertToLocale({ amount: tax_total ?? 0, currency_code })}
          </span>
        </div>
        {giftCardAmount > 0 && (
          <div className="flex items-center justify-between">
            <span>Gift card</span>
            <span
              className="text-ui-fg-interactive"
              data-testid="cart-gift-card-amount"
              data-value={giftCardAmount}
            >
              -{" "}
              {convertToLocale({ amount: giftCardAmount, currency_code })}
            </span>
          </div>
        )}
      </div>
      <div className="h-px w-full border-b border-gray-200 my-4" />
      <div className="flex items-center justify-between text-ui-fg-base mb-2 txt-medium ">
        <span className="flex items-center">
          {hasNetWeightItems ? "Estimated Total" : "Total"}
          {hasNetWeightItems && <NetWeightTooltip />}
        </span>
        <span
          className="txt-xlarge-plus"
          data-testid="cart-total"
          data-value={toMoneyAmount(total) ?? 0}
        >
          {convertToLocale({ amount: total ?? 0, currency_code })}
        </span>
      </div>

      {/* Net-weight disclaimer */}
      {hasNetWeightItems && (
        <div className="bg-Gold/10 border border-Gold/30 rounded-md p-3 mt-4">
          <p className="text-xs text-Charcoal/70 leading-relaxed">
            <strong className="text-Charcoal">Note:</strong> Your cart contains
            items priced by weight. The final charge will be based on actual
            product weights at fulfillment and may vary slightly from this
            estimate.
          </p>
        </div>
      )}

      <div className="h-px w-full border-b border-gray-200 mt-4" />
    </div>
  )
}

export default CartTotals
