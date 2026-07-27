"use server"

import "server-only"

import { revalidatePath, unstable_cache } from "next/cache"
import type { HttpTypes } from "@medusajs/types"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { reportServerSoftFailure } from "@lib/server-soft-failure"
import {
  emitStaffMerchandisingActionFailureAlert,
  emitStaffMerchandisingReviewTelemetry,
} from "@lib/staff-merchandising-ops-alerts"
import {
  canReviewMerchandising,
  staffDisplayName,
} from "@lib/util/staff-access"
import {
  buildMerchandisingClaim,
  isClaimActive,
  isClaimOwnedBy,
  parseReviewCaption,
  reviewSummary,
  serializeReviewCaption,
} from "./product-merchandising-review-payload"
import type {
  MerchandisingImageClaim,
  MerchandisingImageReview,
  MerchandisingRejectReason,
  MerchandisingReviewAuditEntry,
  MerchandisingReviewStatus,
} from "./product-merchandising-review-payload"

type AnyRecord = Record<string, any>

export type {
  MerchandisingImageClaim,
  MerchandisingImageReview,
  MerchandisingRejectReason,
  MerchandisingReviewAuditEntry,
  MerchandisingReviewStatus,
} from "./product-merchandising-review-payload"

export type MerchandisingProductImage = {
  id: number
  documentId: string
  role: "featured" | "gallery"
  name: string
  url: string
  displayUrl: string
  thumbnailUrl?: string
  alternativeText?: string | null
  caption?: string | null
  review: MerchandisingImageReview
  claim?: MerchandisingImageClaim
  auditHistory: MerchandisingReviewAuditEntry[]
}

export type ProductMerchandisingProduct = {
  documentId: string
  title: string
  description: string
  handle?: string | null
  sku: string
  metadata: string[]
  l2Tags: string[]
  l3Tags: string[]
  images: MerchandisingProductImage[]
}

export type ProductMerchandisingTagSummary = {
  documentId: string
  name: string
  displayName: string
  description?: string
  seoDescription?: string
  productCount: number
  imageCount: number
  reviewedImageCount: number
  approvedImageCount: number
  rejectedImageCount: number
  claimedImageCount: number
  oldestActiveClaimedAt?: string | null
  noImageProductCount: number
  metadata: string[]
  l2Parents: string[]
}

export type ProductMerchandisingDetail = ProductMerchandisingTagSummary & {
  products: ProductMerchandisingProduct[]
}

export type ReviewMerchandisingImageInput = {
  imageId: number
  imageDocumentId?: string
  countryCode: string
  status: Exclude<MerchandisingReviewStatus, "unreviewed">
  reason?: MerchandisingRejectReason
  note?: string
  currentCaption?: string | null
  overwriteExistingReview?: boolean
}

export type ClaimMerchandisingImageInput = {
  imageId: number
  imageDocumentId?: string
  countryCode: string
  tagId?: string
  tagName?: string
  currentCaption?: string | null
}

export type MerchandisingImageActionResult = {
  ok: boolean
  review?: MerchandisingImageReview
  claim?: MerchandisingImageClaim
  auditHistory?: MerchandisingReviewAuditEntry[]
  caption?: string | null
  conflict?: boolean
  canOverwrite?: boolean
  latestReview?: MerchandisingImageReview
  latestClaim?: MerchandisingImageClaim
  error?: string
}

type RawProductTag = {
  documentId?: string
  Name?: string
  Description?: string | null
  SEODescription?: string | null
}

type RawImage = {
  id?: number
  documentId?: string
  name?: string
  url?: string
  formats?: AnyRecord | null
  alternativeText?: string | null
  caption?: string | null
}

type RawMediaReview = {
  uploadFileId?: number
  UploadFileId?: number
  caption?: string | null
  ReviewPayload?: string | null
}

type NormalizedProductTag = {
  documentId: string
  name: string
  description: string
  seoDescription: string
}

const GRAPHQL_PAGE_SIZE = 100
const GRAPHQL_PAGE_BATCH_SIZE = 5
const REST_PAGE_BATCH_SIZE = 4
const STRAPI_READ_RETRY_DELAYS_MS = [250, 750]
const TAG_SUMMARY_CACHE_MS = 5 * 60 * 1000
const TAG_SUMMARY_NEXT_CACHE_SECONDS = 5 * 60
const TAG_SUMMARY_NEXT_CACHE_KEY = "staff-merchandising-tag-summary-v2"
const TAG_SUMMARY_NEXT_CACHE_TAG = "staff-merchandising-tag-summary"
const TAG_SUMMARY_INFLIGHT_STALE_MS = 55 * 1000

const METADATA_LABELS: Record<string, string> = {
  Brand: "Brand",
  Source: "Source",
  Origin: "Origin",
  Supplier: "Supplier",
  AvgPackSize: "Pack size",
  AvgPackWeight: "Pack weight",
  Serves: "Serves",
  PiecesPerPack: "Pieces",
  KosherForPassover: "Passover",
  GlutenFree: "Gluten-free",
  Organic: "Organic",
  GrassFed: "Grass-fed",
  FreeRange: "Free-range",
  BoneIn: "Bone-in",
  Boneless: "Boneless",
  Cooked: "Cooked",
  Uncooked: "Uncooked",
  HeatAndServe: "Heat and serve",
  Smoked: "Smoked",
  Marinated: "Marinated",
  VacuumPacked: "Vacuum packed",
  BulkPack: "Bulk pack",
  IQF: "IQF",
}

let tagSummaryCache: {
  timestamp: number
  tags: ProductMerchandisingTagSummary[]
} | null = null
let tagSummaryInflight: Promise<ProductMerchandisingTagSummary[]> | null = null
let tagSummaryInflightStartedAt = 0

const loadCachedProductMerchandisingTags = unstable_cache(
  async () => buildProductMerchandisingTags(),
  [TAG_SUMMARY_NEXT_CACHE_KEY],
  {
    revalidate: TAG_SUMMARY_NEXT_CACHE_SECONDS,
    tags: [TAG_SUMMARY_NEXT_CACHE_TAG],
  }
)

function reusableTagSummaryInflight() {
  if (!tagSummaryInflight) return null

  const ageMs = Date.now() - tagSummaryInflightStartedAt
  if (ageMs <= TAG_SUMMARY_INFLIGHT_STALE_MS) {
    return tagSummaryInflight
  }

  reportServerSoftFailure(
    "staff-merchandising-tags-stale-inflight",
    new Error("Discarding stale merchandising tag summary load."),
    {
      stale_inflight_age_ms: ageMs,
      stale_inflight_threshold_ms: TAG_SUMMARY_INFLIGHT_STALE_MS,
    }
  )
  tagSummaryInflight = null
  tagSummaryInflightStartedAt = 0
  return null
}

function strapiEndpoint() {
  const endpoint = process.env.STRAPI_ENDPOINT?.replace(/\/+$/, "")
  if (!endpoint) throw new Error("Missing STRAPI_ENDPOINT.")
  return endpoint
}

function strapiHeaders() {
  const token = process.env.STRAPI_API_TOKEN
  if (!token) throw new Error("Missing STRAPI_API_TOKEN.")

  return {
    Authorization: `Bearer ${token}`,
  }
}

function strapiRewriteHeaders() {
  const token =
    process.env.STRAPI_REWRITE_API_TOKEN || process.env.STRAPI_API_TOKEN
  if (!token) {
    throw new Error("Missing STRAPI_REWRITE_API_TOKEN.")
  }

  return {
    Authorization: `Bearer ${token}`,
  }
}

async function requireStaffCustomer() {
  const customer = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!customer || !canReviewMerchandising(customer)) {
    throw new Error("Merchandising reviewer access required.")
  }
  return customer
}

function text(value: unknown) {
  return String(value || "").trim()
}

function errorMessage(value: unknown, fallback = "Unknown error.") {
  if (value instanceof Error) return value.message
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    const record = value as AnyRecord
    return (
      text(record.message) ||
      text(record.error?.message) ||
      text(record.error) ||
      text(record.details?.message) ||
      fallback
    )
  }
  return fallback
}

function numericHash(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash || 1
}

function stripLevelPrefix(name: string) {
  return name.replace(/^L[123]:\s*/i, "").trim()
}

function encodeTagKey(name: string) {
  return encodeURIComponent(name)
}

function decodeTagKey(key: string) {
  let decodedUri = key
  try {
    decodedUri = decodeURIComponent(key)
  } catch {
    decodedUri = key
  }

  if (isL3Tag(decodedUri)) return decodedUri

  try {
    const nodeBuffer = (globalThis as AnyRecord).Buffer
    if (nodeBuffer?.from) {
      const legacyDecoded = nodeBuffer.from(key, "base64url").toString("utf8")
      if (isL3Tag(legacyDecoded)) return legacyDecoded
    }
  } catch {
    // Ignore legacy base64url decode failures; current ids use URI encoding.
  }

  return decodedUri
}

function isL2Tag(name: string) {
  return /^L2:\s*/i.test(name)
}

function isL3Tag(name: string) {
  return /^L3:\s*/i.test(name)
}

function imageUrl(image: RawImage) {
  const formats = image.formats || {}
  const thumbnail = formats.thumbnail?.url
  // Source a Strapi-generated derivative (large/medium ~750-1000px) for the
  // review grid: crisp at the ~600px display size yet far lighter than the full
  // original. All derivatives share the thumbnail's host (already allowed), and
  // fall back to the thumbnail/original so this is never worse than before.
  const display =
    text(formats.large?.url) ||
    text(formats.medium?.url) ||
    text(formats.small?.url) ||
    text(thumbnail) ||
    text(image.url)
  return {
    url: text(image.url),
    displayUrl: display,
    thumbnailUrl: text(thumbnail) || text(image.url),
  }
}

function merchandisingImage(
  image: RawImage | null | undefined,
  role: "featured" | "gallery"
): MerchandisingProductImage | null {
  if (!image?.url) return null

  const parsed = parseReviewCaption(image.caption)
  const urls = imageUrl(image)
  const documentId = text(image.documentId)
  const id = image.id || numericHash(documentId || urls.url)

  return {
    id,
    documentId,
    role,
    name: text(image.name) || `Image ${id}`,
    url: urls.url,
    displayUrl: urls.displayUrl,
    thumbnailUrl: urls.thumbnailUrl,
    alternativeText: image.alternativeText || null,
    caption: image.caption || null,
    review: parsed.review,
    claim: isClaimActive(parsed.claim) ? parsed.claim : undefined,
    auditHistory: parsed.auditHistory,
  }
}

function uniqueImages(product: AnyRecord): MerchandisingProductImage[] {
  const images: MerchandisingProductImage[] = []
  const seen = new Set<string>()
  const featured = merchandisingImage(product.FeaturedImage, "featured")

  if (featured) {
    images.push(featured)
    seen.add(featured.documentId || featured.url)
  }

  for (const item of product.GalleryImages || []) {
    const image = merchandisingImage(item, "gallery")
    const key = image?.documentId || image?.url
    if (!image || !key || seen.has(key)) continue
    images.push(image)
    seen.add(key)
  }

  return images
}

function variantSkus(product: AnyRecord) {
  return Array.from(
    new Set(
      (product.MedusaProduct?.Variants || [])
        .map((variant: AnyRecord) => text(variant.Sku))
        .filter(Boolean)
    )
  )
}

function productDescription(product: AnyRecord) {
  return (
    text(product.MedusaProduct?.Description) ||
    text(product.MedusaProduct?.ShortDescription) ||
    "No product description is available in Strapi."
  )
}

function metadataChips(metadata: AnyRecord | null | undefined) {
  if (!metadata || typeof metadata !== "object") return []

  return Object.entries(METADATA_LABELS)
    .map(([key, label]) => {
      const value = metadata[key]
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === false
      ) {
        return ""
      }
      if (value === true) return label
      return `${label}: ${value}`
    })
    .filter(Boolean)
    .slice(0, 8)
}

function productTags(product: AnyRecord): NormalizedProductTag[] {
  return (product.Categorization?.ProductTags || [])
    .map((tag: RawProductTag) => ({
      documentId: text(tag.documentId),
      name: text(tag.Name),
      description: text(tag.Description),
      seoDescription: text(tag.SEODescription),
    }))
    .filter((tag: NormalizedProductTag) => Boolean(tag.name))
}

function summarizeProduct(product: AnyRecord): ProductMerchandisingProduct {
  const tags = productTags(product)
  const skus = variantSkus(product)

  return {
    documentId: text(product.documentId),
    title:
      text(product.Title) ||
      text(product.MedusaProduct?.Title) ||
      "Untitled product",
    description: productDescription(product),
    handle: text(product.MedusaProduct?.Handle) || null,
    sku: skus.join(", ") || "No SKU",
    metadata: metadataChips(product.Metadata),
    l2Tags: tags.filter((tag) => isL2Tag(tag.name)).map((tag) => tag.name),
    l3Tags: tags.filter((tag) => isL3Tag(tag.name)).map((tag) => tag.name),
    images: uniqueImages(product),
  }
}

function addSummaryProduct(
  summary: ProductMerchandisingTagSummary,
  product: ProductMerchandisingProduct
) {
  const activeClaims = product.images
    .map((image) => image.claim)
    .filter((claim) => isClaimActive(claim)) as MerchandisingImageClaim[]

  summary.productCount += 1
  summary.imageCount += product.images.length
  summary.reviewedImageCount += product.images.filter(
    (image) => image.review.status !== "unreviewed"
  ).length
  summary.approvedImageCount += product.images.filter(
    (image) => image.review.status === "approved"
  ).length
  summary.rejectedImageCount += product.images.filter(
    (image) => image.review.status === "rejected"
  ).length
  summary.claimedImageCount += activeClaims.length
  for (const claim of activeClaims) {
    const claimTime = Date.parse(claim.claimedAt)
    if (!Number.isFinite(claimTime)) continue

    const existingTime = summary.oldestActiveClaimedAt
      ? Date.parse(summary.oldestActiveClaimedAt)
      : Number.POSITIVE_INFINITY
    if (!Number.isFinite(existingTime) || claimTime < existingTime) {
      summary.oldestActiveClaimedAt = claim.claimedAt
    }
  }
  if (product.images.length === 0) summary.noImageProductCount += 1

  summary.metadata = Array.from(
    new Set([...summary.metadata, ...product.metadata])
  ).slice(0, 10)
  summary.l2Parents = Array.from(
    new Set([...summary.l2Parents, ...product.l2Tags.map(stripLevelPrefix)])
  ).sort((a, b) => a.localeCompare(b))
}

function isRetryableStrapiStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function strapiErrorDetail(response: Response) {
  const body = await response.text().catch(() => "")
  if (!body) return ""

  try {
    const json = JSON.parse(body)
    return errorMessage(json?.error || json?.errors?.[0] || json, "")
  } catch {
    return body.replace(/\s+/g, " ").trim().slice(0, 300)
  }
}

async function strapiGet<T>(path: string): Promise<T> {
  let lastError: unknown

  for (
    let attempt = 0;
    attempt <= STRAPI_READ_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    let response: Response

    try {
      response = await fetch(`${strapiEndpoint()}${path}`, {
        headers: strapiHeaders(),
        cache: "no-store",
      })
    } catch (error) {
      lastError = error
      if (attempt >= STRAPI_READ_RETRY_DELAYS_MS.length) {
        throw error
      }
      await sleep(STRAPI_READ_RETRY_DELAYS_MS[attempt])
      continue
    }

    if (response.ok) {
      try {
        return await response.json()
      } catch (error) {
        lastError = error
        if (attempt >= STRAPI_READ_RETRY_DELAYS_MS.length) {
          throw error
        }
        await sleep(STRAPI_READ_RETRY_DELAYS_MS[attempt])
        continue
      }
    }

    const detail = await strapiErrorDetail(response)
    const error = new Error(
      `Strapi request failed: ${response.status}${detail ? ` ${detail}` : ""}`
    )
    lastError = error

    if (
      !isRetryableStrapiStatus(response.status) ||
      attempt >= STRAPI_READ_RETRY_DELAYS_MS.length
    ) {
      throw error
    }

    await sleep(STRAPI_READ_RETRY_DELAYS_MS[attempt])
  }

  throw lastError
}

async function strapiGraphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const response = await fetch(`${strapiEndpoint()}/graphql`, {
    method: "POST",
    headers: {
      ...strapiHeaders(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify({ query, variables }),
  })

  const json = await response.json().catch(() => null)

  if (!response.ok || json?.errors) {
    const message = errorMessage(json?.errors?.[0], String(response.status))
    throw new Error(`Strapi GraphQL request failed: ${message}`)
  }

  return json.data as T
}

async function fetchStrapiUploadFile(imageId: number): Promise<RawImage> {
  return hydrateUploadFileWithMediaReview(
    await strapiGet<RawImage>(`/api/upload/files/${imageId}`)
  )
}

function rawMediaReviewUploadId(review: RawMediaReview) {
  return Number(review.uploadFileId || review.UploadFileId || 0)
}

function rawMediaReviewCaption(review: RawMediaReview) {
  return text(review.caption) || text(review.ReviewPayload) || null
}

async function mediaReviewCaptionsByImageId(
  imageIds: number[]
): Promise<Map<number, string>> {
  const ids = Array.from(
    new Set(imageIds.filter((id) => Number.isInteger(id) && id > 0))
  )
  const captions = new Map<number, string>()

  if (!ids.length) return captions
  if (String(process.env.NODE_ENV) === "test") return captions

  for (let start = 0; start < ids.length; start += 200) {
    const chunk = ids.slice(start, start + 200)
    try {
      const response = await strapiGet<{ data?: RawMediaReview[] }>(
        `/api/gp-upload-files/reviews?ids=${chunk.join(",")}`
      )

      for (const review of response.data || []) {
        const uploadId = rawMediaReviewUploadId(review)
        const caption = rawMediaReviewCaption(review)
        if (uploadId && caption) captions.set(uploadId, caption)
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        reportServerSoftFailure("staff-merchandising-media-review-read", error, {
          imageCount: chunk.length,
        })
      }
    }
  }

  return captions
}

async function hydrateUploadFileWithMediaReview(
  upload: RawImage
): Promise<RawImage> {
  const imageId = Number(upload.id || 0)
  if (!imageId) return upload

  const captions = await mediaReviewCaptionsByImageId([imageId])
  const caption = captions.get(imageId)
  if (!caption) return upload

  return {
    ...upload,
    caption,
  }
}

function storedCaptionSummary(caption: string | null | undefined) {
  const parsed = parseReviewCaption(caption)
  if (parsed.review.status !== "unreviewed") return reviewSummary(parsed.review)
  if (caption) return "a caption with no review metadata"
  return "no review metadata"
}

async function requireSuccessfulStrapiWrite(response: Response) {
  let json: any = null
  let body = ""

  if (typeof response.text === "function") {
    body = await response.text().catch(() => "")
  }

  if (body) {
    try {
      json = JSON.parse(body)
    } catch {
      json = null
    }
  } else if (typeof response.json === "function") {
    json = await response.json().catch(() => null)
  }

  if (!response.ok || json?.errors || json?.error) {
    const bodyMessage = body.replace(/\s+/g, " ").trim().slice(0, 300)
    const message = errorMessage(
      json?.error || json?.errors?.[0] || bodyMessage,
      String(response.status || "write failed")
    )
    throw new Error(message)
  }
}

function strapiUploadCaptionWriteAttempts(
  imageId: number,
  caption: string,
  expectedCaption: string | null,
  requireCompareAndSwap = false
) {
  const endpoint = strapiEndpoint()
  const rewriteHeaders = strapiRewriteHeaders()
  const fileInfoBody = JSON.stringify({
    fileInfo: {
      caption,
    },
  })

  const attempts = [
    {
      name: "gp upload caption JSON",
      run: () =>
        fetch(`${endpoint}/api/gp-upload-files/${imageId}/caption`, {
          method: "POST",
          headers: {
            ...rewriteHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            caption,
            expectedCaption,
          }),
        }),
    },
    {
      name: "legacy upload fileInfo JSON",
      run: () =>
        fetch(`${endpoint}/api/upload?id=${imageId}`, {
          method: "POST",
          headers: {
            ...rewriteHeaders,
            "Content-Type": "application/json",
          },
          body: fileInfoBody,
        }),
    },
    {
      name: "upload file caption JSON",
      run: () =>
        fetch(`${endpoint}/api/upload/files/${imageId}`, {
          method: "PUT",
          headers: {
            ...rewriteHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ caption }),
        }),
    },
    {
      name: "upload fileInfo JSON",
      run: () =>
        fetch(`${endpoint}/api/upload/files/${imageId}`, {
          method: "PUT",
          headers: {
            ...rewriteHeaders,
            "Content-Type": "application/json",
          },
          body: fileInfoBody,
        }),
    },
    {
      name: "legacy upload fileInfo form",
      run: () => {
        const formData = new FormData()
        formData.append("fileInfo", JSON.stringify({ caption }))

        return fetch(`${endpoint}/api/upload?id=${imageId}`, {
          method: "POST",
          headers: rewriteHeaders,
          body: formData,
        })
      },
    },
  ]

  return requireCompareAndSwap ? attempts.slice(0, 1) : attempts
}

async function writeStrapiUploadCaption(
  imageId: number,
  caption: string,
  expectedCaption: string | null,
  options: {
    requireCompareAndSwap?: boolean
  } = {}
) {
  const failures: string[] = []

  for (const attempt of strapiUploadCaptionWriteAttempts(
    imageId,
    caption,
    expectedCaption,
    options.requireCompareAndSwap
  )) {
    try {
      const response = await attempt.run()
      await requireSuccessfulStrapiWrite(response)
      const latest = await fetchStrapiUploadFile(imageId)

      if ((latest.caption || null) === caption) {
        return
      }

      failures.push(
        `${attempt.name}: accepted but media readback still showed ${storedCaptionSummary(
          latest.caption
        )}`
      )
    } catch (error) {
      failures.push(
        `${attempt.name}: ${errorMessage(error, "unknown write failure")}`
      )
    }
  }

  throw new Error(`Strapi image review write failed: ${failures.join("; ")}`)
}

function staffIdentity(
  staff: Awaited<ReturnType<typeof requireStaffCustomer>>
) {
  return {
    staffEmail: staff.email || undefined,
    staffName: staffDisplayName(staff),
  }
}

function claimConflictMessage(claim: MerchandisingImageClaim) {
  const owner = claim.staffName || claim.staffEmail || "another staff member"
  const expires = claim.expiresAt
    ? ` until ${new Date(claim.expiresAt).toLocaleString()}`
    : ""
  return `${owner} has claimed this image${expires}.`
}

function actionResultFromCaption(
  caption: string | null | undefined
): Pick<
  MerchandisingImageActionResult,
  "review" | "claim" | "auditHistory" | "caption"
> {
  const parsed = parseReviewCaption(caption)
  return {
    review: parsed.review,
    claim: isClaimActive(parsed.claim) ? parsed.claim : undefined,
    auditHistory: parsed.auditHistory,
    caption: caption || null,
  }
}

const MERCHANDISING_DETAIL_PRODUCTS_QUERY = /* GraphQL */ `
  query MerchandisingDetailProducts(
    $tagName: String!
    $limit: Int
    $start: Int
  ) {
    products(
      filters: {
        Categorization: { ProductTags: { Name: { contains: $tagName } } }
      }
      pagination: { limit: $limit, start: $start }
    ) {
      documentId
      Title
      FeaturedImage {
        documentId
        name
        url
        formats
        alternativeText
        caption
      }
      GalleryImages {
        documentId
        name
        url
        formats
        alternativeText
        caption
      }
      Metadata {
        Brand
        Source
        Origin
        Supplier
        AvgPackSize
        AvgPackWeight
        Serves
        PiecesPerPack
        KosherForPassover
        GlutenFree
        Organic
        GrassFed
        FreeRange
        BoneIn
        Boneless
        Cooked
        Uncooked
        HeatAndServe
        Smoked
        Marinated
        VacuumPacked
        BulkPack
        IQF
      }
      Categorization {
        ProductTags {
          documentId
          Name
          Description
          SEODescription
        }
      }
      MedusaProduct {
        Title
        Handle
        Description
        ShortDescription
        Variants {
          Sku
        }
      }
    }
  }
`

async function fetchGraphqlProducts(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<AnyRecord[]> {
  const products: AnyRecord[] = []
  let start = 0

  while (true) {
    const pageStarts = Array.from(
      { length: GRAPHQL_PAGE_BATCH_SIZE },
      (_, index) => start + index * GRAPHQL_PAGE_SIZE
    )
    const pages = await Promise.all(
      pageStarts.map(async (pageStart) => {
        const data = await strapiGraphql<{ products?: AnyRecord[] }>(query, {
          ...variables,
          limit: GRAPHQL_PAGE_SIZE,
          start: pageStart,
        })
        return data.products || []
      })
    )

    for (const page of pages) {
      products.push(...page)
    }

    if (pages.some((page) => page.length < GRAPHQL_PAGE_SIZE)) break
    start += GRAPHQL_PAGE_BATCH_SIZE * GRAPHQL_PAGE_SIZE
  }

  return products
}

type RestProductLoadMode = "overview" | "detail"
type RestProductsPage = {
  data?: AnyRecord[]
  meta?: { pagination?: { pageCount?: number } }
}

function addOverviewProductFields(params: URLSearchParams) {
  params.set("fields[0]", "documentId")
  params.set("populate[FeaturedImage][fields][0]", "documentId")
  params.set("populate[FeaturedImage][fields][1]", "url")
  params.set("populate[FeaturedImage][fields][2]", "caption")
  params.set("populate[GalleryImages][fields][0]", "documentId")
  params.set("populate[GalleryImages][fields][1]", "url")
  params.set("populate[GalleryImages][fields][2]", "caption")
  params.set(
    "populate[Categorization][populate][ProductTags][fields][0]",
    "Name"
  )
  params.set(
    "populate[Categorization][populate][ProductTags][fields][1]",
    "Description"
  )
  params.set(
    "populate[Categorization][populate][ProductTags][fields][2]",
    "SEODescription"
  )
}

function addDetailProductFields(params: URLSearchParams) {
  params.set("populate[FeaturedImage]", "true")
  params.set("populate[GalleryImages]", "true")
  params.set("populate[Metadata]", "true")
  params.set("populate[Categorization][populate][ProductTags]", "true")
  params.set("populate[MedusaProduct][populate][Variants]", "true")
}

async function fetchRestProducts(
  tagName?: string,
  mode: RestProductLoadMode = "detail"
): Promise<AnyRecord[]> {
  function pagePath(page: number) {
    const params = new URLSearchParams()
    params.set("pagination[page]", String(page))
    params.set("pagination[pageSize]", String(GRAPHQL_PAGE_SIZE))
    if (mode === "overview") {
      addOverviewProductFields(params)
    } else {
      addDetailProductFields(params)
    }

    if (tagName) {
      params.set(
        "filters[Categorization][ProductTags][Name][$contains]",
        tagName
      )
    }

    return `/api/products?${params.toString()}`
  }

  const first = await strapiGet<RestProductsPage>(pagePath(1))
  const products: AnyRecord[] = [...(first.data || [])]
  const pageCount = first.meta?.pagination?.pageCount || 1

  for (let page = 2; page <= pageCount; page += REST_PAGE_BATCH_SIZE) {
    const batchPages = Array.from(
      { length: Math.min(REST_PAGE_BATCH_SIZE, pageCount - page + 1) },
      (_, index) => page + index
    )
    const pages = await Promise.all(
      batchPages.map((batchPage) =>
        strapiGet<RestProductsPage>(pagePath(batchPage))
      )
    )

    for (const json of pages) {
      products.push(...(json.data || []))
    }
  }

  return products
}

async function fetchOverviewProducts(): Promise<AnyRecord[]> {
  return fetchRestProducts(undefined, "overview")
}

async function fetchDetailProducts(tagName: string): Promise<AnyRecord[]> {
  try {
    return await fetchGraphqlProducts(MERCHANDISING_DETAIL_PRODUCTS_QUERY, {
      tagName,
    })
  } catch (error) {
    reportServerSoftFailure("staff-merchandising-detail-graphql", error, {
      fallback: "rest",
      tagName,
    })
    return fetchRestProducts(tagName)
  }
}

async function uploadFilesByDocumentId(
  documentIds: string[]
): Promise<Map<string, RawImage>> {
  const uniqueIds = Array.from(new Set(documentIds.filter(Boolean)))
  const files = new Map<string, RawImage>()

  for (let start = 0; start < uniqueIds.length; start += 50) {
    const chunk = uniqueIds.slice(start, start + 50)
    const params = new URLSearchParams()
    chunk.forEach((documentId, index) => {
      params.set(`filters[documentId][$in][${index}]`, documentId)
    })

    const uploadResponse = await strapiGet<RawImage[] | { data?: RawImage[] }>(
      `/api/upload/files?${params.toString()}`
    )
    const uploads = Array.isArray(uploadResponse)
      ? uploadResponse
      : uploadResponse.data || []

    for (const upload of uploads) {
      const documentId = text(upload.documentId)
      if (documentId) files.set(documentId, upload)
    }
  }

  return files
}

async function uploadFileByDocumentId(
  documentId?: string
): Promise<RawImage | null> {
  if (!documentId) return null
  const uploads = await uploadFilesByDocumentId([documentId])
  const upload = uploads.get(documentId)
  return upload ? hydrateUploadFileWithMediaReview(upload) : null
}

async function hydrateProductImagesWithUploadFiles(
  products: ProductMerchandisingProduct[]
): Promise<ProductMerchandisingProduct[]> {
  const documentIds = products.flatMap((product) =>
    product.images.map((image) => image.documentId).filter(Boolean)
  )
  if (!documentIds.length) return products

  const uploads = await uploadFilesByDocumentId(documentIds)
  const reviewCaptions = await mediaReviewCaptionsByImageId(
    Array.from(uploads.values())
      .map((upload) => Number(upload.id || 0))
      .filter((id) => id > 0)
  )

  return products.map((product) => ({
    ...product,
    images: product.images.map((image) => {
      const upload = uploads.get(image.documentId)
      if (!upload) return image
      const caption =
        reviewCaptions.get(Number(upload.id || 0)) || upload.caption || null
      const parsed = parseReviewCaption(caption)
      const urls = imageUrl(upload)

      return {
        ...image,
        id: upload.id || image.id,
        name: text(upload.name) || image.name,
        url: urls.url || image.url,
        displayUrl: urls.displayUrl || image.displayUrl,
        thumbnailUrl: urls.thumbnailUrl || image.thumbnailUrl,
        alternativeText: upload.alternativeText || image.alternativeText,
        caption,
        review: parsed.review,
        claim: isClaimActive(parsed.claim) ? parsed.claim : undefined,
        auditHistory: parsed.auditHistory,
      }
    }),
  }))
}

export async function getProductMerchandisingTags(): Promise<
  ProductMerchandisingTagSummary[]
> {
  const staff = await requireStaffCustomer()

  return getProductMerchandisingTagsForStaff(staff)
}

export async function getProductMerchandisingTagsForStaff(
  staff: HttpTypes.StoreCustomer
): Promise<ProductMerchandisingTagSummary[]> {
  if (!canReviewMerchandising(staff)) {
    throw new Error("Merchandising reviewer access required.")
  }

  if (
    tagSummaryCache &&
    Date.now() - tagSummaryCache.timestamp < TAG_SUMMARY_CACHE_MS
  ) {
    return tagSummaryCache.tags
  }
  const inflight = reusableTagSummaryInflight()
  if (inflight) return inflight

  tagSummaryInflight = loadCachedProductMerchandisingTags()
  tagSummaryInflightStartedAt = Date.now()
  const currentInflight = tagSummaryInflight

  try {
    const tags = await currentInflight
    tagSummaryCache = {
      timestamp: Date.now(),
      tags,
    }
    return tags
  } catch (error) {
    if (tagSummaryCache) {
      reportServerSoftFailure("staff-merchandising-tags-stale-cache", error, {
        fallback: "module-cache",
        cachedAgeMs: Date.now() - tagSummaryCache.timestamp,
      })
      return tagSummaryCache.tags
    }
    throw error
  } finally {
    if (tagSummaryInflight === currentInflight) {
      tagSummaryInflight = null
      tagSummaryInflightStartedAt = 0
    }
  }
}

async function buildProductMerchandisingTags(): Promise<
  ProductMerchandisingTagSummary[]
> {
  const summaries = new Map<string, ProductMerchandisingTagSummary>()
  const rawProducts = await fetchOverviewProducts()
  const summarizedProducts =
    String(process.env.NODE_ENV) === "test"
      ? rawProducts.map(summarizeProduct)
      : await hydrateProductImagesWithUploadFiles(
          rawProducts.map(summarizeProduct)
        )
  const products = summarizedProducts.map((product, index) => ({
    product,
    tags: productTags(rawProducts[index]),
  }))

  for (const { product, tags } of products) {
    for (const tagName of product.l3Tags) {
      const displayName = stripLevelPrefix(tagName)
      const tag = tags.find((candidate) => candidate.name === tagName)
      const key = tagName

      if (!summaries.has(key)) {
        summaries.set(key, {
          documentId: encodeTagKey(key),
          name: tagName,
          displayName,
          description: tag?.description,
          seoDescription: tag?.seoDescription,
          productCount: 0,
          imageCount: 0,
          reviewedImageCount: 0,
          approvedImageCount: 0,
          rejectedImageCount: 0,
          claimedImageCount: 0,
          noImageProductCount: 0,
          metadata: [],
          l2Parents: [],
        })
      }

      addSummaryProduct(summaries.get(key)!, product)
    }
  }

  return Array.from(summaries.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  )
}

export async function getProductMerchandisingDetail(
  tagId: string
): Promise<ProductMerchandisingDetail | null> {
  await requireStaffCustomer()

  const tagName = decodeTagKey(tagId)
  const products = (
    await hydrateProductImagesWithUploadFiles(
      (await fetchDetailProducts(tagName)).map(summarizeProduct)
    )
  )
    .filter((product) => product.l3Tags.includes(tagName))
    .sort((a, b) => a.title.localeCompare(b.title))

  if (!products.length) return null

  const summary: ProductMerchandisingTagSummary = {
    documentId: tagId,
    name: tagName,
    displayName: stripLevelPrefix(tagName),
    productCount: 0,
    imageCount: 0,
    reviewedImageCount: 0,
    approvedImageCount: 0,
    rejectedImageCount: 0,
    claimedImageCount: 0,
    noImageProductCount: 0,
    metadata: [],
    l2Parents: [],
  }

  for (const product of products) {
    addSummaryProduct(summary, product)
  }

  return {
    ...summary,
    products,
  }
}

async function latestUploadForImage(input: {
  imageId: number
  imageDocumentId?: string
}) {
  const upload = await uploadFileByDocumentId(input.imageDocumentId)
  return upload || fetchStrapiUploadFile(input.imageId)
}

export async function reviewMerchandisingImage(
  input: ReviewMerchandisingImageInput
): Promise<MerchandisingImageActionResult> {
  try {
    const staff = await requireStaffCustomer()
    const latest = await latestUploadForImage(input)
    const imageId = latest.id || input.imageId

    if (!imageId || imageId < 1) {
      throw new Error("Choose an image to review.")
    }
    if (input.status === "rejected" && !input.reason) {
      throw new Error("Choose a rejection reason.")
    }

    const latestCaption = latest.caption || null
    const parsed = parseReviewCaption(latestCaption)
    const activeClaim = isClaimActive(parsed.claim) ? parsed.claim : undefined
    const existingReview = parsed.review
    const hasExistingReview = existingReview.status !== "unreviewed"
    const identity = staffIdentity(staff)

    if (activeClaim && !isClaimOwnedBy(activeClaim, staff.email)) {
      void emitStaffMerchandisingReviewTelemetry({
        event: "conflict",
        imageId,
        imageDocumentId: input.imageDocumentId || latest.documentId,
        countryCode: input.countryCode,
        status: input.status,
        previousStatus: existingReview.status,
        conflictReason: "claim_owned_by_other",
        overwriteExistingReview: input.overwriteExistingReview,
      })

      return {
        ok: false,
        conflict: true,
        latestClaim: activeClaim,
        ...actionResultFromCaption(latestCaption),
        error: claimConflictMessage(activeClaim),
      }
    }

    if (hasExistingReview && !input.overwriteExistingReview) {
      void emitStaffMerchandisingReviewTelemetry({
        event: "conflict",
        imageId,
        imageDocumentId: input.imageDocumentId || latest.documentId,
        countryCode: input.countryCode,
        status: input.status,
        previousStatus: existingReview.status,
        conflictReason: "existing_review",
        overwriteExistingReview: input.overwriteExistingReview,
      })

      return {
        ok: false,
        conflict: true,
        canOverwrite: true,
        latestReview: existingReview,
        ...actionResultFromCaption(latestCaption),
        error: reviewSummary(existingReview),
      }
    }

    if (latestCaption !== (input.currentCaption || null)) {
      void emitStaffMerchandisingReviewTelemetry({
        event: "conflict",
        imageId,
        imageDocumentId: input.imageDocumentId || latest.documentId,
        countryCode: input.countryCode,
        status: input.status,
        previousStatus: existingReview.status,
        conflictReason: hasExistingReview
          ? "caption_changed_with_review"
          : "caption_changed",
        overwriteExistingReview: input.overwriteExistingReview,
      })

      return {
        ok: false,
        conflict: true,
        canOverwrite: hasExistingReview,
        latestReview: existingReview,
        latestClaim: activeClaim,
        ...actionResultFromCaption(latestCaption),
        error: hasExistingReview
          ? reviewSummary(existingReview)
          : "This image changed since you loaded the page. Refresh or try again.",
      }
    }

    const reviewedAt = new Date().toISOString()
    const review: MerchandisingImageReview = {
      status: input.status,
      reason: input.status === "rejected" ? input.reason : undefined,
      note: text(input.note) || undefined,
      reviewerEmail: identity.staffEmail,
      reviewerName: identity.staffName,
      reviewedAt,
    }

    const auditEntry: MerchandisingReviewAuditEntry = {
      action: hasExistingReview ? "overwritten_review" : "reviewed",
      at: reviewedAt,
      ...identity,
      previousReview: hasExistingReview ? existingReview : undefined,
      previousClaim: activeClaim,
      review,
    }
    const caption = serializeReviewCaption(latestCaption, {
      review,
      claim: null,
      auditEntry,
    })

    await writeStrapiUploadCaption(imageId, caption, latestCaption, {
      // A deliberate review change is safe only through the Strapi endpoint
      // that compares the caption the reviewer confirmed with the latest
      // stored value. Legacy upload routes cannot provide that guarantee.
      requireCompareAndSwap: Boolean(input.overwriteExistingReview),
    })

    revalidatePath(`/${input.countryCode}/account/staff/merchandising`)
    void emitStaffMerchandisingReviewTelemetry({
      event: "saved",
      imageId,
      imageDocumentId: input.imageDocumentId || latest.documentId,
      countryCode: input.countryCode,
      status: input.status,
      previousStatus: existingReview.status,
      overwriteExistingReview: input.overwriteExistingReview,
    })

    return {
      ok: true,
      ...actionResultFromCaption(caption),
    }
  } catch (error) {
    console.error("[product-merchandising] review failed", error)
    await emitStaffMerchandisingActionFailureAlert({
      action: "review",
      imageId: input.imageId,
      imageDocumentId: input.imageDocumentId,
      countryCode: input.countryCode,
      status: input.status,
      error,
    })
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not save the image review.",
    }
  }
}

export async function claimMerchandisingImage(
  input: ClaimMerchandisingImageInput
): Promise<MerchandisingImageActionResult> {
  try {
    const staff = await requireStaffCustomer()
    const latest = await latestUploadForImage(input)
    const imageId = latest.id || input.imageId

    if (!imageId || imageId < 1) {
      throw new Error("Choose an image to claim.")
    }

    const latestCaption = latest.caption || null
    const parsed = parseReviewCaption(latestCaption)
    const existingReview = parsed.review
    const activeClaim = isClaimActive(parsed.claim) ? parsed.claim : undefined
    const identity = staffIdentity(staff)

    if (existingReview.status !== "unreviewed") {
      return {
        ok: false,
        conflict: true,
        latestReview: existingReview,
        ...actionResultFromCaption(latestCaption),
        error: reviewSummary(existingReview),
      }
    }

    if (activeClaim && !isClaimOwnedBy(activeClaim, staff.email)) {
      return {
        ok: false,
        conflict: true,
        latestClaim: activeClaim,
        ...actionResultFromCaption(latestCaption),
        error: claimConflictMessage(activeClaim),
      }
    }

    if (latestCaption !== (input.currentCaption || null) && !activeClaim) {
      return {
        ok: false,
        conflict: true,
        ...actionResultFromCaption(latestCaption),
        error:
          "This image changed since you loaded the page. Refresh or try again.",
      }
    }

    const claim = buildMerchandisingClaim({
      ...identity,
      tagId: input.tagId,
      tagName: input.tagName,
    })
    const auditEntry: MerchandisingReviewAuditEntry = {
      action: "claimed",
      at: claim.claimedAt,
      ...identity,
      tagId: input.tagId,
      tagName: input.tagName,
      previousClaim: activeClaim,
      claim,
    }
    const caption = serializeReviewCaption(latestCaption, {
      claim,
      auditEntry,
    })

    await writeStrapiUploadCaption(imageId, caption, latestCaption)

    revalidatePath(`/${input.countryCode}/account/staff/merchandising`)
    return {
      ok: true,
      ...actionResultFromCaption(caption),
    }
  } catch (error) {
    console.error("[product-merchandising] claim failed", error)
    await emitStaffMerchandisingActionFailureAlert({
      action: "claim",
      imageId: input.imageId,
      imageDocumentId: input.imageDocumentId,
      countryCode: input.countryCode,
      tagId: input.tagId,
      tagName: input.tagName,
      error,
    })
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Could not claim the image.",
    }
  }
}

export async function releaseMerchandisingImageClaim(
  input: ClaimMerchandisingImageInput
): Promise<MerchandisingImageActionResult> {
  try {
    const staff = await requireStaffCustomer()
    const latest = await latestUploadForImage(input)
    const imageId = latest.id || input.imageId

    if (!imageId || imageId < 1) {
      throw new Error("Choose an image to release.")
    }

    const latestCaption = latest.caption || null
    const parsed = parseReviewCaption(latestCaption)
    const activeClaim = isClaimActive(parsed.claim) ? parsed.claim : undefined
    const identity = staffIdentity(staff)

    if (!activeClaim) {
      return {
        ok: true,
        ...actionResultFromCaption(latestCaption),
      }
    }

    if (!isClaimOwnedBy(activeClaim, staff.email)) {
      return {
        ok: false,
        conflict: true,
        latestClaim: activeClaim,
        ...actionResultFromCaption(latestCaption),
        error: claimConflictMessage(activeClaim),
      }
    }

    const auditEntry: MerchandisingReviewAuditEntry = {
      action: "released_claim",
      at: new Date().toISOString(),
      ...identity,
      tagId: input.tagId,
      tagName: input.tagName,
      previousClaim: activeClaim,
    }
    const caption = serializeReviewCaption(latestCaption, {
      claim: null,
      auditEntry,
    })

    await writeStrapiUploadCaption(imageId, caption, latestCaption)

    revalidatePath(`/${input.countryCode}/account/staff/merchandising`)
    return {
      ok: true,
      ...actionResultFromCaption(caption),
    }
  } catch (error) {
    console.error("[product-merchandising] claim release failed", error)
    await emitStaffMerchandisingActionFailureAlert({
      action: "release_claim",
      imageId: input.imageId,
      imageDocumentId: input.imageDocumentId,
      countryCode: input.countryCode,
      tagId: input.tagId,
      tagName: input.tagName,
      error,
    })
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not release the image claim.",
    }
  }
}
