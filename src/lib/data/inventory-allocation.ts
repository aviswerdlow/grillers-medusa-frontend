import "server-only"

import { adminFetch } from "./staff/admin"
import type { HttpTypes } from "@medusajs/types"

type AnyRecord = Record<string, any>

export type InventoryAvailabilityDecision =
  | "available"
  | "partial"
  | "blocked"
  | "future_allowed"
  | "inactive"

export type InventoryAvailabilityLine = {
  variant_id: string
  product_id?: string
  qbd_list_id?: string
  sku?: string
  title?: string
  requested_quantity: number
  current_stock_quantity: number
  allocated_quantity: number
  safety_stock_quantity: number
  available_to_promise_quantity: number
  lifecycle: "active" | "seasonal_inactive" | "discontinued" | "internal_only"
  decision: InventoryAvailabilityDecision
  reason: string
  future_order_eligible: boolean
  replenishment_lead_days: number
  earliest_available_date?: string
  alternatives: Array<{
    product_id?: string
    variant_id: string
    title: string
    sku?: string
    available_to_promise_quantity?: number
    relationship: string
  }>
}

export type InventoryAvailabilityInput = {
  cart_id?: string
  order_id?: string
  customer_id?: string
  fulfillment_type?: string
  requested_fulfillment_date?: string
  source?: "customer_web" | "staff_phone_order" | "staff_adjustment" | "admin"
  lines: Array<{
    product_id?: string
    variant_id: string
    quantity: number
    qbd_list_id?: string
    sku?: string
    title?: string
  }>
}

export type InventoryAvailabilityResult = {
  ok: boolean
  lines: InventoryAvailabilityLine[]
  message?: string
}

const MEDUSA_BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/+$/, "")

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

function storeHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-publishable-api-key": PUBLISHABLE_KEY,
  }
}

async function availabilityFetch(
  path: string,
  input: InventoryAvailabilityInput,
  headers: HeadersInit
): Promise<InventoryAvailabilityResult> {
  const res = await fetch(`${MEDUSA_BACKEND_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    cache: "no-store",
  })
  const json = (await res.json().catch(() => ({}))) as AnyRecord
  if (!res.ok) {
    throw new Error(json.message || json.error || res.statusText)
  }
  return {
    ok: Boolean(json.ok),
    lines: Array.isArray(json.lines) ? json.lines : [],
    message: json.message,
  }
}

export async function checkStoreInventoryAvailability(
  input: InventoryAvailabilityInput
) {
  return availabilityFetch(
    "/store/gp-inventory/availability",
    input,
    storeHeaders()
  )
}

export async function checkStaffInventoryAvailability(
  input: InventoryAvailabilityInput
) {
  return adminFetch<InventoryAvailabilityResult>("/admin/grillers/inventory/availability", {
    method: "POST",
    body: JSON.stringify({ ...input, source: input.source || "staff_phone_order" }),
  })
}

export function requestedFulfillmentDateFromCart(
  cart: Pick<HttpTypes.StoreCart, "metadata"> | null | undefined
) {
  const metadata = (cart?.metadata || {}) as AnyRecord
  return (
    textValue(metadata.scheduledDate) ||
    textValue(metadata.requestedDeliveryDate) ||
    textValue(metadata.requested_fulfillment_date) ||
    undefined
  )
}

export function fulfillmentTypeFromCart(
  cart: Pick<HttpTypes.StoreCart, "metadata"> | null | undefined
) {
  const metadata = (cart?.metadata || {}) as AnyRecord
  return (
    textValue(metadata.fulfillmentType) ||
    textValue(metadata.fulfillment_type) ||
    undefined
  )
}

export function linesFromCart(
  cart: Pick<HttpTypes.StoreCart, "items"> | null | undefined
): InventoryAvailabilityInput["lines"] {
  return (cart?.items || [])
    .map((item: AnyRecord) => {
      const variantId = item.variant_id || item.variant?.id
      if (!variantId) return null
      return {
        product_id: item.product_id || item.product?.id,
        variant_id: variantId,
        quantity: Math.max(1, Number(item.quantity || 1)),
        sku: item.variant?.sku || item.variant_sku || item.metadata?.sku,
        title:
          item.metadata?.strapi_title ||
          item.metadata?.customer_title ||
          item.product_title ||
          item.product?.title ||
          item.title,
      }
    })
    .filter(Boolean) as InventoryAvailabilityInput["lines"]
}

export async function checkCartInventoryAvailability(
  cart: HttpTypes.StoreCart
) {
  const lines = linesFromCart(cart)
  if (!lines.length) return { ok: true, lines: [] }

  return checkStoreInventoryAvailability({
    cart_id: cart.id,
    fulfillment_type: fulfillmentTypeFromCart(cart),
    requested_fulfillment_date: requestedFulfillmentDateFromCart(cart),
    lines,
  })
}

export function blockingInventoryLines(lines: InventoryAvailabilityLine[]) {
  return lines.filter((line) =>
    ["partial", "blocked", "inactive"].includes(line.decision)
  )
}

export function inventoryLineMessage(line: InventoryAvailabilityLine) {
  const title = line.title || line.sku || line.variant_id
  if (line.decision === "inactive") {
    return `${title} is not currently offered.`
  }
  if (line.decision === "partial") {
    return `${title} has ${line.available_to_promise_quantity} available for the selected date.`
  }
  if (line.earliest_available_date) {
    return `${title} is not available for the selected date. Earliest expected date: ${line.earliest_available_date}.`
  }
  return `${title} is not available for the selected date.`
}

export function inventoryCheckoutError(lines: InventoryAvailabilityLine[]) {
  const blocking = blockingInventoryLines(lines)
  if (!blocking.length) return null

  const preview = blocking
    .slice(0, 3)
    .map(inventoryLineMessage)
    .join(" ")
  const suffix =
    blocking.length > 3 ? ` ${blocking.length - 3} more lines need review.` : ""
  return `Some items are not available for your selected date. ${preview}${suffix} Choose a replacement, remove the item, join the waitlist, or move the order date before payment.`
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return undefined
}
