"use client"

import React from "react"
import NextImage from "next/image"
import { toast } from "@medusajs/ui"
import SocialShare from "@modules/common/components/social-share"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import FavoriteButton from "@modules/recipes/components/favorite-button"
import RecipeIngredients from "@modules/recipes/components/ingredients"
import VideoEmbed from "@modules/common/components/video-embed"
import { RecipeDetailAnalytics } from "@modules/recipes/components/recipe-analytics"
import { addToCart } from "@lib/data/cart"
import { experimentCartMetadata } from "@lib/experiments/client-context"
import { trackRecipePrintOrSave } from "@lib/gtm"
import { reportClientOpsAlert } from "@lib/client-ops-alert"
import { dispatchCartUpdated } from "@lib/util/cart-events"
import {
  freeDeliveryEligibilityMetadata,
  getProductFreeDeliveryEligibility,
} from "@lib/util/free-delivery-eligibility"
import { isVariantPurchasable } from "@lib/util/product-availability"
import { formatProductPriceDisplay } from "@lib/util/price-display"
import { sanitizeProductCopy } from "@lib/util/product-claims"
import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"

type Recipe = {
  Title: string
  Slug: string
  ShortDescription?: string
  Image?: { url: string }
  PublishedDate?: string
  Servings?: string
  PrepTime?: string
  CookTime?: string
  TotalTime?: string
  Ingredients?: { id: string | number; ingredient: string }[]
  Steps?: { id: string | number; instruction: string }[]
  VideoUrl?: string
  RecipeCategories?: { Name: string; Slug: string }[]
  RelatedProducts?: StrapiCollectionProduct[]
}

type RecipeTemplateProps = {
  recipe: Recipe
  countryCode: string
  isLoggedIn?: boolean
  isFavorited?: boolean
}

const PrintButton = ({
  recipeSlug,
  recipeTitle,
}: {
  recipeSlug: string
  recipeTitle: string
}) => {
  const handlePrint = () => {
    trackRecipePrintOrSave({
      action: "print",
      recipeSlug,
      recipeTitle,
    })
    window.print()
  }

  return (
    <button
      onClick={handlePrint}
      className="print-hide inline-flex items-center gap-2 px-4 py-2 bg-Charcoal/5 hover:bg-Charcoal/10 text-Charcoal/70 hover:text-Charcoal rounded-[5px] transition-colors text-p-sm font-maison-neue"
      aria-label="Print this recipe"
    >
      <svg
        className="w-5 h-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="6 9 6 2 18 2 18 9" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <rect x="6" y="14" width="12" height="8" />
      </svg>
      Print Recipe
    </button>
  )
}

const RecipeHeroProduct = ({
  product,
  countryCode,
}: {
  product: StrapiCollectionProduct
  countryCode: string
}) => {
  const [isAdding, setIsAdding] = React.useState(false)
  const variant = product.MedusaProduct?.Variants?.[0]
  const canAddToCart = Boolean(
    variant?.VariantId && isVariantPurchasable(variant)
  )
  const handle = product.MedusaProduct?.Handle
  const imageUrl = product.FeaturedImage?.url || product.GalleryImages?.[0]?.url
  const productTitle = product.Title || "Featured product"
  const shortDescription = sanitizeProductCopy(
    product.MedusaProduct?.ShortDescription,
    {
      handle,
      title: productTitle,
    }
  )
  const rawPrice = variant?.Price?.CalculatedPriceNumber
  const priceDisplay =
    typeof rawPrice === "number"
      ? formatProductPriceDisplay(
          Number(rawPrice),
          product.Metadata,
          variant?.Sku,
          product.MedusaProduct?.PricingMode
        )
      : null
  const facts = [
    variant?.Sku ? { label: "SKU", value: variant.Sku } : null,
    product.Metadata?.AvgPackWeight
      ? { label: "Pack", value: product.Metadata.AvgPackWeight }
      : null,
    product.Metadata?.Serves
      ? { label: "Serves", value: product.Metadata.Serves }
      : null,
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact))

  const handleAddToCart = async () => {
    if (!variant?.VariantId || !canAddToCart) return

    setIsAdding(true)
    try {
      const metadata = freeDeliveryEligibilityMetadata(
        getProductFreeDeliveryEligibility(product, variant.Sku)
      )
      const cartMetadata = {
        ...experimentCartMetadata(),
        ...metadata,
      }
      await addToCart({
        variantId: variant.VariantId,
        quantity: 1,
        countryCode,
        metadata: Object.keys(cartMetadata).length ? cartMetadata : undefined,
      })
      dispatchCartUpdated({
        action: "add",
        variantId: variant.VariantId,
        quantity: 1,
      })
      toast.success("Added to cart", { description: productTitle })
    } catch (error) {
      console.error("Failed to add recipe product to cart:", error)
      reportClientOpsAlert({
        alertKind: "client_add_to_cart_failed",
        title: "Storefront client add-to-cart failed",
        surface: "recipe_hero_product",
        action: "add_to_cart",
        error,
        productId: product.MedusaProduct?.ProductId,
        variantId: variant.VariantId,
        productHandle: handle,
      })
      toast.error("Couldn't add to cart", {
        description: "Please try again in a moment.",
      })
    } finally {
      setIsAdding(false)
    }
  }

  const productImage = (
    <figure className="relative aspect-square w-full overflow-hidden rounded-[5px] bg-Charcoal/[0.04]">
      {imageUrl && (
        <NextImage
          src={imageUrl}
          alt={productTitle}
          fill
          sizes="(min-width: 640px) 160px, 35vw"
          className="object-cover"
        />
      )}
    </figure>
  )

  return (
    <section
      aria-labelledby="recipe-hero-product-heading"
      className="print-hide rounded-[5px] border border-Charcoal/20 bg-Charcoal/[0.03] p-4 sm:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center">
        {handle ? (
          <LocalizedClientLink
            href={`/products/${handle}`}
            className="block min-w-0"
          >
            {productImage}
          </LocalizedClientLink>
        ) : (
          productImage
        )}

        <div className="min-w-0">
          <p className="font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-VibrantRed">
            Hero product
          </p>
          {handle ? (
            <LocalizedClientLink href={`/products/${handle}`}>
              <h2
                id="recipe-hero-product-heading"
                className="mt-1 text-h4 font-gyst font-bold leading-tight text-Charcoal transition-colors hover:text-VibrantRed"
              >
                {productTitle}
              </h2>
            </LocalizedClientLink>
          ) : (
            <h2
              id="recipe-hero-product-heading"
              className="mt-1 text-h4 font-gyst font-bold leading-tight text-Charcoal"
            >
              {productTitle}
            </h2>
          )}

          {shortDescription && (
            <p className="mt-2 text-sm font-maison-neue leading-snug text-Charcoal/70">
              {shortDescription}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-3">
            {facts.map((fact) => (
              <div key={fact.label}>
                <p className="font-maison-neue-mono text-[10px] font-bold uppercase tracking-wide text-Charcoal/60">
                  {fact.label}
                </p>
                <p className="mt-0.5 font-maison-neue text-sm text-Charcoal">
                  {fact.value}
                </p>
              </div>
            ))}
            {priceDisplay && (
              <div>
                <p className="font-maison-neue-mono text-[10px] font-bold uppercase tracking-wide text-Charcoal/60">
                  Price
                </p>
                <p className="mt-0.5 font-maison-neue text-sm text-Charcoal">
                  <span className="font-gyst text-h4 leading-none">
                    {priceDisplay.primary}
                  </span>
                  {priceDisplay.primaryLabel && (
                    <span className="ml-1 font-maison-neue-mono text-[11px] uppercase">
                      {priceDisplay.primaryLabel}
                    </span>
                  )}
                </p>
                {priceDisplay.secondary && (
                  <p className="mt-1 font-maison-neue text-xs text-Charcoal/70">
                    {priceDisplay.secondary}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
            <button
              onClick={handleAddToCart}
              disabled={isAdding || !canAddToCart}
              className="inline-flex min-h-[44px] min-w-0 items-center justify-center rounded-[5px] border border-Charcoal bg-Gold px-4 py-2 font-rexton text-xs font-bold uppercase text-Charcoal transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              data-agent-action="add-recipe-hero-product-to-cart"
              data-product-handle={handle}
              data-variant-id={variant?.VariantId}
              data-sku={variant?.Sku}
            >
              {isAdding ? "Adding..." : canAddToCart ? "Add to Cart" : "Out of stock"}
            </button>
            {handle && (
              <LocalizedClientLink
                href={`/products/${handle}`}
                className="inline-flex min-h-[44px] min-w-0 items-center justify-center rounded-[5px] border border-Charcoal px-4 py-2 font-rexton text-xs font-bold uppercase text-Charcoal transition-colors hover:bg-Charcoal hover:text-white"
              >
                View Product
              </LocalizedClientLink>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

const RecipeTemplate = ({
  recipe,
  countryCode,
  isLoggedIn = false,
  isFavorited = false,
}: RecipeTemplateProps) => {
  const {
    Title,
    Slug,
    ShortDescription,
    PublishedDate,
    PrepTime,
    CookTime,
    TotalTime,
    Servings,
    Ingredients = [],
    Steps = [],
    Image,
    VideoUrl,
  } = recipe
  const heroProduct = recipe.RelatedProducts?.find(
    (product) => product.MedusaProduct?.Handle
  ) || recipe.RelatedProducts?.[0]

  return (
    <section className="py-10 md:py-16 bg-white text-Charcoal">
      <RecipeDetailAnalytics
        recipeSlug={Slug}
        recipeTitle={Title}
        categories={recipe.RecipeCategories?.map((category) => category.Name)}
      />
      <div className="mx-auto max-w-4xl px-4 recipe-print-container">
        <article className="space-y-12">
          {/* Header */}
          <header>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
              <h1 className="text-h2 font-gyst text-Charcoal">{Title}</h1>
              <div className="print-hide flex items-center gap-3">
                <FavoriteButton
                  recipeSlug={Slug}
                  recipeTitle={Title}
                  initialFavorited={isFavorited}
                  isLoggedIn={isLoggedIn}
                  variant="button"
                />
                <PrintButton recipeSlug={Slug} recipeTitle={Title} />
              </div>
            </div>
            {PublishedDate && (
              <p className="mt-1 text-p-md font-maison-neue text-Charcoal/80">
                Published{" "}
                {new Date(PublishedDate).toLocaleDateString("en-US", {
                  timeZone: "UTC",
                })}
              </p>
            )}
            {ShortDescription && (
              <p className="mt-6 text-p-lg font-maison-neue text-Charcoal">
                {ShortDescription}
              </p>
            )}
          </header>

          {/* Image */}
          {Image?.url && (
            <div className="w-full aspect-[3/2] relative rounded-[5px] overflow-hidden shadow-sm">
              <NextImage
                src={Image.url}
                alt={`Image of ${Title}`}
                fill
                sizes="(min-width: 768px) 720px, 100vw"
                className="object-cover"
                priority
              />
            </div>
          )}

          {heroProduct && (
            <RecipeHeroProduct
              product={heroProduct}
              countryCode={countryCode}
            />
          )}

          {/* Video */}
          {VideoUrl && (
            <section aria-labelledby="video-heading" className="print-hide">
              <h2
                id="video-heading"
                className="text-h3 font-gyst text-Charcoal mb-6"
              >
                Watch How It&apos;s Made
              </h2>
              <VideoEmbed url={VideoUrl} title={`How to make ${Title}`} />
            </section>
          )}

          {/* Stats */}
          <section aria-label="Recipe timing and serving info">
            <div className="recipe-stats grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-b border-Charcoal py-4 text-center">
              {[
                { label: "Total Time", value: TotalTime },
                { label: "Prep Time", value: PrepTime },
                { label: "Cook Time", value: CookTime },
                { label: "Servings", value: Servings },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-p-sm-mono font-maison-neue font-bold uppercase text-Charcoal">
                    {item.label}
                  </p>
                  <p className="text-p-sm-mono font-maison-neue-mono text-Charcoal">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Ingredients */}
          <RecipeIngredients ingredients={Ingredients} />

          {/* Steps */}
          <section aria-labelledby="steps-heading">
            <h2
              id="steps-heading"
              className="text-h3 font-gyst text-Charcoal mb-6"
            >
              Preparation
            </h2>

            <dl className="space-y-8">
              {Steps?.map((step, index) => (
                <div key={step.id} className="">
                  <dt className="text-h4 font-gyst font-bold text-Charcoal pb-2">
                    Step {index + 1}:
                  </dt>
                  <dd className="text-p-md font-maison-neue text-Charcoal">
                    {step.instruction}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Social Share */}
          <section className="print-hide border-t border-Charcoal/20 pt-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-p-md font-maison-neue text-Charcoal">
                Enjoyed this recipe? Share it with friends!
              </p>
              <SocialShare
                url={typeof window !== "undefined" ? window.location.href : `/recipes/${recipe.Slug}`}
                title={Title}
                description={ShortDescription || `Check out this delicious ${Title} recipe from Grillers Pride!`}
                imageUrl={Image?.url || ""}
              />
            </div>
          </section>
        </article>
      </div>
    </section>
  )
}

export default RecipeTemplate
