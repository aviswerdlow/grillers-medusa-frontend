import { sdk } from "@lib/config"
import { isInternalMedusaProduct } from "@lib/util/internal-products"
import { isWaitlistEligible } from "@lib/util/waitlist-eligibility"
import type { HttpTypes } from "@medusajs/types"

// Client-provided handles, titles and SKUs are not evidence that a product is
// public. Resolve the current catalog before saving or sending anything.
export async function resolvePublicWaitlistProduct(
  productId: string,
  variantId?: string
) {
  const { product } = await sdk.client.fetch<{
    product: HttpTypes.StoreProduct
  }>(`/store/products/${encodeURIComponent(productId)}`, {
    query: { fields: "id,title,handle,*variants,+metadata" },
    cache: "no-store",
  })
  if (
    !product ||
    product.id !== productId ||
    !product.handle ||
    !product.title ||
    isInternalMedusaProduct(product) ||
    !product.variants?.length
  ) {
    throw new Error("Product is not eligible for a waitlist")
  }
  const variant = variantId
    ? product.variants.find((v) => v.id === variantId)
    : undefined
  const eligible = (
    v: NonNullable<HttpTypes.StoreProduct["variants"]>[number]
  ) =>
    isWaitlistEligible({
      productMetadata: product.metadata,
      variantMetadata: v.metadata,
    })
  if (
    variantId
      ? !variant || !eligible(variant)
      : !product.variants.some(eligible)
  ) {
    throw new Error("Product is not eligible for a waitlist")
  }
  const qbdId = variant?.metadata?.qbd_list_id ?? product.metadata?.qbd_list_id
  return {
    medusaProductId: product.id,
    medusaVariantId: variant?.id,
    productHandle: product.handle,
    productTitle: product.title,
    sku: variant?.sku || undefined,
    quickBooksListId: typeof qbdId === "string" ? qbdId : undefined,
  }
}
