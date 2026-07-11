import type { FulfillmentType } from "@lib/data/cart"
import { normalizeDeliveryZip } from "@lib/util/delivery-zip"
import { normalizeFulfillmentAddress } from "@lib/util/fulfillment-address"
import type { HttpTypes } from "@medusajs/types"

type FulfillmentAddress =
  | {
      address_1?: string | null
      address_2?: string | null
      city?: string | null
      province?: string | null
      postal_code?: string | null
      country_code?: string | null
    }
  | null
  | undefined

const ADDRESS_DEPENDENT_FULFILLMENT_TYPES = new Set<FulfillmentType>([
  "ups_shipping",
  "atlanta_delivery",
  "southeast_pickup",
])

const VALID_FULFILLMENT_TYPES = new Set<FulfillmentType>([
  "ups_shipping",
  "atlanta_delivery",
  "plant_pickup",
  "southeast_pickup",
])

function normalizedPart(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

/**
 * Only fields that can change fulfillment eligibility, serviceability, or a
 * carrier quote belong in this key. Names and phone numbers do not invalidate
 * a selected method.
 */
export function checkoutFulfillmentAddressKey(address: FulfillmentAddress) {
  const fixed = normalizeFulfillmentAddress(address)

  return [
    normalizedPart(fixed?.address_1),
    normalizedPart(fixed?.address_2),
    normalizedPart(fixed?.city),
    normalizedPart(fixed?.province),
    normalizeDeliveryZip(fixed?.postal_code),
    normalizedPart(fixed?.country_code),
  ].join("|")
}

export function fulfillmentAddressChanged(
  previous: FulfillmentAddress,
  next: FulfillmentAddress
) {
  return (
    checkoutFulfillmentAddressKey(previous) !==
    checkoutFulfillmentAddressKey(next)
  )
}

export function cartFulfillmentType(
  cart: Pick<HttpTypes.StoreCart, "metadata">
): FulfillmentType | null {
  const raw = String(cart.metadata?.fulfillmentType || "").trim()
  return VALID_FULFILLMENT_TYPES.has(raw as FulfillmentType)
    ? (raw as FulfillmentType)
    : null
}

export function shouldResetFulfillmentForAddressChange(
  cart: Pick<HttpTypes.StoreCart, "metadata" | "shipping_address">,
  nextAddress: FulfillmentAddress
) {
  const fulfillmentType = cartFulfillmentType(cart)
  if (
    !fulfillmentType ||
    !ADDRESS_DEPENDENT_FULFILLMENT_TYPES.has(fulfillmentType)
  ) {
    return false
  }

  return fulfillmentAddressChanged(cart.shipping_address, nextAddress)
}

export function planCheckoutAddressFulfillmentTransition(
  cart: Pick<HttpTypes.StoreCart, "metadata" | "shipping_address">,
  nextAddress: FulfillmentAddress
) {
  const currentFulfillmentType = cartFulfillmentType(cart)
  const reset = shouldResetFulfillmentForAddressChange(cart, nextAddress)

  return {
    reset,
    retainedFulfillmentType: reset ? null : currentFulfillmentType,
    metadata: reset ? clearedCheckoutFulfillmentMetadata() : undefined,
  }
}

/**
 * Medusa merges cart metadata updates, so every fulfillment-owned field must
 * be explicitly blanked. Keeping this list in one place prevents a stale date,
 * pickup location, or address-specific choice from surviving an address edit.
 */
export function clearedCheckoutFulfillmentMetadata() {
  return {
    fulfillmentType: "",
    fulfillmentZip: "",
    scheduledDate: "",
    requestedDeliveryDate: "",
    qbdDueDate: "",
    scheduledTimeWindow: "",
    pickupLocationId: "",
    pickupLocationName: "",
    pickupLocationCity: "",
    pickupLocationState: "",
    fulfillmentSelectionStatus: "",
  }
}
