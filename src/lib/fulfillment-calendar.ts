import type { StoreCart } from "@medusajs/types"

/** Backend dates are civil dates in America/New_York, never browser instants. */
export type FulfillmentCalendarChoice = {
  arrivalDate: string
  window: { id: string; label: string; start: string; end: string } | null
  cutoffAt: string
}
export type FulfillmentCalendar = {
  generatedAt: string
  expiresAt: string
  timezone: "America/New_York"
  choices: FulfillmentCalendarChoice[]
  unavailableReason:
    | "no_available_dates"
    | "unknown_route"
    | "missing_transit"
    | null
}
export type FulfillmentCalendarPage = {
  calendar: FulfillmentCalendar
  contextRevision: string
  shippingOptionId: string
  replacementQuote?: string
  regionalLocations?: { id: string; city: string; state: string }[]
}
export type FulfillmentCalendarDraft = {
  arrivalDate: string
  windowId?: string
  contextRevision: string
  shippingOptionId: string
  routeId?: string
  replacementQuote?: string
  staffOverrideConfirmed?: boolean
}
export type CalendarActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; legacy?: true }

export function hasCalendarPromise(metadata?: Record<string, unknown> | null) {
  return [
    metadata?.fulfillment_calendar_selection_v1,
    metadata?.fulfillment_calendar_accepted_v1,
    metadata?.fulfillmentCalendarQuoteId,
  ].some((value) => value !== undefined && value !== null && value !== "")
}

export function fulfillmentDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw)
  const key = us
    ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
    : raw
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const date = new Date(`${key}T12:00:00Z`)
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === key
    ? key
    : null
}

export function formatCalendarDate(
  value: unknown,
  style: "short" | "long" = "short"
) {
  const key = fulfillmentDateKey(value)
  if (!key) return value ? "Date needs review" : ""
  return new Intl.DateTimeFormat("en-US", {
    weekday: style,
    month: style,
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`))
}

export function calendarWindowLabel(metadata?: Record<string, unknown> | null) {
  const label =
    typeof metadata?.fulfillmentWindowLabel === "string"
      ? metadata.fulfillmentWindowLabel.trim()
      : ""
  if (label) {
    return `${label}${
      metadata?.fulfillmentCalendarTimezone === "America/New_York" ? " ET" : ""
    }`
  }
  // Legacy orders keep their stored window; new selections carry the approved label.
  const window =
    typeof metadata?.scheduledTimeWindow === "string"
      ? metadata.scheduledTimeWindow
      : ""
  const legacy: Record<string, string> = {
    morning: "9:00 AM - 12:00 PM",
    afternoon: "12:00 PM - 5:00 PM",
    evening: "5:00 PM - 9:00 PM",
  }
  return legacy[window] || window
}

/** Invalidation only. The server hashes and verifies the actual cart itself. */
export function calendarViewKey(cart: StoreCart) {
  return JSON.stringify({
    id: cart.id,
    email: cart.email,
    customerId: cart.customer_id,
    currency: cart.currency_code,
    region: cart.region_id,
    address: cart.shipping_address,
    calendarPromise: [
      cart.metadata?.fulfillment_calendar_selection_v1,
      cart.metadata?.fulfillment_calendar_accepted_v1,
      cart.metadata?.fulfillmentCalendarQuoteId,
    ],
    items: cart.items?.map((line) => [
      line.id,
      line.variant_id,
      line.quantity,
      line.unit_price,
    ]),
  })
}
