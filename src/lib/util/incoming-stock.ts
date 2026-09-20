import { staffAccessRole } from "./staff-access"

export function canReviewIncomingStock(
  customer: Parameters<typeof staffAccessRole>[0]
) {
  return [
    "staff",
    "office",
    "picker",
    "packer",
    "manager",
    "super_admin",
  ].includes(staffAccessRole(customer))
}
export const RECEIVING_TIMEZONES = [
  { value: "America/New_York", label: "Eastern time" },
  { value: "America/Chicago", label: "Central time" },
] as const

/** Explicit civil-time conversion; reject DST gaps and ambiguous fold times. */
export function receivingInstant(local: string, timezone: string): string {
  if (
    !RECEIVING_TIMEZONES.some((zone) => zone.value === timezone) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)
  )
    throw new Error("Enter a usable date, time and receiving timezone.")
  const nominal = Date.parse(`${local}:00Z`)
  if (
    !Number.isFinite(nominal) ||
    new Date(nominal).toISOString().slice(0, 16) !== local
  )
    throw new Error("Enter a real usable date and time.")
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const matches: string[] = []
  for (let offset = -12; offset <= 14; offset++) {
    const date = new Date(nominal + offset * 3600000)
    const parts = Object.fromEntries(
      formatter.formatToParts(date).map((part) => [part.type, part.value])
    )
    if (
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` ===
      local
    )
      matches.push(date.toISOString())
  }
  if (matches.length !== 1)
    throw new Error(
      "This time is missing or occurs twice when the clocks change. Confirm an unambiguous usable time with the receiving owner."
    )
  return matches[0]
}
export function receivingLocal(instant: string, timezone: string): string {
  if (!timezone || !instant || !Number.isFinite(Date.parse(instant))) return ""
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
export function receivingDisplay(instant: string, timezone: string): string {
  if (!timezone) return "Choose a timezone to review usable times"
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(instant))
}
export function incomingExceptionLabel(reason: string | null): string {
  return reason === "incoming_short"
    ? "Incoming quantity is short"
    : reason === "incoming_late"
    ? "Stock will be usable too late"
    : reason === "incoming_cancelled"
    ? "Incoming batch was cancelled"
    : "Receiving review required"
}
