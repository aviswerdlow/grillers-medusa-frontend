import { ATLANTA_DELIVERY_ZIP_DAYS } from "@lib/util/atlanta-delivery-zips"
import {
  FULFILLMENT_TO_SERVICE_CODES,
  SERVICE_CODE_TO_FULFILLMENT,
} from "@lib/config/shipping-mapping"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { normalizeDeliveryZip } from "@lib/util/delivery-zip"
import { isFulfillmentTypeRegionValid } from "@lib/util/fulfillment-eligibility"
import { normalizeFulfillmentAddress } from "@lib/util/fulfillment-address"
import type { FulfillmentType } from "@lib/data/cart"
import type { HttpTypes } from "@medusajs/types"
import { isFulfillmentSelectionSettled } from "@lib/checkout-payment-readiness"

type CheckoutFulfillmentInvariantInput = {
  cart: HttpTypes.StoreCart
  atlantaZipCodes?: string[] | null
  path?: string
  readiness: {
    addressComplete: boolean
    fulfillmentSelectionSettled: boolean
  }
}

type CheckoutFulfillmentInvariantPlan = {
  alertKind: string
  severity: "warn" | "page" | "info"
  title: string
  fingerprint: string
  meta: Record<string, unknown>
}

const DEFAULT_PATH = "src/modules/checkout/templates/checkout-form/index.tsx"

const VALID_FULFILLMENT_TYPES: FulfillmentType[] = [
  "ups_shipping",
  "atlanta_delivery",
  "plant_pickup",
  "southeast_pickup",
]

function fulfillmentTypeFromCart(
  cart: HttpTypes.StoreCart
): FulfillmentType | null {
  const raw = String(cart.metadata?.fulfillmentType || "").trim()
  return VALID_FULFILLMENT_TYPES.includes(raw as FulfillmentType)
    ? (raw as FulfillmentType)
    : null
}

function activeAtlantaZipCodes(codes?: string[] | null) {
  return codes?.length ? codes : Object.keys(ATLANTA_DELIVERY_ZIP_DAYS)
}

function shippingServiceCode(method: unknown): string | null {
  if (!method || typeof method !== "object") return null
  const record = method as Record<string, unknown>
  const data =
    record.data && typeof record.data === "object"
      ? (record.data as Record<string, unknown>)
      : {}
  const raw =
    data.service_code ||
    data.serviceCode ||
    record.service_code ||
    record.serviceCode ||
    record.name
  const value = String(raw || "").trim()
  return value || null
}

function normalizedServiceCode(value: string | null) {
  if (!value) return null
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
}

function selectedServiceCodes(cart: HttpTypes.StoreCart) {
  return (cart.shipping_methods || [])
    .map(shippingServiceCode)
    .map(normalizedServiceCode)
    .filter((value): value is string => Boolean(value))
}

function fulfillmentForServiceCode(
  code: string | null
): FulfillmentType | null {
  if (!code) return null
  return SERVICE_CODE_TO_FULFILLMENT[code] || null
}

function metadata(input: {
  cart: HttpTypes.StoreCart
  fulfillmentType: FulfillmentType
  shipZip: string
  serviceCodes: string[]
}) {
  return {
    checkout_surface: "checkout_form",
    cart_id: input.cart.id,
    fulfillment_type: input.fulfillmentType,
    ship_zip: input.shipZip || null,
    shipping_method_count: input.cart.shipping_methods?.length || 0,
    selected_shipping_service_codes: input.serviceCodes.slice(0, 4),
  }
}

export function buildCheckoutFulfillmentInvariantAlerts({
  cart,
  atlantaZipCodes,
  readiness,
}: CheckoutFulfillmentInvariantInput): CheckoutFulfillmentInvariantPlan[] {
  // Checkout writes fulfillment metadata, the address, and the shipping method
  // in separate server actions. Inspect only a customer-visible settled state;
  // the deliberate intermediate states are neither incidents nor actionable.
  if (
    !readiness.addressComplete ||
    !readiness.fulfillmentSelectionSettled ||
    !isFulfillmentSelectionSettled(cart)
  ) {
    return []
  }

  const fulfillmentType = fulfillmentTypeFromCart(cart)
  if (!fulfillmentType) return []

  const activeAddress = normalizeFulfillmentAddress(cart.shipping_address)
  const shipZip = normalizeDeliveryZip(activeAddress?.postal_code)
  const serviceCodes = selectedServiceCodes(cart)
  const plans: CheckoutFulfillmentInvariantPlan[] = []
  const baseMeta = metadata({ cart, fulfillmentType, shipZip, serviceCodes })

  if (
    shipZip.length === 5 &&
    !isFulfillmentTypeRegionValid(fulfillmentType, shipZip, {
      atlantaZipCodes: activeAtlantaZipCodes(atlantaZipCodes),
    })
  ) {
    plans.push({
      alertKind: "checkout_fulfillment_region_mismatch",
      severity: "warn",
      title: `Checkout fulfillment ${fulfillmentType} is invalid for ${shipZip}`,
      fingerprint: `checkout:fulfillment:region_mismatch:${fulfillmentType}`,
      meta: {
        ...baseMeta,
        invariant: "fulfillment_type_region_mismatch",
      },
    })
  }

  if (
    fulfillmentType !== "ups_shipping" &&
    (cart.shipping_methods?.length || 0) === 0
  ) {
    plans.push({
      alertKind: "checkout_fulfillment_shipping_method_missing",
      severity: "warn",
      title: `Checkout fulfillment ${fulfillmentType} has no attached shipping method`,
      fingerprint: `checkout:fulfillment:shipping_method_missing:${fulfillmentType}`,
      meta: {
        ...baseMeta,
        invariant: "non_ups_fulfillment_missing_shipping_method",
        expected_service_codes: FULFILLMENT_TO_SERVICE_CODES[fulfillmentType],
      },
    })
  }

  for (const serviceCode of serviceCodes) {
    const serviceFulfillment = fulfillmentForServiceCode(serviceCode)
    if (!serviceFulfillment || serviceFulfillment === fulfillmentType) continue

    plans.push({
      alertKind: "checkout_fulfillment_shipping_method_mismatch",
      severity: "warn",
      title: `Checkout fulfillment ${fulfillmentType} has ${serviceCode} shipping method`,
      fingerprint: `checkout:fulfillment:shipping_method_mismatch:${fulfillmentType}:${serviceFulfillment}`,
      meta: {
        ...baseMeta,
        invariant: "shipping_method_type_mismatch",
        mismatched_service_code: serviceCode,
        service_code_fulfillment_type: serviceFulfillment,
        expected_service_codes: FULFILLMENT_TO_SERVICE_CODES[fulfillmentType],
      },
    })
  }

  return plans
}

export async function emitCheckoutFulfillmentInvariantAlerts({
  path = DEFAULT_PATH,
  ...input
}: CheckoutFulfillmentInvariantInput) {
  const plans = buildCheckoutFulfillmentInvariantAlerts(input)
  await Promise.all(
    plans.map((plan) =>
      emitStorefrontOpsAlert({
        alertKind: plan.alertKind,
        severity: plan.severity,
        title: plan.title,
        path,
        source: "medusa-server",
        fingerprint: plan.fingerprint,
        meta: plan.meta,
      })
    )
  )

  return {
    emitted: plans.length,
    alertKinds: plans.map((plan) => plan.alertKind),
  }
}
