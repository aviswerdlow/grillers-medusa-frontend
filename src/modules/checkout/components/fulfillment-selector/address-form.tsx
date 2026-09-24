"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button, clx } from "@medusajs/ui"
import {
  getStoredDeliveryZip,
  normalizeDeliveryZip,
  storeDeliveryZip,
} from "@lib/util/delivery-zip"
import { ATLANTA_DELIVERY_ZIP_DAYS } from "@lib/util/atlanta-delivery-zips"

export type DeliveryAddress = {
  firstName: string
  lastName: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
}

type AddressFormProps = {
  initialAddress?: DeliveryAddress | null
  onSubmit: (address: DeliveryAddress) => void
  onBack: () => void
  atlantaZipCodes: string[]
  isSubmitting?: boolean
  // "atlanta" enforces the local-delivery ZIP allow-list, the Georgia
  // state allow-list, and uses Atlanta-specific copy. "general" allows any
  // US state and skips ZIP gating — used by the checkout "save your
  // delivery address" flow.
  mode?: "atlanta" | "general"
  submitLabel?: string
  intent?: "add" | "edit"
}

const FALLBACK_ATLANTA_ZIP_CODES = Object.keys(ATLANTA_DELIVERY_ZIP_DAYS)

// Atlanta delivery is local-only. The general address flow below still allows
// any US state so out-of-area customers can save a real shipping address.
const ATLANTA_DELIVERY_STATES = [{ value: "GA", label: "Georgia" }]

// Full US state list — used for the "save your delivery address" flow so
// any customer can save their actual address to their profile.
const ALL_US_STATES = [
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
]

// Google Places Autocomplete (matches the main shipping-address flow).
const PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""
type PlaceSuggestion = { placeId: string; text: string }
async function fetchPlaceSuggestions(
  input: string
): Promise<PlaceSuggestion[]> {
  if (!PLACES_API_KEY || input.length < 3) return []
  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": PLACES_API_KEY,
        },
        body: JSON.stringify({
          input,
          includedPrimaryTypes: ["street_address", "subpremise", "premise"],
          includedRegionCodes: ["us"],
        }),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.suggestions || [])
      .filter((s: any) => s.placePrediction)
      .slice(0, 5)
      .map((s: any) => ({
        placeId: s.placePrediction.placeId,
        text: s.placePrediction.text.text,
      }))
  } catch {
    return []
  }
}
type PlaceAddressFields = {
  address_1: string
  city: string
  province: string
  postal_code: string
}
async function fetchPlaceDetails(
  placeId: string
): Promise<PlaceAddressFields | null> {
  if (!PLACES_API_KEY) return null
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?languageCode=en`,
      {
        headers: {
          "X-Goog-Api-Key": PLACES_API_KEY,
          "X-Goog-FieldMask": "addressComponents",
        },
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    let streetNumber = "",
      route = "",
      city = "",
      state = "",
      postal = ""
    for (const c of (data.addressComponents || []) as any[]) {
      const types: string[] = c.types || []
      if (types.includes("street_number")) streetNumber = c.longText || ""
      else if (types.includes("route")) route = c.longText || ""
      else if (types.includes("locality")) city = c.longText || ""
      else if (types.includes("sublocality_level_1") && !city)
        city = c.longText || ""
      else if (types.includes("administrative_area_level_1"))
        state = c.shortText || ""
      else if (types.includes("postal_code")) postal = c.longText || ""
    }
    return {
      address_1: streetNumber ? `${streetNumber} ${route}` : route,
      city,
      province: state,
      postal_code: postal,
    }
  } catch {
    return null
  }
}

export default function AddressForm({
  initialAddress,
  onSubmit,
  onBack,
  atlantaZipCodes,
  isSubmitting = false,
  mode = "atlanta",
  submitLabel,
  intent = "add",
}: AddressFormProps) {
  const isGeneral = mode === "general"
  const isEditing = intent === "edit"
  const stateOptions = isGeneral ? ALL_US_STATES : ATLANTA_DELIVERY_STATES
  const [address, setAddress] = useState<DeliveryAddress>({
    firstName: initialAddress?.firstName || "",
    lastName: initialAddress?.lastName || "",
    address: initialAddress?.address || "",
    city: initialAddress?.city || "",
    state: initialAddress?.state || "GA",
    zip: initialAddress?.zip || "",
    phone: initialAddress?.phone || "",
  })

  const [zipError, setZipError] = useState<string | null>(null)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  useEffect(() => {
    if (initialAddress?.zip || address.zip) return
    const savedZip = getStoredDeliveryZip()
    if (savedZip) {
      setAddress((prev) => ({ ...prev, zip: savedZip }))
    }
  }, [address.zip, initialAddress?.zip])

  // Google Places autocomplete state for the Street Address field.
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  const wrapperRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const handleStreetChange = useCallback((val: string) => {
    setAddress((prev) => ({ ...prev, address: val }))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const results = await fetchPlaceSuggestions(val)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
      setActiveSuggestion(-1)
    }, 300)
  }, [])

  const selectSuggestion = useCallback(async (s: PlaceSuggestion) => {
    setShowSuggestions(false)
    setSuggestions([])
    const fields = await fetchPlaceDetails(s.placeId)
    if (fields) {
      setAddress((prev) => ({
        ...prev,
        address: fields.address_1 || s.text.split(",")[0] || prev.address,
        city: fields.city || prev.city,
        state: fields.province || prev.state,
        zip: fields.postal_code || prev.zip,
      }))
    } else {
      // Fallback: at least populate the street line from the suggestion text.
      setAddress((prev) => ({
        ...prev,
        address: s.text.split(",")[0] || prev.address,
      }))
    }
  }, [])

  // Validate ZIP against Atlanta delivery zone (skipped in general mode).
  useEffect(() => {
    if (isGeneral) {
      setZipError(null)
      return
    }
    if (address.zip.length === 5) {
      const zip = normalizeDeliveryZip(address.zip)
      const activeAtlantaZipCodes =
        atlantaZipCodes.length > 0
          ? atlantaZipCodes.map((code) => normalizeDeliveryZip(code))
          : FALLBACK_ATLANTA_ZIP_CODES
      const isValidZip = activeAtlantaZipCodes.includes(zip)
      if (!isValidZip) {
        setZipError(
          "Atlanta delivery is not available for this ZIP. Please choose pickup or shipping instead."
        )
      } else {
        setZipError(null)
      }
    } else {
      setZipError(null)
    }
  }, [address.zip, atlantaZipCodes, isGeneral])

  const handleChange = (field: keyof DeliveryAddress, value: string) => {
    // Clean up phone and zip inputs
    if (field === "phone") {
      value = value.replace(/\D/g, "").slice(0, 10)
    }
    if (field === "zip") {
      value = normalizeDeliveryZip(value)
      storeDeliveryZip(value)
    }

    setAddress((prev) => ({ ...prev, [field]: value }))
  }

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  const isValid =
    address.firstName.trim() &&
    address.lastName.trim() &&
    address.address.trim() &&
    address.city.trim() &&
    address.state &&
    address.zip.length === 5 &&
    address.phone.length === 10 &&
    !zipError

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitAttempted(true)
    setTouched({
      firstName: true,
      lastName: true,
      address: true,
      city: true,
      zip: true,
      phone: true,
    })
    if (isValid) {
      onSubmit(address)
    }
  }

  // Show field-level errors when the field has been touched OR after a
  // submit attempt — so first-pass clicking Save reveals all missing fields.
  const showError = (field: keyof DeliveryAddress) =>
    submitAttempted || touched[field]

  const formatPhone = (phone: string) => {
    if (phone.length === 0) return ""
    if (phone.length <= 3) return `(${phone}`
    if (phone.length <= 6) return `(${phone.slice(0, 3)}) ${phone.slice(3)}`
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="text-Gold hover:text-Gold/80 text-sm mb-4 flex items-center gap-1"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back
      </button>

      <h2 className="text-2xl font-bold mb-2">
        {isGeneral
          ? isEditing
            ? "Edit your delivery address"
            : "Add your delivery address"
          : "Where should we deliver?"}
      </h2>
      <p className="text-gray-600 mb-6">
        {isGeneral
          ? isEditing
            ? "We'll update your saved address and use it to check what local delivery and pickup options are available."
            : "We'll save it to your profile and use it to check what local delivery and pickup options are available."
          : "Enter your delivery address. Delivery is available only for eligible Atlanta-area ZIP codes."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Name Row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="firstName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              First Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              id="firstName"
              required
              aria-required="true"
              aria-invalid={
                showError("firstName") && !address.firstName.trim()
                  ? true
                  : undefined
              }
              value={address.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              onBlur={() => handleBlur("firstName")}
              className={clx(
                "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Gold focus:border-transparent",
                {
                  "border-red-300":
                    showError("firstName") && !address.firstName.trim(),
                  "border-gray-300": !(
                    showError("firstName") && !address.firstName.trim()
                  ),
                }
              )}
              placeholder="John"
            />
            {showError("firstName") && !address.firstName.trim() && (
              <p className="mt-1 text-xs text-red-600">
                First name is required
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="lastName"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Last Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              id="lastName"
              required
              aria-required="true"
              aria-invalid={
                showError("lastName") && !address.lastName.trim()
                  ? true
                  : undefined
              }
              value={address.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              onBlur={() => handleBlur("lastName")}
              className={clx(
                "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Gold focus:border-transparent",
                {
                  "border-red-300":
                    showError("lastName") && !address.lastName.trim(),
                  "border-gray-300": !(
                    showError("lastName") && !address.lastName.trim()
                  ),
                }
              )}
              placeholder="Doe"
            />
            {showError("lastName") && !address.lastName.trim() && (
              <p className="mt-1 text-xs text-red-600">Last name is required</p>
            )}
          </div>
        </div>

        {/* Address — Google Places autocomplete */}
        <div ref={wrapperRef} className="relative">
          <label
            htmlFor="address"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Street Address <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            id="address"
            required
            aria-required="true"
            aria-invalid={
              showError("address") && !address.address.trim() ? true : undefined
            }
            autoComplete="off"
            role="combobox"
            aria-expanded={showSuggestions}
            aria-autocomplete="list"
            value={address.address}
            onChange={(e) => handleStreetChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onKeyDown={(e) => {
              if (!showSuggestions || suggestions.length === 0) return
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setActiveSuggestion((p) =>
                  Math.min(p + 1, suggestions.length - 1)
                )
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setActiveSuggestion((p) => Math.max(p - 1, 0))
              } else if (e.key === "Enter" && activeSuggestion >= 0) {
                e.preventDefault()
                selectSuggestion(suggestions[activeSuggestion])
              } else if (e.key === "Escape") setShowSuggestions(false)
            }}
            onBlur={() => handleBlur("address")}
            className={clx(
              "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Gold focus:border-transparent",
              {
                "border-red-300":
                  showError("address") && !address.address.trim(),
                "border-gray-300": !(
                  showError("address") && !address.address.trim()
                ),
              }
            )}
            placeholder="123 Main St"
          />
          {showError("address") && !address.address.trim() && (
            <p className="mt-1 text-xs text-red-600">
              Street address is required
            </p>
          )}
          {showSuggestions && suggestions.length > 0 && (
            <ul
              className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
              role="listbox"
            >
              {suggestions.map((s, i) => (
                <li
                  key={s.placeId}
                  role="option"
                  aria-selected={i === activeSuggestion}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                    i === activeSuggestion
                      ? "bg-Gold/10 text-Charcoal"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectSuggestion(s)
                  }}
                  onMouseEnter={() => setActiveSuggestion(i)}
                >
                  {s.text}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* City, State, ZIP Row */}
        <div className="grid grid-cols-6 gap-4">
          <div className="col-span-3">
            <label
              htmlFor="city"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              City <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              id="city"
              required
              aria-required="true"
              aria-invalid={
                showError("city") && !address.city.trim() ? true : undefined
              }
              value={address.city}
              onChange={(e) => handleChange("city", e.target.value)}
              onBlur={() => handleBlur("city")}
              className={clx(
                "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Gold focus:border-transparent",
                {
                  "border-red-300": showError("city") && !address.city.trim(),
                  "border-gray-300": !(
                    showError("city") && !address.city.trim()
                  ),
                }
              )}
              placeholder="Atlanta"
            />
            {showError("city") && !address.city.trim() && (
              <p className="mt-1 text-xs text-red-600">City is required</p>
            )}
          </div>
          <div className="col-span-1">
            <label
              htmlFor="state"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              State <span className="text-rose-500">*</span>
            </label>
            <select
              id="state"
              required
              aria-required="true"
              value={address.state}
              onChange={(e) => handleChange("state", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-Gold focus:border-transparent bg-white"
            >
              {stateOptions.map((state) => (
                <option key={state.value} value={state.value}>
                  {state.value}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label
              htmlFor="zip"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              ZIP Code <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              id="zip"
              required
              aria-required="true"
              aria-invalid={
                showError("zip") && address.zip.length !== 5 ? true : undefined
              }
              inputMode="numeric"
              value={address.zip}
              onChange={(e) => handleChange("zip", e.target.value)}
              onBlur={() => handleBlur("zip")}
              className={clx(
                "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Gold focus:border-transparent",
                {
                  "border-red-300":
                    Boolean(zipError) ||
                    (showError("zip") && address.zip.length !== 5),
                  "border-gray-300":
                    !zipError &&
                    !(showError("zip") && address.zip.length !== 5),
                }
              )}
              placeholder="30301"
              maxLength={5}
            />
            {showError("zip") && address.zip.length !== 5 && !zipError && (
              <p className="mt-1 text-xs text-red-600">5-digit ZIP required</p>
            )}
          </div>
        </div>

        {/* ZIP Error */}
        {zipError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 flex items-center gap-2">
              <svg
                className="w-4 h-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              {zipError}
            </p>
          </div>
        )}

        {/* Phone */}
        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Phone Number <span className="text-rose-500">*</span>
          </label>
          <input
            type="tel"
            id="phone"
            required
            aria-required="true"
            aria-invalid={
              showError("phone") && address.phone.length !== 10
                ? true
                : undefined
            }
            inputMode="numeric"
            value={formatPhone(address.phone)}
            onChange={(e) =>
              handleChange("phone", e.target.value.replace(/\D/g, ""))
            }
            onBlur={() => handleBlur("phone")}
            className={clx(
              "w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-Gold focus:border-transparent",
              {
                "border-red-300":
                  showError("phone") && address.phone.length !== 10,
                "border-gray-300": !(
                  showError("phone") && address.phone.length !== 10
                ),
              }
            )}
            placeholder="(404) 555-1234"
          />
          {showError("phone") && address.phone.length !== 10 ? (
            <p className="mt-1 text-xs text-red-600">
              10-digit phone number required
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              We&apos;ll text you delivery updates
            </p>
          )}
        </div>

        {/* Info Banner — Atlanta-only flow */}
        {!isGeneral && (
          <div className="p-3 bg-Gold/10 border border-Gold/30 rounded-lg">
            <p className="text-sm text-Charcoal flex items-center gap-2">
              <svg
                className="w-4 h-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Delivery is available only for eligible Atlanta-area ZIP codes
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          size="large"
          disabled={!isValid || isSubmitting}
          isLoading={isSubmitting}
        >
          {submitLabel ||
            (isGeneral
              ? isEditing
                ? "Update Address"
                : "Save Address"
              : "Continue to Schedule")}
        </Button>
      </form>
    </div>
  )
}
