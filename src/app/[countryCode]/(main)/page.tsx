import React from "react"
import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import TrustBand from "@modules/home/components/trust-band"
import BestsellersSection from "@modules/home/components/shop-bestsellers"
import KosherPromiseSection from "@modules/home/components/kosher-promise"
import WholesaleBand from "@modules/home/components/wholesale-band"
import ShopCollectionsSection from "@modules/home/components/shop-collections"
import LearnEntrySection from "@modules/home/components/learn-entry"
import FollowUsSection from "@modules/home/components/follow-us"
import BlogExploreSection from "@modules/home/components/blog-explore"
import ReorderRow from "@modules/home/components/reorder-row"
import HolidayBanner from "@modules/home/components/holiday-banner"
import SpecialtyRow from "@modules/home/components/specialty-row"
import DeliveryPromiseSection from "@modules/home/components/delivery-promise"
import LazySection from "@modules/common/components/lazy-section"
import StandardsComparison from "@modules/common/components/standards-comparison"
import { getRegion } from "@lib/data/regions"
import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import {
  getLatestOrderDeliveryZip,
  listPurchaseHistory,
} from "@lib/data/orders"
import {
  getProductsByMedusaLookupRefs,
  type StrapiCollectionProduct,
} from "@lib/data/strapi/collections"
import { getCuratedCollectionCards } from "@lib/data/strapi/curated-collections"
import strapiClient from "@lib/strapi"
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
import {
  getAddressBookDeliveryZip,
  normalizeDeliveryZip,
} from "@lib/util/delivery-zip"

type PageProps = {
  params: Promise<{ countryCode: string }>
}

function presentString(value: string | null | undefined): value is string {
  return Boolean(value)
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { countryCode } = await params
  try {
    const strapiData = await strapiClient.request<HomePageData>(
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

  const [region, customer, cart, strapiData, globalData] = await Promise.all([
    withTimeout(getRegion(countryCode), 1200, null, "home region"),
    withTimeout(
      retrieveCustomer().catch(() => null),
      1000,
      null,
      "home customer"
    ),
    withTimeout(
      retrieveCart().catch(() => null),
      1000,
      null,
      "home cart"
    ),
    withTimeout(
      strapiClient.request<HomePageData>(GetHomePageQuery).catch(() => null),
      3000,
      null,
      "home Strapi data"
    ),
    withTimeout(
      strapiClient.request<GlobalData>(GetGlobalQuery).catch(() => null),
      1500,
      null,
      "home global data"
    ),
  ])

  if (!region) {
    return null
  }

  // Customer state for the conditional Hero CTA (#57). Legacy QuickBooks
  // history counts here, not just native Medusa orders, so migrated customers
  // immediately get the reorder path on first login.
  const isLoggedIn = !!customer
  const cartZip = normalizeDeliveryZip(cart?.shipping_address?.postal_code)
  const addressBookZip = getAddressBookDeliveryZip(customer?.addresses)
  const latestOrderZip =
    isLoggedIn && !cartZip && !addressBookZip
      ? await withTimeout(
          getLatestOrderDeliveryZip().catch(() => ""),
          1000,
          "",
          "home latest order delivery zip"
        )
      : ""
  const customerZip = cartZip || addressBookZip || latestOrderZip || null
  const customerZipSource = cartZip
    ? "cart"
    : addressBookZip
    ? "address"
    : latestOrderZip
    ? "recent_order"
    : null

  // Reorder-row data: fetch purchase history for logged-in customers. This
  // combines native Medusa orders and the QuickBooks-backed legacy projection.
  // Guests skip the call so the homepage RSC stays fast for them. (#53)
  const purchaseHistory = isLoggedIn
    ? await withTimeout(
        listPurchaseHistory().catch(() => []),
        1200,
        [],
        "home purchase history"
      )
    : []
  const hasOrders = purchaseHistory.length > 0
  const reorderStrapiMap: Record<string, StrapiCollectionProduct> = {}
  if (purchaseHistory.length > 0) {
    const ids = Array.from(
      new Set(purchaseHistory.map((h) => h.productId).filter(presentString))
    )
    const variantIds = Array.from(
      new Set(purchaseHistory.map((h) => h.variantId).filter(presentString))
    )
    const skus = Array.from(
      new Set(purchaseHistory.map((h) => h.sku).filter(presentString))
    )
    if (ids.length > 0 || variantIds.length > 0 || skus.length > 0) {
      try {
        const strapiProducts = await withTimeout(
          getProductsByMedusaLookupRefs(
            { productIds: ids, variantIds, skus },
            strapiClient
          ),
          1800,
          [],
          "home reorder enrichment"
        )
        for (const sp of strapiProducts) {
          if (sp.MedusaProduct?.ProductId) {
            reorderStrapiMap[sp.MedusaProduct.ProductId] = sp
          }
          for (const variant of sp.MedusaProduct?.Variants || []) {
            if (variant.VariantId) {
              reorderStrapiMap[variant.VariantId] = sp
            }
            if (variant.Sku) {
              reorderStrapiMap[variant.Sku.trim().toLowerCase()] = sp
            }
          }
        }
      } catch (error) {
        console.error("Error fetching reorder strapi enrichment:", error)
      }
    }
  }

  const homeCuratedCollections = await withTimeout(
    getCuratedCollectionCards({
      surface: "homepage",
      customerState: hasOrders ? "returning" : "guest_or_no_orders",
      limit: 8,
    }),
    1800,
    [],
    "home curated collection cards"
  )
  const hasShopCollectionsSection = Boolean(
    strapiData?.home?.Sections?.some(
      (section: any) => section.__typename === "ComponentHomeShopCollections"
    )
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

  const renderSections = () => {
    if (strapiData?.home?.Sections) {
      return strapiData?.home?.Sections.map((section: any, index: number) => {
        // Above-the-fold sections (first 3) render immediately
        const isAboveFold = index < 3

        switch (section.__typename) {
          case "ComponentHomeHero":
            // Hero always renders immediately. TrustBand sits directly under
            // it so the value props are visible above the fold (#58).
            // HolidayBanner renders below TrustBand when a holiday is inside
            // its lead-time window — gated by date so most of the year it
            // returns null. (#59)
            return (
              <React.Fragment key={section.__typename}>
                <Hero
                  data={section}
                  countryCode={countryCode}
                  isLoggedIn={isLoggedIn}
                  hasOrders={hasOrders}
                />
                <DeliveryPromiseSection
                  countryCode={countryCode}
                  customerZip={customerZip}
                  customerZipSource={customerZipSource}
                  isLoggedIn={isLoggedIn}
                />
                <TrustBand customer={customer} phoneNumber={null} />
                <StandardsComparison />
                <HolidayBanner />
              </React.Fragment>
            )
          case "ComponentHomeBestsellers":
            // Returning customers (logged-in + at least one order) get a
            // personalized "Reorder your favorites" row rendered right
            // before Bestsellers — Bestsellers stays as the fallback /
            // discovery path for everyone else. (#53)
            return (
              <React.Fragment key={section.__typename}>
                {isLoggedIn && hasOrders && purchaseHistory.length > 0 && (
                  <ReorderRow
                    history={purchaseHistory}
                    strapiMap={reorderStrapiMap}
                    firstName={customer?.first_name}
                    countryCode={countryCode}
                  />
                )}
                <BestsellersSection data={section} countryCode={countryCode} />
                {!hasShopCollectionsSection && (
                  <>
                    <ShopCollectionsSection
                      data={fallbackCollectionsSection}
                      countryCode={countryCode}
                      collections={homeCuratedCollections}
                    />
                    <LearnEntrySection />
                  </>
                )}
              </React.Fragment>
            )
          case "ComponentHomeKosherPromise":
            // SpecialtyRow ("Cuts you can't get from your supermarket")
            // sits between KosherPromise (dark) and WholesaleBand (dark)
            // so the homepage alternates cream/dark sections — gives the
            // specialty row breathing room on a cream background while
            // the dark slabs above and below frame it. The hard-to-find
            // surface for #98 customers Yelp is already sending us from
            // "Bison Meat in Atlanta" / "Grass-fed Beef Butchers in
            // Atlanta" searches.
            return (
              <React.Fragment key={section.__typename}>
                <KosherPromiseSection data={section} />
                <SpecialtyRow countryCode={countryCode} />
                <WholesaleBand />
              </React.Fragment>
            )
          case "ComponentHomeShopCollections":
            return (
              <React.Fragment key={section.__typename}>
                <ShopCollectionsSection
                  data={section}
                  countryCode={countryCode}
                  collections={homeCuratedCollections}
                />
                <LearnEntrySection />
              </React.Fragment>
            )
          case "ComponentHomeTestimonial":
            // The oversized single-quote testimonial block is intentionally
            // suppressed on the homepage. Real review proof should come back
            // later as compact, sourced proof attached to shopping decisions.
            return null
          case "ComponentHomeFollowUs":
            // Lazy load follow us section (typically below fold)
            return isAboveFold ? (
              <FollowUsSection key={section.__typename} data={section} />
            ) : (
              <LazySection key={section.__typename} minHeight="400px">
                <FollowUsSection data={section} />
              </LazySection>
            )
          case "ComponentHomeBlogExplore":
            // Lazy load blog section (typically below fold)
            return isAboveFold ? (
              <BlogExploreSection key={section.__typename} data={section} />
            ) : (
              <LazySection key={section.__typename} minHeight="500px">
                <BlogExploreSection data={section} />
              </LazySection>
            )
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
    </>
  )
}
