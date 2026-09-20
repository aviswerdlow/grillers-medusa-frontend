"use client"

import { formatCalendarDate, calendarWindowLabel } from "@lib/fulfillment-calendar"
import { HttpTypes } from "@medusajs/types"
import type { FulfillmentType } from "@lib/data/cart"

type FulfillmentDetailsProps = {
  order: HttpTypes.StoreOrder
  plantPickupNote?: string
}

const fulfillmentLabels: Record<FulfillmentType, string> = {
  plant_pickup: "Plant Pickup",
  atlanta_delivery: "Atlanta Delivery",
  ups_shipping: "UPS Shipping",
  southeast_pickup: "Southeast Pickup",
}

/**
 * Displays fulfillment details on the order confirmation page.
 * Shows different content based on the fulfillment type.
 */
export default function FulfillmentDetails({ order, plantPickupNote }: FulfillmentDetailsProps) {
  const fulfillmentType = order.metadata?.fulfillmentType as FulfillmentType | undefined
  const scheduledDate = order.metadata?.scheduledDate as string | undefined
  const requestedDeliveryDate = order.metadata?.requestedDeliveryDate as
    | string
    | undefined
  const timeWindow = calendarWindowLabel(order.metadata)
  const pickupLocationId = order.metadata?.pickupLocationId as string | undefined
  const orderNotes = order.metadata?.orderNotes as string | undefined

  if (!fulfillmentType) {
    return null
  }

  return (
    <div className="bg-Gold/10 border border-Gold/30 rounded-lg p-6 my-6">
      <h3 className="text-lg font-semibold mb-4 text-Charcoal">
        {fulfillmentLabels[fulfillmentType]}
      </h3>

      {fulfillmentType === "plant_pickup" && (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Pickup Date</p>
            <p className="font-medium">{formatCalendarDate(scheduledDate, "long")}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Location</p>
            <p className="font-medium">Grillers Pride Plant</p>
            <p className="text-sm text-gray-600">Atlanta, GA</p>
          </div>
          {plantPickupNote ? (
            <div className="bg-white/50 rounded p-3 mt-4">
              <p className="text-sm text-Charcoal">{plantPickupNote}</p>
            </div>
          ) : (
            <div className="bg-white/50 rounded p-3 mt-4">
              <p className="text-sm text-Charcoal">
                <strong>Important:</strong> Please bring your order confirmation
                email and a valid photo ID when picking up your order.
              </p>
            </div>
          )}
        </div>
      )}

      {fulfillmentType === "atlanta_delivery" && (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Delivery Date</p>
            <p className="font-medium">{formatCalendarDate(scheduledDate, "long")}</p>
          </div>
          <div className="bg-white/50 rounded p-3 mt-4">
            <p className="text-sm text-Charcoal">
              Our delivery driver will contact you via the phone number on your
              order when they are on their way. Please ensure someone is
              available to receive the delivery.
            </p>
          </div>
        </div>
      )}

      {fulfillmentType === "ups_shipping" && (
        <div className="space-y-3">
          {requestedDeliveryDate && (
            <div>
              <p className="text-sm text-gray-600">Requested Arrival</p>
              <p className="font-medium">{formatCalendarDate(requestedDeliveryDate, "long")}</p>
            </div>
          )}
          <div className="bg-white/50 rounded p-3 mt-4">
            <p className="text-sm text-Charcoal">
              Your order will be shipped via UPS. You will receive tracking
              information via email once your order has been shipped.
            </p>
            <p className="text-xs text-gray-500 mt-2">
              *Delivery dates are estimates and may vary based on shipping
              conditions.
            </p>
          </div>
        </div>
      )}

      {fulfillmentType === "southeast_pickup" && (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600">Pickup Date</p>
            <p className="font-medium">{formatCalendarDate(scheduledDate, "long")}</p>
          </div>
          {pickupLocationId && (
            <div>
              <p className="text-sm text-gray-600">Pickup Location</p>
              <p className="font-medium">
                Southeast Pickup Point #{pickupLocationId}
              </p>
            </div>
          )}
          <div className="bg-white/50 rounded p-3 mt-4">
            <p className="text-sm text-Charcoal">
              Please bring your order confirmation email to the pickup location.
              You will receive a reminder email with complete pickup details.
            </p>
          </div>
        </div>
      )}

      {timeWindow && fulfillmentType !== "ups_shipping" && (
        <div className="mt-3">
          <p className="text-sm text-gray-600">Time Window</p>
          <p className="font-medium">{timeWindow}</p>
        </div>
      )}

      {orderNotes && (
        <div className="mt-4 pt-4 border-t border-Gold/20">
          <p className="text-sm text-gray-600 mb-1">Order Notes</p>
          <p className="text-sm text-Charcoal">{orderNotes}</p>
        </div>
      )}
    </div>
  )
}
