"use client"

import { Fragment, useCallback, useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  Combobox,
  ComboboxInput,
  ComboboxButton,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react"
import {
  InstantSearch,
  Configure,
  useSearchBox,
  useHits,
} from "react-instantsearch"
import { searchLiteClient } from "@lib/algolia"
import { PRODUCT_INDEX } from "@lib/algolia/indexes"
import { rankSearchHits } from "@lib/algolia/search-relevance"
import { trackSearch } from "@lib/gtm"
import { jitsuTrack } from "@lib/jitsu"
import { formatProductPriceDisplay } from "@lib/util/price-display"

type Product = {
  objectID: string
  Title: string
  FeaturedImage?: { url: string }
  MedusaProduct?: {
    Handle: string
    PricingMode?: "per_lb" | "fixed_price"
    Variants?: Array<{
      Sku?: string
      Price?: { CalculatedPriceNumber: number }
    }>
  }
  Metadata?: {
    AvgPackWeight?: string
    PricingMode?: "per_lb" | "fixed_price"
  }
  [key: string]: any
}

const ClearButton = ({ onClick }: { onClick: () => void }) => (
  <ComboboxButton
    onClick={onClick}
    className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
  >
    <Image
      src="/images/icons/x-mark.svg"
      alt="Clear search"
      width={19}
      height={19}
    />
  </ComboboxButton>
)

const SearchIcon = () => (
  <div className="absolute right-3 top-1/2 -translate-y-1/2 p-1 pointer-events-none">
    <Image
      src="/images/icons/magnifier.svg"
      alt="Search icon"
      width={19}
      height={19}
    />
  </div>
)

function InstantComboboxInput({
  onSubmitQuery,
}: {
  onSubmitQuery: (q: string) => void
}) {
  const { query, refine, clear } = useSearchBox()
  const lastTrackedQuery = useRef<string>("")

  // Track search event with debounce (when query is at least 3 chars and different)
  useEffect(() => {
    if (query.length >= 3 && query !== lastTrackedQuery.current) {
      const timer = setTimeout(() => {
        trackSearch(query)
        jitsuTrack("search_performed", { search_term: query })
        lastTrackedQuery.current = query
      }, 500) // 500ms debounce
      return () => clearTimeout(timer)
    }
  }, [query])

  return (
    <div className="relative">
      <ComboboxInput
        className="w-full h-[50px] border rounded-[5px] border-Charcoal px-5 py-3 focus:outline-none focus:border-gray-500 text-p-md text-Charcoal placeholder:text-Pewter focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
        placeholder="Search products…"
        value={query}
        onChange={(e) => refine(e.target.value)}
        onKeyDown={(e) => {
          // Enter always routes to the full results page (#40). Clicking a
          // row still navigates to the PDP. Stopping propagation prevents
          // Headless UI's Combobox from auto-selecting the focused option.
          if (e.key !== "Enter") return
          const target = e.target as HTMLInputElement
          const q = (target.value || "").trim()
          if (!q) return
          e.preventDefault()
          e.stopPropagation()
          onSubmitQuery(q)
        }}
        displayValue={(hit: Product) => hit?.Title || ""}
        aria-label="Search products"
        aria-autocomplete="list"
      />
      {query ? <ClearButton onClick={clear} /> : <SearchIcon />}
    </div>
  )
}

function formatPrice(price: number | undefined): string | null {
  if (price == null) return null
  return `$${price.toFixed(2)}`
}

function InstantComboboxOptions({
  countryCode,
  onSubmitQuery,
}: {
  countryCode: string
  onSubmitQuery: (q: string) => void
}) {
  const { items } = useHits<Product>()
  const { query } = useSearchBox()
  const trimmedQuery = query.trim()
  const showAllResultsLink = trimmedQuery.length >= 2
  const rankedItems = rankSearchHits(items, trimmedQuery)

  return (
    <>
      {/* ARIA live region for search results */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {query.length >= 2 &&
          (rankedItems.length === 0
            ? "No results found"
            : `${rankedItems.length} result${
                rankedItems.length !== 1 ? "s" : ""
              } found`)}
      </div>

      <ComboboxOptions
        className="absolute z-50 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-96 overflow-auto"
        aria-label="Search results"
      >
        {rankedItems.length === 0 ? (
          <div
            className="px-4 py-3 text-p-md text-Pewter"
            role="option"
            aria-selected="false"
          >
            {showAllResultsLink ? (
              <>
                No quick matches.{" "}
                <button
                  type="button"
                  onClick={() => onSubmitQuery(trimmedQuery)}
                  className="text-Gold hover:text-Gold/80 font-semibold"
                >
                  Search all products for &ldquo;{trimmedQuery}&rdquo; →
                </button>
              </>
            ) : (
              "Start typing to search…"
            )}
          </div>
        ) : (
          <>
            {rankedItems.map((item) => {
              const price =
                item.MedusaProduct?.Variants?.[0]?.Price?.CalculatedPriceNumber
              // Resolve per-lb vs fixed-price the same way PDP/PLP do so
              // search dropdown never shows `$packPrice per lb` for a
              // fixed-price item, or `$packPrice` for a catch-weight one.
              // Codex review follow-up to #104/#31.
              const priceDisplay = price
                ? formatProductPriceDisplay(
                    price,
                    item.Metadata,
                    item.MedusaProduct?.Variants?.[0]?.Sku,
                    (
                      item.MedusaProduct as
                        | { PricingMode?: "per_lb" | "fixed_price" }
                        | undefined
                    )?.PricingMode
                  )
                : null
              const imageUrl = item.FeaturedImage?.url
              const handle = item.MedusaProduct?.Handle
              const href = handle ? `/${countryCode}/products/${handle}` : "#"

              return (
                <ComboboxOption key={item.objectID} value={item} as={Fragment}>
                  {({ focus }) => (
                    <Link
                      href={href}
                      className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-b-0 ${
                        focus ? "bg-gray-50" : ""
                      }`}
                    >
                      {/* Product image */}
                      <div className="w-12 h-12 rounded bg-gray-100 shrink-0 overflow-hidden">
                        {imageUrl ? (
                          <Image
                            src={imageUrl}
                            alt={item.Title || "Product"}
                            width={48}
                            height={48}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <rect x="3" y="3" width="18" height="18" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="m21 15-5-5L5 21" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Title and price (consistent row — falls back to "View →" when price isn't indexed) */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-Charcoal truncate">
                          {item.Title}
                        </p>
                        <p className="text-sm text-Charcoal/70 mt-0.5">
                          {priceDisplay ? (
                            <>
                              <span className="font-semibold text-Charcoal">
                                {priceDisplay.primary}
                              </span>
                              {priceDisplay.primaryLabel && (
                                <span className="text-xs text-Charcoal/50 ml-1">
                                  {priceDisplay.primaryLabel}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-Gold font-medium">
                              View product →
                            </span>
                          )}
                        </p>
                      </div>
                    </Link>
                  )}
                </ComboboxOption>
              )
            })}
            {showAllResultsLink && (
              <button
                type="button"
                onClick={() => onSubmitQuery(trimmedQuery)}
                className="block w-full text-left px-3 py-2.5 text-sm font-semibold text-Gold hover:bg-Scroll/30 border-t border-gray-100"
              >
                See all results for &ldquo;{trimmedQuery}&rdquo; →
              </button>
            )}
          </>
        )}
      </ComboboxOptions>
    </>
  )
}

export default function SearchBar() {
  const router = useRouter()
  const params = useParams<{ countryCode?: string }>()
  const countryCode = params?.countryCode || "us"

  const onSubmitQuery = useCallback(
    (q: string) => {
      router.push(`/${countryCode}/search?q=${encodeURIComponent(q)}`)
    },
    [router, countryCode]
  )

  // Combobox onChange is a no-op — rows are real Links, so click navigates,
  // and Enter is intercepted in the input's keydown to always go to /search.
  return (
    <InstantSearch
      searchClient={searchLiteClient}
      indexName={PRODUCT_INDEX}
      stalledSearchDelay={200}
    >
      <Configure hitsPerPage={10} />

      <Combobox onChange={() => {}}>
        <div className="relative w-full max-w-md mx-auto">
          <InstantComboboxInput onSubmitQuery={onSubmitQuery} />
          <InstantComboboxOptions
            countryCode={countryCode}
            onSubmitQuery={onSubmitQuery}
          />
        </div>
      </Combobox>
    </InstantSearch>
  )
}
