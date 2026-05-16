import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import AddBundleButton from "@modules/products/components/pairs-well-with/add-bundle-button"
import FulfillmentProgress from "@modules/common/components/fulfillment-progress"
import { sanitizeProductCopy } from "@lib/util/product-claims"
import {
  collectionEstimatedSubtotals,
  formatMoneyDelta,
  formatWeightDelta,
  getCollectionSubstitutionGuardrails,
  getSubstitutionImpact,
  lineCartMetadata,
  productPriceDisplay,
} from "@lib/util/collection-substitutions"
import {
  getCollectionProducts,
  type CuratedCollection,
} from "@lib/data/strapi/curated-collections"
export default function CuratedCollectionTemplate({
  collection,
  countryCode,
}: {
  collection: CuratedCollection
  countryCode: string
}) {
  const products = getCollectionProducts(collection)
  const { total, eligible, excluded } = collectionEstimatedSubtotals(products)
  const totalQuantity = products.reduce((sum, item) => sum + item.Quantity, 0)
  const addItems = products
    .map((collectionItem) => {
      const { Product, Quantity } = collectionItem
      const variant = Product.MedusaProduct?.Variants?.[0]
      return {
        variantId: variant?.VariantId || "",
        title: Product.Title,
        quantity: Quantity,
        metadata: lineCartMetadata(collectionItem),
      }
    })
    .filter((item) => item.variantId)
  const substitutionItems = products.filter(
    (item) => item.SubstitutionStatus && item.SubstitutionStatus !== "none"
  )
  const substitutionGuardrails = getCollectionSubstitutionGuardrails(products)
  const requiresSubstitutionAcknowledgement =
    substitutionGuardrails.requiresAcknowledgement
  const needsBusinessReview = substitutionGuardrails.needsBusinessReview
  const heroImage =
    collection.HeroImage?.url ||
    products.find((item) => item.Product.FeaturedImage?.url)?.Product
      .FeaturedImage?.url

  return (
    <main className="bg-white">
      <section className="content-container grid gap-10 py-12 md:grid-cols-[minmax(0,1fr)_420px] md:py-16">
        <div>
          <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
            {collection.Eyebrow || collection.Occasion.replace(/_/g, " ")}
          </p>
          <h1 className="mt-3 font-gyst text-h1-mobile font-bold leading-none text-Charcoal md:text-h1">
            {collection.Name}
          </h1>
          <p className="mt-5 max-w-2xl font-maison-neue text-p-lg leading-relaxed text-Charcoal/75">
            {collection.ShortDescription}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full bg-Scroll px-3 py-1 font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal">
              {collection.CollectionType === "curation_profile"
                ? "Curated profile"
                : "SKU-backed"}
            </span>
            <span className="rounded-full bg-Scroll px-3 py-1 font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal">
              {totalQuantity} items
            </span>
            {collection.TargetMinWeightLb && collection.TargetMaxWeightLb && (
              <span className="rounded-full bg-Scroll px-3 py-1 font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal">
                {collection.TargetMinWeightLb}-{collection.TargetMaxWeightLb} lb
                target
              </span>
            )}
          </div>
        </div>

        <aside className="md:sticky md:top-24 md:self-start">
          <div className="overflow-hidden rounded-[5px] border border-Charcoal/10 bg-Scroll">
            {heroImage && (
              <div className="relative aspect-[4/3] bg-gray-100">
                <Image
                  src={heroImage}
                  alt={collection.HeroImageAlt || collection.Name}
                  fill
                  priority
                  sizes="(min-width: 768px) 420px, 100vw"
                  className="object-cover"
                />
              </div>
            )}
            <div className="p-5">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal/55">
                    Estimated subtotal
                  </p>
                  <p className="mt-1 font-gyst text-h3 leading-none text-Charcoal">
                    ${total.toFixed(2)}
                  </p>
                </div>
                {collection.TargetPriceCents && (
                  <p className="max-w-[130px] text-right font-maison-neue text-xs leading-snug text-Charcoal/55">
                    Target ${Math.round(collection.TargetPriceCents / 100)}
                  </p>
                )}
              </div>

              <FulfillmentProgress
                subtotal={eligible}
                cartSubtotal={total}
                excludedSubtotal={excluded}
                currencyCode="usd"
                className="mb-4"
              />

              {needsBusinessReview && (
                <div className="mb-4 rounded-[5px] border border-VibrantRed/30 bg-VibrantRed/10 p-3 font-maison-neue text-xs leading-relaxed text-Charcoal/70">
                  This collection has a substitution marked for business review.
                  Editors should confirm weight, margin, and shipping cost
                  before promoting it.
                  {substitutionGuardrails.reviewReasons.length > 0 && (
                    <span className="mt-1 block text-Charcoal/60">
                      {substitutionGuardrails.reviewReasons[0]}
                    </span>
                  )}
                </div>
              )}

              <AddBundleButton
                items={addItems}
                countryCode={countryCode}
                bundleId={collection.documentId}
                bundleTitle={collection.Name}
                bundleSlug={collection.Slug}
                requiresAcknowledgement={requiresSubstitutionAcknowledgement}
                acknowledgementLabel={
                  collection.SubstitutionPolicyCopy ||
                  "I understand this collection includes the substitutions shown below."
                }
                disabledReason={
                  needsBusinessReview
                    ? "This collection is temporarily unavailable while we confirm substitution weight and shipping costs."
                    : undefined
                }
              />
              <p className="mt-3 font-maison-neue text-xs leading-relaxed text-Charcoal/55">
                Items are added as normal cart lines. You can edit quantities or
                remove anything before checkout.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <section className="content-container border-t border-Charcoal/10 py-12">
        <div className="mb-8 max-w-3xl">
          <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
            What is included
          </p>
          <h2 className="mt-2 font-gyst text-h2-mobile font-bold leading-tight text-Charcoal md:text-h2">
            Transparent by item
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {products.map(({ Product: item, Quantity, Role, Required }) => {
            const imageUrl = item.FeaturedImage?.url
            const price = productPriceDisplay(item)
            const description = sanitizeProductCopy(
              item.MedusaProduct?.ShortDescription,
              {
                handle: item.MedusaProduct?.Handle,
                title: item.Title,
              }
            )

            return (
              <article
                key={item.documentId}
                className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-4 rounded-[5px] border border-Charcoal/10 bg-white p-4"
              >
                <LocalizedClientLink
                  href={`/products/${item.MedusaProduct?.Handle}`}
                  className="relative aspect-square overflow-hidden rounded-[5px] bg-gray-100"
                >
                  {imageUrl && (
                    <Image
                      src={imageUrl}
                      alt={item.Title}
                      fill
                      sizes="88px"
                      className="object-cover"
                    />
                  )}
                </LocalizedClientLink>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {Quantity > 1 && (
                      <span className="rounded-full bg-Gold/20 px-2 py-0.5 font-maison-neue-mono text-[10px] font-bold uppercase text-Charcoal">
                        {Quantity}x
                      </span>
                    )}
                    <span className="rounded-full bg-Scroll px-2 py-0.5 font-maison-neue-mono text-[10px] font-bold uppercase text-Charcoal/65">
                      {Required === false ? "Optional" : "Recommended"}
                    </span>
                  </div>
                  <LocalizedClientLink
                    href={`/products/${item.MedusaProduct?.Handle}`}
                  >
                    <h3 className="mt-2 line-clamp-2 font-maison-neue text-sm font-semibold leading-snug text-Charcoal hover:text-VibrantRed">
                      {item.Title}
                    </h3>
                  </LocalizedClientLink>
                  <div className="mt-1">
                    {price && (
                      <div className="space-y-0.5">
                        <span className="block font-maison-neue-mono text-[11px] font-bold uppercase leading-tight text-Charcoal/70">
                          {price.primary}
                          {price.primaryLabel && ` ${price.primaryLabel}`}
                        </span>
                        {price.secondary && (
                          <span className="block font-maison-neue text-xs leading-snug text-Charcoal/50">
                            {price.secondary}
                          </span>
                        )}
                      </div>
                    )}
                    {description && (
                      <p className="mt-1 line-clamp-1 font-maison-neue text-xs text-Charcoal/50">
                        {description}
                      </p>
                    )}
                  </div>
                  {Role && (
                    <p className="mt-2 font-maison-neue text-xs leading-relaxed text-Charcoal/60">
                      {Role}
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {substitutionItems.length > 0 && (
        <section className="content-container border-t border-Charcoal/10 py-12">
          <div className="max-w-3xl">
            <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
              Substitutions
            </p>
            <h2 className="mt-2 font-gyst text-h2-mobile font-bold leading-tight text-Charcoal md:text-h2">
              What changed in this collection
            </h2>
            {collection.SubstitutionPolicyCopy && (
              <p className="mt-3 font-maison-neue text-p-md leading-relaxed text-Charcoal/70">
                {collection.SubstitutionPolicyCopy}
              </p>
            )}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {substitutionItems.map((item) =>
              (() => {
                const impact = getSubstitutionImpact(item)
                const weightDelta = formatWeightDelta(impact.weightDelta)
                return (
                  <div
                    key={`${item.Product.documentId}-substitution`}
                    className="rounded-[5px] border border-Gold/40 bg-Gold/10 p-4"
                  >
                    <p className="font-maison-neue-mono text-[10px] font-bold uppercase tracking-wide text-VibrantRed">
                      {item.SubstitutionStatus === "out_of_stock_substituted"
                        ? "Out of stock substitution"
                        : "Editor substitution"}
                    </p>
                    <p className="mt-2 font-maison-neue text-sm font-semibold text-Charcoal">
                      {item.OriginalQuantity && item.OriginalQuantity > 1
                        ? `${item.OriginalQuantity}x `
                        : ""}
                      {item.OriginalProduct?.Title ||
                        item.OriginalProductName ||
                        "Original item"}{" "}
                      → {item.Quantity > 1 ? `${item.Quantity}x ` : ""}
                      {item.Product.Title}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {impact.priceDelta != null && (
                        <span className="rounded-full bg-white px-2 py-1 font-maison-neue-mono text-[10px] font-bold uppercase tracking-wide text-Charcoal/65">
                          {formatMoneyDelta(impact.priceDelta)}
                        </span>
                      )}
                      {weightDelta && (
                        <span className="rounded-full bg-white px-2 py-1 font-maison-neue-mono text-[10px] font-bold uppercase tracking-wide text-Charcoal/65">
                          {weightDelta}
                        </span>
                      )}
                      {item.ShippingCostRisk &&
                        item.ShippingCostRisk !== "normal" && (
                          <span className="rounded-full bg-white px-2 py-1 font-maison-neue-mono text-[10px] font-bold uppercase tracking-wide text-VibrantRed">
                            Shipping review
                          </span>
                        )}
                    </div>
                    {item.SubstitutionNote && (
                      <p className="mt-2 font-maison-neue text-sm leading-relaxed text-Charcoal/70">
                        {item.SubstitutionNote}
                      </p>
                    )}
                  </div>
                )
              })()
            )}
          </div>
        </section>
      )}

      {collection.CustomerFacingRationale && (
        <section className="bg-Scroll py-12">
          <div className="content-container max-w-3xl">
            <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
              Why this collection works
            </p>
            <div className="mt-4 rounded-[5px] border border-Charcoal/10 bg-white p-5 font-maison-neue text-sm leading-relaxed text-Charcoal/70">
              {collection.CustomerFacingRationale}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
