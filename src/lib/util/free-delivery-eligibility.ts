import type { HttpTypes } from "@medusajs/types"
import { toMoneyAmount } from "./money"

export const FREE_DELIVERY_ELIGIBLE_METADATA_KEY = "free_delivery_eligible"
export const FREE_DELIVERY_EXCLUSION_REASON_METADATA_KEY =
  "free_delivery_exclusion_reason"

type CartLine = Pick<
  HttpTypes.StoreCartLineItem,
  "metadata" | "subtotal" | "unit_price" | "quantity"
>

export type ProductFreeDeliveryEligibility = {
  qualifies: boolean
  reason?: string | null
}

export type FreeDeliveryProductLike = {
  Metadata?: {
    QualifiesForFreeDeliveryOffers?: boolean | null
    FreeDeliveryExclusionReason?: string | null
  } | null
  MedusaProduct?: {
    Variants?: Array<{
      Sku?: string | null
      QualifiesForFreeDeliveryOffers?: boolean | null
      FreeDeliveryExclusionReason?: string | null
    }> | null
  } | null
}

function isExplicitFalse(value: unknown): boolean {
  if (value === false || value === 0) return true
  if (typeof value !== "string") return false
  return ["false", "0", "no", "off"].includes(value.trim().toLowerCase())
}

export function isLineItemFreeDeliveryEligible(item: CartLine): boolean {
  return !isExplicitFalse(
    item.metadata?.[FREE_DELIVERY_ELIGIBLE_METADATA_KEY]
  )
}

export function getLineItemFreeDeliveryExclusionReason(
  item: Pick<HttpTypes.StoreCartLineItem, "metadata">
): string | null {
  const reason =
    item.metadata?.[FREE_DELIVERY_EXCLUSION_REASON_METADATA_KEY]
  return typeof reason === "string" && reason.trim() ? reason.trim() : null
}

export function getLineItemSubtotal(item: CartLine): number {
  const explicit = toMoneyAmount(item.subtotal)
  if (explicit !== null && explicit >= 0) return explicit

  const unit = toMoneyAmount(item.unit_price)
  const quantity = Number(item.quantity)
  if (unit === null || !Number.isFinite(quantity)) return 0
  return Math.max(0, unit * quantity)
}

export function getFreeDeliveryEligibleSubtotal(
  items?: CartLine[] | null
): number {
  return (items || []).reduce((sum, item) => {
    if (!isLineItemFreeDeliveryEligible(item)) return sum
    return sum + getLineItemSubtotal(item)
  }, 0)
}

export function getExcludedFreeDeliverySubtotal(
  items?: CartLine[] | null
): number {
  return (items || []).reduce((sum, item) => {
    if (isLineItemFreeDeliveryEligible(item)) return sum
    return sum + getLineItemSubtotal(item)
  }, 0)
}

export function getProductFreeDeliveryEligibility(
  product?: FreeDeliveryProductLike | null,
  sku?: string | null
): ProductFreeDeliveryEligibility {
  const variants = product?.MedusaProduct?.Variants || []
  const selectedVariant =
    sku && variants.length
      ? variants.find((variant) => variant.Sku === sku)
      : undefined

  if (selectedVariant?.QualifiesForFreeDeliveryOffers === false) {
    return {
      qualifies: false,
      reason: selectedVariant.FreeDeliveryExclusionReason || null,
    }
  }

  if (selectedVariant?.QualifiesForFreeDeliveryOffers === true) {
    return { qualifies: true }
  }

  if (product?.Metadata?.QualifiesForFreeDeliveryOffers === false) {
    return {
      qualifies: false,
      reason: product.Metadata.FreeDeliveryExclusionReason || null,
    }
  }

  return { qualifies: true }
}

export function freeDeliveryEligibilityMetadata(
  eligibility: ProductFreeDeliveryEligibility
): Record<string, unknown> {
  if (eligibility.qualifies) return {}
  return {
    [FREE_DELIVERY_ELIGIBLE_METADATA_KEY]: false,
    ...(eligibility.reason
      ? {
          [FREE_DELIVERY_EXCLUSION_REASON_METADATA_KEY]: eligibility.reason,
        }
      : {}),
  }
}
