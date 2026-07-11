import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"
import { isApprovedIngredientDisclosure } from "@lib/util/product-allergens"
import { STRAPI_CACHE_TAGS } from "@lib/strapi/cache-tags"
import type { IngredientDisclosure } from "types/strapi"

export type ProductIngredientDisclosureMap = Record<
  string,
  IngredientDisclosure[]
>

const PAGE_SIZE = 100

function compactDisclosure(disclosure: any): IngredientDisclosure | null {
  if (!disclosure || typeof disclosure !== "object") return null

  const compact: IngredientDisclosure = {
    id: disclosure.id,
    Sku: disclosure.Sku || null,
    Ingredients: disclosure.Ingredients || null,
    Contains: disclosure.Contains || null,
    ReviewStatus: disclosure.ReviewStatus || null,
  }

  return isApprovedIngredientDisclosure(compact) ? compact : null
}

function productIdFor(product: StrapiCollectionProduct) {
  return product.MedusaProduct?.ProductId || null
}

export async function getProductIngredientDisclosureMap(
  productIds: string[]
): Promise<ProductIngredientDisclosureMap> {
  const endpoint = process.env.STRAPI_ENDPOINT?.replace(/\/+$/, "")
  if (!endpoint) return {}

  const uniqueIds = Array.from(new Set(productIds.filter(Boolean)))
  if (uniqueIds.length === 0) return {}

  const headers = process.env.STRAPI_API_TOKEN
    ? { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` }
    : undefined

  const requestedIds = new Set(uniqueIds)
  const disclosureMap: ProductIngredientDisclosureMap = {}
  let start = 0

  while (true) {
    const url = new URL(`${endpoint}/api/products`)
    url.searchParams.set(
      "filters[IngredientDisclosures][ReviewStatus][$eq]",
      "approved"
    )
    url.searchParams.set("pagination[limit]", String(PAGE_SIZE))
    url.searchParams.set("pagination[start]", String(start))
    url.searchParams.set("populate[MedusaProduct]", "true")
    url.searchParams.set("populate[IngredientDisclosures]", "true")

    try {
      const res = await fetch(url.toString(), {
        headers,
        cache: "force-cache",
        next: {
          revalidate: 300,
          tags: [STRAPI_CACHE_TAGS.products],
        },
      })
      if (!res.ok) return disclosureMap

      const json = await res.json()
      const rows = Array.isArray(json?.data) ? json.data : []

      for (const row of rows) {
        const productId = row?.MedusaProduct?.ProductId
        if (!productId || !requestedIds.has(productId)) continue

        const disclosures = Array.isArray(row?.IngredientDisclosures)
          ? row.IngredientDisclosures.map(compactDisclosure).filter(
              (
                disclosure: IngredientDisclosure | null
              ): disclosure is IngredientDisclosure => disclosure !== null
            )
          : []

        if (disclosures.length > 0) {
          disclosureMap[productId] = disclosures
        }
      }

      if (rows.length < PAGE_SIZE) break
      start += PAGE_SIZE
    } catch {
      return disclosureMap
    }
  }

  return disclosureMap
}

export async function enrichProductsWithIngredientDisclosures<
  T extends StrapiCollectionProduct
>(products: T[]): Promise<T[]> {
  const missingDisclosureIds = products
    .filter((product) => !product.IngredientDisclosures?.length)
    .map(productIdFor)
    .filter((id): id is string => Boolean(id))

  if (missingDisclosureIds.length === 0) return products

  const disclosureMap = await getProductIngredientDisclosureMap(
    missingDisclosureIds
  )

  if (Object.keys(disclosureMap).length === 0) return products

  return products.map((product) => {
    if (product.IngredientDisclosures?.length) return product

    const productId = productIdFor(product)
    const disclosures = productId ? disclosureMap[productId] : undefined
    if (!disclosures?.length) return product

    return {
      ...product,
      IngredientDisclosures: disclosures,
    }
  })
}
