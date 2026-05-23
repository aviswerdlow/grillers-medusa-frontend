"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Heading } from "@medusajs/ui"

import CartTotals from "@modules/common/components/cart-totals"
import FulfillmentProgress from "@modules/common/components/fulfillment-progress"
import Divider from "@modules/common/components/divider"
import DiscountCode from "@modules/checkout/components/discount-code"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"
import { clearFulfillmentDetails, type FulfillmentType } from "@lib/data/cart"
import type { AtlantaZipDayConfig } from "@lib/util/eligible-arrival-dates"
import {
  getExcludedFreeDeliverySubtotal,
  getFreeDeliveryEligibleSubtotal,
} from "@lib/util/free-delivery-eligibility"

type SummaryProps = {
  cart: HttpTypes.StoreCart & {
    promotions: HttpTypes.StorePromotion[]
  }
  deliveryZip?: string | null
  atlantaZipConfig?: Record<string, AtlantaZipDayConfig>
}

/**
 * Formats the selected fulfillment type for display
 */
function formatFulfillmentType(type: FulfillmentType): string {
  const labels: Record<FulfillmentType, string> = {
    plant_pickup: "Plant Pickup",
    atlanta_delivery: "Atlanta Delivery",
    ups_shipping: "UPS Shipping",
    southeast_pickup: "Southeast Pickup",
  }
  return labels[type] || type
}

const Summary = ({ cart, deliveryZip, atlantaZipConfig }: SummaryProps) => {
  const router = useRouter()
  const [isChanging, setIsChanging] = useState(false)
  const eligibleSubtotal = getFreeDeliveryEligibleSubtotal(cart.items)
  const excludedSubtotal = getExcludedFreeDeliverySubtotal(cart.items)
  
  const fulfillmentType = cart.metadata?.fulfillmentType as FulfillmentType | undefined
  const scheduledDate = cart.metadata?.scheduledDate as string | undefined

  const handleChangeFulfillment = async () => {
    setIsChanging(true)
    try {
      await clearFulfillmentDetails(cart.id)
      router.refresh()
    } catch (error) {
      console.error("Failed to clear fulfillment:", error)
      setIsChanging(false)
    }
  }

  return (
    <div className="flex flex-col gap-y-4">
      <Heading level="h2" className="text-[2rem] leading-[2.75rem]">
        Summary
      </Heading>

      {/* Show selected fulfillment if chosen */}
      {fulfillmentType && (
        <div className="bg-Gold/10 border border-Gold/30 rounded-md p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-Charcoal">
                {formatFulfillmentType(fulfillmentType)}
              </p>
              {scheduledDate && (
                <p className="text-xs text-Charcoal/70">{scheduledDate}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleChangeFulfillment}
              disabled={isChanging}
              className="text-xs text-RichGold hover:text-RichGold/80 font-medium disabled:opacity-50"
            >
              {isChanging ? "..." : "Change"}
            </button>
          </div>
        </div>
      )}

      <DiscountCode cart={cart} />
      <FulfillmentProgress
        subtotal={eligibleSubtotal}
        cartSubtotal={cart.subtotal}
        excludedSubtotal={excludedSubtotal}
        currencyCode={cart.currency_code}
        fulfillmentType={fulfillmentType}
        shipState={cart.shipping_address?.province}
        postalCode={cart.shipping_address?.postal_code || deliveryZip}
        atlantaZipConfig={atlantaZipConfig}
        context="cart"
      />
      <Divider />
      <CartTotals
        totals={cart}
      />
      <LocalizedClientLink
        href="/checkout"
        data-testid="checkout-button"
      >
        <Button className="w-full h-10">
          {fulfillmentType ? "Go to checkout" : "Proceed to checkout"}
        </Button>
      </LocalizedClientLink>
    </div>
  )
}

export default Summary
