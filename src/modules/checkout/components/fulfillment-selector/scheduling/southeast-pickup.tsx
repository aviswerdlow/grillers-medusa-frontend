"use client"

import { useMemo, useRef, useEffect } from "react"
import { computeEligibleArrivalDates } from "@lib/util/eligible-arrival-dates"
import {
  normalizePickupState,
  pickupLocationsForState,
  regionalPickupPresentation,
} from "@lib/util/southeast-pickup"

export type SoutheastPickupCity = {
  id: string
  City: string
  State: string
  Address?: string
  ZipCode?: string
  IsActive?: boolean
  AvailableDates: { Date: string }[]
  CutoffDays?: number
  Description?: string
}

type SoutheastPickupSchedulingProps = {
  locations: SoutheastPickupCity[]
  preferredState?: string
  selectedLocationId: string
  selectedDate: string
  onLocationChange: (locationId: string) => void
  onDateChange: (date: string) => void
  onConfirm: () => void
  onBack: () => void
  isSubmitting?: boolean
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  FL: "Florida",
  GA: "Georgia",
  NC: "North Carolina",
  SC: "South Carolina",
  TN: "Tennessee",
  TX: "Texas",
}

function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function formatDateForCart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return `${m}/${d}/${y}`
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

function parseDateParts(dateStr: string): { iso: string; month: string; day: string } {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return {
    iso: dateStr,
    month: date.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(d),
  }
}

function getValidDates(location: SoutheastPickupCity): string[] {
  if (!location.AvailableDates?.length) return []

  // Use the shared eligibility utility so the cutoff logic matches
  // Atlanta Delivery + UPS calendars (#36 / #72). The Strapi `CutoffDays`
  // field is honored as a fallback floor — if it's set to e.g. 3, we drop
  // any date less than 3 days out even when the noon-prior cutoff hasn't fired.
  const cutoffDays = location.CutoffDays ?? 3
  const cutoffMs = cutoffDays * 24 * 60 * 60 * 1000
  const now = new Date()

  const isoList = location.AvailableDates.map((d) => d.Date.split("T")[0])
  const eligibility = computeEligibleArrivalDates({
    method: "southeast_pickup",
    southeastAvailableIso: isoList,
  })

  return Array.from(eligibility.isoSet)
    .filter((iso) => {
      const [y, m, day] = iso.split("-").map(Number)
      const date = new Date(y, m - 1, day)
      return date.getTime() - now.getTime() >= cutoffMs
    })
    .sort()
}

export default function SoutheastPickupScheduling({
  locations,
  preferredState,
  selectedLocationId,
  selectedDate,
  onLocationChange,
  onDateChange,
  onConfirm,
  onBack,
  isSubmitting = false,
}: SoutheastPickupSchedulingProps) {
  const datesSectionRef = useRef<HTMLDivElement>(null)

  const activeLocations = useMemo(() => {
    const active = locations.filter((l) => l.IsActive !== false)
    return pickupLocationsForState(active, preferredState)
  }, [locations, preferredState])

  const pickupPresentation = regionalPickupPresentation(preferredState)
  const preferredStateName =
    STATE_NAMES[normalizePickupState(preferredState)] || preferredState

  const locationDateInfo = useMemo(() => {
    const info: Record<string, { count: number; dates: string[] }> = {}
    for (const loc of activeLocations) {
      const valid = getValidDates(loc)
      info[loc.id] = { count: valid.length, dates: valid }
    }
    return info
  }, [activeLocations])

  const groupedByState = useMemo(() => {
    const groups: Record<string, SoutheastPickupCity[]> = {}
    for (const loc of activeLocations) {
      if (!groups[loc.State]) groups[loc.State] = []
      groups[loc.State].push(loc)
    }
    for (const state of Object.keys(groups)) {
      groups[state].sort((a, b) => a.City.localeCompare(b.City))
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [activeLocations])

  const selectedLocation = activeLocations.find((l) => l.id === selectedLocationId)

  const availableDates = useMemo(() => {
    if (!selectedLocation) return []
    return getValidDates(selectedLocation)
  }, [selectedLocation])

  useEffect(() => {
    if (selectedLocationId && datesSectionRef.current) {
      datesSectionRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [selectedLocationId])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-Gold hover:text-Gold/80 font-medium flex items-center gap-1 transition-colors"
        >
          <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Back
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-Charcoal mb-0.5">
          {selectedLocationId
            ? `Change ${pickupPresentation.title} Location`
            : `Select a ${pickupPresentation.title} Location`}
        </h2>
        <p className="text-sm text-Charcoal/60 mb-4">
          {preferredStateName
            ? `Choose from every active ${preferredStateName} route stop.`
            : "Choose a city near you for scheduled pickup."}
        </p>
      </div>

      <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
        {groupedByState.map(([state, cities]) => (
          <div key={state}>
            <p className="text-[11px] font-bold text-Charcoal/40 uppercase tracking-[0.15em] mb-2">
              {STATE_NAMES[state] || state}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {cities.map((loc) => {
                const isSelected = selectedLocationId === loc.id
                const info = locationDateInfo[loc.id] ?? { count: 0, dates: [] }
                const hasNoDates = info.count === 0
                const previewDates = info.dates.slice(0, 2).map(parseDateParts)
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      if (hasNoDates) return
                      onLocationChange(loc.id)
                      onDateChange("")
                    }}
                    disabled={hasNoDates}
                    className={`
                      w-full text-left rounded-xl border-2 transition-all duration-200 overflow-hidden
                      ${hasNoDates
                        ? "border-gray-100 bg-gray-50/50 cursor-not-allowed"
                        : isSelected
                          ? "border-Gold bg-Gold/5 shadow-sm ring-1 ring-Gold/20"
                          : "border-gray-200 bg-white hover:border-Gold/40 hover:shadow-sm"
                      }
                    `}
                  >
                    <div className="flex items-stretch">
                      <div className="flex-1 px-3.5 py-3 flex flex-col justify-center min-w-0">
                        <span className={`text-sm font-semibold block truncate ${
                          hasNoDates ? "text-Charcoal/30" : isSelected ? "text-Charcoal" : "text-Charcoal/80"
                        }`}>
                          {loc.City}
                        </span>
                        {hasNoDates ? (
                          <span className="block text-[10px] text-Charcoal/25 mt-0.5">
                            No dates yet
                          </span>
                        ) : info.count > 2 ? (
                          <span className={`block text-[10px] mt-0.5 ${isSelected ? "text-Gold/60" : "text-Charcoal/30"}`}>
                            +{info.count - 2} more
                          </span>
                        ) : null}
                      </div>

                      {previewDates.length > 0 && (
                        <div className="flex shrink-0">
                          {previewDates.map((d, i) => (
                            <div
                              key={d.iso}
                              className={`
                                w-11 flex flex-col items-center justify-center py-2
                                ${i === 0
                                  ? isSelected ? "bg-Gold/10" : "bg-gray-50"
                                  : isSelected ? "bg-Gold/[0.06]" : "bg-gray-50/60"
                                }
                                ${i > 0 ? (isSelected ? "border-l border-Gold/10" : "border-l border-gray-100") : ""}
                              `}
                            >
                              <span className={`text-[9px] font-bold uppercase leading-none tracking-wider ${
                                isSelected ? "text-Gold/70" : "text-Charcoal/30"
                              }`}>
                                {d.month}
                              </span>
                              <span className={`text-lg font-bold leading-tight -mt-0.5 ${
                                isSelected ? "text-Gold" : "text-Charcoal/60"
                              }`}>
                                {d.day}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div
        ref={datesSectionRef}
        className={`transition-all duration-300 ease-out overflow-hidden ${
          selectedLocation ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {selectedLocation && (
          <div className="pt-2">
            <div className="h-px bg-gradient-to-r from-transparent via-Charcoal/10 to-transparent mb-4" />

            <h3 className="text-sm font-semibold text-Charcoal mb-2">
              Pickup Date — {selectedLocation.City}, {selectedLocation.State}
            </h3>

            {selectedLocation.Address && (
              <div className="bg-white rounded-xl p-3.5 mb-3 border border-gray-200 shadow-sm">
                <p className="text-[10px] font-bold text-Charcoal/35 uppercase tracking-[0.12em] mb-1">
                  Pickup Location
                </p>
                <p className="text-sm text-Charcoal font-semibold">{selectedLocation.Address}</p>
                <p className="text-sm text-Charcoal/60">
                  {selectedLocation.City}, {selectedLocation.State} {selectedLocation.ZipCode}
                </p>
              </div>
            )}

            {availableDates.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 text-sm text-amber-800">
                No pickup dates are currently scheduled for {selectedLocation.City}. Please check back later or choose a different city.
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                {availableDates.map((dateStr) => {
                  const cartDate = formatDateForCart(dateStr)
                  const isSelected = cartDate === selectedDate
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => onDateChange(cartDate)}
                      className={`
                        w-full text-left px-4 py-3 rounded-xl border-2 transition-all duration-200
                        ${isSelected
                          ? "border-Gold bg-Gold/5 shadow-sm ring-1 ring-Gold/20"
                          : "border-gray-200 bg-white hover:border-Gold/40 hover:shadow-sm"
                        }
                      `}
                    >
                      <span className={`text-sm font-semibold ${isSelected ? "text-Charcoal" : "text-Charcoal/75"}`}>
                        {formatDateDisplay(dateStr)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onConfirm}
        disabled={!selectedLocationId || !selectedDate || isSubmitting}
        className={`
          w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200
          ${selectedLocationId && selectedDate && !isSubmitting
            ? "bg-Gold text-white hover:bg-Gold/90 shadow-md hover:shadow-lg active:scale-[0.99]"
            : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }
        `}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Confirming...
          </span>
        ) : (
          "Confirm Pickup"
        )}
      </button>
    </div>
  )
}
