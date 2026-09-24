"use client"

import { useMemo, useCallback, useState, useEffect } from "react"
import { Calendar } from "@medusajs/ui"
import { today, getLocalTimeZone, fromDate } from "@internationalized/date"
import { HttpTypes } from "@medusajs/types"
import useSWR from "swr"
import strapiClient from "@lib/strapi"
import {
  CheckoutShippingBlackoutQuery,
  type CheckoutShippingBlackoutData,
} from "@lib/data/strapi/checkout"
import Spinner from "@modules/common/icons/spinner"

type UPSShippingSchedulingProps = {
  cart: HttpTypes.StoreCart
  selectedDate: string
  onDateChange: (date: string) => void
}

const timeZone = getLocalTimeZone()
const MIN_DATE = today(timeZone).toDate(timeZone)

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

type Checkout = CheckoutShippingBlackoutData["checkout"]

const fetcher = async (): Promise<Checkout | null> => {
  try {
    const res = await strapiClient.request<CheckoutShippingBlackoutData>(
      CheckoutShippingBlackoutQuery
    )
    return res.checkout
  } catch {
    return null
  }
}

export default function UPSShippingScheduling({
  cart,
  selectedDate,
  onDateChange,
}: UPSShippingSchedulingProps) {
  // Fetch blackout rules from Strapi
  const { data: checkout, isLoading } = useSWR<Checkout | null>(
    "checkout-blackout",
    fetcher
  )

  // Compute blocked weekdays & dates
  const blockedWeekdays = useMemo(
    () =>
      checkout?.ShippingBlackoutDaysOfWeek.map((d) =>
        WEEKDAY_NAMES.indexOf(d)
      ) ?? [],
    [checkout]
  )

  const blockedDates = useMemo(
    () =>
      new Set(checkout?.ShippingBlackoutDates.map((d) => d.BlackoutDate) ?? []),
    [checkout]
  )

  // Convert selectedDate to Date object for Calendar
  const dateValue = useMemo(() => {
    if (!selectedDate) return null
    const [m, d, y] = selectedDate.split("/").map(Number)
    return new Date(y, m - 1, d)
  }, [selectedDate])

  // Disable any blocked day or date
  const isDateUnavailable = useCallback(
    (d: Date) => {
      const wd = fromDate(d, timeZone).toDate().getDay()
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, "0")
      const dd = String(d.getDate()).padStart(2, "0")
      const iso = `${yyyy}-${mm}-${dd}`
      return blockedDates.has(iso) || blockedWeekdays.includes(wd)
    },
    [blockedWeekdays, blockedDates]
  )

  const handleDateChange = (date: Date | null) => {
    if (date) {
      const usaDate = date.toLocaleDateString("en-US")
      onDateChange(usaDate)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={36} />
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">When should it arrive?</h2>
      <p className="text-gray-600 mb-6">
        Select your preferred delivery date. We&apos;ll ship your order to arrive on
        or before this date.
      </p>

      <div className="flex justify-center">
        <Calendar
          value={dateValue}
          onChange={handleDateChange}
          aria-label="Select your desired delivery date"
          minValue={MIN_DATE}
          isDateUnavailable={isDateUnavailable}
        />
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded" />
          <span>Not Available</span>
        </div>
      </div>

      {selectedDate && (
        <div className="mt-4 p-3 bg-Gold/10 border border-Gold/30 rounded-md">
          <p className="text-sm">
            <span className="font-medium">Expected delivery by:</span> {selectedDate}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            *This is an estimate. Specific days are not guaranteed due to
            shipping logistics.
          </p>
        </div>
      )}
    </div>
  )
}
