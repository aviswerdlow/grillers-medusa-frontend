export const STRAPI_CACHE_TAGS = {
  products: "strapi:model:product",
  productCollections: "strapi:model:product-collection",
  curatedCollections: "strapi:model:curated-collection",
  home: "strapi:model:home",
  global: "strapi:model:global",
  header: "strapi:model:header",
  footer: "strapi:model:footer",
  announcementBar: "strapi:model:announcement-bar",
  analytics: "strapi:model:analytic",
  cookieConsent: "strapi:model:cookie-consent",
  pdp: "strapi:model:pdp",
} as const

// Previous storefront releases tagged every Strapi result with this value.
// Keep invalidating it during the model-tag rollout; current caches never
// attach it, so this only drains entries created by older deployments.
export const LEGACY_STRAPI_CACHE_TAG = "strapi"

export type StrapiCacheTag =
  (typeof STRAPI_CACHE_TAGS)[keyof typeof STRAPI_CACHE_TAGS]

export const ALL_STRAPI_CACHE_TAGS = Array.from(
  new Set(Object.values(STRAPI_CACHE_TAGS))
)

const TAGS_BY_CACHE_NAME: Array<{
  matches: (name: string) => boolean
  tags: StrapiCacheTag[]
}> = [
  {
    matches: (name) => name === "pdp-product",
    tags: [STRAPI_CACHE_TAGS.products],
  },
  {
    matches: (name) => name === "pdp-common",
    tags: [STRAPI_CACHE_TAGS.pdp],
  },
  {
    matches: (name) => name === "curated-collections-cards",
    tags: [STRAPI_CACHE_TAGS.curatedCollections],
  },
  {
    matches: (name) => name.startsWith("curated-collection-by-slug"),
    tags: [STRAPI_CACHE_TAGS.curatedCollections, STRAPI_CACHE_TAGS.products],
  },
  {
    matches: (name) => name.startsWith("collections-"),
    tags: [STRAPI_CACHE_TAGS.productCollections, STRAPI_CACHE_TAGS.products],
  },
  {
    matches: (name) => name === "home-page",
    tags: [STRAPI_CACHE_TAGS.home],
  },
  {
    matches: (name) => name === "home-global",
    tags: [STRAPI_CACHE_TAGS.global],
  },
  {
    matches: (name) => name === "header-nav",
    tags: [STRAPI_CACHE_TAGS.header],
  },
  {
    matches: (name) => name === "footer",
    tags: [STRAPI_CACHE_TAGS.footer],
  },
  {
    matches: (name) => name === "announcement-bar",
    tags: [STRAPI_CACHE_TAGS.announcementBar],
  },
  {
    matches: (name) => name === "analytics-config",
    tags: [STRAPI_CACHE_TAGS.analytics],
  },
  {
    matches: (name) => name === "cookie-consent",
    tags: [STRAPI_CACHE_TAGS.cookieConsent],
  },
]

/**
 * Keep existing call sites safe while model tags are rolled out. Cache names
 * are deliberately stable and one-to-one with query text in this storefront,
 * so they are a reliable place to attach the owning Strapi model(s).
 */
export function strapiCacheTagsForRequest(name: string): StrapiCacheTag[] {
  const match = TAGS_BY_CACHE_NAME.find((entry) => entry.matches(name))
  // A new cached query must not become impossible to refresh. Unknown cache
  // names use all known model tags until the owner is added above; known
  // webhook models still invalidate only their own model tag.
  return match?.tags || ALL_STRAPI_CACHE_TAGS
}

const TAGS_BY_WEBHOOK_MODEL: Record<string, StrapiCacheTag[]> = {
  product: [STRAPI_CACHE_TAGS.products],
  "product-collection": [STRAPI_CACHE_TAGS.productCollections],
  "product-tag": [STRAPI_CACHE_TAGS.products],
  "product-type": [STRAPI_CACHE_TAGS.products],
  category: [STRAPI_CACHE_TAGS.products],
  "sub-category": [STRAPI_CACHE_TAGS.products],
  "master-category": [STRAPI_CACHE_TAGS.products],
  aisle: [STRAPI_CACHE_TAGS.products],
  tag: [STRAPI_CACHE_TAGS.products],
  recipe: [STRAPI_CACHE_TAGS.products],
  "recipe-category": [STRAPI_CACHE_TAGS.products],
  "recipe-collection": [STRAPI_CACHE_TAGS.products],
  "curated-collection": [STRAPI_CACHE_TAGS.curatedCollections],
  home: [STRAPI_CACHE_TAGS.home],
  global: [STRAPI_CACHE_TAGS.global],
  header: [STRAPI_CACHE_TAGS.header],
  footer: [STRAPI_CACHE_TAGS.footer],
  "announcement-bar": [STRAPI_CACHE_TAGS.announcementBar],
  analytic: [STRAPI_CACHE_TAGS.analytics],
  "cookie-consent": [STRAPI_CACHE_TAGS.cookieConsent],
  pdp: [STRAPI_CACHE_TAGS.pdp],
}

function webhookModelCandidates(model: string | null | undefined) {
  const normalized = model?.trim().toLowerCase()
  if (!normalized) return []

  const withoutNamespace = normalized.includes("::")
    ? normalized.split("::").pop() || normalized
    : normalized

  return Array.from(
    new Set([normalized, withoutNamespace, ...withoutNamespace.split(".")])
  )
}

export function strapiCacheTagsForWebhook({
  event,
  model,
}: {
  event?: string | null
  model?: string | null
}): StrapiCacheTag[] {
  const normalizedEvent = event?.trim().toLowerCase() || ""
  const candidates = webhookModelCandidates(model)

  // An uploaded asset can be referenced by any content model, so every
  // surface that embeds media is genuinely affected by a media event.
  if (
    normalizedEvent.startsWith("media.") ||
    candidates.some((candidate) =>
      ["file", "upload", "plugin::upload.file"].includes(candidate)
    )
  ) {
    return ALL_STRAPI_CACHE_TAGS
  }

  for (const candidate of candidates) {
    const tags = TAGS_BY_WEBHOOK_MODEL[candidate]
    if (tags) return tags
  }

  // Old/malformed webhooks occasionally omit model. Preserve freshness for
  // that exceptional case without making normal model events global again.
  return ALL_STRAPI_CACHE_TAGS
}
