import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"
import { compactCollectionProduct } from "@lib/util/collection-product"
import { isInternalStrapiProduct } from "@lib/util/internal-products"

/**
 * Returns true if the Algolia hit is a stub — only `objectID` (plus the
 * usual highlight scaffolding) with no real product data. The upstream
 * `strapi-plugin-strapi-algolia` writes these stubs when its transformer
 * returns null or an async value the plugin spreads without awaiting
 * (#115). Until that's patched at the Strapi side, /us/search and
 * /us/store filter these out so users never see "ghost" cards.
 */
export function isStubHit(hit: any): boolean {
  if (!hit || typeof hit !== "object") return true
  if (!hit.Title && !hit.MedusaProduct && !hit.FeaturedImage) return true
  return false
}

/**
 * Adapter from an Algolia hit to the StrapiCollectionProduct shape the
 * Strapi-side templates expect. Shared by /us/search and /us/store (and
 * any future Algolia-backed surface).
 *
 * Older index records may shape MedusaProduct differently — `Id` vs
 * `ProductId`, missing Handle, missing GalleryImages — so we normalize
 * to a single shape before downstream code touches it. (#116)
 *
 * Returns null for stub hits (see isStubHit above). Callers should
 * `.filter(Boolean)` to drop them.
 */
export function hitToProduct(hit: any): StrapiCollectionProduct | null {
  if (isStubHit(hit)) return null
  const product = compactCollectionProduct(hit)
  return isInternalStrapiProduct(product) ? null : product
}
