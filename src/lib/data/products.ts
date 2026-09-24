"use server"

import { sdk } from "@lib/config"
import { isInternalMedusaProduct } from "@lib/util/internal-products"
import { sortProducts } from "@lib/util/sort-products"
import { HttpTypes } from "@medusajs/types"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import { getRegion, retrieveRegion } from "./regions"
import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"
import { reportProductEnrichmentFailure } from "@lib/product-enrichment-ops-alerts"

function isLegacyReorderOnlyProduct(product: HttpTypes.StoreProduct) {
  const metadata = product.metadata as Record<string, unknown> | null | undefined
  const flag = metadata?.legacy_reorder_only

  return flag === true || String(flag).toLowerCase() === "true"
}

export const listProducts = async ({
  pageParam = 1,
  queryParams,
  countryCode,
  regionId,
}: {
  pageParam?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  countryCode?: string
  regionId?: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> => {
  if (!countryCode && !regionId) {
    throw new Error("Country code or region ID is required")
  }

  const limit = queryParams?.limit || 12
  const _pageParam = Math.max(pageParam, 1)
  const offset = _pageParam === 1 ? 0 : (_pageParam - 1) * limit

  let region: HttpTypes.StoreRegion | undefined | null

  if (countryCode) {
    region = await getRegion(countryCode)
  } else {
    region = await retrieveRegion(regionId!)
  }

  if (!region) {
    return {
      response: { products: [], count: 0 },
      nextPage: null,
    }
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("products")),
  }

  return sdk.client
    .fetch<{ products: HttpTypes.StoreProduct[]; count: number }>(
      `/store/products`,
      {
        method: "GET",
        query: {
          limit,
          offset,
          region_id: region?.id,
          fields:
            "*variants.calculated_price,+variants.inventory_quantity,+variants.manage_inventory,+variants.allow_backorder,+metadata,+tags,*categories,*categories.parent_category,*categories.parent_category.parent_category",
          ...queryParams,
        },
        headers,
        next,
        cache: "force-cache",
      }
    )
    .then(({ products, count }) => {
      const visibleProducts = products.filter(
        (product) =>
          !isLegacyReorderOnlyProduct(product) &&
          !isInternalMedusaProduct(product)
      )
      const nextPage = count > offset + limit ? pageParam + 1 : null

      return {
        response: {
          products: visibleProducts,
          count: Math.max(0, count - (products.length - visibleProducts.length)),
        },
        nextPage: nextPage,
        queryParams,
      }
    })
}

/**
 * This will fetch 100 products to the Next.js cache and sort them based on the sortBy parameter.
 * It will then return the paginated products based on the page and limit parameters.
 */
export const listProductsWithSort = async ({
  page = 0,
  queryParams,
  sortBy = "created_at",
  countryCode,
}: {
  page?: number
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
  sortBy?: SortOptions
  countryCode: string
}): Promise<{
  response: { products: HttpTypes.StoreProduct[]; count: number }
  nextPage: number | null
  queryParams?: HttpTypes.FindParams & HttpTypes.StoreProductParams
}> => {
  const limit = queryParams?.limit || 12

  const {
    response: { products, count },
  } = await listProducts({
    pageParam: 0,
    queryParams: {
      ...queryParams,
      limit: 100,
    },
    countryCode,
  })

  const sortedProducts = sortProducts(products, sortBy)

  const pageParam = (page - 1) * limit

  const nextPage = count > pageParam + limit ? pageParam + limit : null

  const paginatedProducts = sortedProducts.slice(pageParam, pageParam + limit)

  return {
    response: {
      products: paginatedProducts,
      count,
    },
    nextPage,
    queryParams,
  }
}

/**
 * Strapi is the source of truth for product copy/metadata, but Medusa is the
 * source of truth for live prices and availability. Strapi product snapshots can
 * lag or miss fields, so this helper overlays live Medusa card state. Reorder
 * pages can require an exact live variant price instead of a Strapi snapshot.
 */
export const enrichStrapiProductsWithMedusaPrices = async <T extends StrapiCollectionProduct>(
  products: T[],
  countryCode: string,
  options: { requireLivePrices?: boolean } = {}
): Promise<T[]> => {
  const productIds = Array.from(
    new Set(
      products
        .map((p) => p.MedusaProduct?.ProductId)
        .filter((id): id is string => Boolean(id))
    )
  )
  if (productIds.length === 0) return products

  // Medusa V2's /store/products has a default page-size cap; large id[]
  // arrays come back without `calculated_price` populated on every variant.
  // Chunk the fetch so each request stays well within the cap, then merge.
  // Empirically the /us/store path (≈ 400 ids) was silently returning
  // variants without prices on a single bulk call — chunked, all return
  // priced.
  const CHUNK_SIZE = 50
  const chunks: string[][] = []
  for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
    chunks.push(productIds.slice(i, i + CHUNK_SIZE))
  }
  const medusaProducts = (
    await Promise.all(
      chunks.map(async (chunk, index) => {
        try {
          const { response } = await listProducts({
            countryCode,
            queryParams: {
              id: chunk,
              limit: chunk.length,
            } as HttpTypes.FindParams & HttpTypes.StoreProductParams,
          })
          return response.products
        } catch (err) {
          const start = index * CHUNK_SIZE
          console.error(
            `enrichStrapiProductsWithMedusaPrices: Medusa fetch chunk ${start}-${start + chunk.length} failed`,
            err
          )
          reportProductEnrichmentFailure({
            stage: "medusa_price_inventory_chunk",
            countryCode,
            productCount: productIds.length,
            chunkIndex: index,
            chunkSize: chunk.length,
            error: err,
          })
          // Continue with other chunks rather than dropping every product's price.
          return []
        }
      })
    )
  ).flat()

  type LiveVariantSnapshot = {
    price?: number
    manage_inventory?: boolean | null
    allow_backorder?: boolean | null
    inventory_quantity?: number | null
  }

  const variantById = new Map<string, LiveVariantSnapshot>()
  const firstVariantByProduct = new Map<string, LiveVariantSnapshot>()
  for (const mp of medusaProducts) {
    const variants = mp.variants ?? []
    let firstSnapshot: LiveVariantSnapshot | null = null
    for (const v of variants) {
      const amount = (v as any).calculated_price?.calculated_amount
      const snapshot: LiveVariantSnapshot = {
        price: typeof amount === "number" ? amount : undefined,
        manage_inventory: (v as any).manage_inventory,
        allow_backorder: (v as any).allow_backorder,
        inventory_quantity: (v as any).inventory_quantity,
      }
      variantById.set(v.id, snapshot)
      if (firstSnapshot === null) firstSnapshot = snapshot
    }
    if (firstSnapshot !== null) {
      firstVariantByProduct.set(mp.id, firstSnapshot)
    }
  }

  return products.map((p) => {
    if (!p.MedusaProduct) return p
    const variants = p.MedusaProduct.Variants ?? []
    if (variants.length === 0) {
      const fallback = firstVariantByProduct.get(p.MedusaProduct.ProductId)
      if (fallback == null) return p
      return {
        ...p,
        MedusaProduct: {
          ...p.MedusaProduct,
          Variants: [
            {
              VariantId: "",
              ...(typeof fallback.price === "number"
                ? { Price: { CalculatedPriceNumber: fallback.price } }
                : {}),
              manage_inventory: fallback.manage_inventory,
              allow_backorder: fallback.allow_backorder,
              inventory_quantity: fallback.inventory_quantity,
            },
          ],
        },
      }
    }
    const enrichedVariants = variants.map((v) => {
      const snapshot = options.requireLivePrices
        ? variantById.get(v.VariantId)
        : variantById.get(v.VariantId) ??
          firstVariantByProduct.get(p.MedusaProduct!.ProductId)
      if (snapshot == null) {
        return options.requireLivePrices ? { ...v, Price: undefined } : v
      }
      return {
        ...v,
        Price:
          typeof snapshot.price === "number"
            ? { ...(v.Price ?? {}), CalculatedPriceNumber: snapshot.price }
            : options.requireLivePrices
            ? undefined
            : v.Price,
        manage_inventory: snapshot.manage_inventory,
        allow_backorder: snapshot.allow_backorder,
        inventory_quantity: snapshot.inventory_quantity,
      }
    })
    return {
      ...p,
      MedusaProduct: { ...p.MedusaProduct, Variants: enrichedVariants },
    }
  })
}
