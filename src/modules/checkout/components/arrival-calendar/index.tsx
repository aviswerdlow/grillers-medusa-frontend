"use client"

import { useRouter } from "next/navigation"
import type { StoreCart, StoreCartShippingOption } from "@medusajs/types"
import type {
  AtlantaZipDayConfig,
  FulfillmentBlackouts,
} from "@lib/util/eligible-arrival-dates"
import FulfillmentCalendarPicker from "../fulfillment-calendar"
import LegacyArrivalCalendar from "./legacy-calendar"

// The server controls when the new calendar replaces existing scheduling.
export default function ArriveFoodCalendar({
  cart,
  setError,
  ...legacyProps
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
      legacyFallback={<LegacyArrivalCalendar cart={cart} setError={setError} {...legacyProps} />}
      onSaved={() => {
        setError(null)
        router.refresh()
      }}
    />
  )
}
