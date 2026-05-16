"use client"

import React from "react"
import { Swiper, SwiperSlide } from "swiper/react"
import "swiper/css"
import Image from "next/image"
import { toast } from "@medusajs/ui"
import { addToCart } from "@lib/data/cart"
import { dispatchCartUpdated } from "@lib/util/cart-events"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import AddBundleButton from "@modules/products/components/pairs-well-with/add-bundle-button"
import type {
  CuratedCollection,
  CuratedCollectionItem,
} from "@lib/data/strapi/curated-collections"
import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"
import {
  collectionEstimatedSubtotals,
  getCollectionSubstitutionGuardrails,
  lineEstimatedTotal,
  lineCartMetadata,
  productPriceDisplay,
} from "@lib/util/collection-substitutions"

export default function ShopCollectionsSection({
  data,
  countryCode,
  collections = [],
}: {
  countryCode: string
  data: {
    CollectionsTitle: string
    Collections: Array<{
      id: number
      Title: string
      Slug: string
      Image: {
        url: string
      }
    }>
  }
  collections?: CuratedCollection[]
}) {
  const title = data?.CollectionsTitle || "Curated collections"
  const cards =
    collections.length > 0
      ? collections.map((collection) => {
          const firstProduct = collection.Items?.find(
            (item) => item.Product
          )?.Product
          const products = collectionItems(collection)
          const guardrails = getCollectionSubstitutionGuardrails(products)
          const totalQuantity = products.reduce(
            (sum, item) => sum + (item.Quantity || 1),
            0
          )
          const { total } = collectionEstimatedSubtotals(products)
          return {
            id: collection.documentId,
            title: collection.Name,
            slug: `/collections/${collection.Slug}`,
            collection,
            products,
            totalQuantity,
            estimatedSubtotal: total,
            guardrails,
            imageUrl:
              collection.HeroImage?.url ||
              firstProduct?.FeaturedImage?.url ||
              "",
            alt:
              collection.HeroImageAlt || firstProduct?.Title || collection.Name,
            description: collection.ShortDescription,
            eyebrow: collection.Eyebrow,
          }
        })
      : (data?.Collections || []).map((collection) => ({
          id: collection.id,
          title: collection.Title,
          slug: collection.Slug,
          collection: null,
          products: [],
          totalQuantity: 0,
          estimatedSubtotal: null,
          guardrails: null,
          imageUrl: collection.Image?.url || "",
          alt: collection.Title,
          description: "",
          eyebrow: "",
        }))

  if (!cards.length) return null

  return (
    <section className="pt-14 md:pt-32 pb-8 bg-Scroll overflow-hidden">
      <div className="mx-auto max-w-7xl px-4.5">
        <div className="flex justify-between items-end mb-12">
          <h2 className="text-h2-mobile font-gyst md:text-h2 text-Charcoal">
            {title}
          </h2>
          <LocalizedClientLink
            href="/collections"
            className="h-[44px] w-[44px] border border-black rounded-full flex items-center justify-center"
          >
            <Image
              src="/images/icons/arrow-right.svg"
              width={20}
              height={12}
              alt="See all collections"
            />
          </LocalizedClientLink>
        </div>

        {/* Slider */}
        <Swiper
          spaceBetween={24}
          // Match Shop Bestsellers: the next card peeks on mobile so the
          // row advertises horizontal swiping.
          slidesPerView={1.15}
          breakpoints={{
            480: { slidesPerView: 2 },
            768: { slidesPerView: 3 },
            1024: { slidesPerView: 3 },
          }}
          className="swiper-visible"
        >
          {cards.map((col) => (
            <SwiperSlide key={col.id} className="pb-4">
              <article className="flex h-full min-w-0 flex-col overflow-hidden">
                <LocalizedClientLink href={col.slug}>
                  <figure className="relative w-full aspect-square bg-gray-50">
                    {col.imageUrl && (
                      <Image
                        src={col.imageUrl}
                        alt={col.alt}
                        fill
                        className="object-cover"
                      />
                    )}
                  </figure>
                </LocalizedClientLink>

                <div className="flex flex-1 flex-col py-8">
                  <LocalizedClientLink
                    href={col.slug}
                    className="block min-h-[168px] md:min-h-[178px]"
                  >
                    {col.eyebrow && (
                      <p className="mb-2 min-h-[14px] font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-VibrantRed">
                        {col.eyebrow}
                      </p>
                    )}
                    <h4
                      id={`collection-${col.id}-title`}
                      className="min-h-[72px] border-b border-Charcoal pb-6 font-gyst text-h4 font-bold leading-tight text-Charcoal"
                    >
                      {col.title}
                    </h4>
                    {col.description && (
                      <p className="mt-4 line-clamp-2 font-maison-neue text-sm leading-relaxed text-Charcoal/65">
                        {col.description}
                      </p>
                    )}
                  </LocalizedClientLink>

                  {col.collection && col.products.length > 0 && (
                    <div className="mt-5 border-t border-Charcoal/15 pt-4">
                      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                        <div>
                          <p className="font-maison-neue-mono text-[10px] font-bold uppercase tracking-wide text-Charcoal/55">
                            Collection subtotal
                          </p>
                          <p className="mt-1 font-maison-neue text-sm font-semibold text-Charcoal">
                            ${col.estimatedSubtotal?.toFixed(2)} estimated
                          </p>
                        </div>
                        <LocalizedClientLink
                          href={col.slug}
                          className="mt-[19px] inline-flex min-h-[16px] items-center gap-2 font-rexton text-[11px] font-bold uppercase leading-none tracking-wide text-Charcoal hover:text-VibrantRed"
                        >
                          View items
                          <Image
                            src="/images/icons/arrow-right.svg"
                            width={16}
                            height={10}
                            alt=""
                            aria-hidden="true"
                          />
                        </LocalizedClientLink>
                      </div>

                      <AddBundleButton
                        items={col.products
                          .map((item) => {
                            const variant =
                              item.Product.MedusaProduct?.Variants?.[0]
                            return {
                              variantId: variant?.VariantId || "",
                              title: item.Product.Title,
                              quantity: item.Quantity || 1,
                              metadata: lineCartMetadata(item),
                            }
                          })
                          .filter((item) => item.variantId)}
                        countryCode={countryCode}
                        bundleId={col.collection.documentId}
                        bundleTitle={col.collection.Name}
                        bundleSlug={col.collection.Slug}
                        disabledReason={
                          col.guardrails?.needsBusinessReview
                            ? "Needs substitution review before purchase."
                            : col.guardrails?.requiresAcknowledgement
                            ? "Review substitution details first."
                            : undefined
                        }
                        className="space-y-2"
                        fullWidth
                      />

                      <ul
                        className="mt-4 space-y-2"
                        aria-label={`${col.title} items`}
                      >
                        {col.products.map((item) => {
                          const price = productPriceDisplay(item.Product)
                          const lineTotal = lineEstimatedTotal(
                            item.Product,
                            item.Quantity || 1
                          )

                          return (
                            <li
                              key={`${col.id}-${item.Product.documentId}`}
                              className="flex min-w-0 items-start justify-between gap-3 border-t border-Charcoal/10 pt-2"
                            >
                              <LocalizedClientLink
                                href={`/products/${item.Product.MedusaProduct?.Handle}`}
                                className="min-w-0"
                              >
                                <span className="font-maison-neue text-xs font-semibold leading-snug text-Charcoal">
                                  {item.Quantity > 1
                                    ? `${item.Quantity}x `
                                    : ""}
                                  {item.Product.Title}
                                </span>
                                {price ? (
                                  <span className="mt-1 block space-y-0.5">
                                    <span className="block font-maison-neue-mono text-[10px] font-bold uppercase leading-tight tracking-wide text-Charcoal/55">
                                      {price.primary}
                                      {price.primaryLabel &&
                                        ` ${price.primaryLabel}`}
                                    </span>
                                    {price.secondary && (
                                      <span className="block font-maison-neue text-[11px] leading-snug text-Charcoal/50">
                                        {price.secondary}
                                      </span>
                                    )}
                                    {item.Quantity > 1 && lineTotal > 0 && (
                                      <span className="block font-maison-neue text-[11px] leading-snug text-Charcoal/50">
                                        Line est. ${lineTotal.toFixed(2)}
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="mt-1 block font-maison-neue-mono text-[10px] uppercase tracking-wide text-Charcoal/45">
                                    See price
                                  </span>
                                )}
                              </LocalizedClientLink>
                              <CollectionItemAddButton
                                item={item}
                                collection={col.collection}
                                countryCode={countryCode}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  {!col.collection && (
                    <LocalizedClientLink
                      href={col.slug}
                      className="pt-4 inline-flex items-center gap-2"
                    >
                      <span className="text-p-sm-mono font-rexton uppercase font-bold">
                        Explore
                      </span>
                      <Image
                        src="/images/icons/arrow-right.svg"
                        width={20}
                        height={12}
                        alt=""
                        aria-hidden="true"
                      />
                    </LocalizedClientLink>
                  )}
                </div>
              </article>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  )
}

type ResolvedCollectionItem = CuratedCollectionItem & {
  Product: StrapiCollectionProduct
}

function collectionItems(
  collection: CuratedCollection
): ResolvedCollectionItem[] {
  return (collection.Items || []).filter(
    (item): item is ResolvedCollectionItem =>
      Boolean(item.Product?.MedusaProduct?.Variants?.[0]?.VariantId)
  )
}

function CollectionItemAddButton({
  item,
  collection,
  countryCode,
}: {
  item: ResolvedCollectionItem
  collection: CuratedCollection
  countryCode: string
}) {
  const [isAdding, setIsAdding] = React.useState(false)
  const variant = item.Product.MedusaProduct?.Variants?.[0]
  const quantity = item.Quantity || 1

  const onAdd = async () => {
    if (!variant?.VariantId) return
    setIsAdding(true)
    try {
      await addToCart({
        variantId: variant.VariantId,
        quantity,
        countryCode,
        metadata: {
          ...lineCartMetadata(item),
          source_collection_id: collection.documentId,
          source_collection_title: collection.Name,
          source_collection_slug: collection.Slug,
        },
      })
      dispatchCartUpdated({
        action: "add",
        variantId: variant.VariantId,
        quantity,
      })
      toast.success("Added to cart", {
        description: item.Product.Title,
      })
    } catch (error) {
      console.error("Failed to add collection item:", error)
      toast.error("Couldn't add item", {
        description: "Please try again in a moment.",
      })
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={isAdding || !variant?.VariantId}
      className="inline-flex min-h-[34px] shrink-0 items-center justify-center rounded-full border border-Charcoal px-3 font-rexton text-[10px] font-bold uppercase tracking-wide text-Charcoal transition-colors hover:bg-Charcoal hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isAdding ? "Adding" : quantity > 1 ? `Add ${quantity}x` : "Add"}
    </button>
  )
}
