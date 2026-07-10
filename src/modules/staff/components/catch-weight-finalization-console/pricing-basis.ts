type StaffLinePricingInput = {
  pricing_mode?: string | null
  estimated_weight_total?: number | string | null
}

export type StaffLinePricingBasis = "by_weight" | "per_pack"

/**
 * Resolve the staff packing workflow for an order line.
 *
 * Explicit pricing mode is authoritative. Weight metadata and title parsing
 * are legacy fallbacks only, because fixed-price packs can still include their
 * pack size (for example, "4 lb") in both places.
 */
export function resolveStaffLinePricingBasis(
  line: StaffLinePricingInput,
  title: string
): StaffLinePricingBasis {
  const pricingMode = line.pricing_mode?.trim().toLowerCase()

  if (pricingMode === "fixed" || pricingMode === "fixed_price") {
    return "per_pack"
  }

  if (pricingMode === "per_lb") {
    return "by_weight"
  }

  const estimatedWeight = Number(line.estimated_weight_total)
  if (Number.isFinite(estimatedWeight) && estimatedWeight > 0) {
    return "by_weight"
  }

  return /\b\d+(?:\.\d+)?\s*(lb|lbs|pound|pounds)\b/i.test(title)
    ? "by_weight"
    : "per_pack"
}
