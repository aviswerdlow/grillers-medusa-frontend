"use client"

import { useState } from "react"
import Image from "next/image"
import { Tooltip, TooltipProvider, toast } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import FormattedPrice from "@modules/common/components/formatted-price"
import ProductCardCarousel from "@modules/common/components/product-card-carousel"
import { addToCart } from "@lib/data/cart"
import { formatProductPriceDisplay } from "@lib/util/price-display"
import { sanitizeProductCopy } from "@lib/util/product-claims"
import { dispatchCartUpdated } from "@lib/util/cart-events"
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

export function ProductCard({
  product,
  countryCode,
  viewMode = "grid",
  previouslyOrdered = false,
}: {
  product: StrapiCollectionProduct
  countryCode: string
  viewMode?: "grid" | "list"
  previouslyOrdered?: boolean
}) {
  const [isAdding, setIsAdding] = useState(false)

  const handleAddToCart = async () => {
    const variantId = product?.MedusaProduct?.Variants?.[0]?.VariantId
    if (!variantId) return

    setIsAdding(true)
    try {
      const variant = product.MedusaProduct?.Variants?.[0]
      const metadata = freeDeliveryEligibilityMetadata(
        getProductFreeDeliveryEligibility(product, variant?.Sku)
      )
      await addToCart({
        variantId,
        quantity: 1,
        countryCode,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      })
      dispatchCartUpdated({ action: "add", variantId, quantity: 1 })
      toast.success("Added to cart", { description: product.Title })
    } catch (error) {
      console.error("Failed to add to cart:", error)
      toast.error("Couldn't add to cart", {
        description: "Please try again in a moment.",
      })
    } finally {
      setIsAdding(false)
    }
  }

  const price = product?.MedusaProduct?.Variants?.[0]?.Price?.CalculatedPriceNumber
  const productIdentity = {
    handle: product?.MedusaProduct?.Handle,
    title: product?.Title,
  }
  const shortDescription = sanitizeProductCopy(
    product?.MedusaProduct?.ShortDescription,
    productIdentity
  )

  // Per-lb vs fixed-price decision sourced from (in order)
  //   1. Strapi MedusaProduct.PricingMode / Metadata.PricingMode (QB-driven)
  //   2. bundled SKU→mode map (QB-derived, 1726 entries)
  //   3. weight heuristic
  const priceDisplay = price
    ? formatProductPriceDisplay(
        Number(price),
        product?.Metadata,
        product?.MedusaProduct?.Variants?.[0]?.Sku,
        (product?.MedusaProduct as { PricingMode?: "per_lb" | "fixed_price" } | undefined)?.PricingMode
      )
    : null
  const compactSecondaryPrice = priceDisplay?.secondary
    ?.replace(/^Estimated\s+/i, "Est. ")
    .replace(/\s+for\s+a\s+/i, " / ")
    .replace(/\s+pack$/i, "")

  const galleryImages = [
    product?.FeaturedImage?.url,
    ...(product?.GalleryImages?.map((g) => g?.url) ?? []),
  ].filter((u): u is string => !!u)

  if (viewMode === "list") {
    return (
      <article className="grid min-w-0 grid-cols-1 gap-4 border-b border-gray-200 pb-6 sm:grid-cols-[160px_minmax(0,1fr)] lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:gap-6 lg:items-stretch">
        {/* Col 1: Image */}
        <LocalizedClientLink
          href={`/products/${product?.MedusaProduct?.Handle}`}
          className="block min-w-0 sm:w-[160px] lg:w-[180px]"
        >
          <figure className="relative w-full aspect-square bg-gray-50 overflow-hidden">
            <ProductCardCarousel
              images={galleryImages}
              alt={product.Title}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 160px, 180px"
            />
            {previouslyOrdered && (
              <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 font-maison-neue-mono text-[9px] font-bold uppercase tracking-wide text-Charcoal shadow-sm">
                Ordered before
              </span>
            )}
          </figure>
        </LocalizedClientLink>

        {/* Col 2: Details */}
        <div className="min-w-0 lg:pr-6">
          <LocalizedClientLink
            href={`/products/${product?.MedusaProduct?.Handle}`}
            className="block min-w-0 mb-2"
          >
            <h2 className="text-h4 font-gyst font-bold text-Charcoal hover:text-VibrantRed transition-colors break-words text-balance">
              {product.Title}
            </h2>
          </LocalizedClientLink>

          {/* Description */}
          {shortDescription && (
            <p className="text-sm font-maison-neue text-gray-500 leading-snug mb-3 break-words text-balance">
              {shortDescription}
            </p>
          )}

          {/* Icons row — below title + description */}
          <TooltipProvider delayDuration={100}>
            <div className="flex items-center flex-wrap gap-4 mb-3">
              {product?.Metadata?.GlutenFree && (
                <Tooltip content="Gluten Free" className="bg-Charcoal text-white">
                  <span className="inline-flex items-center cursor-default">
                    <Image
                      src="/images/icons/gluten-free.png"
                      width={48}
                      height={48}
                      alt="Gluten Free"
                      className="h-6 w-auto"
                    />
                  </span>
                </Tooltip>
              )}
              {product?.Metadata?.Cooked ? (
                <Tooltip content="Ready to Eat" className="bg-Charcoal text-white">
                  <span className="inline-flex items-center cursor-default">
                    <Image
                      src="/images/icons/ready-to-eat.png"
                      width={347}
                      height={126}
                      alt="Ready to Eat"
                      className="h-5 w-auto"
                    />
                  </span>
                </Tooltip>
              ) : product?.Metadata?.Uncooked ? (
                <Tooltip content="Uncooked" className="bg-Charcoal text-white">
                  <span className="inline-flex items-center cursor-default">
                    <Image
                      src="/images/icons/raw.png"
                      width={95}
                      height={43}
                      alt="Uncooked"
                      className="h-5 w-auto"
                    />
                  </span>
                </Tooltip>
              ) : null}
              {product?.Metadata?.MSG && (
                <Tooltip content="No MSG" className="bg-Charcoal text-white">
                  <span className="inline-flex items-center cursor-default">
                    <Image
                      src="/images/icons/no-msg.png"
                      width={48}
                      height={24}
                      alt="No MSG"
                      className="h-5 w-auto"
                    />
                  </span>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>

        </div>

        {/* Col 3: Price & Actions */}
        <div className="flex min-w-0 flex-col justify-between gap-4 py-1 h-full self-stretch sm:col-span-2 lg:col-span-1 lg:items-end">
          <div className="flex min-w-0 flex-col gap-1 lg:items-end">
            {priceDisplay && (
              <div className="min-w-0 text-Charcoal lg:text-right">
                <p className="leading-tight">
                  <span className="text-h4 font-gyst">
                    {priceDisplay.primary}
                  </span>
                  {priceDisplay.primaryLabel && (
                    <span className="text-p-sm-mono font-maison-neue-mono uppercase ml-1">
                      {priceDisplay.primaryLabel}
                    </span>
                  )}
                </p>
                {priceDisplay.secondary && (
                  <p className="text-xs font-maison-neue text-Charcoal/70 mt-0.5 break-words">
                    <span className="sm:hidden">{compactSecondaryPrice}</span>
                    <span className="hidden sm:inline">
                      {priceDisplay.secondary}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid w-full min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:max-w-sm lg:flex lg:w-auto lg:max-w-none lg:flex-col lg:items-end">
            <LocalizedClientLink
              href={`/products/${product?.MedusaProduct?.Handle}`}
              className="min-h-[44px] min-w-0 inline-flex gap-2 items-center justify-center hover:opacity-70 focus-visible:opacity-100 focus-visible:underline transition-opacity w-full"
            >
              <span className="text-Charcoal font-rexton text-[10px] font-bold uppercase whitespace-nowrap">View Details</span>
              <Image src="/images/icons/arrow-right.svg" width={16} height={10} alt="view details" />
            </LocalizedClientLink>

            <button
              onClick={handleAddToCart}
              disabled={isAdding || !product?.MedusaProduct?.Variants?.[0]?.VariantId}
              className="w-full min-h-[44px] min-w-0 px-4 py-2.5 rounded-[5px] border border-Charcoal bg-Gold text-Charcoal font-rexton text-xs font-bold uppercase transition-opacity hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-center"
              data-agent-action="add-to-cart"
              data-product-handle={product?.MedusaProduct?.Handle}
              data-variant-id={product?.MedusaProduct?.Variants?.[0]?.VariantId}
              data-sku={product?.MedusaProduct?.Variants?.[0]?.Sku}
            >
              {isAdding ? "Adding..." : "Add to Cart"}
            </button>
          </div>
        </div>
      </article>
    )
  }

  return (
    // Subgrid layout: each card spans 7 row tracks of the parent grid
    // (image, price+sku, title, badges, desc, pack, actions). Cards in
    // the same parent-grid row share track heights, so the title row
    // auto-sizes to the longest title in that row, etc. — no fixed
    // line-clamp needed. Falls back to a regular grid container when
    // the parent isn't a CSS grid (e.g. the PDP swiper).
    <article className="grid h-full min-w-0 grid-cols-1 grid-rows-subgrid row-span-6 gap-y-0 pb-8">
      <LocalizedClientLink
        href={`/products/${product?.MedusaProduct?.Handle}`}
        className="block min-w-0"
      >
        <figure className="relative min-w-0 w-full bg-gray-50 overflow-hidden">
          <div aria-hidden className="block pb-[100%]" />
          <div className="absolute inset-0">
            <ProductCardCarousel
              images={galleryImages}
              alt={product.Title}
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
            />
          </div>
          {previouslyOrdered && (
            <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 font-maison-neue-mono text-[9px] font-bold uppercase tracking-wide text-Charcoal shadow-sm">
              Ordered before
            </span>
          )}
        </figure>
      </LocalizedClientLink>

      {/* Row 2: Price (left) + SKU (right) */}
      <div className="mt-6 flex min-w-0 items-baseline justify-between gap-3">
        {priceDisplay ? (
          <div className="min-w-0 text-Charcoal">
            <p className="leading-none">
              <span className="text-h4 font-gyst">{priceDisplay.primary}</span>
              {priceDisplay.primaryLabel && (
                <span className="text-p-sm-mono font-maison-neue-mono uppercase ml-1">
                  {priceDisplay.primaryLabel}
                </span>
              )}
            </p>
            {priceDisplay.secondary && (
              <p className="text-xs font-maison-neue text-Charcoal/70 mt-1 break-words">
                <span className="sm:hidden">{compactSecondaryPrice}</span>
                <span className="hidden sm:inline">
                  {priceDisplay.secondary}
                </span>
              </p>
            )}
          </div>
        ) : <span />}
      </div>

      {/* Row 3: Title */}
      <LocalizedClientLink
        href={`/products/${product?.MedusaProduct?.Handle}`}
        className="block min-w-0 min-h-[44px] mt-3"
      >
        <h2
          className="text-[15px] leading-[1.22] font-maison-neue font-semibold text-Charcoal hover:text-VibrantRed transition-colors whitespace-normal break-normal line-clamp-3 [hyphens:none] [overflow-wrap:normal] [word-break:keep-all] sm:font-gyst sm:text-[16px] sm:font-bold sm:text-balance lg:text-h4 lg:leading-normal"
        >
          {product.Title}
        </h2>
      </LocalizedClientLink>

      {/* Row 4: Icons — below the title */}
      <TooltipProvider delayDuration={100}>
        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3 text-xs font-maison-neue-mono uppercase text-gray-500 justify-start sm:mt-5 sm:gap-4">
          {product?.Metadata?.GlutenFree && (
            <Tooltip content="Gluten Free" className="bg-Charcoal text-white">
              <span className="inline-flex items-center cursor-default">
                <Image
                  src="/images/icons/gluten-free.png"
                  width={48}
                  height={48}
                  alt="Gluten Free"
                  className="h-6 w-auto"
                />
              </span>
            </Tooltip>
          )}
          {product?.Metadata?.Cooked ? (
            <Tooltip content="Ready to Eat" className="bg-Charcoal text-white">
              <span className="inline-flex items-center cursor-default">
                <Image
                  src="/images/icons/ready-to-eat.png"
                  width={347}
                  height={126}
                  alt="Ready to Eat"
                  className="h-5 w-auto"
                />
              </span>
            </Tooltip>
          ) : product?.Metadata?.Uncooked ? (
            <Tooltip content="Uncooked" className="bg-Charcoal text-white">
              <span className="inline-flex items-center cursor-default">
                <Image
                  src="/images/icons/raw.png"
                  width={95}
                  height={43}
                  alt="Uncooked"
                  className="h-5 w-auto"
                />
              </span>
            </Tooltip>
          ) : null}
          {product?.Metadata?.MSG && (
            <Tooltip content="No MSG" className="bg-Charcoal text-white">
              <span className="inline-flex items-center cursor-default">
                <Image
                  src="/images/icons/no-msg.png"
                  width={48}
                  height={24}
                  alt="No MSG"
                  className="h-5 w-auto"
                />
              </span>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>

      {/* Row 5: Short Description (always rendered to keep subgrid alignment) */}
      <p className="text-sm font-maison-neue text-Charcoal/70 leading-snug sm:line-clamp-3 mt-3 break-words text-balance">
        {shortDescription}
      </p>

      {/* Row 6: Actions */}
      <div className="grid min-w-0 grid-cols-1 gap-2 mt-4 sm:flex sm:items-center sm:justify-between">
        <button
          onClick={handleAddToCart}
          disabled={isAdding || !product?.MedusaProduct?.Variants?.[0]?.VariantId}
          className="min-h-[44px] min-w-0 px-4 py-2 rounded-[5px] border border-Charcoal bg-Gold text-Charcoal font-rexton text-xs font-bold uppercase transition-opacity hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          data-agent-action="add-to-cart"
          data-product-handle={product?.MedusaProduct?.Handle}
          data-variant-id={product?.MedusaProduct?.Variants?.[0]?.VariantId}
          data-sku={product?.MedusaProduct?.Variants?.[0]?.Sku}
        >
          {isAdding ? "Adding..." : "Add to Cart"}
        </button>

        <LocalizedClientLink
          href={`/products/${product?.MedusaProduct?.Handle}`}
          className="min-h-[44px] min-w-0 inline-flex gap-2 items-center justify-center hover:opacity-70 focus-visible:opacity-100 focus-visible:underline transition-opacity sm:shrink-0 py-2"
        >
          <span className="text-Charcoal font-rexton text-[10px] font-bold uppercase whitespace-nowrap">
            View Details
          </span>
          <Image
            src={"/images/icons/arrow-right.svg"}
            width={16}
            height={10}
            alt="view details"
          />
        </LocalizedClientLink>
      </div>
    </article>
  )
}

export default function StrapiProductGrid({
  products,
  countryCode,
  viewMode = "grid",
  wide = false,
  recentProductIds = [],
}: StrapiProductGridProps) {
  const recentSet = new Set(recentProductIds)

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-h4 font-gyst text-Charcoal mb-2">No products found</p>
        <p className="text-p-md text-gray-600">
          Products with this tag will appear here once they are tagged in the system.
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
        {products.map((product) => (
          <ProductCard 
            key={product.documentId} 
            product={product} 
            countryCode={countryCode}
            viewMode={viewMode}
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
