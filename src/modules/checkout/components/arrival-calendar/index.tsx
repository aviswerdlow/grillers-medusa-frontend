"use client"

import { useRouter } from "next/navigation"
import type { StoreCart, StoreCartShippingOption } from "@medusajs/types"
import type {
  AtlantaZipDayConfig,
  FulfillmentBlackouts,
} from "@lib/util/eligible-arrival-dates"
import FulfillmentCalendarPicker from "../fulfillment-calendar"

// Keep the checkout parent contract while retiring browser-side date rules.
export default function ArriveFoodCalendar({
  cart,
  setError,
}: {
  cart: StoreCart
  setError: (error: string | null) => void
  availableShippingMethods?: StoreCartShippingOption[] | null
  serverNowIso?: string
  atlantaZipConfig?: Record<string, AtlantaZipDayConfig>
  fulfillmentBlackouts?: FulfillmentBlackouts
}) {
  const router = useRouter()
  const optionId = cart.shipping_methods?.at(-1)?.shipping_option_id
  if (!optionId)
    return (
      <p className="text-sm">
        Choose a shipping service to see available arrival dates.
      </p>
    )
  return (
    <FulfillmentCalendarPicker
      cart={cart}
      fulfillmentType="ups_shipping"
      shippingOptionId={optionId}
      onSaved={() => {
        setError(null)
        router.refresh()
      }}
    />
  )
}
