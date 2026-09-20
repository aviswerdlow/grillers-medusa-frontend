// Shared by Next.js adapters and the Node sitemap builder.
const lifecycleKeys = [
  "availability_lifecycle",
  "availabilityLifecycle",
  "AvailabilityLifecycle",
]
const isInternalRawMaterialSku = (sku) =>
  typeof sku === "string" && /^RM-/i.test(sku.trim())
const internalMetadata = (metadata) =>
  lifecycleKeys.some(
    (key) =>
      String(metadata?.[key] ?? "")
        .trim()
        .toLowerCase() === "internal_only"
  )
const isInternalMedusaProduct = (product) =>
  internalMetadata(product?.metadata) ||
  Boolean(
    product?.variants?.some(
      (variant) =>
        isInternalRawMaterialSku(variant?.sku) ||
        internalMetadata(variant?.metadata)
    )
  )
const isInternalStrapiProduct = (product) =>
  internalMetadata(product?.MedusaProduct) ||
  Boolean(
    product?.MedusaProduct?.Variants?.some(
      (variant) =>
        isInternalRawMaterialSku(variant?.Sku) || internalMetadata(variant)
    )
  )
module.exports = {
  isInternalRawMaterialSku,
  internalMetadata,
  isInternalMedusaProduct,
  isInternalStrapiProduct,
}
