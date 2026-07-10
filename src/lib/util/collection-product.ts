import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"
import { strapiProductHasInternalRawMaterialSku } from "@lib/util/internal-products"

export const COLLECTION_PRODUCT_METADATA_KEYS = [
  "AvgPackSize",
  "AvgPackWeight",
  "Serves",
  "PiecesPerPack",
  "Uncooked",
  "Cooked",
  "HeatAndServe",
  "GlutenFree",
  "MSG",
  "AntibioticFree",
  "HormoneFree",
  "NoSteroids",
  "NoNitrites",
  "NoNitrates",
  "Organic",
  "Brand",
  "Source",
  "Origin",
  "Breed",
  "Supplier",
  "Angus",
  "GrassFed",
  "FreeRange",
  "SouthAmerican",
  "GrainFree",
  "BoneIn",
  "Boneless",
  "SkinOn",
  "Skinless",
  "Trimmed",
  "Untrimmed",
  "Netted",
  "FirstCut",
  "DeckelOn",
  "WholePacker",
  "CowboyCut",
  "Thickness",
  "Pargiot",
  "Capon",
  "Schnitzel",
  "Strips",
  "Marrow",
  "Kebab",
  "Smoked",
  "Pickled",
  "Cured",
  "Marinated",
  "MarinadeFlavor",
  "CharGrilled",
  "Sliced",
  "Ground",
  "Bulk",
  "Offcut",
  "VacuumPacked",
  "BulkPack",
  "BoilablePouch",
  "AluminumPan",
  "IQF",
  "KosherForPassover",
  "Pareve",
  "Meat",
  "Dairy",
  "CholovYisroel",
  "ChassidishShchita",
  "CHK",
  "RabbiWeissmandl",
  "OU",
  "StarK",
  "RabbiTeitelbaum",
  "CRC",
  "Lubavitch",
  "QualifiesForFreeDeliveryOffers",
  "FreeDeliveryExclusionReason",
  "PricingMode",
] as const

function compactImage(image: any) {
  return image?.url ? { url: image.url } : undefined
}

function compactMetadata(metadata: any) {
  if (!metadata || typeof metadata !== "object") return undefined

  const compact: Record<string, unknown> = {}
  for (const key of COLLECTION_PRODUCT_METADATA_KEYS) {
    const value = metadata[key]
    if (value === undefined || value === null || value === "") continue
    if (value === false && key !== "QualifiesForFreeDeliveryOffers") continue
    compact[key] = value
  }

  return Object.keys(compact).length ? compact : undefined
}

function compactVariant(variant: any) {
  if (!variant || typeof variant !== "object") return null

  const compact: Record<string, unknown> = {
    VariantId: variant.VariantId || "",
  }

  if (variant.Sku) compact.Sku = variant.Sku
  if (variant.QualifiesForFreeDeliveryOffers !== undefined) {
    compact.QualifiesForFreeDeliveryOffers =
      variant.QualifiesForFreeDeliveryOffers
  }
  if (variant.FreeDeliveryExclusionReason) {
    compact.FreeDeliveryExclusionReason = variant.FreeDeliveryExclusionReason
  }
  if (variant.manage_inventory !== undefined) {
    compact.manage_inventory = variant.manage_inventory
  }
  if (variant.allow_backorder !== undefined) {
    compact.allow_backorder = variant.allow_backorder
  }
  if (typeof variant.inventory_quantity === "number") {
    compact.inventory_quantity = variant.inventory_quantity
  }

  const price = variant.Price?.CalculatedPriceNumber
  if (typeof price === "number") {
    compact.Price = { CalculatedPriceNumber: price }
  }

  return compact
}

function compactIngredientDisclosure(disclosure: any) {
  if (!disclosure || typeof disclosure !== "object") return null

  return {
    id: disclosure.id,
    Sku: disclosure.Sku || null,
    Ingredients: disclosure.Ingredients || null,
    Contains: disclosure.Contains || null,
    ReviewStatus: disclosure.ReviewStatus || null,
  }
}

export function compactCollectionProduct(
  product: any
): StrapiCollectionProduct {
  const medusaProduct = product?.MedusaProduct
  const variants = Array.isArray(medusaProduct?.Variants)
    ? medusaProduct.Variants.map(compactVariant).filter(Boolean)
    : []
  const tags = Array.isArray(product?.Categorization?.ProductTags)
    ? product.Categorization.ProductTags.map((tag: any) =>
        tag?.Name ? { Name: tag.Name } : null
      ).filter(Boolean)
    : []
  const ingredientDisclosures = Array.isArray(product?.IngredientDisclosures)
    ? product.IngredientDisclosures.map(compactIngredientDisclosure).filter(
        Boolean
      )
    : []

  return {
    documentId: product?.documentId || String(product?.objectID || ""),
    Title: product?.Title || "",
    FeaturedImage: compactImage(product?.FeaturedImage),
    GalleryImages: Array.isArray(product?.GalleryImages)
      ? product.GalleryImages.map(compactImage).filter(Boolean)
      : [],
    IngredientDisclosures: ingredientDisclosures.length
      ? ingredientDisclosures
      : undefined,
    Metadata: compactMetadata(product?.Metadata),
    Categorization: tags.length ? { ProductTags: tags } : undefined,
    MedusaProduct: medusaProduct
      ? {
          ProductId: medusaProduct.ProductId || medusaProduct.Id || "",
          Handle: medusaProduct.Handle || "",
          Description: medusaProduct.Description || null,
          ShortDescription: medusaProduct.ShortDescription || null,
          PricingMode: medusaProduct.PricingMode || null,
          Variants: variants,
        }
      : undefined,
  } as StrapiCollectionProduct
}

export function compactCollectionProducts<T extends StrapiCollectionProduct>(
  products: T[]
): StrapiCollectionProduct[] {
  return products
    .map(compactCollectionProduct)
    .filter((product) => !strapiProductHasInternalRawMaterialSku(product))
}

export const ALGOLIA_COLLECTION_PRODUCT_ATTRIBUTES = [
  "documentId",
  "Title",
  "FeaturedImage.url",
  "GalleryImages.url",
  "IngredientDisclosures.Sku",
  "IngredientDisclosures.Ingredients",
  "IngredientDisclosures.Contains",
  "IngredientDisclosures.ReviewStatus",
  ...COLLECTION_PRODUCT_METADATA_KEYS.map((key) => `Metadata.${key}`),
  "Categorization.ProductTags.Name",
  "MedusaProduct.ProductId",
  "MedusaProduct.Id",
  "MedusaProduct.Handle",
  "MedusaProduct.Description",
  "MedusaProduct.ShortDescription",
  "MedusaProduct.PricingMode",
  "MedusaProduct.Variants.VariantId",
  "MedusaProduct.Variants.Sku",
  "MedusaProduct.Variants.QualifiesForFreeDeliveryOffers",
  "MedusaProduct.Variants.FreeDeliveryExclusionReason",
  "MedusaProduct.Variants.manage_inventory",
  "MedusaProduct.Variants.allow_backorder",
  "MedusaProduct.Variants.inventory_quantity",
  "MedusaProduct.Variants.Price.CalculatedPriceNumber",
]
