import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import AddBundleButton from "./add-bundle-button"
import { sanitizeProductCopy } from "@lib/util/product-claims"
import {
  getCollectionProducts,
  getCuratedCollections,
  type CuratedCollection,
} from "@lib/data/strapi/curated-collections"
import { withTimeout } from "@lib/util/promise-timeout"
import type { HttpTypes } from "@medusajs/types"
import {
  getCollectionSubstitutionGuardrails,
  lineEstimatedTotal,
  lineCartMetadata,
  productPriceDisplay,
} from "@lib/util/collection-substitutions"

function normalize(value?: unknown) {
  if (value == null) return ""
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function asArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function currentProductText(
  product: HttpTypes.StoreProduct,
  strapiProductData?: any
) {
  const tags =
    asArray(strapiProductData?.Categorization?.ProductTags)
      .map((tag: any) => tag?.Name)
      .filter(Boolean) || []
  return normalize(
    [
      product.title,
      product.handle,
      product.description,
      strapiProductData?.Title,
      strapiProductData?.MedusaProduct?.Description,
      ...tags,
    ].join(" ")
  )
}

function scoreCollection(collection: CuratedCollection, currentText: string) {
  let score = collection.IsFeatured ? 8 : 0
  score += Math.max(0, 200 - (collection.SortOrder || 100)) / 100

  for (const keyword of asArray(collection.PdpMatchKeywords)) {
    const normalizedKeyword = normalize(keyword)
    if (normalizedKeyword && currentText.includes(normalizedKeyword))
      score += 10
  }

  for (const rule of asArray(collection.RecommendationRules)) {
    if (!rule || rule.Surface !== "pdp") continue
    for (const keyword of asArray(rule.MatchKeywords)) {
      const normalizedKeyword = normalize(keyword)
      if (normalizedKeyword && currentText.includes(normalizedKeyword))
        score += 6
    }
    score += Math.max(0, 200 - (rule.Priority || 100)) / 200
  }

  return score
}

function prepareCollections(
  collections: CuratedCollection[],
  product: HttpTypes.StoreProduct,
  strapiProductData?: any
) {
  const currentHandle = product.handle || ""
  const currentText = currentProductText(product, strapiProductData)

  return asArray(collections)
    .map((collection) => {
      const products = getCollectionProducts(collection).filter(
        ({ Product }) =>
          Product?.MedusaProduct?.Handle &&
          Product.MedusaProduct.Handle !== currentHandle
      )
      return {
        ...collection,
        products,
        score: scoreCollection(collection, currentText),
      }
    })
    .filter((collection) => collection.products.length >= 2)
    .sort(
      (a, b) => b.score - a.score || (a.SortOrder || 999) - (b.SortOrder || 999)
    )
    .slice(0, 3)
}

export default async function PairsWellWith({
  product,
  countryCode,
  strapiProductData,
}: {
  product: HttpTypes.StoreProduct
  countryCode: string
  strapiProductData?: any
}) {
  let collections: ReturnType<typeof prepareCollections> = []
  try {
    const curatedCollections = await withTimeout(
      getCuratedCollections({
        countryCode,
        surface: "pdp",
        customerState: "all",
        limit: 12,
      }),
      1800,
      [],
      `PDP curated collections for ${product.handle || product.id}`
    )
    collections = prepareCollections(
      curatedCollections,
      product,
      strapiProductData
    )
  } catch (error) {
    console.error("Failed to render PDP curated collections:", {
      productId: product.id,
      handle: product.handle,
      error,
    })
    return null
  }

  if (collections.length === 0) return null

  return (
    <section className="bg-Scroll py-12 md:py-16">
      <div className="content-container">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
              Complete the cart
            </p>
            <h2 className="mt-2 font-gyst text-h3 font-bold leading-tight text-Charcoal">
              Pairs well with this order
            </h2>
          </div>
          <p className="max-w-xl font-maison-neue text-p-md leading-relaxed text-Charcoal/70">
            Curated collections for the way customers actually cook: Shabbos,
            weeknights, grilling, holidays, and first orders.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {collections.map((collection) => {
            const substitutionGuardrails = getCollectionSubstitutionGuardrails(
              collection.products
            )
            const quickAddDisabledReason =
              substitutionGuardrails.needsBusinessReview
                ? "This collection is temporarily unavailable while we confirm the final item mix."
                : substitutionGuardrails.requiresAcknowledgement
                ? "Review substitution details on the collection page before adding."
                : undefined
            const items = collection.products
              .map((collectionItem) => ({
                variantId:
                  collectionItem.Product.MedusaProduct?.Variants?.[0]
                    ?.VariantId || "",
                title:
                  collectionItem.Product.Title ||
                  collectionItem.Product.MedusaProduct?.Handle ||
                  "",
                quantity: collectionItem.Quantity || 1,
                metadata: lineCartMetadata(collectionItem),
              }))
              .filter((item) => item.variantId)
            const total = collection.products.reduce(
              (sum, item) =>
                sum + lineEstimatedTotal(item.Product, item.Quantity || 1),
              0
            )
            const occasion =
              collection.Occasion && typeof collection.Occasion === "string"
                ? collection.Occasion.replace(/_/g, " ")
                : "recommended"

            return (
              <article
                key={collection.documentId || collection.Slug}
                className="flex min-w-0 flex-col rounded-[5px] border border-Charcoal/10 bg-white"
              >
                <div className="border-b border-Charcoal/10 p-5">
                  <p className="font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-VibrantRed">
                    {collection.Eyebrow || occasion}
                  </p>
                  <h3 className="mt-2 font-gyst text-h4 font-bold leading-tight text-Charcoal">
                    {collection.Name || "Recommended picks"}
                  </h3>
                  {collection.ShortDescription && (
                    <p className="mt-2 font-maison-neue text-sm leading-relaxed text-Charcoal/70">
                      {collection.ShortDescription}
                    </p>
                  )}
                  {collection.Slug && (
                    <LocalizedClientLink
                      href={`/collections/${collection.Slug}`}
                      className="mt-3 inline-flex font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal underline underline-offset-4"
                    >
                      View collection
                    </LocalizedClientLink>
                  )}
                </div>

                <div className="flex flex-1 flex-col divide-y divide-Charcoal/10">
                  {collection.products.map(({ Product: item, Quantity }) => {
                    const imageUrl =
                      typeof item.FeaturedImage?.url === "string"
                        ? item.FeaturedImage.url
                        : null
                    const price = productPriceDisplay(item)
                    const lineTotal = lineEstimatedTotal(item, Quantity || 1)
                    const description = sanitizeProductCopy(
                      item.MedusaProduct?.ShortDescription,
                      {
                        handle: item.MedusaProduct?.Handle,
                        title: item.Title,
                      }
                    )

                    return (
                      <LocalizedClientLink
                        key={item.documentId}
                        href={`/products/${item.MedusaProduct?.Handle}`}
                        className="grid min-w-0 grid-cols-[72px_minmax(0,1fr)] gap-3 p-4 transition-colors hover:bg-Scroll"
                      >
                        <div className="relative aspect-square overflow-hidden rounded-[5px] bg-gray-100">
                          {imageUrl && (
                            <Image
                              src={imageUrl}
                              alt={item.Title}
                              fill
                              sizes="72px"
                              className="object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-start gap-2">
                            {Quantity > 1 && (
                              <span className="mt-0.5 shrink-0 rounded-full bg-Gold/20 px-2 py-0.5 font-maison-neue-mono text-[10px] font-bold uppercase text-Charcoal">
                                {Quantity}x
                              </span>
                            )}
                            <p className="line-clamp-2 font-maison-neue text-sm font-semibold leading-snug text-Charcoal">
                              {item.Title || "Recommended product"}
                            </p>
                          </div>
                          <div className="mt-1">
                            {price && (
                              <div className="space-y-0.5">
                                <span className="block font-maison-neue-mono text-[11px] font-bold uppercase leading-tight text-Charcoal/70">
                                  {price.primary}
                                  {price.primaryLabel &&
                                    ` ${price.primaryLabel}`}
                                </span>
                                {price.secondary && (
                                  <span className="block font-maison-neue text-xs leading-snug text-Charcoal/60">
                                    {price.secondary}
                                  </span>
                                )}
                                {Quantity > 1 && lineTotal > 0 && (
                                  <span className="block font-maison-neue text-xs leading-snug text-Charcoal/60">
                                    Line est. ${lineTotal.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            )}
                            {description && (
                              <span className="mt-1 block line-clamp-1 font-maison-neue text-xs text-Charcoal/60">
                                {description}
                              </span>
                            )}
                          </div>
                        </div>
                      </LocalizedClientLink>
                    )
                  })}
                </div>

                <div className="border-t border-Charcoal/10 p-5">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <span className="font-maison-neue text-sm text-Charcoal/60">
                      Estimated subtotal
                    </span>
                    <span className="font-gyst text-h4 leading-none text-Charcoal">
                      ${total.toFixed(2)}
                    </span>
                  </div>
                  <AddBundleButton
                    items={items}
                    countryCode={countryCode}
                    bundleId={collection.documentId}
                    bundleTitle={collection.Name}
                    bundleSlug={collection.Slug}
                    disabledReason={quickAddDisabledReason}
                  />
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
