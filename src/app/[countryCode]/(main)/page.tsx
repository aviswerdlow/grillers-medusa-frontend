import React from "react"
import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import BestsellersSection from "@modules/home/components/shop-bestsellers"
import KosherPromiseSection from "@modules/home/components/kosher-promise"
import WholesaleBand from "@modules/home/components/wholesale-band"
import ShopCollectionsSection from "@modules/home/components/shop-collections"
import LearnEntrySection from "@modules/home/components/learn-entry"
import FollowUsSection from "@modules/home/components/follow-us"
import PersonalizedReorderRow from "@modules/home/components/personalized-reorder-row"
import HolidayBanner from "@modules/home/components/holiday-banner"
import SpecialtyRow from "@modules/home/components/specialty-row"
import DeliveryPromiseSection from "@modules/home/components/delivery-promise"
import LazySection from "@modules/common/components/lazy-section"
import { getCuratedCollectionCards } from "@lib/data/strapi/curated-collections"
import { cachedStrapiRequest } from "@lib/strapi"
import { GetHomePageQuery, type HomePageData } from "@lib/data/strapi/home"
import {
  GetGlobalQuery,
  type GlobalData,
  generateOrganizationJsonLd,
  generateWebSiteJsonLd,
} from "@lib/data/strapi/global"
import { generateAlternates } from "@lib/util/seo"
import { getBaseURL } from "@lib/util/env"
import { withTimeout } from "@lib/util/promise-timeout"
import { resolveHomeSections } from "@lib/util/home-sections"
import { emitFallbackHomepageOpsAlert } from "@lib/homepage-ops-alerts"
import { withCuratedCollectionsTimeoutAlert } from "@lib/curated-collections-ops-alerts"
import { resolveHomepageCmsPolicies } from "@lib/home-cms-policy"

type PageProps = {
  params: Promise<{ countryCode: string }>
}

export function generateStaticParams() {
  return [{ countryCode: "us" }]
}

type CuratedCollectionCards = Awaited<
  ReturnType<typeof getCuratedCollectionCards>
>

async function ShopCollectionsBlock({
  data,
  countryCode,
  collectionsPromise,
}: {
  data: any
  countryCode: string
  collectionsPromise: Promise<CuratedCollectionCards>
}) {
  const collections = await collectionsPromise

  return (
    <ShopCollectionsSection
      data={data}
      countryCode={countryCode}
      collections={collections}
    />
  )
}

async function DeliveryPromiseBlock({ countryCode }: { countryCode: string }) {
  return (
    <DeliveryPromiseSection countryCode={countryCode} useStorefrontSession />
  )
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { countryCode } = await params
  try {
    const strapiData = await cachedStrapiRequest<HomePageData>(
      "home-page",
      GetHomePageQuery
    )
    const seo = strapiData?.home?.SEO
    const socialMeta = strapiData?.home?.SocialMeta

    const baseUrl = getBaseURL()
    const alternates = await generateAlternates("", countryCode)

    return {
      title: seo?.metaTitle || "Grillers Pride | Premium Kosher Meats",
      description:
        seo?.metaDescription ||
        "Shop premium kosher meats at Grillers Pride. Fresh, high-quality cuts delivered to your door. 100% kosher certified.",
      alternates,
      openGraph: {
        title: socialMeta?.ogTitle || seo?.metaTitle || "Grillers Pride",
        description:
          socialMeta?.ogDescription ||
          seo?.metaDescription ||
          "Premium kosher meats delivered fresh to your door.",
        type: (socialMeta?.ogType as any) || "website",
        url: baseUrl,
        siteName: "Grillers Pride",
        images: socialMeta?.ogImage?.url
          ? [
              {
                url: socialMeta.ogImage.url,
                alt: socialMeta.ogImageAlt || "Grillers Pride",
              },
            ]
          : undefined,
      },
      twitter: {
        card: (socialMeta?.twitterCard as any) || "summary_large_image",
        title: socialMeta?.twitterTitle || seo?.metaTitle || "Grillers Pride",
        description:
          socialMeta?.twitterDescription ||
          seo?.metaDescription ||
          "Premium kosher meats delivered fresh.",
        images: socialMeta?.twitterImage?.url
          ? [socialMeta.twitterImage.url]
          : undefined,
        site: socialMeta?.twitterSite,
        creator: socialMeta?.twitterCreator,
      },
    }
  } catch (error) {
    console.error("Error fetching home page SEO:", error)
    return {
      title: "Grillers Pride | Premium Kosher Meats",
      description:
        "Shop premium kosher meats at Grillers Pride. Fresh, high-quality cuts delivered to your door.",
    }
  }
}

export default async function Home(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params

  const { countryCode } = params

  const {
    home: homeCmsPolicy,
    global: globalCmsPolicy,
    curated: curatedCmsPolicy,
  } = resolveHomepageCmsPolicies()

  const [strapiData, globalData] = await Promise.all([
    withTimeout(
      cachedStrapiRequest<HomePageData>("home-page", GetHomePageQuery).catch(
        () => null
      ),
      homeCmsPolicy.timeoutMs,
      null,
      "home Strapi data"
    ),
    withTimeout(
      cachedStrapiRequest<GlobalData>("home-global", GetGlobalQuery).catch(
        () => null
      ),
      globalCmsPolicy.timeoutMs,
      null,
      "home global data"
    ),
  ])

  const homeCuratedCollectionsPromise = withCuratedCollectionsTimeoutAlert({
    promise: getCuratedCollectionCards({
      surface: "homepage",
      customerState: "guest_or_no_orders",
      limit: 8,
    }),
    fallback: [],
    operation: "cards",
    surface: "homepage",
    countryCode,
    customerState: "guest_or_no_orders",
    limit: 8,
    timeoutMs: curatedCmsPolicy.timeoutMs,
  })
  // Fail open: the body is driven by the bounded Strapi `home` query above.
  // A slow/errored live re-fetch once returned null
  // sections and the page rendered an empty <section> ("blank on normal load,
  // appears on hard reload"). resolveHomeSections substitutes a usable set so
  // the homepage is never blank.
  const { sections: homeSections, usedFallback: homeUsedFallback } =
    resolveHomeSections(strapiData)
  if (homeUsedFallback) {
    console.warn(
      "home: Strapi home sections unavailable — rendering fallback homepage"
    )
    // #251: fallback homepage renders must be visible in the ops timeline.
    await emitFallbackHomepageOpsAlert({
      countryCode,
      hasStrapiData: Boolean(strapiData),
      hasGlobalData: Boolean(globalData),
    })
  }
  const hasShopCollectionsSection = Boolean(
    homeSections.some(
      (section: any) => section.__typename === "ComponentHomeShopCollections"
    )
  )
  const shopCollectionsSection = homeSections.find(
    (section: any) => section.__typename === "ComponentHomeShopCollections"
  )
  const fallbackCollectionsSection = {
    CollectionsTitle: "Build a full table",
    Collections: [],
  }

  const baseUrl = getBaseURL()
  // Always emit Organization JSON-LD — defaults kick in when Strapi Global
  // isn't populated yet so Google still gets the entity for the Knowledge Panel.
  const organizationJsonLd = generateOrganizationJsonLd(
    globalData?.global,
    baseUrl
  )
  const websiteJsonLd = generateWebSiteJsonLd(baseUrl, countryCode)
  const homepageVariant: string = "control"
  const shouldMoveCollectionsEarly =
    homepageVariant === "products_earlier" && Boolean(shopCollectionsSection)
  const shouldDeferStory =
    shouldMoveCollectionsEarly || homepageVariant === "compressed_story"
  const storySupportSections = <LearnEntrySection />

  const renderSections = () => {
    if (homeSections.length) {
      const readingOrder = [
        "ComponentHomeHero",
        "ComponentHomeBestsellers",
        "ComponentHomeShopCollections",
        "ComponentHomeKosherPromise",
        "ComponentHomeBlogExplore",
        "ComponentHomeFollowUs",
      ]
      return [...homeSections]
        .sort(
          (a: any, b: any) =>
            readingOrder.indexOf(a.__typename) -
            readingOrder.indexOf(b.__typename)
        )
        .map((section: any, index: number) => {
          const isAboveFold = index < 3

          switch (section.__typename) {
            case "ComponentHomeHero":
              return (
                <React.Fragment key={section.__typename}>
                  <Hero data={section} countryCode={countryCode} />
                  <HolidayBanner />
                </React.Fragment>
              )
            case "ComponentHomeBestsellers":
              return (
                <React.Fragment key={section.__typename}>
                  <PersonalizedReorderRow countryCode={countryCode} />
                  <React.Suspense fallback={null}>
                    <BestsellersSection
                      data={section}
                      countryCode={countryCode}
                    />
                  </React.Suspense>
                  {shouldMoveCollectionsEarly && shopCollectionsSection && (
                    <>
                      <React.Suspense fallback={null}>
                        <ShopCollectionsBlock
                          data={shopCollectionsSection}
                          countryCode={countryCode}
                          collectionsPromise={homeCuratedCollectionsPromise}
                        />
                      </React.Suspense>
                      <React.Suspense fallback={null}>
                        <DeliveryPromiseBlock countryCode={countryCode} />
                      </React.Suspense>
                    </>
                  )}
                  {!hasShopCollectionsSection && (
                    <>
                      <React.Suspense fallback={null}>
                        <ShopCollectionsBlock
                          data={fallbackCollectionsSection}
                          countryCode={countryCode}
                          collectionsPromise={homeCuratedCollectionsPromise}
                        />
                      </React.Suspense>
                      <React.Suspense fallback={null}>
                        <DeliveryPromiseBlock countryCode={countryCode} />
                      </React.Suspense>
                      {!shouldDeferStory && storySupportSections}
                    </>
                  )}
                </React.Fragment>
              )
            case "ComponentHomeKosherPromise":
              return (
                <React.Fragment key={section.__typename}>
                  <React.Suspense fallback={null}>
                    <SpecialtyRow countryCode={countryCode} />
                  </React.Suspense>
                  <KosherPromiseSection data={section} />
                  {shouldDeferStory && storySupportSections}
                </React.Fragment>
              )
            case "ComponentHomeShopCollections":
              if (shouldMoveCollectionsEarly) {
                return null
              }

              return (
                <React.Fragment key={section.__typename}>
                  <React.Suspense fallback={null}>
                    <ShopCollectionsBlock
                      data={section}
                      countryCode={countryCode}
                      collectionsPromise={homeCuratedCollectionsPromise}
                    />
                  </React.Suspense>
                  <React.Suspense fallback={null}>
                    <DeliveryPromiseBlock countryCode={countryCode} />
                  </React.Suspense>
                  {!shouldDeferStory && storySupportSections}
                </React.Fragment>
              )
            case "ComponentHomeTestimonial":
              return null
            case "ComponentHomeFollowUs":
              return isAboveFold ? (
                <FollowUsSection key={section.__typename} data={section} />
              ) : (
                <LazySection key={section.__typename} minHeight="360px">
                  <FollowUsSection data={section} />
                </LazySection>
              )
            case "ComponentHomeBlogExplore":
              return null // Recipes and guides share the single Learn & cook section.
            default:
              return null
          }
        })
    }
    return null
  }

  return (
    <>
      {/* Organization + WebSite JSON-LD for SEO (Google Knowledge Panel + sitelinks searchbox) */}
      {organizationJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      {renderSections()}
      <WholesaleBand />
    </>
  )
}
