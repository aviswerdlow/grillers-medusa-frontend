export interface StrapiImage {
  url: string
}

export type AvailabilityLifecycle =
  | "active"
  | "seasonal_inactive"
  | "discontinued"
  | "internal_only"

// SEO Types
export interface StrapiSEO {
  metaTitle: string
  metaDescription: string
  shareImage?: StrapiImage
}

export interface StrapiSocialMeta {
  ogTitle?: string
  ogDescription?: string
  ogImage?: StrapiImage
  ogImageAlt?: string
  ogType?: string
  twitterCard?: string
  twitterTitle?: string
  twitterDescription?: string
  twitterImage?: StrapiImage
  twitterImageAlt?: string
  twitterCreator?: string
  twitterSite?: string
}

// Footer Types
export interface FooterLink {
  id: string
  Text: string
  Url: string
}

export interface FooterNavigationColumn {
  id: string
  Title: string
  Links: FooterLink[]
}

export interface FooterSocialLink {
  id: string
  Platform: string
  Url: string
  Icon?: StrapiImage
}

export interface FooterCertificationBadge {
  id: string
  Name: string
  Image?: StrapiImage
  Description?: string
}

export interface StrapiFooterData {
  footer: {
    NavigationColumns: FooterNavigationColumn[]
    SocialLinks: FooterSocialLink[]
    ContactEmail?: string
    ContactPhone?: string
    ContactAddress?: string
    LegalLinks: FooterLink[]
    CertificationBadges: FooterCertificationBadge[]
    CopyrightText?: string
    ShowNewsletterSection?: boolean
    NewsletterTitle?: string
    NewsletterDescription?: string
  }
}

// Product Types
//
// Mirrors the Strapi `api::product.product` `Metadata` shape. Most of
// the boolean flags ride along on every product but only a subset
// applies to a given SKU; the PDP renders chips conditionally.
export interface Metadata {
  // Sizing / pack semantics.
  AvgPackSize?: string
  AvgPackWeight?: string
  Serves?: string
  PiecesPerPack?: number

  // Prep state.
  Uncooked?: boolean
  Cooked?: boolean
  HeatAndServe?: boolean

  // Dietary / ingredient flags.
  GlutenFree?: boolean
  MSG?: boolean // historical: `true` means "NO MSG" per existing card UI
  Pareve?: boolean
  Meat?: boolean
  Dairy?: boolean
  CholovYisroel?: boolean

  // Kashruth.
  KosherForPassover?: boolean
  ChassidishShchita?: boolean
  ChassidishRecognized?: boolean
  CHK?: boolean
  RabbiWeissmandl?: boolean
  OU?: boolean
  AgriStarLamedKLubavitchOrRabbiWeissmandl?: boolean
  AgriStarLamedKLubavitch?: boolean
  StarK?: boolean
  RabbiTeitelbaum?: boolean
  CRC?: boolean
  Lubavitch?: boolean

  // Shipping-offer eligibility.
  QualifiesForFreeDeliveryOffers?: boolean
  FreeDeliveryExclusionReason?: string

  // Sourcing.
  Source?: string
  Brand?: string
  Origin?: string
  Breed?: string
  Supplier?: string
  Angus?: boolean
  GrassFed?: boolean
  Organic?: boolean
  FreeRange?: boolean
  GrainFree?: boolean
  AntibioticFree?: boolean
  HormoneFree?: boolean
  NoSteroids?: boolean
  NoNitrites?: boolean
  NoNitrates?: boolean
  SouthAmerican?: boolean

  // Cut characteristics.
  BoneIn?: boolean
  Boneless?: boolean
  SkinOn?: boolean
  Skinless?: boolean
  Trimmed?: boolean
  Untrimmed?: boolean
  Netted?: boolean
  FirstCut?: boolean
  DeckelOn?: boolean
  WholePacker?: boolean
  CowboyCut?: boolean
  Thickness?: string
  Pargiot?: boolean
  Capon?: boolean
  Schnitzel?: boolean
  Strips?: boolean
  Marrow?: boolean
  Kebab?: boolean

  // Preparation styles.
  Smoked?: boolean
  Pickled?: boolean
  Cured?: boolean
  Marinated?: boolean
  MarinadeFlavor?: string
  CharGrilled?: boolean
  Sliced?: boolean
  Ground?: boolean
  Bulk?: boolean
  Offcut?: boolean

  // Packaging.
  VacuumPacked?: boolean
  BulkPack?: boolean
  BoilablePouch?: boolean
  AluminumPan?: boolean
  IQF?: boolean
}

export interface MedusaProductVariant {
  VariantId: string
  QuickBooksListId?: string | null
  Title: string
  // GP internal SKU code (e.g. "1-03-15-1"). Used by the PDP for the
  // phone-order workflow (#110) and by Algolia indexing.
  Sku?: string | null
  QualifiesForFreeDeliveryOffers?: boolean | null
  FreeDeliveryExclusionReason?: string | null
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
  inventory_quantity?: number | null
  WaitlistEnabled?: boolean | null
  AvailabilityLifecycle?: AvailabilityLifecycle | null
  Price?: {
    CalculatedPriceNumber: number
    OriginalPriceNumber: number
  }
}

export interface MedusaProduct {
  ProductId: string
  QuickBooksListId?: string | null
  Title: string
  Handle: string
  Description: string
  WaitlistEnabled?: boolean | null
  AvailabilityLifecycle?: AvailabilityLifecycle | null
  Variants?: MedusaProductVariant[]
}

export type IngredientDisclosureReviewStatus =
  | "needs_review"
  | "approved"
  | "rejected"

export interface IngredientDisclosure {
  id?: string | number
  Sku?: string | null
  Ingredients?: string | null
  Contains?: string | null
  Directions?: string | null
  SourceLabelFile?: string | null
  ReviewStatus?: IngredientDisclosureReviewStatus | null
  VerifiedAt?: string | null
}

export interface StrapiProductData {
  objectID: string
  Title: string
  Categorization: any
  Metadata: Metadata
  id: number
  FeaturedImage: StrapiImage
  GalleryImages: StrapiImage[]
  Certifications?: { icon: string; label: string }[]
  MedusaProduct: MedusaProduct
  IngredientDisclosures?: IngredientDisclosure[]
}

// Testimonial Types
export interface StrapiTestimonial {
  id: string
  documentId: string
  CustomerName: string
  CustomerTitle?: string
  CustomerCompany?: string
  CustomerLocation?: string
  CustomerPhoto?: StrapiImage
  TestimonialText: string
  Rating: number // 1-5
  Featured?: boolean
  Tags?: string[]
  PublishedDate?: string
}

export interface StrapiTestimonialSection {
  Title?: string
  Subtitle?: string
  DisplayMode: "carousel" | "grid" | "featured" | "list"
  MaxItems?: number
  FilterByTags?: string[]
  ShowRatings?: boolean
  AutoRotate?: boolean
  AutoRotateInterval?: number
}
