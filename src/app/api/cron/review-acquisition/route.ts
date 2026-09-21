import { communicationsAdminToken } from "@lib/data/background-admin-token"
import { NextResponse } from "next/server"
import {
  type ReviewAskKind,
  sendReviewAcquisitionEmail,
} from "@lib/data/review-acquisition"
import {
  emitCronAlert,
  planHeartbeat,
  planMisconfiguredAlert,
  planReviewAcquisitionAlert,
  planReviewAcquisitionSuppressionAlert,
} from "@lib/cron-ops-alerts"

const ALERT_PATH = "src/app/api/cron/review-acquisition/route.ts"

/**
 * Required env for the review-ask flow. Missing Medusa creds makes
 * `fetchRecentlyDelivered` return [] silently — the cron looks healthy
 * (HTTP 200, scanned:0) but never sends, so we page on it.
 */
function missingReviewAcquisitionEnv(): string[] {
  const required = ["MEDUSA_BACKEND_URL"]
  return [...required.filter((name) => !process.env[name]), ...(!communicationsAdminToken() ? ["MEDUSA_COMMUNICATIONS_API_TOKEN or MEDUSA_READ_ONLY_API_TOKEN or MEDUSA_ADMIN_API_TOKEN"] : [])]
}

/**
 * Daily cron for the review-acquisition flow (#96).
 *
 * The route is intentionally conservative: it only sends when an
 * order has a `metadata.delivered_at` timestamp and the customer has
 * not already received the matching platform ask.
 */

const CRON_SECRET = process.env.CRON_SECRET
const MEDUSA_BACKEND_URL = (process.env.MEDUSA_BACKEND_URL || "").replace(
  /\/+$/,
  ""
)
const ADMIN_TOKEN = communicationsAdminToken()
const ADMIN_AUTH_HEADER = ADMIN_TOKEN
  ? `Basic ${Buffer.from(`${ADMIN_TOKEN}:`).toString("base64")}`
  : ""
const STRAPI_BASE = (process.env.STRAPI_ENDPOINT || "").replace(/\/+$/, "")
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN

const ATLANTA_ZIP_PREFIX = "30"
const GOOGLE_FIRST_TIME_DAYS = 7
const GOOGLE_REPEAT_DAYS = 30
const YELP_FOLLOWUP_DAYS_AFTER_GOOGLE = 30

type ReviewMetadata = Record<string, unknown> & {
  account_type?: string
  review_ask_sent_google_at?: string
  review_ask_sent_yelp_at?: string
  review_request_sent_at?: string
  support_ticket_at?: string
  refund_requested_at?: string
  known_issue_at?: string
}

type DeliveredOrder = {
  id: string
  email?: string
  customer_id?: string
  customer?: {
    id?: string
    email?: string
    first_name?: string
    metadata?: ReviewMetadata
  } | null
  shipping_address?: {
    postal_code?: string
    first_name?: string
  }
  metadata?: ReviewMetadata & {
    delivered_at?: string
    order_count_at_time_of_purchase?: number
  }
  items?: Array<{ title?: string }>
}

type DeliveredOrderFetchResult = {
  orders: DeliveredOrder[]
  sourceFailed?: boolean
  sourceFailureStage?: string
  sourceStatus?: number
  sourceError?: string
}

type SuppressionLookupResult = {
  suppressed: boolean
  failed?: boolean
  status?: number
  error?: string
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function redactedErrorMessage(error: unknown) {
  return errorMessage(error)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\s+/g, " ")
    .trim()
}

function withinDayOf(timestamp: string | undefined, daysAgo: number): boolean {
  if (!timestamp) return false
  const t = new Date(timestamp).getTime()
  if (!Number.isFinite(t)) return false
  const target = Date.now() - daysAgo * 24 * 60 * 60 * 1000
  const halfDay = 12 * 60 * 60 * 1000
  return Math.abs(t - target) <= halfDay
}

function olderThanDays(timestamp: string | undefined, days: number): boolean {
  if (!timestamp) return false
  const t = new Date(timestamp).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t >= days * 24 * 60 * 60 * 1000
}

function isAtlantaZip(zip: string | undefined): boolean {
  return !!zip && zip.startsWith(ATLANTA_ZIP_PREFIX)
}

function isDryRun(req: Request): boolean {
  const url = new URL(req.url)
  const value =
    url.searchParams.get("dry_run") ||
    url.searchParams.get("dryRun") ||
    req.headers.get("x-review-dry-run") ||
    ""
  return ["1", "true", "yes"].includes(value.toLowerCase())
}

function isB2B(metadata?: ReviewMetadata): boolean {
  const accountType = String(metadata?.account_type || "").toLowerCase()
  return accountType.includes("wholesale") || accountType.includes("b2b")
}

function hasRecentBadSignal(order: DeliveredOrder): boolean {
  const meta = order.metadata || {}
  return !!(
    meta.support_ticket_at ||
    meta.refund_requested_at ||
    meta.known_issue_at
  )
}

function asOrderSummary(order: DeliveredOrder): string {
  const titles = (order.items || [])
    .map((i) => i.title)
    .filter((t): t is string => !!t)
    .slice(0, 2)
  if (titles.length === 0) return "your recent order"
  if (titles.length === 1) return `your ${titles[0]} order`
  return `your ${titles[0]} and ${titles.length - 1} more item order`
}

async function fetchRecentlyDelivered(): Promise<DeliveredOrderFetchResult> {
  if (!MEDUSA_BACKEND_URL || !ADMIN_TOKEN) {
    console.warn(
      "[cron/review-acquisition] MEDUSA_BACKEND_URL or MEDUSA_READ_ONLY_API_TOKEN missing; skipping run"
    )
    return {
      orders: [],
      sourceFailed: true,
      sourceFailureStage: "missing_config",
    }
  }
  const cutoff = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000).toISOString()
  const fields = [
    "id",
    "email",
    "customer_id",
    "customer.*",
    "shipping_address.*",
    "metadata",
    "items.title",
  ].join(",")
  const url =
    `${MEDUSA_BACKEND_URL}/admin/orders?limit=500` +
    `&fields=${encodeURIComponent(fields)}` +
    `&created_at[$gte]=${encodeURIComponent(cutoff)}`
  try {
    const res = await fetch(url, {
      headers: { Authorization: ADMIN_AUTH_HEADER },
      cache: "no-store",
    })
    if (!res.ok) {
      console.error(
        "[cron/review-acquisition] Medusa fetch failed",
        res.status
      )
      return {
        orders: [],
        sourceFailed: true,
        sourceFailureStage: "medusa_status",
        sourceStatus: res.status,
      }
    }
    const json = (await res.json()) as { orders?: DeliveredOrder[] }
    if (!Array.isArray(json.orders)) {
      console.error(
        "[cron/review-acquisition] Medusa fetch payload missing orders"
      )
      return {
        orders: [],
        sourceFailed: true,
        sourceFailureStage: "medusa_payload",
      }
    }
    return { orders: json.orders }
  } catch (err) {
    console.error("[cron/review-acquisition] Medusa fetch threw", err)
    return {
      orders: [],
      sourceFailed: true,
      sourceFailureStage: "medusa_request",
      sourceError: errorMessage(err).slice(0, 300),
    }
  }
}

async function isSuppressed(email: string): Promise<SuppressionLookupResult> {
  if (!STRAPI_BASE) {
    return {
      suppressed: false,
      failed: true,
      error: "STRAPI_ENDPOINT missing",
    }
  }
  try {
    const params = new URLSearchParams({
      "filters[Email][$eqi]": email.toLowerCase(),
      "filters[Type][$eq]": "reviews",
      "pagination[limit]": "1",
    })
    const res = await fetch(`${STRAPI_BASE}/api/email-suppressions?${params}`, {
      headers: STRAPI_API_TOKEN
        ? { Authorization: `Bearer ${STRAPI_API_TOKEN}` }
        : {},
      cache: "no-store",
    })
    if (!res.ok) {
      return {
        suppressed: false,
        failed: true,
        status: res.status,
        error: res.statusText,
      }
    }
    const json = (await res.json()) as { data?: unknown[] }
    return { suppressed: Array.isArray(json.data) && json.data.length > 0 }
  } catch (err) {
    console.error("[cron/review-acquisition] suppression lookup threw", err)
    return {
      suppressed: false,
      failed: true,
      error: redactedErrorMessage(err).slice(0, 300),
    }
  }
}

async function medusaAdminJson(
  path: string,
  body: Record<string, unknown>
): Promise<boolean> {
  if (!MEDUSA_BACKEND_URL || !ADMIN_TOKEN) return false
  try {
    const res = await fetch(`${MEDUSA_BACKEND_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: ADMIN_AUTH_HEADER,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })
    if (!res.ok) {
      console.error("[cron/review-acquisition] metadata update failed", {
        path,
        status: res.status,
      })
    }
    return res.ok
  } catch (err) {
    console.error("[cron/review-acquisition] metadata update threw", err)
    return false
  }
}

async function recordOrderMetadata(
  order: DeliveredOrder,
  metadata: ReviewMetadata
): Promise<boolean> {
  const ok = await medusaAdminJson(`/admin/orders/${order.id}`, {
    metadata,
  })
  if (ok) {
    return true
  }
  return medusaAdminJson(`/admin/orders/${order.id}/metadata`, {
    metadata,
  })
}

async function recordCustomerMetadata(
  order: DeliveredOrder,
  metadata: ReviewMetadata
): Promise<boolean> {
  const customerId = order.customer?.id || order.customer_id
  if (!customerId) return true
  return medusaAdminJson(`/admin/customers/${customerId}`, {
    metadata,
  })
}

async function recordAskSent(
  order: DeliveredOrder,
  metadata: ReviewMetadata
): Promise<boolean> {
  try {
    const [orderRecorded, customerRecorded] = await Promise.all([
      recordOrderMetadata(order, metadata),
      recordCustomerMetadata(order, metadata),
    ])
    return orderRecorded && customerRecorded
  } catch (err) {
    console.error("[cron/review-acquisition] metadata record threw", err)
    return false
  }
}

function getEmail(order: DeliveredOrder): string {
  return (order.email || order.customer?.email || "").trim().toLowerCase()
}

function getFirstName(order: DeliveredOrder): string | undefined {
  return order.shipping_address?.first_name || order.customer?.first_name
}

function googleSentAt(order: DeliveredOrder): string | undefined {
  return (
    order.customer?.metadata?.review_ask_sent_google_at ||
    order.metadata?.review_ask_sent_google_at ||
    order.metadata?.review_request_sent_at
  )
}

function yelpSentAt(order: DeliveredOrder): string | undefined {
  return (
    order.customer?.metadata?.review_ask_sent_yelp_at ||
    order.metadata?.review_ask_sent_yelp_at
  )
}

async function trySendAsk(
  order: DeliveredOrder,
  kind: ReviewAskKind
): Promise<{ sent: boolean; metadataRecorded: boolean }> {
  const result = await sendReviewAcquisitionEmail({
    email: getEmail(order),
    firstName: getFirstName(order),
    orderId: order.id,
    orderSummary: asOrderSummary(order),
    kind,
  })
  if (!result.ok) return { sent: false, metadataRecorded: false }

  const now = new Date().toISOString()
  let metadataRecorded = false
  if (kind === "yelp_atlanta_followup") {
    metadataRecorded = await recordAskSent(order, {
      review_ask_sent_yelp_at: now,
    })
  } else {
    metadataRecorded = await recordAskSent(order, {
      review_ask_sent_google_at: now,
      review_request_sent_at: now,
    })
  }
  return { sent: true, metadataRecorded }
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization") || ""
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const dryRun = isDryRun(req)

  // Misconfiguration guard: missing Medusa env => silent no-op for days.
  const missingEnv = missingReviewAcquisitionEnv()
  if (missingEnv.length > 0) {
    await emitCronAlert(
      planMisconfiguredAlert("review-acquisition", missingEnv),
      ALERT_PATH
    )
    return NextResponse.json(
      { ok: false, error: "misconfigured", missingEnv },
      { status: 200 }
    )
  }

  const delivered = await fetchRecentlyDelivered()
  const orders = delivered.orders
  const summary = {
    dryRun,
    scanned: orders.length,
    sourceFailed: delivered.sourceFailed || false,
    sourceFailureStage: delivered.sourceFailureStage,
    sourceStatus: delivered.sourceStatus,
    sourceError: delivered.sourceError,
    eligibleGoogle: 0,
    eligibleYelp: 0,
    sentGoogle: 0,
    sentYelp: 0,
    failed: 0,
    metadataFailed: 0,
    suppressionLookupFailed: 0,
    suppressionFailureStatus: undefined as number | undefined,
    suppressionFailureError: undefined as string | undefined,
    skipped: 0,
    skippedNoEmail: 0,
    skippedNoDeliveredAt: 0,
    skippedB2B: 0,
    skippedBadSignal: 0,
    skippedSuppressed: 0,
    skippedAlreadyAsked: 0,
    skippedNotDue: 0,
  }

  for (const order of orders) {
    const email = getEmail(order)
    const delivered = order.metadata?.delivered_at
    const repeat =
      (order.metadata?.order_count_at_time_of_purchase ?? 1) > 1
    const customerMetadata = order.customer?.metadata || {}

    if (!email) {
      summary.skipped++
      summary.skippedNoEmail++
      continue
    }
    if (!delivered) {
      summary.skipped++
      summary.skippedNoDeliveredAt++
      continue
    }
    if (isB2B(customerMetadata)) {
      summary.skipped++
      summary.skippedB2B++
      continue
    }
    if (hasRecentBadSignal(order)) {
      summary.skipped++
      summary.skippedBadSignal++
      continue
    }
    const suppression = await isSuppressed(email)
    if (suppression.failed) {
      summary.suppressionLookupFailed++
      summary.suppressionFailureStatus ??= suppression.status
      summary.suppressionFailureError ??= suppression.error
    }
    if (suppression.suppressed) {
      summary.skipped++
      summary.skippedSuppressed++
      continue
    }

    const googleAt = googleSentAt(order)
    const yelpAt = yelpSentAt(order)
    const atlanta = isAtlantaZip(order.shipping_address?.postal_code)

    if (
      atlanta &&
      googleAt &&
      !yelpAt &&
      olderThanDays(googleAt, YELP_FOLLOWUP_DAYS_AFTER_GOOGLE)
    ) {
      summary.eligibleYelp++
      if (dryRun) continue
      const result = await trySendAsk(order, "yelp_atlanta_followup")
      if (result.sent) {
        summary.sentYelp++
        if (!result.metadataRecorded) summary.metadataFailed++
      } else {
        summary.failed++
        summary.skipped++
      }
      continue
    }

    if (googleAt) {
      summary.skipped++
      summary.skippedAlreadyAsked++
      continue
    }

    const googleEligible = repeat
      ? withinDayOf(delivered, GOOGLE_REPEAT_DAYS)
      : withinDayOf(delivered, GOOGLE_FIRST_TIME_DAYS)
    if (!googleEligible) {
      summary.skipped++
      summary.skippedNotDue++
      continue
    }

    summary.eligibleGoogle++
    if (dryRun) continue
    const result = await trySendAsk(
      order,
      repeat ? "google_repeat" : "google_first_time"
    )
    if (result.sent) {
      summary.sentGoogle++
      if (!result.metadataRecorded) summary.metadataFailed++
    } else {
      summary.failed++
      summary.skipped++
    }
  }

  // Emit a failure alert (warn, or page when eligible-but-nothing-sent) when
  // review-ask sends failed, then a success heartbeat for silence detection.
  // Both fire before returning and never alter the HTTP response.
  await emitCronAlert(
    planReviewAcquisitionSuppressionAlert(summary),
    ALERT_PATH
  )
  await emitCronAlert(planReviewAcquisitionAlert(summary), ALERT_PATH)
  await emitCronAlert(
    planHeartbeat("review-acquisition", {
      scanned: summary.scanned,
      sent_google: summary.sentGoogle,
      sent_yelp: summary.sentYelp,
      metadata_failed: summary.metadataFailed,
      suppression_lookup_failed: summary.suppressionLookupFailed,
      source_failed: summary.sourceFailed,
      source_failure_stage: summary.sourceFailureStage || null,
      dry_run: summary.dryRun,
    }),
    ALERT_PATH
  )

  return NextResponse.json({ ok: true, ...summary })
}

export const GET = POST
