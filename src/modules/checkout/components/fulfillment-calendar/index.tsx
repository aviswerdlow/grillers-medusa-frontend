"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { StoreCart } from "@medusajs/types"
import {
  getCheckoutCalendar,
  saveCheckoutCalendar,
  type FulfillmentType,
} from "@lib/data/cart"
import {
  calendarViewKey,
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
  onSaved: () => void
}

/** Every mode uses the same server contract. No local holiday, cutoff or ZIP
 * transit calculation is allowed to turn an unavailable date into a promise. */
export default function FulfillmentCalendarPicker({
  cart,
  fulfillmentType,
  shippingOptionId,
  routeId,
  pickupLocation,
  onSaved,
}: Props) {
  const [page, setPage] = useState<FulfillmentCalendarPage | null>(null)
  const [selected, setSelected] = useState<FulfillmentCalendarChoice | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
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
    setMessage(null)
    setExpired(false)
    try {
      const result = await getCheckoutCalendar({
        cartId: cart.id,
        fulfillmentType,
        shippingOptionId,
        routeId,
      })
      if (sequence.current !== request || currentKey.current !== key) return
      if (result.ok) setPage(result.data)
      else setMessage(result.error)
    } catch {
      if (sequence.current === request && currentKey.current === key)
        setMessage("We couldn’t load available dates. Please try again.")
    } finally {
      if (sequence.current === request && currentKey.current === key)
        setLoading(false)
    }
  }, [cart.id, fulfillmentType, shippingOptionId, routeId, key])

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
    if (!selected || !page || savingRef.current || expired) return
    savingRef.current = true
    setSaving(true)
    setMessage(null)
    const requestKey = key
    const request = sequence.current
    try {
      const result = await saveCheckoutCalendar({
        cartId: cart.id,
        pickupLocation,
        choice: {
          arrivalDate: selected.arrivalDate,
          windowId: selected.window?.id,
          shippingOptionId: page.shippingOptionId,
          routeId,
          contextRevision: page.contextRevision,
          replacementQuote: page.replacementQuote,
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
        onSaved()
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
      {empty && (
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
                  onClick={() => setSelected(choice)}
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
          <button
            type="button"
            onClick={save}
            disabled={!selected || saving}
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
