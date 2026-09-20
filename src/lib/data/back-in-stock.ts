"use server"

import { randomBytes } from "crypto"
import { sendTemplatedEmail } from "@lib/postmark"
import { trackCommunicationEvent } from "./communications-events"
import { emitBackInStockCaptureFailureAlert } from "@lib/customer-demand-ops-alerts"
import { resolvePublicWaitlistProduct } from "./public-waitlist-product"

function strapiBase() {
  return (process.env.STRAPI_ENDPOINT || "").replace(/\/+$/, "")
}

function strapiApiToken() {
  return process.env.STRAPI_API_TOKEN
}

/**
 * Notify-me-when-back-in-stock — server action for the PDP capture
 * form (#102).
 *
 * Flow:
 *
 *   1. Lightweight email validation (regex on shape — Postmark and
 *      Strapi do the heavy lifting). Reject obvious garbage early so
 *      we never write a record we can't actually email.
 *   2. Verify current public catalog eligibility, then create a
 *      `back-in-stock-request` record through Strapi's authenticated
 *      server API. Keep anonymous access disabled. Strapi storage means the restock trigger
 *      (whichever service owns it) can query a single source of truth
 *      when inventory crosses zero.
 *   3. Send the confirmation email via Postmark template
 *      `back-in-stock-confirm`. The unsubscribe link uses the
 *      single-use token from the Strapi record.
 *
 * Persistence errors are reported to the customer. We do not show a
 * success state unless Strapi accepted the row the restock trigger
 * will later process.
 *
 * Repeated active subscriptions are checked before sending another
 * confirmation; the restock trigger also collapses duplicate records.
 */

export type RequestBackInStockResult = {
  ok: boolean
  error?: string
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

function generateUnsubscribeToken(): string {
  return randomBytes(24).toString("base64url")
}

async function persistToStrapi(payload: {
  Email: string
  MedusaProductId: string
  MedusaVariantId?: string
  ProductHandle: string
  ProductTitle: string
  Sku?: string
  QuickBooksListId?: string
  RequestedFulfillmentDate?: string
  WaitlistReason?: "out_of_stock" | "allocated_out" | "future_unavailable"
  UnsubscribeToken: string
  Source: "pdp" | "side_cart" | "search"
}): Promise<{ ok: boolean; id?: number; documentId?: string }> {
  const STRAPI_BASE = strapiBase()
  const STRAPI_API_TOKEN = strapiApiToken()
  if (!STRAPI_BASE) {
    console.error("[back-in-stock] STRAPI_ENDPOINT not set; skipping persist")
    await emitBackInStockCaptureFailureAlert({
      stage: "configuration",
      missingEnv: ["STRAPI_ENDPOINT"],
      medusaProductId: payload.MedusaProductId,
      medusaVariantId: payload.MedusaVariantId,
      productHandle: payload.ProductHandle,
      sku: payload.Sku,
      source: payload.Source,
      waitlistReason: payload.WaitlistReason,
    })
    return { ok: false }
  }
  try {
    const res = await fetch(`${STRAPI_BASE}/api/back-in-stock-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(STRAPI_API_TOKEN
          ? { Authorization: `Bearer ${STRAPI_API_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({ data: payload }),
      cache: "no-store",
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.error(
        `[back-in-stock] Strapi persist failed ${res.status}: ${text.slice(0, 200)}`
      )
      await emitBackInStockCaptureFailureAlert({
        stage: "strapi_persist",
        status: res.status,
        statusText: res.statusText,
        error: text,
        medusaProductId: payload.MedusaProductId,
        medusaVariantId: payload.MedusaVariantId,
        productHandle: payload.ProductHandle,
        sku: payload.Sku,
        source: payload.Source,
        waitlistReason: payload.WaitlistReason,
      })
      return { ok: false }
    }
    const json = (await res.json()) as {
      data?: { id?: number; documentId?: string }
    }
    return {
      ok: true,
      id: json.data?.id,
      documentId: json.data?.documentId,
    }
  } catch (err) {
    console.error("[back-in-stock] Strapi persist threw", err)
    await emitBackInStockCaptureFailureAlert({
      stage: "strapi_persist",
      error: err,
      medusaProductId: payload.MedusaProductId,
      medusaVariantId: payload.MedusaVariantId,
      productHandle: payload.ProductHandle,
      sku: payload.Sku,
      source: payload.Source,
      waitlistReason: payload.WaitlistReason,
    })
    return { ok: false }
  }
}

async function hasActiveSubscription(
  email: string,
  medusaProductId: string,
  medusaVariantId: string | undefined,
  context: {
    productHandle: string
    sku?: string
    source: "pdp" | "side_cart" | "search"
    waitlistReason: "out_of_stock" | "allocated_out" | "future_unavailable"
  }
): Promise<boolean> {
  const STRAPI_BASE = strapiBase()
  const STRAPI_API_TOKEN = strapiApiToken()
  if (!STRAPI_BASE) return false
  try {
    const url =
      `${STRAPI_BASE}/api/back-in-stock-requests` +
      `?filters[Email][$eqi]=${encodeURIComponent(email)}` +
      `&filters[MedusaProductId][$eq]=${encodeURIComponent(medusaProductId)}` +
      (medusaVariantId
        ? `&filters[MedusaVariantId][$eq]=${encodeURIComponent(
            medusaVariantId
          )}`
        : "") +
      `&filters[NotifiedAt][$null]=true` +
      `&filters[UnsubscribedAt][$null]=true` +
      `&pagination[limit]=1`
    const res = await fetch(url, {
      headers: STRAPI_API_TOKEN
        ? { Authorization: `Bearer ${STRAPI_API_TOKEN}` }
        : {},
      cache: "no-store",
    })
    if (!res.ok) {
      await emitBackInStockCaptureFailureAlert({
        stage: "dedupe_lookup",
        status: res.status,
        statusText: res.statusText,
        medusaProductId,
        medusaVariantId,
        productHandle: context.productHandle,
        sku: context.sku,
        source: context.source,
        waitlistReason: context.waitlistReason,
      })
      return false
    }
    const json = (await res.json()) as { data?: unknown[] }
    return Array.isArray(json.data) && json.data.length > 0
  } catch (error) {
    await emitBackInStockCaptureFailureAlert({
      stage: "dedupe_lookup",
      error,
      medusaProductId,
      medusaVariantId,
      productHandle: context.productHandle,
      sku: context.sku,
      source: context.source,
      waitlistReason: context.waitlistReason,
    })
    return false
  }
}

export async function requestBackInStockNotification(input: {
  email: string
  medusaProductId: string
  medusaVariantId?: string
  productHandle: string
  productTitle: string
  sku?: string
  quickBooksListId?: string
  requestedFulfillmentDate?: string
  waitlistReason?: "out_of_stock" | "allocated_out" | "future_unavailable"
  source?: "pdp" | "side_cart" | "search"
  /** Honeypot — must be empty for legit submissions. */
  honeypot?: string
}): Promise<RequestBackInStockResult> {
  const email = (input.email || "").trim().toLowerCase()
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." }
  }
  if (!input.medusaProductId || !input.productHandle) {
    // The PDP component always passes these; if they're missing
    // something is wrong on our side, not the customer's. Don't
    // surface internal detail.
    return { ok: false, error: "Something went wrong. Please try again." }
  }

  // Honeypot field — the form ships an invisible "company" input that
  // legitimate humans never touch. Bots that scrape form schemas and
  // fill every field will populate it; we silently 200 those.
  if (input.honeypot && input.honeypot.length > 0) {
    return { ok: true }
  }

  try {
    const canonical = await resolvePublicWaitlistProduct(input.medusaProductId, input.medusaVariantId)
    input = { ...input, ...canonical }
  } catch {
    return { ok: false, error: "We couldn't verify this item's availability. Please try again." }
  }

  // De-dupe before sending. If this email has an active (un-unsubscribed)
  // subscription on this product, return ok without queuing another
  // confirmation email — the customer's already on the list.
  if (
    await hasActiveSubscription(
      email,
      input.medusaProductId,
      input.medusaVariantId,
      {
        productHandle: input.productHandle,
        sku: input.sku,
        source: input.source ?? "pdp",
        waitlistReason: input.waitlistReason || "out_of_stock",
      }
    )
  ) {
    return { ok: true }
  }

  const token = generateUnsubscribeToken()
  const persisted = await persistToStrapi({
    Email: email,
    MedusaProductId: input.medusaProductId,
    ...(input.medusaVariantId ? { MedusaVariantId: input.medusaVariantId } : {}),
    ProductHandle: input.productHandle,
    ProductTitle: input.productTitle || "your product",
    ...(input.sku ? { Sku: input.sku } : {}),
    ...(input.quickBooksListId
      ? { QuickBooksListId: input.quickBooksListId }
      : {}),
    ...(input.requestedFulfillmentDate
      ? { RequestedFulfillmentDate: input.requestedFulfillmentDate }
      : {}),
    WaitlistReason: input.waitlistReason || "out_of_stock",
    UnsubscribeToken: token,
    Source: input.source ?? "pdp",
  })
  if (!persisted.ok) {
    return {
      ok: false,
      error: "We couldn't save your request. Please try again.",
    }
  }

  const baseUrl = (
    process.env.NEXT_PUBLIC_BASE_URL || "https://www.grillerspride.com"
  ).replace(/\/+$/, "")
  const productUrl = `${baseUrl}/us/products/${input.productHandle}`
  const unsubscribeUrl = `${baseUrl}/api/back-in-stock/unsubscribe?t=${encodeURIComponent(token)}`

  // The customer is on the list once Strapi has the row. Confirmation
  // email failures are logged because the restock trigger can still
  // notify the persisted subscriber later.
  const send = await sendTemplatedEmail({
    to: email,
    templateAlias: "back-in-stock-confirm",
    templateModel: {
      product_title: input.productTitle,
      product_handle: input.productHandle,
      product_url: productUrl,
      unsubscribe_url: unsubscribeUrl,
    },
    tag: "back-in-stock-confirm",
    metadata: {
      medusa_product_id: input.medusaProductId,
      medusa_variant_id: input.medusaVariantId || "",
      sku: input.sku || "",
      strapi_id: persisted.documentId ?? "",
      source: input.source ?? "pdp",
    },
  })
  if (!send.ok) {
    console.error("[back-in-stock] Postmark send failed", send.message)
    await emitBackInStockCaptureFailureAlert({
      stage: "confirmation_email",
      error: send.message || send.errorCode || "Postmark send failed",
      medusaProductId: input.medusaProductId,
      medusaVariantId: input.medusaVariantId,
      productHandle: input.productHandle,
      sku: input.sku,
      source: input.source ?? "pdp",
      waitlistReason: input.waitlistReason || "out_of_stock",
      strapiId: persisted.documentId ?? persisted.id ?? null,
    })
  }

  await trackCommunicationEvent({
    event_name: "waitlist_joined",
    event_id: `waitlist_joined:${persisted.documentId || persisted.id || token}`,
    source: "storefront-server",
    email,
    template_key: "back-in-stock-confirm",
    properties: {
      medusa_product_id: input.medusaProductId,
      medusa_variant_id: input.medusaVariantId || null,
      product_handle: input.productHandle,
      product_title: input.productTitle,
      sku: input.sku || null,
      waitlist_reason: input.waitlistReason || "out_of_stock",
      strapi_id: persisted.documentId || persisted.id || null,
      confirmation_email_sent: send.ok,
    },
  })

  return { ok: true }
}
