"use server"

import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { getDeliveryZipCookie } from "@lib/data/delivery-zip"
import { getAtlantaDeliveryZipConfig } from "@lib/data/strapi/fulfillment"
import { getFreeShippingThresholds } from "@lib/data/strapi/checkout"
import type { FulfillmentType } from "@lib/util/free-shipping"
import type { AtlantaZipDayConfig } from "@lib/util/eligible-arrival-dates"
import { getAddressBookDeliveryZip } from "@lib/util/delivery-zip"
import { toMoneyAmount } from "@lib/util/money"
import { withTimeout } from "@lib/util/promise-timeout"
import {
  getExcludedFreeDeliverySubtotal,
  getFreeDeliveryEligibleSubtotal,
} from "@lib/util/free-delivery-eligibility"

export type CartConversionState = {
  subtotal: number
  cartSubtotal: number
  excludedSubtotal: number
  currencyCode: string
  itemCount: number
  fulfillmentType: FulfillmentType
  shipState: string | null
  postalCode: string | null
  atlantaZipConfig?: Record<string, AtlantaZipDayConfig>
  /** #266: Strapi-editable UPS free-shipping thresholds (null → constants), so
   * the PDP progress matches the cart/checkout/side-cart threshold. */
  inRegionThreshold?: number | null
  nationalThreshold?: number | null
}

export async function getCartConversionState(): Promise<CartConversionState> {
  const cart = await retrieveCart().catch(() => null)
  const [savedZip, atlantaZipConfig, customer, thresholds] =
    await Promise.all([
      getDeliveryZipCookie(),
      getAtlantaDeliveryZipConfig().catch(() => undefined),
      retrieveCustomer().catch(() => null),
      withTimeout(
        getFreeShippingThresholds().catch(() => ({
          inRegionThreshold: null,
          nationalThreshold: null,
        })),
        400,
        { inRegionThreshold: null, nationalThreshold: null },
        "cart conversion thresholds"
      ),
    ])
  const customerZip = getAddressBookDeliveryZip(customer?.addresses)
  const fallbackZip = savedZip || customerZip

  if (!cart) {
    return {
      subtotal: 0,
      cartSubtotal: 0,
      excludedSubtotal: 0,
      currencyCode: "usd",
      itemCount: 0,
      fulfillmentType: null,
      shipState: null,
      postalCode: fallbackZip || null,
      atlantaZipConfig,
      inRegionThreshold: thresholds.inRegionThreshold,
      nationalThreshold: thresholds.nationalThreshold,
    }
  }

  const metadata = (cart.metadata || {}) as Record<string, unknown>

  const eligibleSubtotal = getFreeDeliveryEligibleSubtotal(cart.items)
  const excludedSubtotal = getExcludedFreeDeliverySubtotal(cart.items)

  return {
    subtotal: eligibleSubtotal,
    cartSubtotal: toMoneyAmount(cart.subtotal) ?? eligibleSubtotal,
    excludedSubtotal,
    currencyCode: cart.currency_code || "usd",
    itemCount:
      cart.items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0,
    fulfillmentType:
      typeof metadata.fulfillmentType === "string"
        ? metadata.fulfillmentType
        : null,
    shipState: cart.shipping_address?.province || null,
    postalCode: cart.shipping_address?.postal_code || fallbackZip || null,
    atlantaZipConfig,
    inRegionThreshold: thresholds.inRegionThreshold,
    nationalThreshold: thresholds.nationalThreshold,
  }
}
