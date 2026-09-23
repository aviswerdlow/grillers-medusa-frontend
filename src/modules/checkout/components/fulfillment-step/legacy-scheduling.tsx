"use client"

import { useState } from "react"
import type { StoreCart } from "@medusajs/types"
import { setFulfillmentDetails, setShippingMethod, type FulfillmentType } from "@lib/data/cart"
import { findShippingOptionByType } from "@lib/data/fulfillment"
import type { FulfillmentConfigData } from "@lib/data/strapi/checkout"
import PlantPickupScheduling from "../fulfillment-selector/scheduling/plant-pickup"
import AtlantaDeliveryScheduling from "../fulfillment-selector/scheduling/atlanta-delivery"
import SoutheastPickupScheduling from "../fulfillment-selector/scheduling/southeast-pickup"

/** The pre-calendar scheduling controls, shown only after the server verifies
 * rollout compatibility. Each write repeats that check. */
export default function LegacyFulfillmentScheduling({
  cart, config, fulfillmentType, zip, state, locationId, onLocationChange, onBack, onSaved,
}: {
  cart: StoreCart
  config: FulfillmentConfigData["checkout"]
  fulfillmentType: Exclude<FulfillmentType, "ups_shipping">
  zip: string
  state: string
  locationId: string
  onLocationChange: (id: string) => void
  onBack: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState("")
  const [window, setWindow] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (saving || !date || (fulfillmentType === "atlanta_delivery" && !window)) return
    setSaving(true)
    setError(null)
    try {
      const location = config.SoutheastPickupLocations?.find((item) => item.id === locationId)
      const option = await findShippingOptionByType(cart.id, fulfillmentType)
      if (!option) throw new Error("This fulfillment option is unavailable. Please choose another option.")
      await setFulfillmentDetails({
        cartId: cart.id, fulfillmentType, fulfillmentZip: zip,
        scheduledDate: date, scheduledTimeWindow: window,
        ...(fulfillmentType === "southeast_pickup" ? {
          pickupLocationId: locationId, pickupLocationName: location?.Name,
          pickupLocationCity: location?.City, pickupLocationState: location?.State,
        } : {}),
      })
      await setShippingMethod({ cartId: cart.id, shippingMethodId: option.id })
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t save that date. Please try again.")
    } finally { setSaving(false) }
  }
  return <div className="space-y-4">
    {fulfillmentType === "plant_pickup" ? <PlantPickupScheduling
      config={config} selectedDate={date} onDateChange={setDate}
      onConfirm={save} onBack={onBack} isSubmitting={saving}
    /> : fulfillmentType === "atlanta_delivery" ? <>
      <AtlantaDeliveryScheduling config={config} selectedDate={date}
        selectedTimeWindow={window} onDateChange={setDate} onTimeWindowChange={setWindow}
        destinationZip={zip} atlantaZipConfig={config.AtlantaDeliveryZipDays} />
      <button type="button" className="min-h-[44px] w-full rounded-md bg-Gold p-3 disabled:opacity-50"
        onClick={save} disabled={saving || !date || !window}>
        {saving ? "Confirming…" : "Confirm delivery date"}
      </button>
    </> : <SoutheastPickupScheduling
      locations={config.SoutheastPickupLocations?.map((item) => ({ ...item, IsActive: true })) || []}
      preferredState={state} selectedLocationId={locationId} selectedDate={date}
      onLocationChange={onLocationChange} onDateChange={setDate}
      onConfirm={save} onBack={onBack} isSubmitting={saving}
    />}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>
}
