/**
 * Holiday deadline data — used by the homepage HolidayBanner (#59).
 *
 * Hardcoded here intentionally for the launch period. The original spec called
 * for a Strapi `holiday-deadline` collection type so non-engineers can edit
 * deadlines; that's tracked as a follow-up. Migrating to Strapi later is a
 * matter of swapping `getActiveHoliday()` to fetch from the API and mapping
 * fields 1:1 — the consumer component shape doesn't change.
 *
 * To add a new holiday: append an entry. To shorten / lengthen the banner
 * lead time, edit `bannerLeadDays`. Dates are ISO `YYYY-MM-DD` in the
 * America/New_York calendar, matching the staff's communicated dates.
 */

export type HolidayCutoff = {
  service: string // e.g. "Delivery", "UPS Ground", "Plant Pickup"
  cutoff: string // ISO date YYYY-MM-DD OR a relative phrase like "1 business day before"
  note?: string
}

export type Holiday = {
  /** Display name. */
  name: string
  /** ISO date of the first night (or first day for day-of holidays). */
  firstNight: string
  /** Days before `firstNight` when the banner starts rendering. Default 28. */
  bannerLeadDays?: number
  /** Days before `firstNight` after which the banner stops rendering. Default 1. */
  bannerEndDaysBefore?: number
  /** Whether the entry is live. Set to false to hide without deleting. */
  active: boolean
  /** Cutoffs by service. Order matters — first in array renders first. */
  cutoffs: HolidayCutoff[]
  /** Optional emoji for the banner intro. Defaults to a candle. */
  emoji?: string
}

const DEFAULT_LEAD_DAYS = 28
const DEFAULT_END_BEFORE = 1

/**
 * Schedule of upcoming Jewish holidays — Sep 2026 through Dec 2026 plus the
 * Spring 2027 cycle. Dates pulled from a standard Jewish calendar; verify
 * against Chabad's calendar before each season since first-night dates can
 * vary by ±1 day depending on the calendar source.
 */
export const HOLIDAYS: Holiday[] = [
  {
    name: "Rosh Hashanah",
    firstNight: "2026-09-11",
    active: true,
    emoji: "🍎",
    cutoffs: [
      { service: "Delivery (Atlanta)", cutoff: "2026-09-09" },
      { service: "UPS Ground", cutoff: "2026-09-04" },
      { service: "Plant Pickup", cutoff: "1 business day before" },
    ],
  },
  {
    name: "Yom Kippur",
    firstNight: "2026-09-20",
    active: true,
    emoji: "🕯️",
    cutoffs: [
      { service: "Delivery (Atlanta)", cutoff: "2026-09-18" },
      { service: "UPS Ground", cutoff: "2026-09-15" },
      { service: "Plant Pickup", cutoff: "1 business day before" },
    ],
  },
  {
    name: "Sukkot",
    firstNight: "2026-09-25",
    active: true,
    emoji: "🌿",
    cutoffs: [
      { service: "Delivery (Atlanta)", cutoff: "2026-09-23" },
      { service: "UPS Ground", cutoff: "2026-09-18" },
      { service: "Plant Pickup", cutoff: "1 business day before" },
    ],
  },
  {
    name: "Hanukkah",
    firstNight: "2026-12-04",
    active: true,
    emoji: "🕎",
    cutoffs: [
      { service: "Delivery (Atlanta)", cutoff: "2026-12-02" },
      { service: "UPS Ground", cutoff: "2026-11-28" },
      { service: "Plant Pickup", cutoff: "1 business day before" },
    ],
  },
  {
    name: "Pesach",
    firstNight: "2027-04-21",
    bannerLeadDays: 42, // Pesach gets a longer lead because catering volume builds 6 weeks out
    active: true,
    emoji: "🍷",
    cutoffs: [
      { service: "Delivery (Atlanta)", cutoff: "2027-04-19" },
      { service: "UPS Ground", cutoff: "2027-04-14" },
      { service: "Plant Pickup", cutoff: "1 business day before" },
      { service: "Bulk / Catering", cutoff: "2027-04-07", note: "10 business days before" },
    ],
  },
  {
    name: "Shavuot",
    firstNight: "2027-06-10",
    active: true,
    emoji: "🌾",
    cutoffs: [
      { service: "Delivery (Atlanta)", cutoff: "2027-06-08" },
      { service: "UPS Ground", cutoff: "2027-06-03" },
      { service: "Plant Pickup", cutoff: "1 business day before" },
    ],
  },
]

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function easternCalendarDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const value = (type: string) => parts.find((part) => part.type === type)?.value
  return `${value("year")}-${value("month")}-${value("day")}`
}

function addCalendarDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** Relative cutoffs remain as supplied; only dated entries can expire. */
export function getUpcomingCutoffs(
  holiday: Holiday,
  now: Date = new Date()
): HolidayCutoff[] {
  const today = easternCalendarDate(now)
  return holiday.cutoffs.filter(
    ({ cutoff }) => !ISO_DATE.test(cutoff) || cutoff >= today
  )
}

/**
 * Returns the holiday whose banner window currently contains today, or null
 * if none. When two windows overlap (e.g. Yom Kippur + Sukkot in late
 * September), return the one whose `firstNight` is sooner — per the issue
 * spec's "prefer the earlier holiday" rule.
 */
export function getActiveHoliday(now: Date = new Date()): Holiday | null {
  const today = easternCalendarDate(now)
  const candidates = HOLIDAYS.filter((h) => {
    if (!h.active) return false
    const start = addCalendarDays(h.firstNight, -(h.bannerLeadDays ?? DEFAULT_LEAD_DAYS))
    const end = addCalendarDays(h.firstNight, -(h.bannerEndDaysBefore ?? DEFAULT_END_BEFORE))
    return today >= start && today <= end && getUpcomingCutoffs(h, now).length > 0
  })
  if (!candidates.length) return null
  candidates.sort((a, b) => a.firstNight.localeCompare(b.firstNight))
  return candidates[0]
}

/**
 * Format an ISO date as "Wednesday, March 25" for the banner copy.
 */
export function formatBannerDate(iso: string): string {
  if (!ISO_DATE.test(iso)) return iso // e.g. "1 business day before"
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}
