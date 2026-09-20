import type { HttpTypes } from "@medusajs/types"
import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"

const policy = require("./public-catalog.cjs") as {
  internalMetadata: (metadata: unknown) => boolean
  isInternalRawMaterialSku: (sku: unknown) => boolean
  isInternalMedusaProduct: (product: unknown) => boolean
  isInternalStrapiProduct: (product: unknown) => boolean
}

export function hasInternalCatalogLifecycle(metadata: unknown): boolean {
  return policy.internalMetadata(metadata)
}

export function isInternalRawMaterialSku(sku: unknown): boolean {
  return policy.isInternalRawMaterialSku(sku)
}

export function isInternalMedusaProduct(
  product:
    | (Pick<HttpTypes.StoreProduct, "variants"> & {
        metadata?: Record<string, unknown> | null
      })
    | null
    | undefined
): boolean {
  return policy.isInternalMedusaProduct(product)
}

export function isInternalStrapiProduct(
  product: Pick<StrapiCollectionProduct, "MedusaProduct"> | null | undefined
): boolean {
  return policy.isInternalStrapiProduct(product)
}
