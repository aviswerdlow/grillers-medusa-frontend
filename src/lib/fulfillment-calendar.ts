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
}
export type FulfillmentCalendarDraft = {
  arrivalDate: string
  windowId?: string
  contextRevision: string
  shippingOptionId: string
  routeId?: string
  replacementQuote?: string
}
export type CalendarActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export function formatCalendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`))
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
    items: cart.items?.map((line) => [
      line.id,
      line.variant_id,
      line.quantity,
      line.unit_price,
    ]),
  })
}
