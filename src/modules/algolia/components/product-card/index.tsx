"use client"

import { useState } from "react"
import Image from "next/image"
import { toast } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { addToCart } from "@lib/data/cart"
import { experimentCartMetadata } from "@lib/experiments/client-context"
import { trackAddToCart } from "@lib/gtm"
import { jitsuTrack } from "@lib/jitsu"
import { reportClientOpsAlert } from "@lib/client-ops-alert"
import { formatCardPriceDisplay } from "@lib/util/card-price-display"
import ProductCardFacts from "@modules/common/components/product-card-facts"
import { dispatchCartUpdated } from "@lib/util/cart-events"
import { isVariantPurchasable } from "@lib/util/product-availability"
import type { StrapiProductData } from "types/strapi"

const ProductCard = ({ hit }: { hit: StrapiProductData }) => {
  const [isAdding, setIsAdding] = useState(false)
  const variant = hit?.MedusaProduct?.Variants?.[0]
  const canAddToCart = Boolean(
    variant?.VariantId && isVariantPurchasable(variant)
  )

  const handleAddToCart = async () => {
    // Get the first variant ID
    const variantId = variant?.VariantId
    if (!variantId || !canAddToCart) return
    const itemId = hit?.MedusaProduct?.ProductId || hit.objectID

    setIsAdding(true)
    try {
      await addToCart({
        variantId,
        quantity: 1,
        countryCode: "us",
        metadata: experimentCartMetadata(),
      })
      dispatchCartUpdated({ action: "add", variantId, quantity: 1 })

      toast.success("Added to cart", { description: hit.Title })

      const price = variant?.Price?.CalculatedPriceNumber
      trackAddToCart({ id: itemId, title: hit.Title, price }, 1)
      jitsuTrack("product_added_to_cart", {
        item_id: itemId,
        item_name: hit.Title,
        variant_id: variantId,
        price,
        quantity: 1,
        currency: "USD",
      })
    } catch (error) {
      console.error("Failed to add to cart:", error)
      reportClientOpsAlert({
        alertKind: "client_add_to_cart_failed",
        title: "Storefront client add-to-cart failed",
        surface: "algolia_product_card",
        action: "add_to_cart",
        error,
        productId: itemId,
        variantId,
        productHandle: hit?.MedusaProduct?.Handle,
      })
      toast.error("Couldn't add to cart", {
        description: "Please try again in a moment.",
      })
    } finally {
      setIsAdding(false)
    }
  }

  const handleProductClick = () => {
    jitsuTrack("product_selected_from_list", {
      item_id: hit?.MedusaProduct?.ProductId || hit.objectID,
      item_name: hit.Title,
      price: hit?.MedusaProduct?.Variants?.[0]?.Price?.CalculatedPriceNumber,
    })
  }

  const price = variant?.Price?.CalculatedPriceNumber
  const display =
    typeof price === "number" && price > 0
      ? formatCardPriceDisplay(
          price,
          hit.Metadata,
          variant?.Sku,
          (
            hit.MedusaProduct as
              | { PricingMode?: "per_lb" | "fixed_price" }
              | undefined
          )?.PricingMode
        )
      : null
  const href = `/products/${hit.MedusaProduct?.Handle}`
  return (
    <article className="flex h-full min-w-0 flex-col gap-2">
      <LocalizedClientLink
        href={href}
        onClick={handleProductClick}
        className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-Gold"
      >
        <figure className="relative aspect-square overflow-hidden bg-gray-50">
          <Image
            src={hit.FeaturedImage?.url || "https://placehold.co/400x400"}
            alt={hit.Title}
            fill
            sizes="(max-width: 639px) 50vw, 33vw"
            className="object-cover"
          />
        </figure>
        <h2 className="mt-3 min-h-[44px] break-words font-gyst text-base font-bold leading-snug text-Charcoal sm:text-xl">
          {hit.Title}
        </h2>
      </LocalizedClientLink>
      <ProductCardFacts metadata={hit.Metadata} />
      {display && (
        <div className="mt-auto pt-2 text-Charcoal">
          <p>
            <span className="font-gyst text-xl sm:text-2xl">
              {display.primary}
            </span>{" "}
            <span className="font-maison-neue text-xs">
              {display.primaryLabel}
            </span>
          </p>
          <p className="mt-1 font-maison-neue text-xs leading-relaxed text-Charcoal/70">
            {display.secondary}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={handleAddToCart}
        disabled={isAdding || !canAddToCart}
        className="mt-2 min-h-[44px] w-full rounded-[5px] border border-Charcoal bg-Gold px-3 py-2 font-maison-neue text-sm font-bold text-Charcoal disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-Charcoal"
      >
        {isAdding ? "Adding..." : canAddToCart ? "Add to Cart" : "Out of stock"}
      </button>
    </article>
  )
}

export default ProductCard
