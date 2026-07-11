import { Metadata } from "next"
import { notFound } from "next/navigation"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductTemplate from "@modules/products/templates"
import { cachedStrapiRequest } from "@lib/strapi"
import {
  GetCommonPdpQuery,
  GetProductQuery,
  generateProductJsonLd,
  getProductIngredientDisclosures,
} from "@lib/data/strapi/pdp"
import { getBaseURL } from "@lib/util/env"
import { withTimeout } from "@lib/util/promise-timeout"
import { retrieveCustomer } from "@lib/data/customer"
import { listPurchaseHistory } from "@lib/data/orders"
import ExperimentExposure from "@lib/experiments/exposure"
import { getExperimentAssignment } from "@lib/experiments/server"
import {
  emitPdpStrapiLoadFailureAlert,
  withPdpStrapiFallback,
} from "@lib/pdp-ops-alerts"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
}

type StrapiProductResponse = {
  products?: any[]
} | null

function titleFromHandle(handle: string) {
  return handle
    .replace(/-\d+(?:lb|oz).*$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { handle } = params
  const baseUrl = getBaseURL()
  const productUrl = `${baseUrl}/${params.countryCode}/products/${handle}`
  const fallbackTitle = `${titleFromHandle(handle)} | Grillers Pride`
  const fallbackDescription =
    "Shop premium kosher meats from Grillers Pride. Order online for shipping, local delivery, or plant pickup."

  const [region, product] = await Promise.all([
    withTimeout(
      getRegion(params.countryCode),
      1200,
      null,
      `PDP metadata region lookup for ${handle}`
    ),
    withTimeout(
      listProducts({
        countryCode: params.countryCode,
        queryParams: { handle, limit: 1 } as any,
      }).then(({ response }) => response.products[0] || null),
      2500,
      null,
      `PDP metadata product lookup for ${handle}`
    ),
  ])

  if (!region || !product) {
    return {
      title: fallbackTitle,
      description: fallbackDescription,
      alternates: { canonical: productUrl },
    }
  }

  // Fetch Strapi product data for SEO. If this degrades, metadata falls back to
  // Medusa fields but ops should still see that customer-facing PDP copy is stale.
  const strapiProductData: any = await withPdpStrapiFallback(
    cachedStrapiRequest("pdp-product", GetProductQuery, {
      medusa_product_id: product.id,
    }),
    null,
    {
      stage: "metadata_product",
      timeoutMs: 1200,
      handle,
      countryCode: params.countryCode,
      medusaProductId: product.id,
    }
  )

  const strapiProduct = strapiProductData?.products?.[0]
  if (strapiProductData && !strapiProduct) {
    await emitPdpStrapiLoadFailureAlert({
      stage: "metadata_product",
      reason: "empty_result",
      handle,
      countryCode: params.countryCode,
      medusaProductId: product.id,
    }).catch(() => {
      // Fail open: metadata should still render from Medusa fallbacks.
    })
  }

  // Use Strapi SEO data if available, otherwise fallback to Medusa
  const seo = strapiProduct?.SEO
  const socialMeta = strapiProduct?.SocialMeta

  // Build title - always append " | Grillers Pride" if not already present
  const baseTitle = seo?.metaTitle || strapiProduct?.Title || product.title
  const title = baseTitle.includes("Grillers Pride")
    ? baseTitle
    : `${baseTitle} | Grillers Pride`

  const description =
    seo?.metaDescription ||
    strapiProduct?.MedusaProduct?.Description ||
    product.description ||
    `Shop ${
      strapiProduct?.Title || product.title
    } at Grillers Pride. Premium kosher meats delivered fresh to your door.`

  const imageUrl = strapiProduct?.FeaturedImage?.url || product.thumbnail

  return {
    title,
    description,
    alternates: {
      // Always use our env-driven productUrl — Strapi's seo.canonicalUrl is
      // often the legacy grillerspride.com URL imported from the old site,
      // which would tell Google to index the legacy domain instead of ours.
      canonical: productUrl,
    },
    openGraph: {
      title: socialMeta?.ogTitle || title,
      description: socialMeta?.ogDescription || description,
      type: (socialMeta?.ogType as any) || "website",
      url: productUrl,
      siteName: "Grillers Pride",
      images: socialMeta?.ogImage?.url
        ? [
            {
              url: socialMeta.ogImage.url,
              alt:
                socialMeta.ogImageAlt || strapiProduct?.Title || product.title,
            },
          ]
        : imageUrl
        ? [
            {
              url: imageUrl,
              alt: strapiProduct?.Title || product.title,
            },
          ]
        : [],
    },
    twitter: {
      card: (socialMeta?.twitterCard as any) || "summary_large_image",
      title: socialMeta?.twitterTitle || title,
      description: socialMeta?.twitterDescription || description,
      images: socialMeta?.twitterImage?.url
        ? [socialMeta.twitterImage.url]
        : imageUrl
        ? [imageUrl]
        : [],
      site: socialMeta?.twitterSite,
      creator: socialMeta?.twitterCreator,
    },
  }
}

export default async function ProductPage(props: Props) {
  const params = await props.params
  const strapiCommonPdpDataPromise = withPdpStrapiFallback(
    cachedStrapiRequest("pdp-common", GetCommonPdpQuery),
    null,
    {
      stage: "common_pdp",
      timeoutMs: 1200,
      handle: params.handle,
      countryCode: params.countryCode,
    }
  ).then((data: any) => data?.pdp || null)

  const [region, productResult, customer] = await Promise.all([
    getRegion(params.countryCode),
    listProducts({
      countryCode: params.countryCode,
      queryParams: { handle: params.handle, limit: 1 } as any,
    }),
    withTimeout(
      retrieveCustomer().catch(() => null),
      1200,
      null,
      `PDP customer lookup for ${params.handle}`
    ),
  ])

  if (!region) {
    notFound()
  }

  const pricedProduct = productResult.response.products[0]

  if (!pricedProduct) {
    notFound()
  }

  const strapiProductDataPromise = withPdpStrapiFallback<StrapiProductResponse>(
    cachedStrapiRequest<{ products?: any[] }>("pdp-product", GetProductQuery, {
      medusa_product_id: pricedProduct.id,
    }),
    null,
    {
      stage: "product_data",
      timeoutMs: 2500,
      handle: params.handle,
      countryCode: params.countryCode,
      medusaProductId: pricedProduct.id,
    }
  )
  const purchaseHistoryItemPromise = customer
    ? withTimeout(
        listPurchaseHistory()
          .catch(() => [])
          .then(
            (items) =>
              items.find((item) => item.productId === pricedProduct.id) || null
          ),
        1200,
        null,
        `PDP purchase history for ${pricedProduct.id}`
      )
    : Promise.resolve(null)
  const pdpExperimentPromise = getExperimentAssignment("pdp_at_a_glance_v1", {
    routeMarket: params.countryCode,
    customerType: customer ? "registered" : "guest",
    userId: customer?.id,
  })
  const pdpRecommendationExperimentPromise = getExperimentAssignment(
    "pdp_recommendation_strategy_v1",
    {
      routeMarket: params.countryCode,
      customerType: customer ? "registered" : "guest",
      userId: customer?.id,
    }
  )

  const [
    strapiProductData,
    purchaseHistoryItem,
    pdpExperiment,
    pdpRecommendationExperiment,
  ] = await Promise.all([
    strapiProductDataPromise,
    purchaseHistoryItemPromise,
    pdpExperimentPromise,
    pdpRecommendationExperimentPromise,
  ])
  const productFromStrapi = strapiProductData?.products?.[0]
  if (strapiProductData && !productFromStrapi) {
    await emitPdpStrapiLoadFailureAlert({
      stage: "product_data",
      reason: "empty_result",
      handle: params.handle,
      countryCode: params.countryCode,
      medusaProductId: pricedProduct.id,
    }).catch(() => {
      // Fail open: PDP should still render from Medusa fallbacks.
    })
  }
  // Ingredient disclosures are already part of GetProductQuery. The REST read
  // is a recovery path only when that product query failed or returned an
  // older shape; issuing both requests on every PDP doubled Strapi cold-start
  // load and repeatedly tripped the disclosure timeout canary.
  const ingredientDisclosures = Array.isArray(
    productFromStrapi?.IngredientDisclosures
  )
    ? productFromStrapi.IngredientDisclosures
    : await withPdpStrapiFallback(
        getProductIngredientDisclosures(pricedProduct.id, {
          onLoadFailure: (failure) => {
            void emitPdpStrapiLoadFailureAlert({
              stage: "ingredient_disclosures",
              reason: failure.reason,
              handle: params.handle,
              countryCode: params.countryCode,
              medusaProductId: pricedProduct.id,
              status: failure.status,
              error: failure.error,
            }).catch(() => {
              // Fail open: disclosure fallbacks should not block PDP rendering.
            })
          },
        }),
        [],
        {
          stage: "ingredient_disclosures",
          timeoutMs: 1200,
          handle: params.handle,
          countryCode: params.countryCode,
          medusaProductId: pricedProduct.id,
        }
      )
  const resolvedIngredientDisclosures = Array.isArray(
    productFromStrapi?.IngredientDisclosures
  )
    ? productFromStrapi.IngredientDisclosures
    : ingredientDisclosures
  const strapiProduct = productFromStrapi
    ? {
        ...productFromStrapi,
        IngredientDisclosures: resolvedIngredientDisclosures,
      }
    : null

  const baseUrl = getBaseURL()
  const productJsonLd = generateProductJsonLd(
    pricedProduct,
    strapiProduct,
    baseUrl,
    params.countryCode
  )

  return (
    <>
      <ExperimentExposure assignment={pdpExperiment} />
      <ExperimentExposure assignment={pdpRecommendationExperiment} />
      {/* Product JSON-LD for SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ProductTemplate
        product={pricedProduct}
        region={region}
        countryCode={params.countryCode}
        strapiCommonPdpData={strapiCommonPdpDataPromise}
        strapiProductData={strapiProduct}
        purchaseHistoryItem={purchaseHistoryItem}
        pdpExperimentVariant={
          pdpExperiment?.isEnabled ? pdpExperiment.variantKey : "control"
        }
        pdpRecommendationVariant={
          pdpRecommendationExperiment?.isEnabled
            ? pdpRecommendationExperiment.variantKey
            : "control"
        }
      />
    </>
  )
}

export const dynamic = "force-dynamic"
