"use client"

import { formatCalendarDate, calendarWindowLabel } from "@lib/fulfillment-calendar"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { clearFulfillmentDetails, type FulfillmentType } from "@lib/data/cart"

type FulfillmentBannerProps = {
  cart: HttpTypes.StoreCart
}

const fulfillmentConfig: Record<
  FulfillmentType,
  {
    label: string
    description: string
    icon: React.ReactNode
  }
> = {
  plant_pickup: {
    label: "Plant Pickup",
    description: "Pick up your order at our Atlanta facility. Please bring a valid ID when collecting your order.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  atlanta_delivery: {
    label: "Local Delivery",
    description: "Fresh delivery to your door within the Atlanta metro area. You'll receive a text notification when your order is on its way.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
    ),
  },
  ups_shipping: {
    label: "UPS Shipping",
    description: "Nationwide delivery via UPS. Your order will be packed in insulated containers to ensure freshness.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  southeast_pickup: {
    label: "Regional Pickup",
    description: "Collect your order from one of our partner pickup locations across the Southeast. Check your confirmation email for location details.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
}

/**
 * Displays the selected fulfillment method at the top of checkout.
 * Professional gold banner with fulfillment details and option to change.
 */
export default function FulfillmentBanner({ cart }: FulfillmentBannerProps) {
  const router = useRouter()
  const [isChanging, setIsChanging] = useState(false)
  
  const fulfillmentType = cart.metadata?.fulfillmentType as FulfillmentType | undefined
  const scheduledDate = cart.metadata?.scheduledDate as string | undefined
  const requestedDeliveryDate = cart.metadata?.requestedDeliveryDate as
    | string
    | undefined
  const scheduledTimeWindow = calendarWindowLabel(cart.metadata)
  const pickupLocationId = cart.metadata?.pickupLocationId as string | undefined

  if (!fulfillmentType) {
    return null
  }

  const config = fulfillmentConfig[fulfillmentType]
  const isPickup = fulfillmentType === "plant_pickup" || fulfillmentType === "southeast_pickup"
  const displayDate =
    fulfillmentType === "ups_shipping" ? requestedDeliveryDate : scheduledDate

  const handleChange = async () => {
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
    <div className="bg-gradient-to-r from-Gold/20 to-Gold/10 border border-Gold/30 rounded-xl p-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-4">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-Gold text-white text-xs font-bold">
          1
        </span>
        <span className="text-sm font-medium text-Charcoal">Fulfillment Method</span>
        <svg className="w-4 h-4 text-green-600 ml-1" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="p-3 bg-Gold rounded-xl text-white shadow-sm">
            {config.icon}
          </div>
          
          {/* Details */}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-Charcoal mb-1">
              {config.label}
            </h3>
            
            {/* Schedule info */}
            {displayDate && (
              <div className="flex items-center gap-2 text-sm text-Charcoal/80 mb-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-medium">{formatCalendarDate(displayDate)}</span>
                {fulfillmentType !== "ups_shipping" && scheduledTimeWindow && (
                  <>
                    <span className="text-Charcoal/40">•</span>
                    <span>{scheduledTimeWindow}</span>
                  </>
                )}
              </div>
            )}
            
            {/* Description */}
            <p className="text-sm text-Charcoal/70 leading-relaxed max-w-md">
              {config.description}
            </p>
          </div>
        </div>

        {/* Change button */}
        <button
          type="button"
          onClick={handleChange}
          disabled={isChanging}
          className="flex items-center gap-1 text-sm text-Gold hover:text-Gold/80 font-medium whitespace-nowrap disabled:opacity-50"
        >
          {isChanging ? "..." : "Change"}
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
