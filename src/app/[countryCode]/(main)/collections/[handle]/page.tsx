import { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { type ProductCollectionData } from "@lib/data/strapi/collections"
import { getCollectionPageData } from "@lib/data/strapi/collection-page"
import { enrichStrapiProductsWithMedusaPrices } from "@lib/data/products"
import CollectionTemplate from "@modules/collections/templates"
import CuratedCollectionTemplate from "@modules/collections/templates/curated-collection"
import { getBaseURL } from "@lib/util/env"
import { retrieveCustomer } from "@lib/data/customer"
import { listPurchaseHistory } from "@lib/data/orders"
import {
  compactCollectionProducts,
  withoutUnverifiedProductState,
} from "@lib/util/collection-product"
import { withTimeout } from "@lib/util/promise-timeout"
import {
  refreshCuratedCollectionPrices,
  type CuratedCollection,
} from "@lib/data/strapi/curated-collections"
import ExperimentExposure from "@lib/experiments/exposure"
import { getExperimentAssignment } from "@lib/experiments/server"

type Props = {
  params: Promise<{ handle: string; countryCode: string }>
}

const loadCollectionForPage = cache((handle: string, countryCode: string) =>
  getCollectionPageData(handle, countryCode)
)

export const maxDuration = 60

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { handle, countryCode } = params

  if (!handle) {
    notFound()
  }

  const loaded = await loadCollectionForPage(handle, countryCode)
  if (loaded.status === "unavailable") {
    return {
      title: "Collection temporarily unavailable | Grillers Pride",
      robots: { index: false, follow: true },
    }
  }
  if (loaded.status === "not_found") {
    return {
      title: "Collection Not Found | Grillers Pride",
      description: "The requested collection could not be found.",
    }
  }

  if (loaded.content.kind === "curated") {
    const curated = loaded.content.collection
    const baseUrl = getBaseURL()
    const canonicalUrl = `${baseUrl}/${countryCode}/collections/${handle}`
    const seo = curated.SEO
    const socialMeta = curated.SocialMeta
    const title = seo?.metaTitle || `${curated.Name} | Grillers Pride`
    const description = seo?.metaDescription || curated.ShortDescription

    return {
      title,
      description,
      alternates: { canonical: canonicalUrl },
      openGraph: {
        title: socialMeta?.ogTitle || title,
        description: socialMeta?.ogDescription || description,
        type: (socialMeta?.ogType as any) || "website",
        url: canonicalUrl,
        siteName: "Grillers Pride",
        images: socialMeta?.ogImage?.url
          ? [
              {
                url: socialMeta.ogImage.url,
                alt: socialMeta.ogImageAlt || curated.Name,
              },
            ]
          : curated.HeroImage?.url
          ? [
              {
                url: curated.HeroImage.url,
                alt: curated.HeroImageAlt || curated.Name,
              },
            ]
          : undefined,
      },
      twitter: {
        card: (socialMeta?.twitterCard as any) || "summary_large_image",
        title: socialMeta?.twitterTitle || title,
        description: socialMeta?.twitterDescription || description,
        images: socialMeta?.twitterImage?.url
          ? [socialMeta.twitterImage.url]
          : curated.HeroImage?.url
          ? [curated.HeroImage.url]
          : undefined,
        site: socialMeta?.twitterSite,
        creator: socialMeta?.twitterCreator,
      },
      robots: {
        index: true,
        follow: true,
      },
    }
  }

  const { collection, tagSEODescription } = loaded.content

  const baseUrl = getBaseURL()
  const canonicalUrl = `${baseUrl}/${countryCode}/collections/${handle}`

  const seo = collection.SEO
  const socialMeta = collection.SocialMeta
  const title = seo?.metaTitle || `${collection.Name} | Grillers Pride`
  const description =
    seo?.metaDescription ||
    tagSEODescription ||
    collection.Description ||
    `Shop our ${collection.Name} collection of premium kosher meats. Fresh, high-quality cuts delivered to your door. 100% kosher certified.`

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: socialMeta?.ogTitle || title,
      description: socialMeta?.ogDescription || description,
      type: (socialMeta?.ogType as any) || "website",
      url: canonicalUrl,
      siteName: "Grillers Pride",
      images: socialMeta?.ogImage?.url
        ? [
            {
              url: socialMeta.ogImage.url,
              alt: socialMeta.ogImageAlt || collection.Name,
            },
          ]
        : undefined,
    },
    twitter: {
      card: (socialMeta?.twitterCard as any) || "summary_large_image",
      title: socialMeta?.twitterTitle || title,
      description: socialMeta?.twitterDescription || description,
      images: socialMeta?.twitterImage?.url
        ? [socialMeta.twitterImage.url]
        : undefined,
      site: socialMeta?.twitterSite,
      creator: socialMeta?.twitterCreator,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

function generateCollectionJsonLd(
  collection: ProductCollectionData,
  countryCode: string
) {
  const baseUrl = getBaseURL()
  const canonicalUrl = `${baseUrl}/${countryCode}/collections/${collection.Slug}`
  const description =
    collection.SEO?.metaDescription ||
    `Shop our ${collection.Name} collection of premium kosher meats.`

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: collection.Name,
    description: description,
    url: canonicalUrl,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${baseUrl}/${countryCode}`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Collections",
          item: `${baseUrl}/${countryCode}/collections`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: collection.Name,
          item: canonicalUrl,
        },
      ],
    },
    isPartOf: {
      "@type": "WebSite",
      name: "Grillers Pride",
      url: `${baseUrl}`,
    },
  }
}

function generateCuratedCollectionJsonLd(
  collection: CuratedCollection,
  countryCode: string
) {
  const baseUrl = getBaseURL()
  const canonicalUrl = `${baseUrl}/${countryCode}/collections/${collection.Slug}`

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: collection.Name,
    description: collection.SEO?.metaDescription || collection.ShortDescription,
    url: canonicalUrl,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: `${baseUrl}/${countryCode}`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Collections",
          item: `${baseUrl}/${countryCode}/collections`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: collection.Name,
          item: canonicalUrl,
        },
      ],
    },
  }
}

export default async function CollectionPage(props: Props) {
  const params = await props.params
  const { countryCode, handle } = params

  if (!handle || handle.length === 0) {
    return notFound()
  }

  const loaded = await loadCollectionForPage(handle, countryCode)
  const plpExperiment = await getExperimentAssignment("plp_merchandising_v1", {
    routeMarket: countryCode,
    customerType: "unknown",
  })

  if (loaded.status === "not_found") return notFound()
  if (loaded.status === "unavailable") {
    return (
      <main className="content-container py-12" role="status">
        <h1>Collection temporarily unavailable</h1>
        <p>Please try again, or continue shopping from the store.</p>
        <a href={`/${countryCode}/collections/${handle}`} className="underline">
          Try again
        </a>{" "}
        <a href={`/${countryCode}/store`} className="underline">
          Shop all products
        </a>
      </main>
    )
  }

  if (loaded.content.kind === "curated") {
    const curated = loaded.stale
      ? await refreshCuratedCollectionPrices(
          loaded.content.collection,
          countryCode,
          true
        )
      : loaded.content.collection
    const jsonLd = generateCuratedCollectionJsonLd(curated, countryCode)
    return (
      <>
        <ExperimentExposure assignment={plpExperiment} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <CuratedCollectionTemplate
          collection={curated}
          countryCode={countryCode}
        />
      </>
    )
  }

  const customerPromise = withTimeout(
    retrieveCustomer().catch(() => null),
    1000,
    null,
    `collection customer lookup for ${handle}`
  )

  const { collection } = loaded.content
  let products = loaded.content.products
  const fallbackProducts = loaded.stale
    ? products.map(withoutUnverifiedProductState)
    : products

  const recentProductIdsPromise = customerPromise.then(async (customer) => {
    if (!customer) return []
    return Array.from(
      new Set(
        (
          await withTimeout(
            listPurchaseHistory().catch(() => []),
            1200,
            [],
            `collection purchase history for ${handle}`
          )
        )
          .map((item) => item.productId)
          .filter((id): id is string => Boolean(id))
      )
    )
  })

  // Strapi caches a CalculatedPriceNumber via a sync workflow that can lag.
  // Always overlay live Medusa prices so cards (grid + list) display the
  // current price regardless of Strapi sync state.
  const [enrichedProducts, recentProductIds] = await Promise.all([
    withTimeout(
      enrichStrapiProductsWithMedusaPrices(fallbackProducts, countryCode, {
        requireLivePrices: loaded.stale,
      }).catch(() => fallbackProducts),
      1200,
      fallbackProducts,
      `collection price enrichment for ${handle}`
    ),
    recentProductIdsPromise,
  ])
  products = enrichedProducts

  const jsonLd = generateCollectionJsonLd(collection, countryCode)

  return (
    <>
      <ExperimentExposure assignment={plpExperiment} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CollectionTemplate
        title={collection.Name}
        slug={handle}
        countryCode={countryCode}
        collection={collection}
        products={compactCollectionProducts(products)}
        recentProductIds={recentProductIds}
      />
    </>
  )
}

export const dynamic = "force-dynamic"
