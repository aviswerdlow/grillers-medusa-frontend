import { Metadata } from "next"

import { generateAlternates } from "@lib/util/seo"
import { getBaseURL } from "@lib/util/env"
import { getStoreProducts } from "@lib/data/strapi/collections"
import { enrichStrapiProductsWithMedusaPrices } from "@lib/data/products"
import { compactCollectionProducts } from "@lib/util/collection-product"
import { variantNeedsInventoryObservation } from "@lib/util/product-availability"
import CollectionTemplate from "@modules/collections/templates"
import ExperimentExposure from "@lib/experiments/exposure"
import { getExperimentAssignment } from "@lib/experiments/server"
import { itemListJsonLd, webPageJsonLd } from "@lib/util/structured-data"
import strapiClient from "@lib/strapi"
import {
  emitStoreCatalogEmptyAlert,
  emitStoreCatalogInventoryMissingAlert,
  emitStoreCatalogLoadFailureAlert,
} from "@lib/store-catalog-ops-alerts"
import {
  resolveEmptyStoreCatalogDecision,
  isProductionBuildPhase,
} from "@lib/store-catalog-resolution"

type Params = {
  params: Promise<{ countryCode: string }>
}

export const maxDuration = 60
export const revalidate = 300

export function generateStaticParams() {
  return [{ countryCode: "us" }]
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { countryCode } = await params
  const alternates = await generateAlternates("/store", countryCode)

  return {
    title: "Shop All Products | Grillers Pride",
    description:
      "Browse our full kosher catalog: beef, poultry, lamb, veal, prepared and provisions. Filter by cooking state, sourcing, and certification.",
    alternates,
  }
}

export default async function StorePage(props: Params) {
  const { countryCode } = await props.params

  // Track whether the catalog came back empty because Strapi ERRORED/timed out
  // (onLoadFailure fires unrecovered) vs. genuinely returned nothing. These must
  // be handled differently — a transient Strapi outage must not take down the
  // browse page or block the deploy (which prerenders this page).
  let catalogLoadFailed = false
  const rawProducts = await getStoreProducts(strapiClient, {
    onLoadFailure: (failure) => {
      if (failure.recovered === false) {
        catalogLoadFailed = true
      }
      void emitStoreCatalogLoadFailureAlert(failure).catch(() => {
        // Fail-open: catalog alerting must never block store rendering.
      })
    },
  })
  // Cards collapse without an image, so require FeaturedImage at minimum
  // (matches the prior Strapi-fetched implementation's filter).
  const visibleProducts = rawProducts.filter((p) => p.FeaturedImage?.url)
  if (visibleProducts.length === 0) {
    await emitStoreCatalogEmptyAlert({
      rawCount: rawProducts.length,
      visibleCount: visibleProducts.length,
    }).catch(() => {
      // Fail-open for alert delivery, but not for rendering an empty store.
    })
    const decision = resolveEmptyStoreCatalogDecision({
      loadFailed: catalogLoadFailed,
      isBuildPhase: isProductionBuildPhase(),
    })
    if (decision === "fail_empty") {
      // Strapi responded but the catalog is genuinely empty — a real problem.
      throw new Error(
        `Store catalog resolved with no visible products (${rawProducts.length} raw products)`
      )
    }
    // No cached catalogue exists in this cold process. Keep navigation usable
    // with an explicit retry state; successful refreshes repopulate the cards.
  }
  const enrichedProducts = await enrichStrapiProductsWithMedusaPrices(
    visibleProducts,
    countryCode
  )
  const missingInventoryVariants = enrichedProducts.flatMap((product) =>
    (product.MedusaProduct?.Variants ?? [])
      .filter(variantNeedsInventoryObservation)
      .map((variant) => ({
        productId: product.MedusaProduct?.ProductId || null,
        productTitle: product.Title || null,
        variantId: variant.VariantId || null,
        sku: variant.Sku || null,
      }))
  )
  if (missingInventoryVariants.length > 0) {
    const productCount = new Set(
      missingInventoryVariants.map((variant) => variant.productId)
    ).size
    void emitStoreCatalogInventoryMissingAlert({
      productCount,
      variantCount: missingInventoryVariants.length,
      examples: missingInventoryVariants.slice(0, 5),
    }).catch(() => {
      // Fail-open for alert delivery; availability itself fails closed.
    })
  }
  const plpExperiment = await getExperimentAssignment("plp_merchandising_v1", {
    routeMarket: countryCode,
    customerType: "unknown",
  })
  const baseUrl = getBaseURL()
  const productListJsonLd = itemListJsonLd(
    baseUrl,
    countryCode,
    "All kosher products",
    visibleProducts
      .filter((product) => product.MedusaProduct?.Handle)
      .slice(0, 48)
      .map((product) => ({
        type: "Product",
        name: product.Title,
        path: `/products/${product.MedusaProduct!.Handle}`,
        description:
          product.MedusaProduct?.ShortDescription ||
          product.MedusaProduct?.Description,
        image: product.FeaturedImage?.url,
      }))
  )
  const storeJsonLd = webPageJsonLd({
    baseUrl,
    countryCode,
    path: "/store",
    name: "Shop All Products",
    description:
      "Browse the Grillers Pride kosher catalog by product, cut, cooking state, sourcing, and certification.",
    type: "CollectionPage",
    breadcrumbs: [{ name: "Store", path: "/store" }],
    mainEntity: productListJsonLd,
    about: ["Kosher meat", "Frozen delivery", "Local pickup"],
  })

  return (
    <>
      <ExperimentExposure assignment={plpExperiment} />
      {catalogLoadFailed && visibleProducts.length === 0 && (
        <p role="status" className="content-container py-8">
          The catalogue is temporarily unavailable.{" "}
          <a href={`/${countryCode}/store`} className="underline">
            Try again
          </a>
          {" or "}
          <a href={`/${countryCode}`} className="underline">
            browse our home page
          </a>
          .
        </p>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(storeJsonLd) }}
      />
      <CollectionTemplate
        title="All Products"
        slug="store"
        countryCode={countryCode}
        products={compactCollectionProducts(enrichedProducts)}
      />
    </>
  )
}
