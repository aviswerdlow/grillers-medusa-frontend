"use client"

import React, { useEffect, useId, useRef, useCallback, useState } from "react"

type AddressFields = {
  address_1: string
  city: string
  province: string
  postal_code: string
  country_code: string
}

type AddressAutocompleteProps = {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onAddressSelect: (fields: AddressFields) => void
  name: string
  id?: string
  label: string
  required?: boolean
  autoComplete?: string
  "data-testid"?: string
}

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || ""

type Suggestion = {
  placeId: string
  text: string
}

async function fetchSuggestionsFromAPI(input: string): Promise<Suggestion[]> {
  if (!API_KEY || input.length < 3) return []

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
      },
      body: JSON.stringify({
        input,
        includedPrimaryTypes: ["street_address", "subpremise", "premise"],
        includedRegionCodes: ["us"],
      }),
    })

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

async function fetchPlaceDetails(placeId: string): Promise<AddressFields | null> {
  if (!API_KEY) return null

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?languageCode=en`,
      {
        headers: {
          "X-Goog-Api-Key": API_KEY,
          "X-Goog-FieldMask": "addressComponents",
        },
      }
    )

    if (!res.ok) return null
    const data = await res.json()
    const components: any[] = data.addressComponents || []

    let streetNumber = ""
    let route = ""
    let city = ""
    let state = ""
    let postalCode = ""
    let country = ""

    for (const c of components) {
      const types: string[] = c.types || []
      if (types.includes("street_number")) {
        streetNumber = c.longText || ""
      } else if (types.includes("route")) {
        route = c.longText || ""
      } else if (types.includes("locality")) {
        city = c.longText || ""
      } else if (types.includes("sublocality_level_1") && !city) {
        city = c.longText || ""
      } else if (types.includes("administrative_area_level_1")) {
        state = c.shortText || ""
      } else if (types.includes("postal_code")) {
        postalCode = c.longText || ""
      } else if (types.includes("country")) {
        country = (c.shortText || "").toLowerCase()
      }
    }

    return {
      address_1: streetNumber ? `${streetNumber} ${route}` : route,
      city,
      province: state,
      postal_code: postalCode,
      country_code: country,
    }
  } catch {
    return null
  }
}

const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  onAddressSelect,
  name,
  id,
  label,
  required,
  "data-testid": dataTestId,
}) => {
  const generatedId = useId()
  const inputId = id || `gp-address-${generatedId}`
  const listboxId = `${inputId}-suggestions`
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const onAddressSelectRef = useRef(onAddressSelect)
  onAddressSelectRef.current = onAddressSelect

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e)
      const val = e.target.value
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        const results = await fetchSuggestionsFromAPI(val)
        setSuggestions(results)
        setShowDropdown(results.length > 0)
        setActiveIndex(-1)
      }, 300)
    },
    [onChange]
  )

  const selectSuggestion = useCallback(async (placeId: string, displayText: string) => {
    setShowDropdown(false)
    setSuggestions([])

    // Immediately set the address line to the display text
    const syntheticEvent = {
      target: { name, value: displayText.split(",")[0] },
    } as React.ChangeEvent<HTMLInputElement>
    onChange(syntheticEvent)

    const fields = await fetchPlaceDetails(placeId)
    if (fields) {
      onAddressSelectRef.current(fields)
    }
  }, [name, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || suggestions.length === 0) return

      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === "Enter" && activeIndex >= 0) {
        e.preventDefault()
        const s = suggestions[activeIndex]
        selectSuggestion(s.placeId, s.text)
      } else if (e.key === "Escape") {
        setShowDropdown(false)
      }
    },
    [showDropdown, suggestions, activeIndex, selectSuggestion]
  )

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className="flex flex-col w-full relative">
      <div className="flex relative z-0 w-full txt-compact-medium">
        <input
          ref={inputRef}
          type="text"
          name={name}
          id={inputId}
          placeholder=" "
          required={required}
          autoComplete="off"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          className="pt-4 pb-1 block w-full h-11 px-4 mt-0 bg-ui-bg-field border rounded-md appearance-none focus:outline-none focus:ring-0 focus:shadow-borders-interactive-with-active border-ui-border-base hover:bg-ui-bg-field-hover"
          data-testid={dataTestId}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={showDropdown && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        />
        <label
          htmlFor={inputId}
          className="flex items-center justify-center mx-3 px-1 transition-all absolute duration-300 top-3 -z-1 origin-0 text-ui-fg-subtle"
        >
          {label}
          {required && <span aria-hidden="true" className="text-rose-500">*</span>}
        </label>
      </div>

      {showDropdown && suggestions.length > 0 && (
        <ul
          className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
          role="listbox"
          id={listboxId}
        >
          {suggestions.map((s, i) => (
            <li
              key={s.placeId}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`px-4 py-3 text-sm cursor-pointer transition-colors ${
                i === activeIndex
                  ? "bg-Gold/10 text-Charcoal"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
              onMouseDown={(e) => {
                e.preventDefault()
                selectSuggestion(s.placeId, s.text)
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {s.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AddressAutocomplete
