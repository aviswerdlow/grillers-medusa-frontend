"use server"

import { sendTemplatedEmail } from "@lib/postmark"
import { isWaitlistEligible } from "@lib/util/waitlist-eligibility"
import { isInternalMedusaProduct } from "@lib/util/internal-products"
import { trackCommunicationEvent } from "./communications-events"
import type { HttpTypes } from "@medusajs/types"

/**
 * Restock trigger for #102. Polls inventory state, finds products that
 * have active back-in-stock-requests AND positive inventory, fires
 * Postmark `back-in-stock-restocked` to each pending subscriber, then
 * marks the Strapi request as notified.
 *
 * Why a cron, not a Medusa subscriber? Medusa V2 inventory events
 * (`inventory-level.updated` et al.) exist, but the installed inventory
 * module stores **current** state — not a historical snapshot — so a
 * 0→positive transition isn't directly observable from the event
 * payload. A cron pattern is also simpler to operate (no DI, no
 * subscriber registration), matches the existing
 * `/api/cron/review-acquisition` pattern, and is debouncable trivially.
 *
 * Anti-spam guards:
 *   - One email per subscriber per restock cycle (NotifiedAt is set
 *     atomically; we never re-fetch already-notified rows).
 *   - 7-day cooldown: if a product was notified within the last 7 days
 *     and is back in stock again, we DO NOT re-notify subscribers who
 *     signed up after that cycle (they wait for the next cycle). We
 *     enforce this by checking the most-recent NotifiedAt on the same
 *     ProductId across the catalog.
 *   - Bounded query batches (`pageSize=500` per product).
 *
 * Env required:
 *   - STRAPI_ENDPOINT, STRAPI_API_TOKEN
 *   - POSTMARK_SERVER_TOKEN (+ POSTMARK_DEFAULT_FROM)
 *   - MEDUSA_BACKEND_URL, MEDUSA_READ_ONLY_API_TOKEN
 *   - NEXT_PUBLIC_SITE_URL (for the restock URL in the email body)
 */

const STRAPI = (process.env.STRAPI_ENDPOINT || "").replace(/\/+$/, "")
const STRAPI_TOKEN = process.env.STRAPI_API_TOKEN || ""
const MEDUSA = (process.env.MEDUSA_BACKEND_URL || "").replace(/\/+$/, "")
const MEDUSA_ADMIN_TOKEN = process.env.MEDUSA_READ_ONLY_API_TOKEN || ""
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://grillers-medusa-frontend.vercel.app"
).replace(/\/+$/, "")

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000

type StrapiBackInStockRequest = {
  documentId: string
  Email: string
  MedusaProductId: string
  MedusaVariantId?: string | null
  ProductHandle: string
  ProductTitle: string
  Sku?: string | null
  QuickBooksListId?: string | null
  RequestedFulfillmentDate?: string | null
  WaitlistReason?: string | null
  UnsubscribeToken: string
  NotifiedAt: string | null
  UnsubscribedAt: string | null
}

type MedusaProductInventory = {
  productId: string
  inStock: boolean
  waitlistEnabled: boolean
  status: string
  variants: Map<
    string,
    {
      inStock: boolean
      waitlistEnabled: boolean
      sku?: string
    }
  >
}

type MedusaInventoryLookupResult = {
  inventory: Map<string, MedusaProductInventory>
  failures: string[]
}

export type TriggerSummary = {
  ok: boolean
  productsConsidered: number
  productsBackInStock: number
  subscribersNotified: number
  subscribersFailed: number
  errors: string[]
}

async function strapiGet(path: string): Promise<any> {
  const res = await fetch(`${STRAPI}${path}`, {
    headers: { Authorization: `Bearer ${STRAPI_TOKEN}` },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`Strapi GET ${path} ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

async function strapiPut(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${STRAPI}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${STRAPI_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Strapi PUT ${path} ${res.status}: ${await res.text()}`)
  }
}

function redactedFailureText(value: unknown): string {
  const raw =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : String(value || "")

  return raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300)
}

async function fetchPendingRequests(): Promise<StrapiBackInStockRequest[]> {
  if (!STRAPI || !STRAPI_TOKEN) {
    console.warn("[back-in-stock-trigger] Strapi env missing; skip")
    return []
  }
  const all: StrapiBackInStockRequest[] = []
  let page = 1
  // Paginate: pending = NotifiedAt null AND UnsubscribedAt null
  while (true) {
    const qs = new URLSearchParams({
      "filters[NotifiedAt][$null]": "true",
      "filters[UnsubscribedAt][$null]": "true",
      "pagination[page]": String(page),
      "pagination[pageSize]": "100",
      sort: "createdAt:asc",
    })
    const body = await strapiGet(`/api/back-in-stock-requests?${qs.toString()}`)
    const data = (body.data || []) as Array<
      {
        attributes?: StrapiBackInStockRequest
      } & StrapiBackInStockRequest
    >
    // Strapi 5 returns flattened, Strapi 4 nested under .attributes
    for (const row of data) {
      const attrs = (row.attributes ?? row) as StrapiBackInStockRequest
      all.push({
        ...attrs,
        documentId: (row as any).documentId ?? attrs.documentId,
      })
    }
    const pc = body.meta?.pagination?.pageCount ?? 1
    if (page >= pc) break
    page += 1
  }
  return all
}

async function fetchMedusaProductInventory(
  productIds: string[]
): Promise<MedusaInventoryLookupResult> {
  const out = new Map<string, MedusaProductInventory>()
  const failures: string[] = []
  if (!MEDUSA || productIds.length === 0) return { inventory: out, failures }

  // Medusa admin lookup. Falls back to publishable-key store API if the
  // admin token is missing — that path can't see draft/archived products
  // but suffices to read `variants.inventory_quantity` for published ones.
  const headers: Record<string, string> = MEDUSA_ADMIN_TOKEN
    ? {
        Authorization: `Basic ${Buffer.from(`${MEDUSA_ADMIN_TOKEN}:`).toString(
          "base64"
        )}`,
      }
    : {
        "x-publishable-api-key":
          process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || "",
      }

  const root = MEDUSA_ADMIN_TOKEN ? "/admin/products" : "/store/products"
  const fields =
    "id,status,+metadata,variants.id,variants.sku,variants.inventory_quantity,variants.allow_backorder,variants.manage_inventory,+variants.metadata"
  // Batch into chunks of 50 to keep URLs short.
  for (let i = 0; i < productIds.length; i += 50) {
    const batch = productIds.slice(i, i + 50)
    const qs = new URLSearchParams({
      "id[]": "", // placeholder; replaced below
      fields,
      limit: "50",
    })
    qs.delete("id[]")
    batch.forEach((id) => qs.append("id[]", id))
    let data: any
    try {
      const res = await fetch(`${MEDUSA}${root}?${qs.toString()}`, {
        headers,
        cache: "no-store",
      })
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText)
        const message = redactedFailureText(
          `Medusa ${root} inventory batch failed (${res.status}): ${body}`
        )
        console.error(`[back-in-stock-trigger] ${message}`)
        failures.push(message)
        continue
      }
      data = await res.json()
    } catch (err) {
      const message = `Medusa ${root} inventory batch threw: ${
        err instanceof Error ? err.message : String(err)
      }`
      const safeMessage = redactedFailureText(message)
      console.error(`[back-in-stock-trigger] ${safeMessage}`)
      failures.push(safeMessage)
      continue
    }
    const products = (data.products || []) as Array<{
      id: string
      status?: string
      metadata?: Record<string, unknown> | null
      variants?: Array<{
        id?: string
        sku?: string | null
        inventory_quantity?: number | null
        allow_backorder?: boolean
        manage_inventory?: boolean
        metadata?: Record<string, unknown> | null
      }>
    }>
    for (const p of products) {
      // Admin reads also include internal items; old subscriptions must never
      // turn those records into customer emails when stock changes.
      if (isInternalMedusaProduct(p as HttpTypes.StoreProduct)) continue
      const variants = p.variants || []
      const variantInventory = new Map<
        string,
        { inStock: boolean; waitlistEnabled: boolean; sku?: string }
      >()
      // Product is "in stock" if any of its variants has either
      // unmanaged inventory, backorder enabled, or inventory_quantity > 0.
      const inStock = variants.some((v) => {
        if (v.allow_backorder) return true
        if (v.manage_inventory === false) return true
        const q = v.inventory_quantity
        return typeof q === "number" && q > 0
      })
      variants.forEach((v) => {
        if (!v.id) return
        const variantInStock =
          Boolean(v.allow_backorder) ||
          v.manage_inventory === false ||
          (typeof v.inventory_quantity === "number" &&
            v.inventory_quantity > 0)
        variantInventory.set(v.id, {
          inStock: variantInStock,
          waitlistEnabled: isWaitlistEligible({
            productMetadata: p.metadata,
            variantMetadata: v.metadata,
          }),
          sku: v.sku || undefined,
        })
      })
      const waitlistEnabled =
        variants.length > 0
          ? variants.some((v) =>
              isWaitlistEligible({
                productMetadata: p.metadata,
                variantMetadata: v.metadata,
              })
            )
          : isWaitlistEligible({ productMetadata: p.metadata })

      out.set(p.id, {
        productId: p.id,
        inStock,
        waitlistEnabled,
        status: p.status || "published",
        variants: variantInventory,
      })
    }
  }
  return { inventory: out, failures }
}

async function fetchRecentNotifications(
  productIds: string[]
): Promise<Map<string, Date>> {
  // For each product id, find the MOST RECENT NotifiedAt across all
  // requests. Used to enforce the 7-day cooldown.
  const recent = new Map<string, Date>()
  if (!STRAPI || !STRAPI_TOKEN || productIds.length === 0) return recent

  // Strapi doesn't have a clean "max per group" without server code; we
  // request the top-1-per-product manually via a sort.
  for (const pid of productIds) {
    const qs = new URLSearchParams({
      "filters[MedusaProductId][$eq]": pid,
      "filters[NotifiedAt][$notNull]": "true",
      "pagination[pageSize]": "1",
      sort: "NotifiedAt:desc",
    })
    try {
      const body = await strapiGet(
        `/api/back-in-stock-requests?${qs.toString()}`
      )
      const row = body.data?.[0]
      if (!row) continue
      const attrs = row.attributes ?? row
      if (attrs?.NotifiedAt) {
        recent.set(pid, new Date(attrs.NotifiedAt))
      }
    } catch (err) {
      console.warn(
        `[back-in-stock-trigger] fetchRecentNotifications ${pid}: ${
          (err as Error).message
        }`
      )
    }
  }
  return recent
}

async function sendRestockEmail(
  req: StrapiBackInStockRequest
): Promise<boolean> {
  const productUrl = `${SITE_URL}/us/products/${encodeURIComponent(
    req.ProductHandle
  )}`
  const unsubscribeUrl = `${SITE_URL}/api/back-in-stock/unsubscribe?t=${encodeURIComponent(
    req.UnsubscribeToken
  )}`

  const result = await sendTemplatedEmail({
    to: req.Email,
    templateAlias: "back-in-stock-restocked",
    templateModel: {
      product_title: req.ProductTitle,
      product_url: productUrl,
      unsubscribe_url: unsubscribeUrl,
    },
    tag: "back-in-stock",
    metadata: {
      productId: req.MedusaProductId,
      variantId: req.MedusaVariantId || "",
      sku: req.Sku || "",
      productHandle: req.ProductHandle,
    },
  })
  if (!result.ok) {
    console.error(
      `[back-in-stock-trigger] postmark fail ${req.Email}: ${result.message}`
    )
    return false
  }
  return true
}

async function markNotified(req: StrapiBackInStockRequest): Promise<void> {
  await strapiPut(
    `/api/back-in-stock-requests/${encodeURIComponent(req.documentId)}`,
    {
      data: { NotifiedAt: new Date().toISOString() },
    }
  )
}

/**
 * Top-level driver. Idempotent: re-running while a SKU is in stock and
 * has pending subscribers will keep firing (one per subscriber-cycle)
 * until everyone's marked. Re-running after everyone's marked is a no-op
 * because the NotifiedAt filter excludes them.
 */
export async function runBackInStockTrigger(): Promise<TriggerSummary> {
  const summary: TriggerSummary = {
    ok: true,
    productsConsidered: 0,
    productsBackInStock: 0,
    subscribersNotified: 0,
    subscribersFailed: 0,
    errors: [],
  }

  try {
    const pending = await fetchPendingRequests()
    if (pending.length === 0) {
      return summary
    }

    // Group pending by product
    const byProduct = new Map<string, StrapiBackInStockRequest[]>()
    for (const r of pending) {
      const arr = byProduct.get(r.MedusaProductId) || []
      arr.push(r)
      byProduct.set(r.MedusaProductId, arr)
    }
    summary.productsConsidered = byProduct.size

    const productIds = Array.from(byProduct.keys())
    const [inventoryResult, lastNotified] = await Promise.all([
      fetchMedusaProductInventory(productIds),
      fetchRecentNotifications(productIds),
    ])
    const inventory = inventoryResult.inventory
    summary.errors.push(...inventoryResult.failures)

    const now = Date.now()

    for (const entry of Array.from(byProduct.entries())) {
      const [productId, requests] = entry
      const inv = inventory.get(productId)
      if (!inv) {
        // Couldn't read Medusa state — skip (don't accidentally send)
        continue
      }
      if (!inv.waitlistEnabled) continue
      if (inv.status !== "published") continue
      const shouldNotify = requests.some((request) => {
        if (!request.MedusaVariantId) return inv.inStock
        const variant = inv.variants.get(request.MedusaVariantId)
        return Boolean(variant?.waitlistEnabled && variant.inStock)
      })
      if (!shouldNotify) continue

      const last = lastNotified.get(productId)
      if (last && now - last.getTime() < COOLDOWN_MS) {
        // Within 7-day cooldown — don't re-notify a thrashing SKU
        continue
      }

      summary.productsBackInStock += 1

      // Send to each pending subscriber, mark on success
      for (const req of requests) {
        if (req.NotifiedAt) continue // defensive — should already be filtered
        if (req.UnsubscribedAt) continue
        if (req.MedusaVariantId) {
          const variant = inv.variants.get(req.MedusaVariantId)
          if (!variant?.waitlistEnabled || !variant.inStock) continue
        }

        const sent = await sendRestockEmail(req)
        if (sent) {
          try {
            await markNotified(req)
            await trackCommunicationEvent({
              event_name: "back_in_stock_notification_sent",
              event_id: `back_in_stock_notification_sent:${req.documentId}`,
              source: "storefront-cron",
              email: req.Email,
              template_key: "back-in-stock-restocked",
              properties: {
                medusa_product_id: req.MedusaProductId,
                medusa_variant_id: req.MedusaVariantId || null,
                product_handle: req.ProductHandle,
                product_title: req.ProductTitle,
                sku: req.Sku || null,
                waitlist_reason: req.WaitlistReason || null,
                strapi_id: req.documentId,
              },
            })
            summary.subscribersNotified += 1
          } catch (err) {
            summary.subscribersFailed += 1
            summary.errors.push(
              `markNotified ${req.documentId}: ${(err as Error).message}`
            )
          }
        } else {
          summary.subscribersFailed += 1
        }
      }
    }
  } catch (err) {
    summary.ok = false
    summary.errors.push((err as Error).message)
    console.error("[back-in-stock-trigger] top-level error:", err)
  }

  return summary
}
