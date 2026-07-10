import { gql } from "graphql-request"
import strapiClient, { cachedStrapiRequest } from "@lib/strapi"
import { enrichStrapiProductsWithMedusaPrices } from "@lib/data/products"
import { emitCuratedCollectionsStrapiFailureAlert } from "@lib/curated-collections-ops-alerts"
import { compactCollectionProduct } from "@lib/util/collection-product"
import { strapiProductHasInternalRawMaterialSku } from "@lib/util/internal-products"
import type { StrapiSEO, StrapiSocialMeta } from "./seo"
import type { StrapiCollectionProduct } from "./collections"

export type CuratedCollectionItem = {
  id?: string | number
  Quantity: number
  Required?: boolean
  Role?: string | null
  Notes?: string | null
  ProductHandle?: string | null
  Product?: StrapiCollectionProduct | null
  OriginalProduct?: StrapiCollectionProduct | null
  OriginalProductName?: string | null
  OriginalQuantity?: number | null
  SubstitutionStatus?:
    | "none"
    | "out_of_stock_substituted"
    | "editor_substituted"
    | null
  SubstitutionValuePolicy?:
    | "actual_replacement_price"
    | "equal_or_better_value"
    | "smaller_pack_acknowledged"
    | "requires_editor_review"
    | null
  ShippingCostRisk?:
    | "normal"
    | "heavier_or_bulkier"
    | "margin_review_required"
    | null
  RequiresBusinessReview?: boolean | null
  SubstitutionNote?: string | null
  RequiresSubstitutionAcknowledgement?: boolean | null
}

export type CuratedCurationSlot = {
  id?: string | number
  Label: string
  CategoryRule: string
  MinWeightLb?: number | null
  MaxWeightLb?: number | null
  MinPricePerLb?: number | null
  MaxPricePerLb?: number | null
  Required?: boolean
  Notes?: string | null
}

export type CuratedRecommendationRule = {
  Surface: "homepage" | "pdp" | "cart" | "checkout" | "email" | "sms" | "agent"
  Trigger:
    | "default"
    | "product_keyword"
    | "cart_keyword"
    | "customer_state"
    | "seasonal_window"
    | "category_gap"
    | "free_shipping_gap"
  MatchKeywords?: string[] | null
  CustomerState?:
    | "all"
    | "guest_or_no_orders"
    | "returning"
    | "lapsed"
    | "high_value"
  Priority?: number | null
  Notes?: string | null
}

export type CuratedCollection = {
  documentId: string
  Name: string
  Slug: string
  Eyebrow?: string | null
  ShortDescription: string
  CollectionType: "sku_backed" | "curation_profile"
  Occasion:
    | "starter"
    | "shabbos"
    | "weeknight"
    | "holiday"
    | "grilling"
    | "premium"
    | "heritage"
    | "prepared"
    | "stock_up"
    | "cart_upsell"
    | "other"
  CustomerStateFilter?:
    | "all"
    | "guest_or_no_orders"
    | "returning"
    | "lapsed"
    | "high_value"
  VisibilityStart?: string | null
  VisibilityEnd?: string | null
  HeroImage?: { url: string } | null
  HeroImageAlt?: string | null
  Items?: CuratedCollectionItem[] | null
  CurationSlots?: CuratedCurationSlot[] | null
  RecommendationRules?: CuratedRecommendationRule[] | null
  TargetPriceCents?: number | null
  TargetMinWeightLb?: number | null
  TargetMaxWeightLb?: number | null
  SortOrder?: number | null
  IsFeatured?: boolean | null
  IsActive?: boolean | null
  SurfacePlacements?: string[] | null
  PdpMatchKeywords?: string[] | null
  StrategySignals?: string[] | null
  CustomerFacingRationale?: string | null
  SubstitutionPolicyCopy?: string | null
  SEO?: StrapiSEO | null
  SocialMeta?: StrapiSocialMeta | null
}

const CuratedProductFields = gql`
  fragment CuratedProductFields on Product {
    documentId
    Title
    FeaturedImage {
      url
    }
    GalleryImages {
      url
    }
    Metadata {
      AvgPackSize
      AvgPackWeight
      Serves
      PiecesPerPack
      Uncooked
      Cooked
      HeatAndServe
      GlutenFree
      MSG
      AntibioticFree
      HormoneFree
      NoSteroids
      NoNitrites
      NoNitrates
      Organic
      Brand
      Source
      Origin
      Breed
      Supplier
      Angus
      GrassFed
      FreeRange
      SouthAmerican
      GrainFree
      BoneIn
      Boneless
      SkinOn
      Skinless
      Trimmed
      Untrimmed
      Netted
      FirstCut
      DeckelOn
      WholePacker
      CowboyCut
      Thickness
      Pargiot
      Capon
      Schnitzel
      Strips
      Marrow
      Kebab
      Smoked
      Pickled
      Cured
      Marinated
      MarinadeFlavor
      CharGrilled
      Sliced
      Ground
      Bulk
      Offcut
      VacuumPacked
      BulkPack
      BoilablePouch
      AluminumPan
      IQF
      KosherForPassover
      Pareve
      Meat
      Dairy
      CholovYisroel
      ChassidishShchita
      ChassidishRecognized
      CHK
      RabbiWeissmandl
      OU
      AgriStarLamedKLubavitchOrRabbiWeissmandl
      AgriStarLamedKLubavitch
      StarK
      RabbiTeitelbaum
      CRC
      Lubavitch
      QualifiesForFreeDeliveryOffers
      FreeDeliveryExclusionReason
    }
    Categorization {
      ProductTags {
        Name
      }
    }
    MedusaProduct {
      ProductId
      Handle
      ShortDescription
      Variants {
        VariantId
        Sku
        QualifiesForFreeDeliveryOffers
        FreeDeliveryExclusionReason
        Price {
          CalculatedPriceNumber
        }
      }
    }
  }
`

const CuratedCollectionFields = gql`
  ${CuratedProductFields}
  fragment CuratedCollectionFields on CuratedCollection {
    documentId
    Name
    Slug
    Eyebrow
    ShortDescription
    CustomerFacingRationale
    SubstitutionPolicyCopy
    CollectionType
    Occasion
    CustomerStateFilter
    VisibilityStart
    VisibilityEnd
    HeroImage {
      url
    }
    HeroImageAlt
    Items(pagination: { limit: 100 }) {
      Quantity
      Required
      Role
      Notes
      ProductHandle
      OriginalProductName
      Product {
        ...CuratedProductFields
      }
    }
    RecommendationRules {
      Surface
      Trigger
      MatchKeywords
      CustomerState
      Priority
      Notes
    }
    TargetPriceCents
    TargetMinWeightLb
    TargetMaxWeightLb
    SortOrder
    IsFeatured
    IsActive
    SurfacePlacements
    PdpMatchKeywords
    SEO {
      metaTitle
      metaDescription
      keywords
      canonicalUrl
    }
    SocialMeta {
      ogTitle
      ogDescription
      ogImage {
        url
      }
      ogImageAlt
      ogType
      twitterCard
      twitterTitle
      twitterDescription
      twitterImage {
        url
      }
      twitterImageAlt
      twitterCreator
      twitterSite
    }
  }
`

export const GetCuratedCollectionsQuery = gql`
  ${CuratedCollectionFields}
  query GetCuratedCollections($limit: Int = 50) {
    curatedCollections(
      filters: { IsActive: { eq: true } }
      sort: ["SortOrder:asc", "Name:asc"]
      pagination: { limit: $limit, start: 0 }
    ) {
      ...CuratedCollectionFields
    }
  }
`

export const GetCuratedCollectionBySlugQuery = gql`
  ${CuratedCollectionFields}
  query GetCuratedCollectionBySlug($slug: String!) {
    curatedCollections(
      filters: { Slug: { eq: $slug }, IsActive: { eq: true } }
      pagination: { limit: 1, start: 0 }
    ) {
      ...CuratedCollectionFields
    }
  }
`

const LegacyCuratedProductFields = gql`
  fragment LegacyCuratedProductFields on Product {
    documentId
    Title
    FeaturedImage {
      url
    }
    GalleryImages {
      url
    }
    Metadata {
      AvgPackSize
      AvgPackWeight
      Serves
      PiecesPerPack
      Uncooked
      Cooked
      HeatAndServe
      GlutenFree
      MSG
      AntibioticFree
      HormoneFree
      NoSteroids
      NoNitrites
      NoNitrates
      Organic
      Brand
      Source
      Origin
      Breed
      Supplier
      Angus
      GrassFed
      FreeRange
      SouthAmerican
      GrainFree
      BoneIn
      Boneless
      SkinOn
      Skinless
      Trimmed
      Untrimmed
      Netted
      FirstCut
      DeckelOn
      WholePacker
      CowboyCut
      Thickness
      Pargiot
      Capon
      Schnitzel
      Strips
      Marrow
      Kebab
      Smoked
      Pickled
      Cured
      Marinated
      MarinadeFlavor
      CharGrilled
      Sliced
      Ground
      Bulk
      Offcut
      VacuumPacked
      BulkPack
      BoilablePouch
      AluminumPan
      IQF
      KosherForPassover
      Pareve
      Meat
      Dairy
      CholovYisroel
    }
    Categorization {
      ProductTags {
        Name
      }
    }
    MedusaProduct {
      ProductId
      Handle
      ShortDescription
      Variants {
        VariantId
        Sku
        Price {
          CalculatedPriceNumber
        }
      }
    }
  }
`

const LegacyCuratedCollectionFields = gql`
  ${LegacyCuratedProductFields}
  fragment LegacyCuratedCollectionFields on CuratedCollection {
    documentId
    Name
    Slug
    Eyebrow
    ShortDescription
    CollectionType
    Occasion
    CustomerStateFilter
    VisibilityStart
    VisibilityEnd
    HeroImage {
      url
    }
    HeroImageAlt
    Items(pagination: { limit: 100 }) {
      Quantity
      Required
      Role
      Notes
      ProductHandle
      Product {
        ...LegacyCuratedProductFields
      }
    }
    RecommendationRules {
      Surface
      Trigger
      MatchKeywords
      CustomerState
      Priority
      Notes
    }
    TargetPriceCents
    TargetMinWeightLb
    TargetMaxWeightLb
    SortOrder
    IsFeatured
    IsActive
    SurfacePlacements
    PdpMatchKeywords
    SEO {
      metaTitle
      metaDescription
      keywords
      canonicalUrl
    }
    SocialMeta {
      ogTitle
      ogDescription
      ogImage {
        url
      }
      ogImageAlt
      ogType
      twitterCard
      twitterTitle
      twitterDescription
      twitterImage {
        url
      }
      twitterImageAlt
      twitterCreator
      twitterSite
    }
  }
`

const LegacyCuratedCollectionsQuery = gql`
  ${LegacyCuratedCollectionFields}
  query LegacyCuratedCollections($limit: Int = 50) {
    curatedCollections(
      filters: { IsActive: { eq: true } }
      sort: ["SortOrder:asc", "Name:asc"]
      pagination: { limit: $limit, start: 0 }
    ) {
      ...LegacyCuratedCollectionFields
    }
  }
`

const LegacyCuratedCollectionBySlugQuery = gql`
  ${LegacyCuratedCollectionFields}
  query LegacyCuratedCollectionBySlug($slug: String!) {
    curatedCollections(
      filters: { Slug: { eq: $slug }, IsActive: { eq: true } }
      pagination: { limit: 1, start: 0 }
    ) {
      ...LegacyCuratedCollectionFields
    }
  }
`

const CuratedCollectionCardFields = gql`
  fragment CuratedCollectionCardFields on CuratedCollection {
    documentId
    Name
    Slug
    Eyebrow
    ShortDescription
    CollectionType
    Occasion
    CustomerStateFilter
    VisibilityStart
    VisibilityEnd
    HeroImage {
      url
    }
    HeroImageAlt
    SortOrder
    IsFeatured
    IsActive
    SurfacePlacements
  }
`

export const GetCuratedCollectionCardsQuery = gql`
  ${CuratedCollectionCardFields}
  query GetCuratedCollectionCards($limit: Int = 50) {
    curatedCollections(
      filters: { IsActive: { eq: true } }
      sort: ["SortOrder:asc", "Name:asc"]
      pagination: { limit: $limit, start: 0 }
    ) {
      ...CuratedCollectionCardFields
    }
  }
`

function isVisibleNow(collection: CuratedCollection, now = new Date()) {
  if (collection.IsActive === false) return false
  const start = collection.VisibilityStart
    ? new Date(`${collection.VisibilityStart}T00:00:00`)
    : null
  const end = collection.VisibilityEnd
    ? new Date(`${collection.VisibilityEnd}T23:59:59`)
    : null
  if (start && now < start) return false
  if (end && now > end) return false
  return true
}

function matchesSurface(collection: CuratedCollection, surface: string) {
  const placements = collection.SurfacePlacements || []
  return placements.length === 0 || placements.includes(surface)
}

function matchesCustomerState(
  collection: CuratedCollection,
  customerState: "guest_or_no_orders" | "returning" | "all" | "any"
) {
  if (customerState === "any") return true
  const filter = collection.CustomerStateFilter || "all"
  return filter === "all" || filter === customerState
}

function uniqueProducts(collections: CuratedCollection[]) {
  const seen = new Set<string>()
  const products: StrapiCollectionProduct[] = []
  for (const collection of collections) {
    for (const item of collection.Items || []) {
      const product = item.Product
      const id = product?.MedusaProduct?.ProductId || product?.documentId
      if (!product || !id || seen.has(id)) continue
      seen.add(id)
      products.push(product)
    }
  }
  return products
}

function replaceProducts(
  collections: CuratedCollection[],
  enriched: StrapiCollectionProduct[]
) {
  const byId = new Map(
    enriched.map((product) => [
      product.MedusaProduct?.ProductId || product.documentId,
      product,
    ])
  )

  return collections.map((collection) => ({
    ...collection,
    Items: (collection.Items || []).map((item) => {
      const id =
        item.Product?.MedusaProduct?.ProductId || item.Product?.documentId
      return id && byId.has(id)
        ? { ...item, Product: compactCollectionProduct(byId.get(id)!) }
        : compactCuratedCollectionItem(item)
    }),
  }))
}

function compactCuratedCollectionItem(item: CuratedCollectionItem) {
  const product =
    item.Product && !strapiProductHasInternalRawMaterialSku(item.Product)
      ? compactCollectionProduct(item.Product)
      : null
  const originalProduct =
    item.OriginalProduct &&
    !strapiProductHasInternalRawMaterialSku(item.OriginalProduct)
      ? compactCollectionProduct(item.OriginalProduct)
      : null

  return {
    ...item,
    Product: product || undefined,
    OriginalProduct: originalProduct || undefined,
  }
}

function compactCuratedCollections(collections: CuratedCollection[]) {
  return collections.map((collection) => ({
    ...collection,
    Items:
      collection.Items?.map(compactCuratedCollectionItem) || collection.Items,
  }))
}

async function enrichCollections(
  collections: CuratedCollection[],
  countryCode: string
) {
  const products = uniqueProducts(collections)
  if (!products.length) return compactCuratedCollections(collections)
  const enriched = await enrichStrapiProductsWithMedusaPrices(
    products,
    countryCode
  )
  return replaceProducts(collections, enriched)
}

export async function getCuratedCollections({
  countryCode,
  surface,
  customerState = "all",
  limit = 50,
  enrichPrices = true,
}: {
  countryCode: string
  surface?: string
  customerState?: "guest_or_no_orders" | "returning" | "all" | "any"
  limit?: number
  enrichPrices?: boolean
}): Promise<CuratedCollection[]> {
  const applyFilters = (collections: CuratedCollection[]) =>
    (collections || [])
      .filter((collection) => isVisibleNow(collection))
      .filter((collection) => !surface || matchesSurface(collection, surface))
      .filter((collection) => matchesCustomerState(collection, customerState))
      .slice(0, limit)

  // Strapi pagination runs before the app-level surface/customer filters above.
  // Fetch a wider window so "homepage" and other narrower surfaces are not
  // accidentally starved by earlier SortOrder records intended for PDP/cart.
  const queryLimit = Math.max(limit, 100)
  let primaryError: unknown

  try {
    const data = await cachedStrapiRequest<{
      curatedCollections: CuratedCollection[]
    }>("curated-collections-list", GetCuratedCollectionsQuery, {
      limit: queryLimit,
    })

    const collections = applyFilters(data.curatedCollections)
    return enrichPrices
      ? enrichCollections(collections, countryCode)
      : compactCuratedCollections(collections)
  } catch (error) {
    primaryError = error
    console.error("Error fetching curated collections:", error)
  }

  try {
    const data = await cachedStrapiRequest<{
      curatedCollections: CuratedCollection[]
    }>("curated-collections-list-legacy", LegacyCuratedCollectionsQuery, {
      limit: queryLimit,
    })
    const collections = applyFilters(data.curatedCollections)
    if (primaryError) {
      void emitCuratedCollectionsStrapiFailureAlert({
        operation: "list",
        stage: "primary",
        surface,
        countryCode,
        customerState,
        limit,
        recovered: true,
        error: primaryError,
      }).catch(() => {
        // Fail open: alerting should never block merchandising content.
      })
    }
    return enrichPrices
      ? enrichCollections(collections, countryCode)
      : compactCuratedCollections(collections)
  } catch (error) {
    console.error("Error fetching legacy curated collections:", error)
    void emitCuratedCollectionsStrapiFailureAlert({
      operation: "list",
      stage: primaryError ? "legacy" : "primary",
      surface,
      countryCode,
      customerState,
      limit,
      recovered: false,
      error,
    }).catch(() => {
      // Fail open: alerting should never block merchandising content.
    })
    return []
  }
}

export async function getCuratedCollectionCards({
  surface,
  alertSurface,
  customerState = "all",
  limit = 50,
}: {
  surface?: string
  alertSurface?: string
  customerState?: "guest_or_no_orders" | "returning" | "all" | "any"
  limit?: number
}): Promise<CuratedCollection[]> {
  // Strapi pagination happens before the app-level placement/customer filters.
  // Fetch a wider window so narrow surfaces like the homepage are not starved
  // by earlier cards intended for PDP, cart, or collection-hub surfaces.
  const queryLimit = Math.max(limit, 100)

  try {
    const data = await cachedStrapiRequest<{
      curatedCollections: CuratedCollection[]
    }>("curated-collections-cards", GetCuratedCollectionCardsQuery, {
      limit: queryLimit,
    })

    return (data.curatedCollections || [])
      .filter((collection) => isVisibleNow(collection))
      .filter((collection) => !surface || matchesSurface(collection, surface))
      .filter((collection) => matchesCustomerState(collection, customerState))
      .slice(0, limit)
  } catch (error) {
    console.error("Error fetching curated collection cards:", error)
    void emitCuratedCollectionsStrapiFailureAlert({
      operation: "cards",
      stage: "primary",
      surface: alertSurface || surface,
      customerState,
      limit,
      recovered: false,
      error,
    }).catch(() => {
      // Fail open: alerting should never block merchandising content.
    })
    return []
  }
}

export async function getCuratedCollectionBySlug(
  slug: string,
  countryCode: string,
  alertSurface = "collection_page"
): Promise<CuratedCollection | null> {
  const enrichVisibleCollection = async (
    collection: CuratedCollection | null | undefined
  ) => {
    if (!collection || !isVisibleNow(collection)) return null
    const [enriched] = await enrichCollections([collection], countryCode)
    return enriched || null
  }
  let primaryError: unknown

  try {
    const data = await cachedStrapiRequest<{
      curatedCollections: CuratedCollection[]
    }>("curated-collection-by-slug", GetCuratedCollectionBySlugQuery, { slug })
    return enrichVisibleCollection(data.curatedCollections?.[0])
  } catch (error) {
    primaryError = error
    console.error("Error fetching curated collection:", error)
  }

  try {
    const data = await cachedStrapiRequest<{
      curatedCollections: CuratedCollection[]
    }>("curated-collection-by-slug-legacy", LegacyCuratedCollectionBySlugQuery, {
      slug,
    })
    if (primaryError) {
      void emitCuratedCollectionsStrapiFailureAlert({
        operation: "detail",
        stage: "primary",
        surface: alertSurface,
        countryCode,
        slug,
        recovered: true,
        error: primaryError,
      }).catch(() => {
        // Fail open: alerting should never block merchandising content.
      })
    }
    return enrichVisibleCollection(data.curatedCollections?.[0])
  } catch (error) {
    console.error("Error fetching legacy curated collection:", error)
    void emitCuratedCollectionsStrapiFailureAlert({
      operation: "detail",
      stage: primaryError ? "legacy" : "primary",
      surface: alertSurface,
      countryCode,
      slug,
      recovered: false,
      error,
    }).catch(() => {
      // Fail open: alerting should never block merchandising content.
    })
    return null
  }
}

export function getCollectionProducts(collection: CuratedCollection) {
  return (collection.Items || []).filter(
    (
      item
    ): item is CuratedCollectionItem & { Product: StrapiCollectionProduct } =>
      Boolean(item.Product?.MedusaProduct?.Handle)
  )
}
