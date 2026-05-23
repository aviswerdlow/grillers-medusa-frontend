"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  InstantSearch,
  Configure,
  useHits,
  useSearchBox,
} from "react-instantsearch"
import { searchLiteClient } from "@lib/algolia"
import { PRODUCT_INDEX } from "@lib/algolia/indexes"
import { hitToProduct } from "@lib/algolia/hit-to-product"
import {
  rankSearchHits,
  searchQueryForAlgolia,
} from "@lib/algolia/search-relevance"
import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"
import { enrichStrapiProductsWithMedusaPrices } from "@lib/data/products"
import StrapiProductGrid from "@modules/collections/components/strapi-product-grid"
import CollectionFilters, {
  type ActiveFilters,
  getActiveFilterCount,
  getEmptyFilters,
  hasActiveFilters,
  filterProducts,
  productsHaveFilters,
} from "@modules/collections/components/collection-filters"
import CollectionPagination from "@modules/collections/components/collection-pagination"

const RESULTS_PER_PAGE = 51

interface SearchResultsProps {
  initialQuery: string
}

// Force the InstantSearch query to match the URL ?q= on mount.
function QuerySync({ q }: { q: string }) {
  const { query, refine } = useSearchBox()
  const algoliaQuery = searchQueryForAlgolia(q)
  useEffect(() => {
    if (algoliaQuery && algoliaQuery !== query) refine(algoliaQuery)
  }, [algoliaQuery, query, refine])
  return null
}

function ResultCount({ count, query }: { count: number; query: string }) {
  const display = query
  if (!display) return null
  return (
    <p className="text-p-md text-Charcoal/70">
      {count} {count === 1 ? "result" : "results"} for{" "}
      <span className="font-bold text-Charcoal">&ldquo;{display}&rdquo;</span>
    </p>
  )
}

function EmptyResults({
  query,
  countryCode,
}: {
  query: string
  countryCode: string
}) {
  return (
    <div className="py-16 text-center">
      <h2 className="text-h3-mobile md:text-h3 font-gyst text-Charcoal mb-3">
        No results for &ldquo;{query}&rdquo;
      </h2>
      <p className="text-p-md text-Charcoal/70 max-w-lg mx-auto mb-8">
        We couldn&apos;t find any products matching that search. Try a broader
        term, check spelling, or browse one of the popular categories below.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {[
          { label: "Beef", href: `/${countryCode}/store` },
          { label: "Chicken", href: `/${countryCode}/store` },
          { label: "Lamb", href: `/${countryCode}/store` },
          { label: "View all", href: `/${countryCode}/store` },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="inline-flex min-h-[44px] items-center px-4 py-2 border border-Charcoal/20 rounded-full text-p-sm font-maison-neue hover:border-Gold hover:text-Gold transition-colors"
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

function SearchBody({
  initialQuery,
  countryCode,
}: {
  initialQuery: string
  countryCode: string
}) {
  const { items } = useHits<any>()
  const { query: liveQuery } = useSearchBox()
  // hitToProduct returns null for stub hits the upstream plugin writes when
  // its transformer returns null/async (#115). Filter them so the grid
  // doesn't render ghost cards.
  const allProducts = useMemo(
    () =>
      items
        .map(hitToProduct)
        .filter((p): p is StrapiCollectionProduct => p !== null),
    [items]
  )

  const [activeFilters, setActiveFilters] = useState<ActiveFilters>(
    getEmptyFilters()
  )
  const [currentPage, setCurrentPage] = useState(1)
  // Mobile filter drawer — collapsed by default so products are the first
  // thing visible. Same pattern as the collection page (#119).
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  useEffect(() => {
    if (!mobileFiltersOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileFiltersOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener("keydown", onKey)
    }
  }, [mobileFiltersOpen])

  const displayQuery = initialQuery.trim() || liveQuery.trim()
  const rankedProducts = useMemo(
    () => rankSearchHits(allProducts, displayQuery),
    [allProducts, displayQuery]
  )

  // Reset page on new query or filter change.
  const filtered = useMemo(
    () => filterProducts(rankedProducts, activeFilters),
    [rankedProducts, activeFilters]
  )

  const totalPages = Math.ceil(filtered.length / RESULTS_PER_PAGE)
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * RESULTS_PER_PAGE
    return filtered.slice(start, start + RESULTS_PER_PAGE)
  }, [filtered, currentPage])

  // Algolia indexes Strapi metadata but does not carry live Medusa prices,
  // so the visible page is hydrated with current Medusa pricing before the
  // grid renders. Falls back silently to Algolia data on Medusa failure.
  const [pricedProducts, setPricedProducts] =
    useState<StrapiCollectionProduct[]>(paginated)
  useEffect(() => {
    let cancelled = false
    setPricedProducts(paginated)
    if (paginated.length === 0) return
    enrichStrapiProductsWithMedusaPrices(paginated, countryCode)
      .then((enriched) => {
        if (!cancelled) setPricedProducts(enriched)
      })
      .catch(() => {
        // keep unpriced fallback
      })
    return () => {
      cancelled = true
    }
  }, [paginated, countryCode])

  const handleFilterChange = (filters: ActiveFilters) => {
    setActiveFilters(filters)
    setCurrentPage(1)
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // Reset to page 1 when the underlying result set changes (new search).
  useEffect(() => {
    setCurrentPage(1)
  }, [rankedProducts.length, displayQuery])

  const showFilters = productsHaveFilters(rankedProducts)
  const isEmpty = displayQuery.length > 0 && rankedProducts.length === 0

  if (isEmpty) {
    return (
      <>
        <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
          <h1 className="text-h2-mobile md:text-h2 font-gyst text-Charcoal">
            Search
          </h1>
          <ResultCount count={rankedProducts.length} query={displayQuery} />
        </div>
        <EmptyResults query={displayQuery} countryCode={countryCode} />
      </>
    )
  }

  return (
    <>
      <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-h2-mobile md:text-h2 font-gyst text-Charcoal">
          Search
        </h1>
        <ResultCount count={filtered.length} query={displayQuery} />
      </div>

      <div
        className={`gap-8 grid grid-cols-1 ${
          showFilters ? "lg:grid-cols-[0.25fr_1fr]" : ""
        }`}
      >
        {showFilters && (
          <div className="hidden lg:block">
            <CollectionFilters
              products={rankedProducts}
              activeFilters={activeFilters}
              onFilterChange={handleFilterChange}
            />
          </div>
        )}

        <main className="flex-1">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            {hasActiveFilters(activeFilters) ? (
              <p className="text-sm text-gray-600">
                Showing {filtered.length} of {rankedProducts.length}
              </p>
            ) : (
              <span />
            )}
            {showFilters && (
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="lg:hidden inline-flex items-center gap-2 h-[44px] px-4 border border-gray-300 rounded-lg bg-white text-Charcoal text-sm font-maison-neue hover:border-Charcoal focus:outline-none focus:ring-1 focus:ring-Gold"
                aria-label={`Open filters${
                  getActiveFilterCount(activeFilters) > 0
                    ? `, ${getActiveFilterCount(activeFilters)} active`
                    : ""
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M2 4h12M4 8h8M6 12h4" strokeLinecap="round" />
                </svg>
                <span>Filters</span>
                {getActiveFilterCount(activeFilters) > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-Charcoal text-white text-xs font-maison-neue-mono">
                    {getActiveFilterCount(activeFilters)}
                  </span>
                )}
              </button>
            )}
          </div>

          <StrapiProductGrid
            products={pricedProducts}
            countryCode={countryCode}
            viewMode="grid"
          />

          {totalPages > 1 && (
            <div className="mt-12">
              <CollectionPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            </div>
          )}
        </main>
      </div>

      {/* Mobile filter bottom sheet — hidden ≥ lg (desktop uses the sidebar). */}
      {showFilters && (
        <div
          className={`lg:hidden fixed inset-0 z-40 ${
            mobileFiltersOpen ? "" : "pointer-events-none"
          }`}
          aria-hidden={!mobileFiltersOpen}
        >
          <div
            onClick={() => setMobileFiltersOpen(false)}
            className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
              mobileFiltersOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Product filters"
            className={`absolute inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[24px] bg-white shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out ${
              mobileFiltersOpen ? "translate-y-0" : "translate-y-full"
            }`}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="h-1 w-12 rounded-full bg-Charcoal/20" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
              <h2 className="text-h4 font-gyst font-bold text-Charcoal">
                Filters
              </h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="w-10 h-10 -mr-2 flex items-center justify-center text-Charcoal hover:bg-Charcoal/5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold"
                aria-label="Close filters"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <CollectionFilters
                products={rankedProducts}
                activeFilters={activeFilters}
                onFilterChange={handleFilterChange}
                hideHeader
              />
            </div>
            <div className="px-5 py-4 border-t border-gray-200 shrink-0">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="w-full h-12 bg-Charcoal text-white font-maison-neue font-bold text-sm uppercase tracking-wide rounded-md hover:bg-Charcoal/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold"
              >
                Show {filtered.length}{" "}
                {filtered.length === 1 ? "result" : "results"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function SearchResults({ initialQuery }: SearchResultsProps) {
  const params = useParams<{ countryCode?: string }>()
  const countryCode = params?.countryCode || "us"

  return (
    <div className="content-container py-10">
      <InstantSearch
        searchClient={searchLiteClient}
        indexName={PRODUCT_INDEX}
        future={{ preserveSharedStateOnUnmount: true }}
      >
        {/* Pull every matching hit so we can filter + paginate client-side
            with the same components the collection page uses. 1000 is the
            Algolia per-request cap and is way above our current catalog. */}
        <Configure hitsPerPage={1000} />
        <QuerySync q={initialQuery} />
        <SearchBody initialQuery={initialQuery} countryCode={countryCode} />
      </InstantSearch>
    </div>
  )
}
