"use client"

import { memo, useState } from "react"
import Image from "next/image"
import { toast } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ProductCardFacts from "@modules/common/components/product-card-facts"
import { addToCart } from "@lib/data/cart"
import { experimentCartMetadata } from "@lib/experiments/client-context"
import { reportClientOpsAlert } from "@lib/client-ops-alert"
import { formatCardPriceDisplay } from "@lib/util/card-price-display"
import { dispatchCartUpdated } from "@lib/util/cart-events"
import { isVariantPurchasable } from "@lib/util/product-availability"
import {
  freeDeliveryEligibilityMetadata,
  getProductFreeDeliveryEligibility,
} from "@lib/util/free-delivery-eligibility"
import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"

type StrapiProductGridProps = {
  products: StrapiCollectionProduct[]
  countryCode: string
  viewMode?: "grid" | "list"
  /** When the filter sidebar is hidden the products area is wider, so we
   * bump to 4 cols at xl. Default 3 cols matches the with-sidebar layout. */
  wide?: boolean
  recentProductIds?: string[]
}

export const ProductCard = memo(function ProductCard({
  product,
  countryCode,
  viewMode = "grid",
  previouslyOrdered = false,
  imageSizes,
  priority = false,
}: {
  product: StrapiCollectionProduct
  countryCode: string
  viewMode?: "grid" | "list"
  previouslyOrdered?: boolean
  imageSizes?: string
  priority?: boolean
  hydrateCarouselOnView?: boolean
}) {
  const [isAdding, setIsAdding] = useState(false)
  const variant = product?.MedusaProduct?.Variants?.[0]
  const canAddToCart = Boolean(
    variant?.VariantId && isVariantPurchasable(variant)
  )

  const handleAddToCart = async () => {
    const variantId = variant?.VariantId
    if (!variantId || !canAddToCart) return

    setIsAdding(true)
    try {
      const metadata = freeDeliveryEligibilityMetadata(
        getProductFreeDeliveryEligibility(product, variant?.Sku)
      )
      const cartMetadata = {
        ...experimentCartMetadata(),
        ...metadata,
      }
      await addToCart({
        variantId,
        quantity: 1,
        countryCode,
        metadata: Object.keys(cartMetadata).length ? cartMetadata : undefined,
      })
      dispatchCartUpdated({ action: "add", variantId, quantity: 1 })
      toast.success("Added to cart", { description: product.Title })
    } catch (error) {
      console.error("Failed to add to cart:", error)
      reportClientOpsAlert({
        alertKind: "client_add_to_cart_failed",
        title: "Storefront client add-to-cart failed",
        surface: "strapi_product_grid",
        action: "add_to_cart",
        error,
        productId: product.MedusaProduct?.ProductId,
        variantId,
        productHandle: product.MedusaProduct?.Handle,
      })
      toast.error("Couldn't add to cart", {
        description: "Please try again in a moment.",
      })
    } finally {
      setIsAdding(false)
    }
  }

  const price = variant?.Price?.CalculatedPriceNumber
  const priceDisplay =
    typeof price === "number"
      ? formatCardPriceDisplay(
          price,
          product.Metadata,
          variant?.Sku,
          (
            product.MedusaProduct as
              | { PricingMode?: "per_lb" | "fixed_price" }
              | undefined
          )?.PricingMode
        )
      : null
  const productHref = `/products/${product.MedusaProduct?.Handle}`

  return (
    <article
      className={
        viewMode === "list"
          ? "grid min-w-0 grid-cols-[112px_minmax(0,1fr)] gap-4 border-b border-Charcoal/10 pb-6 sm:grid-cols-[160px_minmax(0,1fr)]"
          : "flex h-full min-w-0 flex-col pb-6"
      }
    >
      <LocalizedClientLink
        href={productHref}
        className="block min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-Gold"
      >
        <figure className="relative aspect-square overflow-hidden bg-gray-50">
          <Image
            src={
              product.FeaturedImage?.url ||
              product.GalleryImages?.[0]?.url ||
              "https://placehold.co/400x400"
            }
            alt={product.Title}
            fill
            sizes={imageSizes || "(max-width: 639px) 50vw, 33vw"}
            priority={priority}
            className="object-cover"
          />
          {previouslyOrdered && (
            <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-xs text-Charcoal">
              Ordered before
            </span>
          )}
        </figure>
      </LocalizedClientLink>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-3">
        <LocalizedClientLink
          href={productHref}
          className="block min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-Gold"
        >
          <h2 className="break-words font-gyst text-base font-bold leading-snug text-Charcoal sm:text-xl">
            {product.Title}
          </h2>
        </LocalizedClientLink>
        <ProductCardFacts metadata={product.Metadata} />
        {priceDisplay && (
          <div className="mt-auto pt-2 text-Charcoal">
            <p>
              <span className="font-gyst text-xl sm:text-2xl">
                {priceDisplay.primary}
              </span>{" "}
              <span className="font-maison-neue text-xs">
                {priceDisplay.primaryLabel}
              </span>
            </p>
            <p className="mt-1 font-maison-neue text-xs leading-relaxed text-Charcoal/70">
              {priceDisplay.secondary}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={isAdding || !canAddToCart}
          className="mt-2 min-h-[44px] w-full rounded-[5px] border border-Charcoal bg-Gold px-3 py-2 font-maison-neue text-sm font-bold text-Charcoal disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-Charcoal"
          data-agent-action="add-to-cart"
          data-product-handle={product.MedusaProduct?.Handle}
          data-variant-id={variant?.VariantId}
          data-sku={variant?.Sku}
        >
          {isAdding
            ? "Adding..."
            : canAddToCart
            ? "Add to Cart"
            : "Out of stock"}
        </button>
      </div>
    </article>
  )
})

ProductCard.displayName = "ProductCard"

export default function StrapiProductGrid({
  products,
  countryCode,
  viewMode = "grid",
  wide = false,
  recentProductIds = [],
}: StrapiProductGridProps) {
  const recentSet = new Set(recentProductIds)
  const gridImageSizes = wide
    ? "(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 33vw, 25vw"
    : "(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 33vw"

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-h4 font-gyst text-Charcoal mb-2">
          No products found
        </p>
        <p className="text-p-md text-gray-600">
          Products with this tag will appear here once they are tagged in the
          system.
        </p>
      </div>
    )
  }

  return (
    <>
      <div
        className={
          viewMode === "grid"
            ? `grid grid-cols-2 lg:grid-cols-3 ${
                wide ? "xl:grid-cols-4" : "xl:grid-cols-3"
              } gap-x-4 sm:gap-x-6 gap-y-0`
            : "flex flex-col space-y-8"
        }
      >
        {products.map((product, index) => (
          <ProductCard
            key={product.documentId}
            product={product}
            countryCode={countryCode}
            viewMode={viewMode}
            imageSizes={gridImageSizes}
            hydrateCarouselOnView={false}
            priority={viewMode === "grid" ? index < 2 : index === 0}
            previouslyOrdered={
              !!product.MedusaProduct?.ProductId &&
              recentSet.has(product.MedusaProduct.ProductId)
            }
          />
        ))}
      </div>
    </>
  )
}
