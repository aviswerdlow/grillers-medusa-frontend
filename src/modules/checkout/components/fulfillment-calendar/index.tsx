"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import type { StoreCart } from "@medusajs/types"
import {
  getCheckoutCalendar,
  saveCheckoutCalendar,
  type FulfillmentType,
} from "@lib/data/cart"
import {
  calendarViewKey,
  hasCalendarPromise,
  formatCalendarDate,
  type FulfillmentCalendarPage,
  type FulfillmentCalendarChoice,
} from "@lib/fulfillment-calendar"

type Props = {
  cart: StoreCart
  fulfillmentType: FulfillmentType
  shippingOptionId?: string
  routeId?: string
  pickupLocation?: { name?: string; city?: string; state?: string }
  actions?: {
    load: typeof getCheckoutCalendar
    save: typeof saveCheckoutCalendar
  }
  inventoryOverrideReview?: boolean
  legacyFallback?: ReactNode
  onSaved: () => void | Promise<void>
}
const customerActions = {
  load: getCheckoutCalendar,
  save: saveCheckoutCalendar,
}

/** Every mode uses the same server contract. No local holiday, cutoff or ZIP
 * transit calculation is allowed to turn an unavailable date into a promise. */
export default function FulfillmentCalendarPicker({
  cart,
  fulfillmentType,
  shippingOptionId,
  routeId: providedRouteId,
  pickupLocation,
  actions = customerActions,
  inventoryOverrideReview = false,
  legacyFallback,
  onSaved,
}: Props) {
  const [chosenRouteId, setChosenRouteId] = useState("")
  const [overrideConfirmed, setOverrideConfirmed] = useState(false)
  const routeId = providedRouteId ?? chosenRouteId
  const chooseRoute =
    fulfillmentType === "southeast_pickup" && providedRouteId === undefined
  const [page, setPage] = useState<FulfillmentCalendarPage | null>(null)
  const [selected, setSelected] = useState<FulfillmentCalendarChoice | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [legacy, setLegacy] = useState(false)
  const notice = useRef<HTMLParagraphElement>(null)
  const sequence = useRef(0)
  const savingRef = useRef(false)
  const key = `${calendarViewKey(cart)}|${fulfillmentType}|${
    shippingOptionId || ""
  }|${routeId || ""}`
  const currentKey = useRef(key)
  currentKey.current = key
  const pickup =
    fulfillmentType === "plant_pickup" || fulfillmentType === "southeast_pickup"

  const load = useCallback(async () => {
    const request = ++sequence.current
    setLoading(true)
    setPage(null)
    setSelected(null)
    setOverrideConfirmed(false)
    setMessage(null)
    setExpired(false)
    setLegacy(false)
    try {
      const result = await actions.load({
        cartId: cart.id,
        fulfillmentType,
        shippingOptionId,
        routeId,
      })
      if (sequence.current !== request || currentKey.current !== key) return
      if (result.ok) setPage(result.data)
      else if (result.legacy) {
        setLegacy(true)
        setMessage("Refresh dates to check your order’s current schedule.")
      }
      else setMessage(result.error)
    } catch {
      if (sequence.current === request && currentKey.current === key)
        setMessage("We couldn’t load available dates. Please try again.")
    } finally {
      if (sequence.current === request && currentKey.current === key)
        setLoading(false)
    }
  }, [cart.id, fulfillmentType, shippingOptionId, routeId, key, actions.load])

  useEffect(() => {
    void load()
    return () => {
      sequence.current++
    }
  }, [load])

  // Use the server's lifetime, not the shopper's wall clock. Submission still
  // rechecks the exact cutoff, including time spent in transit or a sleeping tab.
  useEffect(() => {
    if (!page) return
    const lifetime =
      Date.parse(page.calendar.expiresAt) -
      Date.parse(page.calendar.generatedAt)
    const expire = () => {
      setExpired(true)
      setSelected(null)
      setMessage(
        "These dates need to be checked again. Refresh dates before continuing."
      )
    }
    const timer = window.setTimeout(expire, Math.max(0, lifetime))
    const resume = () => {
      if (document.visibilityState === "visible") expire()
    }
    document.addEventListener("visibilitychange", resume)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [page])

  useEffect(() => {
    if (message) notice.current?.focus()
  }, [message])

  const save = async () => {
    if (
      !selected ||
      !page ||
      savingRef.current ||
      expired ||
      (inventoryOverrideReview && !overrideConfirmed)
    )
      return
    savingRef.current = true
    setSaving(true)
    setMessage(null)
    const requestKey = key
    const request = sequence.current
    try {
      const result = await actions.save({
        cartId: cart.id,
        pickupLocation,
        choice: {
          arrivalDate: selected.arrivalDate,
          windowId: selected.window?.id,
          shippingOptionId: page.shippingOptionId,
          routeId,
          contextRevision: page.contextRevision,
          replacementQuote: page.replacementQuote,
          ...(inventoryOverrideReview
            ? { staffOverrideConfirmed: overrideConfirmed }
            : {}),
        },
      })
      if (currentKey.current !== requestKey || sequence.current !== request)
        return
      if (!result.ok) {
        setMessage(result.error)
        setExpired(true)
        setSelected(null)
      } else if (result.data.state === "changed") {
        setPage(result.data.page)
        setSelected(null)
        setMessage(result.data.message)
      } else {
        await onSaved()
      }
    } catch {
      if (currentKey.current === requestKey && sequence.current === request) {
        setMessage(
          "We couldn’t confirm that date. Refresh dates and try again."
        )
        setExpired(true)
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const empty = page && !page.calendar.choices.length
  if (!loading && legacy && legacyFallback && !hasCalendarPromise(cart.metadata))
    return <>{legacyFallback}</>
  return (
    <section
      className="space-y-4"
      aria-label={pickup ? "Pickup date" : "Arrival date"}
      aria-busy={loading || saving}
    >
      <div>
        <h3 className="text-base font-semibold text-Charcoal">
          {pickup ? "Choose your pickup date" : "Choose your arrival date"}
        </h3>
        <p className="mt-1 text-sm text-Charcoal/70">
          {pickup
            ? "Pickup windows and order cutoffs use Eastern Time."
            : "Choose the day your order should arrive. Order cutoffs use Eastern Time."}
        </p>
      </div>
      {loading && (
        <p role="status" className="text-sm">
          Checking available dates…
        </p>
      )}
      {message && (
        <p
          ref={notice}
          role="alert"
          tabIndex={-1}
          className="text-sm text-red-700 focus:outline focus:outline-2 focus:outline-offset-4"
        >
          {message}
        </p>
      )}
      {chooseRoute && page && (
        <label className="block text-sm font-semibold">
          Pickup location
          <select
            className="mt-2 block min-h-[44px] w-full rounded-md border border-gray-300 bg-white p-2"
            value={routeId}
            disabled={saving}
            onChange={(event) => setChosenRouteId(event.target.value)}
          >
            <option value="">Choose a location</option>
            {page.regionalLocations?.map((location) => (
              <option key={location.id} value={location.id}>
                {location.city}, {location.state}
              </option>
            ))}
          </select>
          {!page.regionalLocations?.length && (
            <span className="mt-2 block font-normal">
              No pickup locations are available for this address. Choose another
              fulfillment method.
            </span>
          )}
        </label>
      )}
      {empty && !(chooseRoute && !routeId) && (
        <p role="status" className="text-sm text-Charcoal/80">
          {page.calendar.unavailableReason === "unknown_route"
            ? "This location doesn’t have a confirmed schedule. Please choose another location or fulfillment method."
            : page.calendar.unavailableReason === "missing_transit"
            ? "Arrival dates aren’t available for this shipping service. Please choose another service or contact us."
            : "No dates are available for this option right now. Please choose another location or fulfillment method."}
        </p>
      )}
      {!loading && !expired && !!page?.calendar.choices.length && (
        <fieldset disabled={saving} className="space-y-3">
          <legend className="sr-only">
            {pickup
              ? "Available pickup dates and windows"
              : "Available arrival dates and windows"}
          </legend>
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
            {page.calendar.choices.map((choice) => {
              const checked = choice === selected
              return (
                <button
                  key={`${choice.arrivalDate}|${choice.window?.id || ""}`}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => {
                    setSelected(choice)
                    setOverrideConfirmed(false)
                  }}
                  className={`min-h-[52px] p-3 text-left border rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    checked
                      ? "border-Charcoal bg-Gold/10"
                      : "border-gray-300 hover:border-Charcoal"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {formatCalendarDate(choice.arrivalDate)}
                  </span>
                  {choice.window && (
                    <span className="block text-sm mt-1">
                      {choice.window.label} ({choice.window.start}–
                      {choice.window.end} ET)
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {inventoryOverrideReview && selected && (
            <label className="flex min-h-[44px] items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={overrideConfirmed}
                onChange={(event) => setOverrideConfirmed(event.target.checked)}
              />
              I have reviewed the inventory exceptions above and confirm their
              approval applies to these quantities and this date.
            </label>
          )}
          <button
            type="button"
            onClick={save}
            disabled={
              !selected ||
              saving ||
              (inventoryOverrideReview && !overrideConfirmed)
            }
            className="w-full min-h-[44px] px-4 py-3 rounded-md bg-Gold text-Charcoal font-semibold disabled:bg-gray-100 disabled:text-gray-500"
          >
            {saving
              ? "Confirming date…"
              : pickup
              ? "Confirm pickup date"
              : "Confirm arrival date"}
          </button>
        </fieldset>
      )}
      {!loading && (
        <button
          type="button"
          onClick={load}
          disabled={saving}
          className="min-h-[44px] text-sm underline underline-offset-4"
        >
          Refresh dates
        </button>
      )}
    </section>
  )
}
