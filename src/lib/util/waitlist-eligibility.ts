import { hasInternalCatalogLifecycle } from "./internal-products"

export type AvailabilityLifecycle =
  | "active"
  | "seasonal_inactive"
  | "discontinued"
  | "internal_only"

type Metadata = Record<string, unknown> | null | undefined

type StrapiWaitlistFields = {
  WaitlistEnabled?: boolean | null
  AvailabilityLifecycle?: AvailabilityLifecycle | string | null
}

const WAITLIST_KEYS = ["waitlist_enabled", "waitlistEnabled", "WaitlistEnabled"]

const LIFECYCLE_KEYS = [
  "availability_lifecycle",
  "availabilityLifecycle",
  "AvailabilityLifecycle",
]

const BLOCKING_LIFECYCLES = new Set<AvailabilityLifecycle>([
  "seasonal_inactive",
  "discontinued",
  "internal_only",
])

function recordFrom(value: Metadata): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {}
  }

  return value
}

function booleanFromUnknown(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value)) return value !== 0

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["true", "1", "yes", "y"].includes(normalized)) return true
    if (["false", "0", "no", "n"].includes(normalized)) return false
  }

  return undefined
}

function waitlistFlagFromMetadata(metadata: Metadata): boolean | undefined {
  const record = recordFrom(metadata)

  for (const key of WAITLIST_KEYS) {
    const value = booleanFromUnknown(record[key])
    if (value !== undefined) {
      return value
    }
  }

  return undefined
}

function lifecycleFromUnknown(
  value: unknown
): AvailabilityLifecycle | undefined {
  if (typeof value !== "string") return undefined

  const normalized = value.trim().toLowerCase()
  if (
    normalized === "active" ||
    normalized === "seasonal_inactive" ||
    normalized === "discontinued" ||
    normalized === "internal_only"
  ) {
    return normalized
  }

  return undefined
}

function lifecycleFromMetadata(
  metadata: Metadata
): AvailabilityLifecycle | undefined {
  const record = recordFrom(metadata)

  for (const key of LIFECYCLE_KEYS) {
    const value = lifecycleFromUnknown(record[key])
    if (value) {
      return value
    }
  }

  return undefined
}

function waitlistFlagFromStrapi(
  fields?: StrapiWaitlistFields | null
): boolean | undefined {
  return booleanFromUnknown(fields?.WaitlistEnabled)
}

function lifecycleFromStrapi(
  fields?: StrapiWaitlistFields | null
): AvailabilityLifecycle | undefined {
  return lifecycleFromUnknown(fields?.AvailabilityLifecycle)
}

export function isWaitlistEligible({
  productMetadata,
  variantMetadata,
  strapiProduct,
  strapiVariant,
}: {
  productMetadata?: Metadata
  variantMetadata?: Metadata
  strapiProduct?: StrapiWaitlistFields | null
  strapiVariant?: StrapiWaitlistFields | null
}): boolean {
  // Internal production inputs cannot be opted into customer waitlists.
  if (
    hasInternalCatalogLifecycle(productMetadata) ||
    hasInternalCatalogLifecycle(variantMetadata) ||
    [
      lifecycleFromStrapi(strapiVariant),
      lifecycleFromStrapi(strapiProduct),
    ].includes("internal_only")
  )
    return false

  const variantFlag =
    waitlistFlagFromStrapi(strapiVariant) ??
    waitlistFlagFromMetadata(variantMetadata)
  if (variantFlag !== undefined) return variantFlag

  const productFlag =
    waitlistFlagFromStrapi(strapiProduct) ??
    waitlistFlagFromMetadata(productMetadata)
  if (productFlag !== undefined) return productFlag

  const lifecycle =
    lifecycleFromStrapi(strapiVariant) ??
    lifecycleFromMetadata(variantMetadata) ??
    lifecycleFromStrapi(strapiProduct) ??
    lifecycleFromMetadata(productMetadata)

  if (lifecycle && BLOCKING_LIFECYCLES.has(lifecycle)) {
    return false
  }

  return true
}

export function isCatalogLifecyclePurchasable({
  productMetadata,
  variantMetadata,
  strapiProduct,
  strapiVariant,
}: {
  productMetadata?: Metadata
  variantMetadata?: Metadata
  strapiProduct?: StrapiWaitlistFields | null
  strapiVariant?: StrapiWaitlistFields | null
}): boolean {
  if (
    hasInternalCatalogLifecycle(productMetadata) ||
    hasInternalCatalogLifecycle(variantMetadata) ||
    [
      lifecycleFromStrapi(strapiVariant),
      lifecycleFromStrapi(strapiProduct),
    ].includes("internal_only")
  )
    return false

  const lifecycle =
    lifecycleFromStrapi(strapiVariant) ??
    lifecycleFromMetadata(variantMetadata) ??
    lifecycleFromStrapi(strapiProduct) ??
    lifecycleFromMetadata(productMetadata)

  return !(lifecycle && BLOCKING_LIFECYCLES.has(lifecycle))
}

export function shouldShowBackInStockForm({
  inStock,
  product,
  selectedVariant,
  strapiProduct,
  strapiVariant,
}: {
  inStock?: boolean
  product?: {
    id?: string | null
    handle?: string | null
    metadata?: Metadata
  } | null
  selectedVariant?: {
    id?: string | null
    metadata?: Metadata
  } | null
  strapiProduct?: StrapiWaitlistFields | null
  strapiVariant?: StrapiWaitlistFields | null
}): boolean {
  if (inStock) return false
  if (!product?.id || !product?.handle || !selectedVariant?.id) return false

  return isWaitlistEligible({
    productMetadata: product.metadata,
    variantMetadata: selectedVariant.metadata,
    strapiProduct,
    strapiVariant,
  })
}
