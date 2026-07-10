"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import type { StoreCart, StoreCartShippingOption } from "@medusajs/types"

import { setRequestedDeliveryDate } from "@lib/data/cart"
import {
  computeEligibleArrivalDates,
  normalizeUpsServiceCode,
  toIsoDate,
  type ArrivalMethod,
  type AtlantaZipDayConfig,
  type FulfillmentBlackouts,
} from "@lib/util/eligible-arrival-dates"
import { ATLANTA_DELIVERY_ZIP_DAYS } from "@lib/data/strapi/checkout"

/**
 * Arrival-date picker for the checkout shipping flow. Renders the next batch of
 * eligible dates as a card grid — the calendar grid version made it impossible
 * to tell selectable vs disabled days at a glance.
 */

type ArriveFoodCalendarProps = {
  cart: StoreCart
  setError: (error: string | null) => void
  /** All shipping options visible to this cart — used to resolve service_code. */
  availableShippingMethods?: StoreCartShippingOption[] | null
  /** Server-derived "now" — passed from the parent so the client clock can't lie. */
  serverNowIso?: string
  atlantaZipConfig?: Record<string, AtlantaZipDayConfig>
  fulfillmentBlackouts?: FulfillmentBlackouts
}

function deriveArrivalMethod(
  cart: StoreCart,
  availableShippingMethods?: StoreCartShippingOption[] | null
): ArrivalMethod {
  const fulfillmentType = cart.metadata?.fulfillmentType as string | undefined
  const selectedOptionId = cart.shipping_methods?.at(-1)?.shipping_option_id
  const selectedOption = availableShippingMethods?.find((o) => o.id === selectedOptionId)
  const serviceCode =
    (selectedOption as any)?.data?.service_code ??
    (selectedOption as any)?.service_code

  if (fulfillmentType === "atlanta_delivery") return "atlanta_delivery"
  if (fulfillmentType === "southeast_pickup") return "southeast_pickup"
  if (fulfillmentType === "plant_pickup") return "plant_pickup"

  const normalizedServiceCode = normalizeUpsServiceCode(serviceCode)

  if (normalizedServiceCode === "OVERNIGHT") return "ups_overnight"
  if (normalizedServiceCode === "2ND_DAY_AIR") return "ups_2day"
  if (normalizedServiceCode === "3_DAY_SELECT") return "ups_3day"
  if (normalizedServiceCode === "GROUND") return "ups_ground"

  const name = (selectedOption?.name || "").toLowerCase()
  if (name.includes("overnight")) return "ups_overnight"
  if (name.includes("2nd day") || name.includes("two day")) return "ups_2day"
  if (
    name.includes("3 day") ||
    name.includes("3-day") ||
    name.includes("3rd day") ||
    name.includes("third day") ||
    name.includes("three day")
  ) {
    return "ups_3day"
  }
  return "ups_ground"
}

const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const WEEKDAY_NARROW = ["S", "M", "T", "W", "T", "F", "S"]
const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

const INITIAL_DATES_SHOWN = 9

// ────────────────────────────────────────────────────────────────────
// Custom month-grid calendar
//
// Replaces the @medusajs/ui Calendar so we can give eligible days a
// light-gray pill and the selected day a green pill — the previous
// component's defaults made it impossible to tell selectable from
// disabled days at a glance.
// ────────────────────────────────────────────────────────────────────

type MonthCalendarProps = {
  value: Date | null
  eligibleIsoSet: Set<string>
  earliest: Date
  latest: Date
  onSelect: (d: Date) => void
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function MonthCalendar({
  value,
  eligibleIsoSet,
  earliest,
  latest,
  onSelect,
}: MonthCalendarProps) {
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    startOfMonth(value || earliest)
  )

  const selectedIso = value ? toIsoDate(value) : null
  const todayIso = toIsoDate(new Date())

  // Compose the visible grid: 6 rows × 7 cols starting from the Sunday
  // before (or on) the 1st of `viewMonth`.
  const grid = useMemo(() => {
    const firstOfMonth = startOfMonth(viewMonth)
    const startWeekday = firstOfMonth.getDay()
    const cells: Array<Date> = []
    const cursor = new Date(firstOfMonth)
    cursor.setDate(cursor.getDate() - startWeekday)
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    return cells
  }, [viewMonth])

  // Don't let the user page outside the eligibility window — showing
  // months full of greyed-out numbers is just visual noise.
  const minMonth = startOfMonth(earliest)
  const maxMonth = startOfMonth(latest)
  const canGoPrev = viewMonth.getTime() > minMonth.getTime()
  const canGoNext = viewMonth.getTime() < maxMonth.getTime()

  return (
    <div className="select-none">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => canGoPrev && setViewMonth((m) => addMonths(m, -1))}
          disabled={!canGoPrev}
          aria-label="Previous month"
          className="w-8 h-8 flex items-center justify-center rounded-full text-Charcoal/70 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-Charcoal">
          {MONTH_LONG[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => canGoNext && setViewMonth((m) => addMonths(m, 1))}
          disabled={!canGoNext}
          aria-label="Next month"
          className="w-8 h-8 flex items-center justify-center rounded-full text-Charcoal/70 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_NARROW.map((w, i) => (
          <div
            key={`${w}-${i}`}
            className="text-center text-[10px] font-semibold uppercase tracking-wider text-Charcoal/50 py-1"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const inMonth = d.getMonth() === viewMonth.getMonth()
          const iso = toIsoDate(d)
          const isEligible = eligibleIsoSet.has(iso)
          const isSelected = iso === selectedIso
          const isToday = iso === todayIso

          let cellClass =
            "relative h-10 flex items-center justify-center text-sm rounded-lg transition-colors "
          if (!inMonth) {
            cellClass += "text-Charcoal/25"
          } else if (isSelected) {
            cellClass += "bg-emerald-600 text-white font-semibold shadow-sm"
          } else if (isEligible) {
            cellClass +=
              "bg-gray-100 text-Charcoal font-medium hover:bg-Gold/20 hover:text-Charcoal cursor-pointer"
          } else {
            cellClass += "text-Charcoal/30"
          }

          return (
            <button
              key={iso}
              type="button"
              onClick={() => isEligible && onSelect(d)}
              disabled={!isEligible}
              aria-pressed={isSelected}
              aria-label={`${WEEKDAY_LONG[d.getDay()]}, ${MONTH_LONG[d.getMonth()]} ${d.getDate()}${
                isEligible ? "" : " — not available"
              }`}
              className={cellClass}
            >
              {d.getDate()}
              {isToday && !isSelected && (
                <span
                  className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
                    isEligible ? "bg-Gold" : "bg-Charcoal/40"
                  }`}
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[11px] text-Charcoal/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-200" />
          Available
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-emerald-600" />
          Selected
        </span>
      </div>
    </div>
  )
}

export default function ArriveFoodCalendar({
  cart,
  setError,
  availableShippingMethods,
  serverNowIso,
  atlantaZipConfig = ATLANTA_DELIVERY_ZIP_DAYS,
  fulfillmentBlackouts,
}: ArriveFoodCalendarProps) {
  const [dateValue, setDateValue] = useState<Date | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [view, setView] = useState<"list" | "calendar">("list")

  const method = useMemo(
    () => deriveArrivalMethod(cart, availableShippingMethods),
    [cart, availableShippingMethods]
  )
  const destinationZip = (cart.shipping_address?.postal_code || "").trim()

  const now = useMemo(
    () => (serverNowIso ? new Date(serverNowIso) : undefined),
    [serverNowIso]
  )

  const eligibility = useMemo(
    () =>
      computeEligibleArrivalDates({
        method,
        destinationZip,
        now,
        atlantaZipConfig,
        blackouts: fulfillmentBlackouts,
      }),
    [method, destinationZip, now, atlantaZipConfig, fulfillmentBlackouts]
  )

  // Hydrate selection from cart metadata. If the stored date is no longer
  // eligible (method or zip changed) drop it and clear server-side so a
  // logically-impossible date can never reach payment.
  useEffect(() => {
    const md = cart?.metadata?.requestedDeliveryDate as string | undefined
    if (!md) {
      setDateValue(eligibility.earliest ?? null)
      return
    }
    const [m, d, y] = md.split("/").map(Number)
    if (!m || !d || !y) {
      setDateValue(eligibility.earliest ?? null)
      return
    }
    const stored = new Date(y, m - 1, d)
    if (eligibility.isoSet.has(toIsoDate(stored))) {
      setDateValue(stored)
    } else {
      setDateValue(eligibility.earliest ?? null)
      setRequestedDeliveryDate({ cartId: cart.id, date: "" }).catch(() => {
        /* UI will recover when user re-selects */
      })
    }
  }, [cart?.metadata?.requestedDeliveryDate, eligibility.isoSet, eligibility.earliest, cart.id])

  const handlePick = useCallback(
    (d: Date) => {
      setError(null)
      setDateValue(d)
      const usaDate = d.toLocaleDateString("en-US")
      setRequestedDeliveryDate({ cartId: cart.id, date: usaDate }).catch((err) =>
        setError(err.message)
      )
    },
    [cart.id, setError]
  )

  if (!eligibility.earliest || eligibility.dates.length === 0) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200/80 rounded-lg text-sm text-amber-800">
        No eligible arrival dates found in the next 30 days for this shipping
        method. Please choose a different shipping method or contact us to
        schedule.
      </div>
    )
  }

  const visibleDates = showAll
    ? eligibility.dates
    : eligibility.dates.slice(0, INITIAL_DATES_SHOWN)
  const selectedIso = dateValue ? toIsoDate(dateValue) : null
  const earliestIso = toIsoDate(eligibility.earliest)
  const hasMore = eligibility.dates.length > INITIAL_DATES_SHOWN

  const latestEligible = eligibility.dates[eligibility.dates.length - 1]

  const toggleView = () => setView((v) => (v === "list" ? "calendar" : "list"))

  return (
    <div className="space-y-3">
      {view === "list" ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {visibleDates.map((d) => {
              const iso = toIsoDate(d)
              const isSelected = iso === selectedIso
              const isEarliest = iso === earliestIso
              const weekday = WEEKDAY_SHORT[d.getDay()]
              const weekdayLong = WEEKDAY_LONG[d.getDay()]
              const monthAbbrev = MONTH_SHORT[d.getMonth()]
              const day = d.getDate()
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => handlePick(d)}
                  aria-pressed={isSelected}
                  aria-label={`${weekdayLong}, ${monthAbbrev} ${day}${isEarliest ? " — earliest available" : ""}`}
                  className={`
                    relative flex flex-col items-center justify-center
                    rounded-xl border-2 px-2 py-3 transition-all
                    ${isSelected
                      ? "border-Gold bg-Gold/[0.08] shadow-sm"
                      : "border-gray-200 bg-white hover:border-Gold/60 hover:shadow-sm"
                    }
                  `}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${isSelected ? "text-Gold" : "text-Charcoal/60"}`}>
                    {weekday}
                  </span>
                  <span className={`text-xl font-bold leading-tight mt-0.5 ${isSelected ? "text-Charcoal" : "text-Charcoal"}`}>
                    {day}
                  </span>
                  <span className={`text-[10px] font-medium uppercase tracking-wide ${isSelected ? "text-Gold" : "text-Charcoal/50"}`}>
                    {monthAbbrev}
                  </span>
                  {isEarliest && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider bg-Gold text-white px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                      Earliest
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            {hasMore ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-xs font-semibold text-Gold hover:text-Gold/80"
              >
                {showAll
                  ? "Show fewer dates"
                  : `Show ${eligibility.dates.length - INITIAL_DATES_SHOWN} more dates`}
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={toggleView}
              className="text-xs font-semibold text-Charcoal/70 hover:text-Charcoal underline underline-offset-2 transition-colors"
            >
              Switch to calendar view
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <MonthCalendar
              value={dateValue}
              eligibleIsoSet={eligibility.isoSet}
              earliest={eligibility.earliest}
              latest={latestEligible || eligibility.earliest}
              onSelect={handlePick}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggleView}
              className="text-xs font-semibold text-Charcoal/70 hover:text-Charcoal underline underline-offset-2 transition-colors"
            >
              Switch to list view
            </button>
          </div>
        </>
      )}

      <p className="text-xs text-Charcoal/55 leading-snug" aria-live="polite">
        {eligibility.reason} Arrival dates are estimates — we don't control
        carrier schedules.
      </p>
    </div>
  )
}
