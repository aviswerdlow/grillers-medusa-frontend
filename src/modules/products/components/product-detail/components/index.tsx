import React, { useRef, useState, useCallback } from "react"
import Image from "next/image"
import { Swiper, SwiperSlide } from "swiper/react"
import { Zoom } from "swiper/modules"
import type { Swiper as SwiperType } from "swiper"
import "swiper/css"
import "swiper/css/zoom"
import { HttpTypes } from "@medusajs/types"
import { getProductPrice } from "@lib/util/get-product-price"

import ProductActions from "./product-actions"
import ProductPrice from "./product-price"
import ProductVariantPicker from "./product-variant-picker"
import Breadcrumb, {
  buildProductBreadcrumbs,
} from "@modules/common/components/breadcrumb"
import SocialShare from "@modules/common/components/social-share"
import KashruthBadges from "@modules/products/components/kashruth-badges"
import NotifyBackInStockForm from "@modules/products/components/notify-back-in-stock"
import ShippingEligibility from "@modules/products/components/shipping-eligibility"
import ProductConversionPanel from "@modules/products/components/product-conversion-panel"
import ProductFacts from "@modules/products/components/product-facts"
import { sanitizeProductCopy } from "@lib/util/product-claims"

import type { StrapiProductData } from "types/strapi"
import type { CartConversionState } from "@lib/data/conversion"
import type { PurchaseHistoryItem } from "@lib/data/orders"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  strapiProductData: StrapiProductData
  selectedVariant?: HttpTypes.StoreProductVariant
  options: Record<string, string>
  setOptionValue: (optionId: string, value: string) => void
  inStock?: boolean
  isAdding?: boolean
  isValidVariant?: boolean
  quantity: number
  increment: () => void
  decrement: () => void
  handleAddToCart: () => void
  actionsRef?: React.RefObject<HTMLDivElement | null>
  showMobileActions?: boolean
  cartConversion?: CartConversionState | null
  purchaseHistoryItem?: PurchaseHistoryItem | null
}

const ProductImages = ({
  product,
  images,
}: {
  product: HttpTypes.StoreProduct
  images: any[]
}) => {
  const swiperRef = useRef<SwiperType | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [announcement, setAnnouncement] = useState("")
  const totalImages = images.length

  if (totalImages === 0) {
    return (
      <div className="flex h-96 w-full items-center justify-center border border-gray-300 bg-white md:h-[600px]">
        <span className="px-6 text-center font-maison-neue text-p-sm text-Charcoal/60">
          Product image coming soon
        </span>
      </div>
    )
  }

  const handleSlideChange = useCallback(
    (swiper: SwiperType) => {
      const newIndex = swiper.realIndex
      setCurrentIndex(newIndex)
      setAnnouncement(
        `Image ${newIndex + 1} of ${totalImages}: ${product.title}`
      )
    },
    [totalImages, product.title]
  )

  const handlePrev = useCallback(() => {
    swiperRef.current?.slidePrev()
  }, [])

  const handleNext = useCallback(() => {
    swiperRef.current?.slideNext()
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        handlePrev()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        handleNext()
      }
    },
    [handlePrev, handleNext]
  )

  return (
    <div
      className="relative w-full h-96 md:h-[600px]"
      role="region"
      aria-label={`Product image gallery for ${product.title}`}
      aria-roledescription="carousel"
      onKeyDown={handleKeyDown}
    >
      {/* Screen reader announcements for image changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <Swiper
        modules={[Zoom]}
        spaceBetween={24}
        slidesPerView={1}
        className="h-full"
        onSwiper={(swiper) => {
          swiperRef.current = swiper
        }}
        onSlideChange={handleSlideChange}
        loop={true}
        zoom={{
          maxRatio: 3,
          minRatio: 1,
        }}
        a11y={{
          enabled: true,
          prevSlideMessage: "Previous image",
          nextSlideMessage: "Next image",
          firstSlideMessage: "This is the first image",
          lastSlideMessage: "This is the last image",
        }}
      >
        {images.map((image, index) => (
          <SwiperSlide
            key={index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${totalImages}`}
          >
            <div className="swiper-zoom-container relative h-full w-full">
              <Image
                src={image.url}
                alt={`${product.title} - Image ${index + 1} of ${totalImages}`}
                fill
                className="object-cover border border-gray-300"
                data-swiper-zoom="3"
              />
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Slider nav with enhanced accessibility */}
      <div
        className="absolute bottom-4 right-4 flex space-x-2 z-[1]"
        role="group"
        aria-label="Gallery navigation"
      >
        <button
          onClick={handlePrev}
          className="h-11 w-11 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
          aria-label="Previous image"
        >
          <Image
            src="/images/icons/arrow-left.svg"
            width={12}
            height={20}
            alt=""
            aria-hidden="true"
          />
        </button>
        <button
          onClick={handleNext}
          className="h-11 w-11 bg-white/80 rounded-full flex items-center justify-center hover:bg-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
          aria-label="Next image"
        >
          <Image
            src="/images/icons/arrow-right.svg"
            width={12}
            height={20}
            alt=""
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Image counter for visual users */}
      <div
        className="absolute bottom-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm font-maison-neue z-[1]"
        aria-hidden="true"
      >
        {currentIndex + 1} / {totalImages}
      </div>
    </div>
  )
}

export default function ProductDetail({
  product,
  region,
  countryCode,
  strapiProductData,
  selectedVariant,
  options,
  setOptionValue,
  quantity,
  increment,
  decrement,
  inStock,
  isAdding,
  isValidVariant,
  handleAddToCart,
  actionsRef,
  showMobileActions = false,
  cartConversion,
  purchaseHistoryItem,
}: ProductTemplateProps) {
  const heroTag = strapiProductData?.Metadata?.KosherForPassover
    ? "Kosher for Passover"
    : "Certified Kosher"

  const images = [
    strapiProductData?.FeaturedImage,
    ...(strapiProductData?.GalleryImages || []),
  ].filter((image) => image?.url)

  // Build breadcrumb items.
  // Prefer Strapi storefront collections because their slugs match the
  // /collections/[handle] routes used by the nav. Medusa category trails
  // are passed through for compatibility but are ignored by the breadcrumb
  // helper because /categories/[handle] is not built.
  const strapiData = strapiProductData as any
  const productIdentity = {
    handle: strapiProductData?.MedusaProduct?.Handle || product.handle,
    title: strapiProductData?.Title || product.title,
  }
  const productDescription = sanitizeProductCopy(
    strapiProductData?.MedusaProduct?.Description,
    productIdentity
  )
  const strapiCollection = strapiData?.Categorization?.ProductCollections?.[0]
  const strapiL2Tag = strapiData?.Categorization?.ProductTags?.find(
    (t: { Name: string }) => t.Name?.startsWith("L2:")
  )
  const fallbackCollection = strapiCollection
    ? { title: strapiCollection.Name, handle: strapiCollection.Slug }
    : product.collection ||
      (strapiL2Tag
        ? {
            title: strapiL2Tag.Name.replace(/^L2:\s*/, ""),
            handle: encodeURIComponent(strapiL2Tag.Name),
          }
        : null)

  const breadcrumbItems = buildProductBreadcrumbs(
    fallbackCollection,
    countryCode,
    (product as any).categories
  )
  const selectedPrice = getProductPrice({
    product,
    variantId: selectedVariant?.id,
  })
  const stickyPrice =
    selectedPrice?.variantPrice || selectedPrice?.cheapestPrice || null
  const optionSummary =
    Object.values(options).filter(Boolean).join(" / ") || "Select Options"
  const isSingleVariant = (product.variants?.length ?? 0) <= 1
  const setActionsNode = useCallback(
    (node: HTMLDivElement | null) => {
      if (!actionsRef) return
      const mutableRef =
        actionsRef as React.MutableRefObject<HTMLDivElement | null>
      mutableRef.current = node
    },
    [actionsRef]
  )

  return (
    <section className="py-4 md:pt-4 md:pb-16 bg-Scroll relative">
      {/* Breadcrumb Navigation */}
      <div className="mx-auto max-w-7xl px-6 mb-8">
        <Breadcrumb
          items={breadcrumbItems}
          currentPage={strapiProductData?.Title || product.title || "Product"}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
        {/* Left: product image + nav buttons - sticky on desktop */}
        <div className="md:sticky md:top-[150px] md:self-start mt-6">
          <ProductImages product={product} images={images} />
        </div>

        {/* Right: product info */}
        <div className="flex flex-col pt-4 relative">
          {/* Certification icon - absolutely positioned. The 72px right
              padding on the SKU + h1 below keeps the title text out from
              under the badge on mobile (badge is 63px wide; 72px gives a
              small breathing margin). */}
          <div className="absolute top-0 right-0">
            <Image
              src="/images/pages/pdp/CertifiedKosher.png"
              width={63}
              height={63}
              alt="Certified Kosher"
            />
          </div>

          {/* Tag + Title */}
          <div className="mb-6">
            <span className="bg-Black text-White font-maison-neue-mono leading-none text-p-sm px-4 pt-2 pb-1.5 rounded-full uppercase tracking-wide">
              {heroTag}
            </span>
          </div>
          {(selectedVariant?.sku ||
            strapiProductData?.MedusaProduct?.Variants?.[0]?.Sku) && (
            <p className="text-xs font-maison-neue-mono uppercase tracking-wider text-Charcoal/60 mb-2 pr-[72px] sm:pr-0">
              SKU:{" "}
              {selectedVariant?.sku ||
                strapiProductData?.MedusaProduct?.Variants?.[0]?.Sku}
            </p>
          )}
          <h1 className="text-h3 font-gyst text-Charcoal mb-7 text-balance pr-[72px] sm:pr-0">
            {strapiProductData?.Title || product.title}
          </h1>

          {/* Price block. Headline + math-on-one-line sub for catch-weight
              items, `Each — fixed price` for items flagged as such in QB.
              AVG PACK WEIGHT box dropped — the math line now carries the
              same info (`Estimated $4.78 for a ~1.2 lb pack`) without
              forcing the customer to multiply. */}
          <div className="border-t border-b border-Charcoal mb-6">
            <ProductPrice
              product={product}
              variant={selectedVariant}
              metadata={strapiProductData?.Metadata}
              explicitMode={
                (
                  strapiProductData?.MedusaProduct as
                    | { PricingMode?: "per_lb" | "fixed_price" }
                    | undefined
                )?.PricingMode
              }
            />
          </div>

          <ProductVariantPicker
            product={product}
            options={options}
            setOptionValue={setOptionValue}
          />

          {/* Quantity + Add to Cart */}
          <div ref={setActionsNode}>
            <ProductConversionPanel
              cartState={cartConversion}
              currencyCode={region.currency_code}
              purchaseHistoryItem={purchaseHistoryItem}
            />
            <ProductActions
              product={product}
              variant={selectedVariant}
              inStock={inStock}
              isAdding={isAdding}
              isValidVariant={isValidVariant}
              quantity={quantity}
              increment={increment}
              decrement={decrement}
              handleAddToCart={handleAddToCart}
            />
          </div>

          {/* Notify-me-when-back-in-stock — only shown when the
              selected variant is OOS. Drops the customer's email
              into a Strapi `back-in-stock-request` collection and
              fires a Postmark confirmation. Restock trigger lives
              outside this surface (Medusa inventory webhook). #102. */}
          {!inStock && (
            <div className="mb-6">
              <NotifyBackInStockForm
                medusaProductId={product.id || ""}
                productHandle={product.handle || ""}
                productTitle={
                  strapiProductData?.Title || product.title || "this product"
                }
              />
            </div>
          )}

          <ProductFacts strapiProductData={strapiProductData} />

          {/* Description */}
          {productDescription && (
            <>
              <h2 className="text-p-sm-mono font-maison-neue font-bold uppercase text-Charcoal pb-2">
                Description
              </h2>
              <p className="text-p-md font-maison-neue text-Charcoal mb-6 leading-relaxed">
                {productDescription}
              </p>
            </>
          )}

          {/* Kashruth + sourcing chips — only renders flags that come
              from Strapi metadata; always shows the "kashruth policy"
              link so customers who filter on a specific hechsher can
              read GP's umbrella supervision details (#39). */}
          <KashruthBadges
            metadata={strapiProductData?.Metadata}
            countryCode={countryCode}
          />

          {/* Shipping eligibility callout. Lives in the buybox column
              right above SocialShare — that placement was tried in the
              How-It-Works trust zone (#128 attempt) and the rendered
              page looked off (small chip-style card stretching a wide
              gap), so we reverted to buybox-inline per Peter's call. */}
          <ShippingEligibility countryCode={countryCode} />

          {/* Social Share */}
          <div className="mb-8">
            <SocialShare
              url={
                typeof window !== "undefined"
                  ? window.location.href
                  : `/${countryCode}/products/${product.handle}`
              }
              title={product.title || ""}
              description={productDescription || product.description || ""}
              imageUrl={
                strapiProductData?.FeaturedImage?.url || product.thumbnail || ""
              }
            />
          </div>

          {/* Legacy "Details & Certifications" grid removed in #126 —
              the KashruthBadges chip row above renders the same Gluten
              Free / sourcing flags as data-driven chips, and the
              umbrella Certified Kosher graphic still hangs in the
              hero badge area at the top of the page. */}
        </div>
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-white transition-opacity duration-200 lg:hidden ${
          showMobileActions ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className="flex w-full flex-col items-center gap-y-3 border-t border-gray-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          data-testid="mobile-actions"
        >
          <div className="flex w-full min-w-0 items-center justify-center gap-x-2 text-center text-sm text-Charcoal">
            <span className="min-w-0 truncate" data-testid="mobile-title">
              {strapiProductData?.Title || product.title}
            </span>
            <span aria-hidden="true">-</span>
            <span className="shrink-0">{stickyPrice?.calculated_price}</span>
          </div>
          <div
            className={`grid w-full min-w-0 gap-x-4 ${
              isSingleVariant ? "grid-cols-1" : "grid-cols-2"
            }`}
          >
            {!isSingleVariant && (
              <button
                type="button"
                onClick={() =>
                  actionsRef?.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  })
                }
                className="min-h-[44px] min-w-0 rounded-[5px] border border-Charcoal bg-white px-3 py-2 text-center font-rexton text-xs font-bold uppercase text-Charcoal"
                data-testid="mobile-actions-button"
              >
                <span className="block truncate">{optionSummary}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={
                !inStock || !selectedVariant || isAdding || !isValidVariant
              }
              className="min-h-[44px] min-w-0 rounded-[5px] border border-Charcoal bg-Gold px-3 py-2 text-center font-rexton text-xs font-bold uppercase text-Charcoal transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="mobile-cart-button"
            >
              {!selectedVariant
                ? "Select variant"
                : !inStock || !isValidVariant
                ? "Out of stock"
                : isAdding
                ? "Adding..."
                : "Add to cart"}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
