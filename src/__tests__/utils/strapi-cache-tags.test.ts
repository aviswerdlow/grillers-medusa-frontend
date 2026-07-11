import {
  ALL_STRAPI_CACHE_TAGS,
  LEGACY_STRAPI_CACHE_TAG,
  STRAPI_CACHE_TAGS,
  strapiCacheTagsForRequest,
  strapiCacheTagsForWebhook,
} from "@lib/strapi/cache-tags"

describe("Strapi cache tags", () => {
  it("keeps product and layout cache ownership separate", () => {
    expect(strapiCacheTagsForRequest("pdp-product")).toEqual([
      STRAPI_CACHE_TAGS.products,
    ])
    expect(strapiCacheTagsForRequest("header-nav")).toEqual([
      STRAPI_CACHE_TAGS.header,
    ])
    expect(strapiCacheTagsForRequest("curated-collection-by-slug")).toEqual([
      STRAPI_CACHE_TAGS.curatedCollections,
      STRAPI_CACHE_TAGS.products,
    ])
  })

  it("maps namespaced Strapi webhook models to only affected tags", () => {
    expect(
      strapiCacheTagsForWebhook({
        event: "entry.update",
        model: "api::product.product",
      })
    ).toEqual([STRAPI_CACHE_TAGS.products])
    expect(
      strapiCacheTagsForWebhook({
        event: "entry.publish",
        model: "curated-collection",
      })
    ).toEqual([STRAPI_CACHE_TAGS.curatedCollections])
  })

  it("invalidates every model only for genuinely cross-model or unknown events", () => {
    expect(
      strapiCacheTagsForWebhook({ event: "media.update", model: "file" })
    ).toEqual(ALL_STRAPI_CACHE_TAGS)
    expect(strapiCacheTagsForWebhook({})).toEqual(ALL_STRAPI_CACHE_TAGS)
    expect(strapiCacheTagsForRequest("new-unmapped-query")).toEqual(
      ALL_STRAPI_CACHE_TAGS
    )
    expect(ALL_STRAPI_CACHE_TAGS).not.toContain(LEGACY_STRAPI_CACHE_TAG)
  })
})
