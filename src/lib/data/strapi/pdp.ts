import { gql } from "graphql-request"
import type { IngredientDisclosure } from "types/strapi"

export type ProductIngredientDisclosureFailure = {
  reason: "missing_config" | "non_2xx" | "request_failed"
  status?: number
  error?: unknown
}

type ProductIngredientDisclosureOptions = {
  onLoadFailure?: (
    failure: ProductIngredientDisclosureFailure
  ) => void | Promise<void>
}

function notifyIngredientDisclosureFailure(
  options: ProductIngredientDisclosureOptions | undefined,
  failure: ProductIngredientDisclosureFailure
) {
  try {
    void options?.onLoadFailure?.(failure)?.catch(() => {
      // Fail open: disclosure alerting must never break PDP rendering.
    })
  } catch {
    // Fail open: disclosure alerting must never break PDP rendering.
  }
}

export const GetCommonPdpQuery = gql`
  query CommonPdpQuery {
    pdp {
      WhyUs {
        Title
        Image {
          url
        }
        List {
          id
          Title
          Description
        }
      }
      HowItWorks {
        Title
        Description
        Cards {
          Text
          Image {
            url
          }
          id
        }
      }
    }
  }
`

export const GetProductQuery = gql`
  query GetProductQuery($medusa_product_id: String) {
    products(
      filters: { MedusaProduct: { ProductId: { eq: $medusa_product_id } } }
      pagination: { limit: 1 }
    ) {
      documentId
      medusa_product_id
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
        Brand
        Source
        Origin
        Breed
        Supplier
        Angus
        GrassFed
        Organic
        FreeRange
        SouthAmerican
        GrainFree
        AntibioticFree
        HormoneFree
        NoSteroids
        NoNitrites
        NoNitrates
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
      Recipes {
        documentId
        Title
        Slug
        ShortDescription
        Image {
          url
        }
      }
      MedusaProduct {
        ProductId
        QuickBooksListId
        Title
        Description
        Handle
        WaitlistEnabled
        AvailabilityLifecycle
        Variants {
          VariantId
          QuickBooksListId
          Title
          Sku
          WaitlistEnabled
          AvailabilityLifecycle
          QualifiesForFreeDeliveryOffers
          FreeDeliveryExclusionReason
          Price {
            OriginalPriceNumber
            CalculatedPriceNumber
          }
        }
      }
      IngredientDisclosures {
        id
        Sku
        Ingredients
        Contains
        Directions
        SourceLabelFile
        ReviewStatus
        VerifiedAt
      }
      Categorization {
        ProductTags {
          Name
        }
        ProductCollections {
          Name
          Slug
        }
      }
    }
  }
`

export async function getProductIngredientDisclosures(
  medusaProductId?: string | null,
  options: ProductIngredientDisclosureOptions = {}
): Promise<IngredientDisclosure[]> {
  const endpoint = process.env.STRAPI_ENDPOINT?.replace(/\/+$/, "")
  if (!medusaProductId) return []
  if (!endpoint) {
    notifyIngredientDisclosureFailure(options, {
      reason: "missing_config",
    })
    return []
  }

  const url = new URL(`${endpoint}/api/products`)
  url.searchParams.set(
    "filters[MedusaProduct][ProductId][$eq]",
    medusaProductId
  )
  url.searchParams.set("pagination[limit]", "1")
  url.searchParams.set("populate[IngredientDisclosures]", "true")

  try {
    const res = await fetch(url.toString(), {
      headers: process.env.STRAPI_API_TOKEN
        ? { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` }
        : undefined,
      next: { tags: ["strapi"] },
    })

    if (!res.ok) {
      if (res.status !== 400) {
        console.error(
          "Failed to fetch Strapi ingredient disclosures:",
          res.status,
          await res.text()
        )
        notifyIngredientDisclosureFailure(options, {
          reason: "non_2xx",
          status: res.status,
        })
      }
      return []
    }

    const json = await res.json()
    const disclosures = json?.data?.[0]?.IngredientDisclosures
    return Array.isArray(disclosures) ? disclosures : []
  } catch (error) {
    console.error("Failed to fetch Strapi ingredient disclosures:", error)
    notifyIngredientDisclosureFailure(options, {
      reason: "request_failed",
      error,
    })
    return []
  }
}

export const GetProductFeaturedImageQuery = gql`
  query GetProductFeaturedImageQuery($medusa_product_id: String) {
    products(
      filters: { MedusaProduct: { ProductId: { eq: $medusa_product_id } } }
      pagination: { limit: 1 }
    ) {
      FeaturedImage {
        url
      }
    }
  }
`

export const GetProductTitleQuery = gql`
  query GetProductTitleQuery($medusa_product_id: String) {
    products(
      filters: { MedusaProduct: { ProductId: { eq: $medusa_product_id } } }
      pagination: { limit: 1 }
    ) {
      Title
    }
  }
`

export const GetProductMetadataQuery = gql`
  query GetProductMetadataQuery($medusa_product_id: String) {
    products(
      filters: { MedusaProduct: { ProductId: { eq: $medusa_product_id } } }
      pagination: { limit: 1 }
    ) {
      Metadata {
        AvgPackWeight
        AvgPackSize
        QualifiesForFreeDeliveryOffers
        FreeDeliveryExclusionReason
      }
    }
  }
`

export type ProductMetadata = {
  AvgPackWeight?: string | null
  AvgPackSize?: string | null
  QualifiesForFreeDeliveryOffers?: boolean | null
  FreeDeliveryExclusionReason?: string | null
}

/**
 * Strip the embedded "$XX.XX/lb" / "$XX/lb" / "$XX.XX/oz" pricing string
 * (and any leading whitespace/punctuation that becomes orphaned). The
 * legacy Medusa product titles ship a price baked into the name — we don't
 * want it in the JSON-LD `name` because:
 *   1. `offers.price` already carries the canonical price.
 *   2. The baked-in price is stale relative to current pricing.
 *   3. Google may surface the JSON-LD `name` in rich snippets, where a
 *      "$19.99/lb" suffix looks unprofessional.
 */
function stripEmbeddedPrice(name: string): string {
  return name
    .replace(/\$\s?\d+(?:\.\d+)?\s*\/\s*(?:lb|oz|kg|g|each|ea)\.?/gi, "")
    .replace(/[\s,.\-–—]+$/g, "") // trim trailing punctuation/whitespace
    .trim()
}

/**
 * Sanitize a Medusa-imported product title for use as the JSON-LD `name`.
 *
 * The legacy Medusa import shipped raw descriptions as titles, e.g.:
 *   "Chuckeye (Delmonico) Steak, Boneless,(2x9oz) American Angus,
 *    Uncooked, Kosher for Passover. $19.99/lb."
 *
 * Heuristic: keep the segment up to the first comma (almost always the
 * descriptive cut name), then strip any embedded price. If that leaves
 * something too short to be useful (< 4 chars) we fall back to the full
 * title with prices stripped instead. This is intentionally conservative
 * — the canonical fix is populating the Strapi `Title` field, which this
 * function is bypassed for.
 */
function cleanLegacyMedusaName(title: string): string {
  const stripped = stripEmbeddedPrice(title)
  const firstComma = stripped.indexOf(",")
  if (firstComma > 3) {
    const head = stripped.slice(0, firstComma).trim()
    if (head.length >= 4) {
      return head
    }
  }
  // Also collapse double spaces left over from imports
  return stripped.replace(/\s{2,}/g, " ")
}

function formatSchemaPrice(amount: number | null | undefined) {
  if (!Number.isFinite(amount) || !amount || amount <= 0) {
    return undefined
  }

  return amount.toFixed(2)
}

function propertyValue(name: string, value: string | null | undefined) {
  if (!value) return null
  return {
    "@type": "PropertyValue",
    name,
    value,
  }
}

function hechsherValue(metadata: Record<string, any> | null | undefined) {
  if (!metadata) return null
  const labels = [
    metadata.CHK && "CHK",
    metadata.OU && "OU",
    metadata.ChassidishRecognized && "Chassidish Recognized",
    metadata.AgriStarLamedKLubavitchOrRabbiWeissmandl &&
      "AgriStar Lamed-K (Lubavich or Rabbi Weismandl)",
    metadata.AgriStarLamedKLubavitch && "AgriStar Lamed-K Lubavich",
    metadata.StarK && "Star-K",
    metadata.CRC && "CRC",
    metadata.RabbiWeissmandl && "Rabbi Weissmandl",
    metadata.RabbiTeitelbaum && "Rabbi Teitelbaum",
    metadata.Lubavitch && "Lubavitch",
    metadata.ChassidishShchita && "Chassidish shchita",
    metadata.KosherForPassover && "Kosher for Passover",
  ].filter(Boolean)

  return labels.length > 0 ? labels.join(" / ") : null
}

function productAdditionalProperties(
  metadata: Record<string, any> | null | undefined
) {
  if (!metadata) {
    return []
  }

  const source = [
    metadata.Angus && "American Angus",
    metadata.GrassFed && "grass-fed",
    metadata.Organic && "organic",
    metadata.FreeRange && "free range",
    metadata.AntibioticFree && "no antibiotics",
    metadata.HormoneFree && "no hormones",
    metadata.Source,
    metadata.Origin,
  ]
    .filter(Boolean)
    .join(", ")

  const prep = [
    metadata.Uncooked && "uncooked",
    metadata.Cooked && "ready to eat",
    metadata.HeatAndServe && "heat and serve",
    metadata.VacuumPacked && "vacuum packed",
  ]
    .filter(Boolean)
    .join(", ")

  return [
    metadata.GlutenFree && propertyValue("Dietary", "Gluten Free"),
    metadata.MSG && propertyValue("Ingredient claim", "No MSG"),
    propertyValue("Kashrut", hechsherValue(metadata)),
    propertyValue("Average pack size", metadata.AvgPackSize),
    propertyValue("Average pack weight", metadata.AvgPackWeight),
    metadata.PiecesPerPack &&
      propertyValue("Pieces per pack", String(metadata.PiecesPerPack)),
    propertyValue("Source / grade", source),
    propertyValue("Preparation", prep),
  ].filter(Boolean)
}

/**
 * Generates Product JSON-LD schema for SEO
 */
export function generateProductJsonLd(
  product: {
    id?: string
    title?: string
    description?: string | null
    thumbnail?: string | null
    handle?: string
    variants?: Array<{
      id?: string
      sku?: string | null
      calculated_price?: {
        calculated_amount?: number | null
        currency_code?: string | null
      }
      inventory_quantity?: number | null
      manage_inventory?: boolean | null
      allow_backorder?: boolean | null
    }> | null
  },
  strapiData: {
    Title?: string
    FeaturedImage?: { url: string }
    GalleryImages?: Array<{ url: string }>
    MedusaProduct?: {
      Description?: string
    }
    Metadata?: {
      GlutenFree?: boolean
      [key: string]: any
    }
  } | null,
  baseUrl: string,
  countryCode: string
) {
  const variant = product.variants?.[0]
  const price = formatSchemaPrice(variant?.calculated_price?.calculated_amount)
  const currency =
    variant?.calculated_price?.currency_code?.toUpperCase() || "USD"
  const inStock =
    !!variant &&
    (!variant.manage_inventory ||
      !!variant.allow_backorder ||
      (variant.inventory_quantity ?? 0) > 0)

  // Collect all images
  const images: string[] = []
  if (strapiData?.FeaturedImage?.url) {
    images.push(strapiData.FeaturedImage.url)
  }
  if (strapiData?.GalleryImages) {
    images.push(...strapiData.GalleryImages.map((img) => img.url))
  }
  if (images.length === 0 && product.thumbnail) {
    images.push(product.thumbnail)
  }

  const productUrl = `${baseUrl}/${countryCode}/products/${product.handle}`

  // Prefer the cleaner Strapi display title for the JSON-LD name. When Strapi
  // hasn't overridden the title (which is the case for many legacy imports),
  // run the Medusa fallback through `cleanLegacyMedusaName` to drop the
  // embedded price string ("$19.99/lb") and the variant/size descriptor
  // tail. Even when Strapi's `Title` is set, we still strip any embedded
  // price defensively — it should never appear in the JSON-LD `name` because
  // `offers.price` is the canonical price source. See issue #45.
  const rawName = strapiData?.Title?.trim()
    ? stripEmbeddedPrice(strapiData.Title)
    : cleanLegacyMedusaName(product.title || "")
  const displayName = rawName || strapiData?.Title || product.title

  const productNode = {
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: displayName,
    description: strapiData?.MedusaProduct?.Description || product.description,
    image: images.length > 0 ? images : undefined,
    url: productUrl,
    sku: variant?.sku || variant?.id,
    suitableForDiet: "https://schema.org/KosherDiet",
    brand: {
      "@type": "Brand",
      name: "Grillers Pride",
    },
    ...(price && {
      offers: {
        "@type": "Offer",
        url: productUrl,
        priceCurrency: currency,
        price,
        itemCondition: "https://schema.org/NewCondition",
        availability: inStock
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
        availableDeliveryMethod: [
          "https://schema.org/ParcelService",
          "https://schema.org/OnSitePickup",
        ],
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "US",
          },
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
              "@type": "QuantitativeValue",
              minValue: 0,
              maxValue: 2,
              unitCode: "DAY",
            },
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: 1,
              maxValue: 5,
              unitCode: "DAY",
            },
          },
        },
        seller: {
          "@type": "Organization",
          name: "Grillers Pride",
        },
      },
    }),
    additionalProperty: productAdditionalProperties(strapiData?.Metadata),
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      productNode,
      {
        "@type": "DeliveryEvent",
        "@id": `${productUrl}#cold-chain-delivery`,
        name: "Cold-chain delivery confirmation",
        description:
          "Frozen kosher meat orders are packed in insulated packaging with dry ice when shipped. Final shipping, pickup, and delivery options are confirmed at checkout based on address and basket.",
        about: { "@id": `${productUrl}#product` },
      },
    ],
  }
}
