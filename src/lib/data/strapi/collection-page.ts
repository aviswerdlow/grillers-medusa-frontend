import strapiClient from "@lib/strapi"
import {
  extractTagValue,
  getProductCollectionByHandle,
  getProductTagBySlugStrict,
  getProductsByCollectionSlugStrict,
  getProductsByTagStrict,
  type ProductCollectionData,
  type StrapiCollectionProduct,
} from "./collections"
import {
  getCuratedCollectionBySlug,
  type CuratedCollection,
} from "./curated-collections"
import { withStrapiTimeout } from "@lib/util/strapi-timeout"

export type CollectionPageContent =
  | { kind: "curated"; collection: CuratedCollection }
  | {
      kind: "products"
      collection: ProductCollectionData
      products: StrapiCollectionProduct[]
      tagSEODescription: string
    }

export type CollectionPageLoadResult =
  | { status: "ready"; content: CollectionPageContent; stale: false }
  | {
      status: "ready"
      content: CollectionPageContent
      stale: true
      lastGoodAgeSeconds: number
    }
  | { status: "not_found"; stale: false }
  | { status: "unavailable"; stale: false }

const DEFAULT_COLLECTION_TIMEOUT_MS = 8_000
// This is a process-local last-good copy. The query results themselves live in
// Next's shared Data Cache, including when a timed-out refresh finishes later.
const lastGoodByClient = new WeakMap<
  object,
  Map<string, { content: CollectionPageContent; loadedAtMs: number }>
>()

export async function withLastGoodCollection(
  client: object,
  handle: string,
  countryCode: string,
  load: () => Promise<CollectionPageContent | null>,
  timeoutMs = DEFAULT_COLLECTION_TIMEOUT_MS
): Promise<CollectionPageLoadResult> {
  let entries = lastGoodByClient.get(client)
  if (!entries) {
    entries = new Map()
    lastGoodByClient.set(client, entries)
  }
  const key = `${countryCode}:${handle}`
  const previous = entries.get(key)
  const refresh = load().then((content) => {
    if (content) entries!.set(key, { content, loadedAtMs: Date.now() })
    else entries!.delete(key)
    return content
  })

  try {
    // An 8 s early return is safe only when this process has a complete copy.
    // A true cold miss waits for the transport and can fill the Data Cache.
    const content = await (previous
      ? withStrapiTimeout(refresh, timeoutMs, `Collection ${handle}`)
      : refresh)
    return content
      ? { status: "ready", content, stale: false }
      : { status: "not_found", stale: false }
  } catch (error) {
    console.error(`Error loading collection ${handle}:`, error)
    return previous
      ? {
          status: "ready",
          content: previous.content,
          stale: true,
          lastGoodAgeSeconds: Math.max(
            0,
            Math.floor((Date.now() - previous.loadedAtMs) / 1000)
          ),
        }
      : { status: "unavailable", stale: false }
  }
}

export async function getCollectionPageData(
  handle: string,
  countryCode: string
): Promise<CollectionPageLoadResult> {
  return withLastGoodCollection(strapiClient, handle, countryCode, async () => {
    let curated: CuratedCollection | null = null
    let curatedError: unknown
    try {
      curated = await getCuratedCollectionBySlug(
        handle,
        countryCode,
        "collection_page",
        true
      )
    } catch (error) {
      // A product collection or tag can still be a usable shopping route.
      curatedError = error
    }
    if (curated) return { kind: "curated", collection: curated }

    const collection = await getProductCollectionByHandle(handle, strapiClient)
    if (collection) {
      const products = await getProductsByCollectionSlugStrict(
        handle,
        strapiClient
      )
      return {
        kind: "products",
        collection,
        products,
        tagSEODescription: "",
      }
    }

    const tag = await getProductTagBySlugStrict(handle, strapiClient)
    if (!tag) {
      if (curatedError) throw curatedError
      return null
    }
    const tagValue = extractTagValue(tag.Name)
    const products = await getProductsByTagStrict(tag.Name, strapiClient)
    return {
      kind: "products",
      collection: {
        Name: `Kosher ${tagValue}`,
        Slug: handle,
        Description:
          tag.Description || `Browse our Kosher ${tagValue} products`,
      },
      products,
      tagSEODescription: tag.SEODescription || "",
    }
  })
}
