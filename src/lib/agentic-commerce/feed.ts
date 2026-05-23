import type { HttpTypes } from "@medusajs/types"

export const AGENTIC_COMMERCE_FEED_VERSION =
  "grillers-pride.agentic-commerce-products.v1"

export type AgenticCommerceProduct = {
  item_id: string
  product_id: string
  variant_id: string | null
  sku: string | null
  mpn: string | null
  title: string
  description: string
  url: string
  image_url: string | null
  additional_image_urls: string[]
  brand: string
  condition: "new"
  availability: "in_stock" | "out_of_stock"
  price: {
    amount: number | null
    currency: string
  }
  categories: string[]
  tags: string[]
  kosher: {
    merchant: "Grillers Pride"
    claims: string[]
  }
  fulfillment: {
    methods: string[]
    notes: string
  }
}

export type AgenticCommerceProductFeed = {
  schema_version: typeof AGENTIC_COMMERCE_FEED_VERSION
  generated_at: string
  merchant: {
    id: "grillers-pride"
    name: "Grillers Pride"
    canonical_url: string
    default_country_code: string
  }
  integration: {
    protocol: "openai-agentic-commerce-product-feed"
    checkout_mode: "merchant_redirect"
    universal_cart_cookie: "_medusa_cart_id"
  }
  products: AgenticCommerceProduct[]
}

type FeedOptions = {
  baseUrl: string
  countryCode: string
  generatedAt?: string
}

type ProductVariant = NonNullable<HttpTypes.StoreProduct["variants"]>[number]

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, "")
}

function absoluteUrl(value: string | null | undefined, baseUrl: string) {
  if (!value) return null
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return null
  }
}

function normalizeText(value: unknown, maxLength: number) {
  const text = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1).trimEnd()
}

function stripEmbeddedPrice(value: string) {
  return value
    .replace(/\$\s?\d+(?:\.\d+)?\s*\/\s*(?:lb|oz|kg|g|each|ea)\.?/gi, "")
    .replace(/[\s,.\-]+$/g, "")
    .trim()
}

function cleanLegacyProductTitle(value: string) {
  const stripped = stripEmbeddedPrice(value)
  const firstComma = stripped.indexOf(",")

  if (firstComma > 3) {
    return stripped.slice(0, firstComma).trim()
  }

  return stripped
}

function cleanTitle(productTitle: string, variantTitle?: string | null) {
  const base = cleanLegacyProductTitle(productTitle)
  const variant = variantTitle ? cleanLegacyProductTitle(variantTitle) : ""
  const lowerBase = base.toLowerCase()
  const lowerVariant = variant.toLowerCase()
  const shouldAppendVariant =
    variant &&
    variant !== "Default variant" &&
    lowerVariant !== lowerBase &&
    !lowerVariant.startsWith(lowerBase) &&
    !lowerBase.startsWith(lowerVariant)

  const title = shouldAppendVariant ? `${base} - ${variant}` : base

  return normalizeText(title || productTitle || "Grillers Pride product", 150)
}

function variantAmount(variant?: ProductVariant | null) {
  const amount = (variant as any)?.calculated_price?.calculated_amount
  return typeof amount === "number" && Number.isFinite(amount) ? amount : null
}

function variantCurrency(variant?: ProductVariant | null) {
  const currency = (variant as any)?.calculated_price?.currency_code
  return String(currency || "usd").toUpperCase()
}

function variantAvailability(
  variant?: ProductVariant | null
): AgenticCommerceProduct["availability"] {
  if (!variant) return "out_of_stock"
  if (!variant.manage_inventory || variant.allow_backorder) return "in_stock"
  return (variant.inventory_quantity ?? 0) > 0 ? "in_stock" : "out_of_stock"
}

function categoryNames(product: HttpTypes.StoreProduct) {
  const seen = new Set<string>()
  const names: string[] = []

  const visit = (category: any) => {
    if (!category) return
    visit(category.parent_category)
    const name = normalizeText(category.name, 80)
    if (name && !seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }

  for (const category of product.categories || []) {
    visit(category)
  }

  return names
}

function tagNames(product: HttpTypes.StoreProduct) {
  return Array.from(
    new Set(
      (product.tags || [])
        .map((tag: any) => normalizeText(tag.value || tag.name || "", 80))
        .filter(Boolean)
    )
  )
}

function kosherClaims(product: HttpTypes.StoreProduct) {
  const metadata = (product.metadata || {}) as Record<string, unknown>
  const claims = new Set<string>(["kosher"])

  for (const key of [
    "CHK",
    "OU",
    "StarK",
    "CRC",
    "RabbiWeissmandl",
    "RabbiTeitelbaum",
    "Lubavitch",
    "ChassidishShchita",
    "GlutenFree",
  ]) {
    if (
      metadata[key] === true ||
      String(metadata[key]).toLowerCase() === "true"
    ) {
      claims.add(key)
    }
  }

  if (
    metadata.kosher_for_passover === true ||
    String(metadata.kosher_for_passover).toLowerCase() === "true"
  ) {
    claims.add("Kosher for Passover")
  }

  return Array.from(claims)
}

function productImages(product: HttpTypes.StoreProduct, baseUrl: string) {
  const rawImages = [
    product.thumbnail,
    ...(product.images || []).map((image) => image.url),
  ]

  return Array.from(
    new Set(
      rawImages
        .map((image) => absoluteUrl(image, baseUrl))
        .filter((image): image is string => Boolean(image))
    )
  )
}

function productDescription(product: HttpTypes.StoreProduct, title: string) {
  return (
    normalizeText(product.description, 5000) ||
    `${title} from Grillers Pride. See the product page for current pack size, kosher claims, price, availability, and fulfillment options.`
  )
}

function itemId(
  product: HttpTypes.StoreProduct,
  variant?: ProductVariant | null
) {
  return variant?.id || product.id
}

export function buildAgenticCommerceProductFeed(
  products: HttpTypes.StoreProduct[],
  options: FeedOptions
): AgenticCommerceProductFeed {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const countryCode = options.countryCode.toLowerCase()
  const entries = products.flatMap((product) => {
    const variants = product.variants?.length ? product.variants : [null]
    const categories = categoryNames(product)
    const tags = tagNames(product)
    const claims = kosherClaims(product)
    const images = productImages(product, baseUrl)
    const url = `${baseUrl}/${countryCode}/products/${
      product.handle || product.id
    }`

    return variants.map((variant) => {
      const title = cleanTitle(product.title || "", variant?.title)

      return {
        item_id: itemId(product, variant),
        product_id: product.id,
        variant_id: variant?.id || null,
        sku: variant?.sku || null,
        mpn: variant?.sku || null,
        title,
        description: productDescription(product, title),
        url,
        image_url: images[0] || null,
        additional_image_urls: images.slice(1),
        brand: "Grillers Pride",
        condition: "new" as const,
        availability: variantAvailability(variant),
        price: {
          amount: variantAmount(variant),
          currency: variantCurrency(variant),
        },
        categories,
        tags,
        kosher: {
          merchant: "Grillers Pride" as const,
          claims,
        },
        fulfillment: {
          methods: [
            "ups_frozen_delivery",
            "atlanta_local_delivery",
            "southeast_pickup",
            "plant_pickup",
          ],
          notes:
            "Fulfillment eligibility, schedules, minimums, taxes, and shipping charges are authoritative at cart and checkout time.",
        },
      }
    })
  })

  return {
    schema_version: AGENTIC_COMMERCE_FEED_VERSION,
    generated_at: options.generatedAt || new Date().toISOString(),
    merchant: {
      id: "grillers-pride",
      name: "Grillers Pride",
      canonical_url: baseUrl,
      default_country_code: countryCode,
    },
    integration: {
      protocol: "openai-agentic-commerce-product-feed",
      checkout_mode: "merchant_redirect",
      universal_cart_cookie: "_medusa_cart_id",
    },
    products: entries,
  }
}
