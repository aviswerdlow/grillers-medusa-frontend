"use client"

import { useMemo, useState, useRef, useEffect, useCallback } from "react"
import { jitsuTrack } from "@lib/jitsu"
import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"
import {
  FDA_MAJOR_ALLERGENS,
  getProductAllergenKeys,
  hasApprovedIngredientDisclosure,
  productContainsAnyAllergen,
  type AllergenKey,
} from "@lib/util/product-allergens"

type MetadataField = NonNullable<StrapiCollectionProduct["Metadata"]>
type BoolMetadataKey = {
  [K in keyof MetadataField]: MetadataField[K] extends boolean | undefined ? K : never
}[keyof MetadataField]

type FacetGroupDef = {
  id: string
  label: string
  options: Array<{ field: BoolMetadataKey; label: string }>
  includeAnyOption?: boolean
  minVisibleOptions?: number
  hideWhenNonDistinct?: boolean
}

const HECHSHER_FILTER_OPTIONS: FacetGroupDef["options"] = [
  { field: "ChassidishShchita", label: "Chassidish Shchita" },
  { field: "CHK", label: "CHK" },
  { field: "RabbiWeissmandl", label: "Rabbi Weissmandl" },
  { field: "OU", label: "OU" },
  { field: "StarK", label: "Star-K" },
  { field: "RabbiTeitelbaum", label: "Rabbi Teitelbaum" },
  { field: "CRC", label: "CRC (Brooklyn)" },
  { field: "Lubavitch", label: "Lubavitch" },
]

const FACET_GROUPS: FacetGroupDef[] = [
  {
    id: "cookState",
    label: "Cooking State",
    options: [
      { field: "Uncooked", label: "Uncooked" },
      { field: "Cooked", label: "Ready to Eat" },
      { field: "HeatAndServe", label: "Heat & Serve" },
    ],
  },
  {
    id: "diet",
    label: "Dietary",
    options: [
      { field: "GlutenFree", label: "Gluten Free" },
      { field: "MSG", label: "No MSG" },
      { field: "AntibioticFree", label: "Antibiotic Free" },
      { field: "HormoneFree", label: "Hormone Free" },
      { field: "NoSteroids", label: "No Steroids" },
      { field: "NoNitrites", label: "No Nitrites" },
      { field: "NoNitrates", label: "No Nitrates" },
      { field: "Organic", label: "Organic" },
    ],
  },
  {
    id: "sourcing",
    label: "Sourcing",
    options: [
      { field: "Angus", label: "Angus" },
      { field: "GrassFed", label: "Grass-Fed" },
      { field: "FreeRange", label: "Free-Range" },
      { field: "SouthAmerican", label: "South American" },
      { field: "GrainFree", label: "Grain-Free" },
    ],
  },
  {
    id: "cut",
    label: "Cut",
    options: [
      { field: "BoneIn", label: "Bone-In" },
      { field: "Boneless", label: "Boneless" },
      { field: "SkinOn", label: "Skin-On" },
      { field: "Skinless", label: "Skinless" },
      { field: "Trimmed", label: "Trimmed" },
      { field: "Untrimmed", label: "Untrimmed" },
      { field: "Netted", label: "Netted" },
      { field: "FirstCut", label: "First Cut" },
      { field: "DeckelOn", label: "Deckel-On" },
      { field: "WholePacker", label: "Whole Packer" },
      { field: "CowboyCut", label: "Cowboy Cut" },
      { field: "Pargiot", label: "Pargiot" },
      { field: "Capon", label: "Capon" },
      { field: "Schnitzel", label: "Schnitzel" },
      { field: "Strips", label: "Strips" },
      { field: "Marrow", label: "Marrow" },
      { field: "Kebab", label: "Kebab" },
    ],
  },
  {
    id: "kosher",
    label: "Kosher Type",
    options: [
      { field: "KosherForPassover", label: "Kosher for Passover" },
      { field: "Pareve", label: "Pareve" },
      // "Meat" intentionally omitted — it's a kashrut classification, not a
      // shopping filter. For a kosher butcher, every cut is Meat by default,
      // so a "Meat" filter is redundant and visually noisy.
      { field: "Dairy", label: "Dairy" },
      { field: "CholovYisroel", label: "Cholov Yisroel" },
    ],
  },
  {
    // Keep hechsher options in one table so new certification organizations
    // can be added without changing the filter-building logic.
    id: "hechsher",
    label: "Hechsher",
    options: HECHSHER_FILTER_OPTIONS,
    includeAnyOption: true,
    minVisibleOptions: 1,
    hideWhenNonDistinct: false,
  },
  {
    id: "preparation",
    label: "Preparation",
    options: [
      { field: "Smoked", label: "Smoked" },
      { field: "Pickled", label: "Pickled" },
      { field: "Cured", label: "Cured" },
      { field: "Marinated", label: "Marinated" },
      { field: "CharGrilled", label: "Char-Grilled" },
      { field: "Sliced", label: "Sliced" },
      { field: "Ground", label: "Ground" },
    ],
  },
  {
    id: "packaging",
    label: "Packaging",
    options: [
      { field: "VacuumPacked", label: "Vacuum Packed" },
      { field: "BulkPack", label: "Bulk Pack" },
      { field: "BoilablePouch", label: "Boilable Pouch" },
      { field: "AluminumPan", label: "Aluminum Pan" },
      { field: "IQF", label: "IQF" },
    ],
  },
]

export type ActiveFilters = {
  metadata: Record<string, string[]> // group.id → array of field names
  tags: string[]
  avoidAllergens: AllergenKey[]
  priceMax?: number | null
  recentOnly?: boolean
}

type FilterOption = {
  label: string
  value: string
  count: number
}

interface CollectionFiltersProps {
  products: StrapiCollectionProduct[]
  activeFilters: ActiveFilters
  onFilterChange: (filters: ActiveFilters) => void
  // Active collection / tag slug for the current page (e.g. "kosher-beef").
  // Used to hide the L2 parent that *is* the current scope — checking it
  // would filter to a tag the user is already viewing.
  currentSlug?: string
  // Hide the internal "Filters" + Clear All header. Useful when the
  // mobile drawer provides its own header so we don't double-stack it.
  hideHeader?: boolean
}

export function getEmptyFilters(): ActiveFilters {
  return {
    metadata: {},
    tags: [],
    avoidAllergens: [],
    priceMax: null,
    recentOnly: false,
  }
}

export function hasActiveFilters(filters: ActiveFilters): boolean {
  return (
    filters.tags.length > 0 ||
    (filters.avoidAllergens?.length || 0) > 0 ||
    Object.values(filters.metadata).some((arr) => arr.length > 0) ||
    !!filters.priceMax ||
    !!filters.recentOnly
  )
}

export function getActiveFilterCount(filters: ActiveFilters): number {
  return (
    filters.tags.length +
    (filters.avoidAllergens?.length || 0) +
    Object.values(filters.metadata).reduce((sum, arr) => sum + arr.length, 0) +
    (filters.priceMax ? 1 : 0) +
    (filters.recentOnly ? 1 : 0)
  )
}

// Build visible facet groups. Skip options with count==0. Most groups hide
// unless at least one option distinguishes products; hechsher intentionally
// stays visible with one populated option because customers may need to verify
// the exact certification even when it is not a narrowing filter.
export function buildFacetGroups(products: StrapiCollectionProduct[]) {
  const total = products.length
  return FACET_GROUPS
    .map((g) => ({
      ...g,
      options: g.options
        .map((o) => ({
          ...o,
          count: products.filter(
            (p) => (p.Metadata as Record<string, unknown> | undefined)?.[o.field as string] === true
          ).length,
        }))
        .filter((o) => o.count > 0),
    }))
    .filter((g) => {
      const minVisibleOptions = g.minVisibleOptions ?? 2
      if (g.options.length < minVisibleOptions) return false
      if (g.hideWhenNonDistinct === false) return true
      return g.options.some((o) => o.count < total)
    })
}

function buildAllergenOptions(products: StrapiCollectionProduct[]) {
  const productsWithApprovedDisclosures = products.filter(
    hasApprovedIngredientDisclosure
  )

  const hasKnownAllergenSignals = productsWithApprovedDisclosures.some(
    (product) => getProductAllergenKeys(product).length > 0
  )

  if (!hasKnownAllergenSignals) return []

  return FDA_MAJOR_ALLERGENS.map((allergen) => ({
    label: allergen.label,
    value: allergen.key,
    count: productsWithApprovedDisclosures.filter(
      (product) => !productContainsAnyAllergen(product, [allergen.key])
    ).length,
  }))
}

// At least one filterable thing exists for these products?
// Build the same L2 / L3 tag groups the sidebar would render, applying the
// same "useful" filter so this matches the sidebar's own visibility rules.
function buildTagGroups(products: StrapiCollectionProduct[]) {
  const l2Counts = new Map<string, number>()
  const l3Counts = new Map<string, number>()
  const l3ToL2 = new Map<string, Set<string>>()

  products.forEach((product) => {
    const tags = product.Categorization?.ProductTags || []
    const productL2s = tags.filter((t) => t.Name.startsWith("L2:")).map((t) => t.Name)
    const productL3s = tags.filter((t) => t.Name.startsWith("L3:")).map((t) => t.Name)

    productL2s.forEach((l2) => l2Counts.set(l2, (l2Counts.get(l2) || 0) + 1))
    productL3s.forEach((l3) => {
      l3Counts.set(l3, (l3Counts.get(l3) || 0) + 1)
      if (!l3ToL2.has(l3)) l3ToL2.set(l3, new Set())
      productL2s.forEach((l2) => l3ToL2.get(l3)!.add(l2))
    })
  })

  const groups: Array<{ l2Count: number; l3Children: number[] }> = []
  l2Counts.forEach((l2Count, l2Name) => {
    const children: number[] = []
    l3ToL2.forEach((parentL2s, l3Name) => {
      if (parentL2s.has(l2Name)) children.push(l3Counts.get(l3Name) || 0)
    })
    if (children.length >= 1) groups.push({ l2Count, l3Children: children })
  })

  // Same "useful" filter as the rendered component: a single L2 with a single
  // L3 of equal count to itself is hidden (filter would do nothing).
  if (groups.length === 1) {
    const g = groups[0]
    if (g.l3Children.length === 1 && g.l3Children[0] === g.l2Count) return []
  }
  return groups
}

export function productsHaveFilters(products: StrapiCollectionProduct[]): boolean {
  if (buildAllergenOptions(products).length > 0) return true
  if (buildFacetGroups(products).length > 0) return true
  return buildTagGroups(products).length > 0
}

export function filterProducts(
  products: StrapiCollectionProduct[],
  filters: ActiveFilters,
  options?: { recentProductIds?: string[] }
): StrapiCollectionProduct[] {
  const recentSet = new Set(options?.recentProductIds || [])
  return products.filter((product) => {
    // Metadata facet groups: OR within a group, AND across groups.
    for (const [groupId, selectedFields] of Object.entries(filters.metadata)) {
      if (selectedFields.length === 0) continue
      const matches = selectedFields.some(
        (field) => (product.Metadata as Record<string, unknown> | undefined)?.[field] === true
      )
      if (!matches) return false
    }

    // Tag filters (OR within group)
    if (filters.tags.length > 0) {
      const productTagNames =
        product.Categorization?.ProductTags?.map((t) => t.Name) || []
      const matchesTags = filters.tags.some((tag) =>
        productTagNames.includes(tag)
      )
      if (!matchesTags) return false
    }

    if (filters.avoidAllergens?.length) {
      if (!hasApprovedIngredientDisclosure(product)) return false
      if (productContainsAnyAllergen(product, filters.avoidAllergens)) {
        return false
      }
    }

    if (filters.priceMax) {
      const price =
        product.MedusaProduct?.Variants?.[0]?.Price?.CalculatedPriceNumber
      if (typeof price !== "number" || price > filters.priceMax) return false
    }

    if (filters.recentOnly) {
      const id = product.MedusaProduct?.ProductId
      if (!id || !recentSet.has(id)) return false
    }

    return true
  })
}

// Session-persisted collapse flag per facet group id.
function useCollapse(storageKey: string, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return defaultCollapsed
    const saved = window.sessionStorage.getItem(storageKey)
    if (saved === "1") return true
    if (saved === "0") return false
    return defaultCollapsed
  })
  useEffect(() => {
    if (typeof window === "undefined") return
    window.sessionStorage.setItem(storageKey, collapsed ? "1" : "0")
  }, [storageKey, collapsed])
  return [collapsed, setCollapsed] as const
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-Charcoal/60 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CategoryFilterSection({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useCollapse("collection-filter-collapse-category")
  return (
    <div className="border-t border-Charcoal/10 pt-4">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between mb-3 pr-3 group"
        aria-expanded={!collapsed}
      >
        <h3 className="text-p-sm-mono font-maison-neue-mono font-bold uppercase text-Charcoal group-hover:text-VibrantRed transition-colors">
          Category
        </h3>
        <ChevronIcon collapsed={collapsed} />
      </button>
      {!collapsed && children}
    </div>
  )
}

function FilterSection({
  storageKey,
  title,
  options,
  activeValues,
  onToggle,
  includeAnyOption = false,
  totalCount = 0,
  onClear,
}: {
  storageKey: string
  title: string
  options: FilterOption[]
  activeValues: string[]
  onToggle: (value: string) => void
  includeAnyOption?: boolean
  totalCount?: number
  onClear?: () => void
}) {
  const [collapsed, setCollapsed] = useCollapse(storageKey)
  if (options.length === 0) return null

  return (
    <div className="border-t border-Charcoal/10 pt-4">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between mb-3 pr-3 group"
        aria-expanded={!collapsed}
      >
        <h3 className="text-p-sm-mono font-maison-neue-mono font-bold uppercase text-Charcoal group-hover:text-VibrantRed transition-colors">
          {title}
        </h3>
        <ChevronIcon collapsed={collapsed} />
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-2">
          {includeAnyOption && (
            <label className="flex items-center gap-2 cursor-pointer group pr-3">
              <input
                type="checkbox"
                checked={activeValues.length === 0}
                onChange={() => onClear?.()}
                className="w-4 h-4 rounded border-gray-300 text-Charcoal focus:ring-Gold accent-Charcoal"
              />
              <span className="text-xs font-maison-neue text-Charcoal/70 group-hover:text-VibrantRed transition-colors">
                Any
              </span>
              <span className="text-xs text-Charcoal/60 ml-auto">
                ({totalCount})
              </span>
            </label>
          )}
          {options.map((option) => {
            const isActive = activeValues.includes(option.value)
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 cursor-pointer group pr-3"
              >
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={() => onToggle(option.value)}
                  className="w-4 h-4 rounded border-gray-300 text-Charcoal focus:ring-Gold accent-Charcoal"
                />
                <span className="text-xs font-maison-neue text-Charcoal/70 group-hover:text-VibrantRed transition-colors">
                  {option.label}
                </span>
                <span className="text-xs text-Charcoal/60 ml-auto">
                  ({option.count})
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Mirrors `generateTagSlug` in @lib/data/strapi/collections (kept inline here
// to avoid pulling a server-only file into this client component).
const slugifyTagValue = (v: string): string =>
  `kosher-${v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`

const extractTagValueLocal = (n: string): string =>
  n.match(/^L[123]:/) ? n.split(":")[1].trim() : n

export default function CollectionFilters({
  products,
  activeFilters,
  onFilterChange,
  currentSlug,
  hideHeader = false,
}: CollectionFiltersProps) {
  // Data-driven facet groups built from new Metadata fields.
  const facetGroups = useMemo(() => buildFacetGroups(products), [products])
  const allergenOptions = useMemo(
    () => buildAllergenOptions(products),
    [products]
  )

  // Build hierarchical tag filter options: L2 parents with L3 children
  type TagGroup = {
    l2: FilterOption
    l3Children: FilterOption[]
  }

  const tagGroups = useMemo<TagGroup[]>(() => {
    const l2Counts = new Map<string, number>()
    const l3Counts = new Map<string, number>()
    // Map L3 tag -> Set of L2 tags that appear on the same products
    const l3ToL2 = new Map<string, Set<string>>()

    products.forEach((product) => {
      const tags = product.Categorization?.ProductTags || []
      const productL2s = tags.filter((t) => t.Name.startsWith("L2:")).map((t) => t.Name)
      const productL3s = tags.filter((t) => t.Name.startsWith("L3:")).map((t) => t.Name)

      productL2s.forEach((l2) => {
        l2Counts.set(l2, (l2Counts.get(l2) || 0) + 1)
      })

      productL3s.forEach((l3) => {
        l3Counts.set(l3, (l3Counts.get(l3) || 0) + 1)
        // Associate this L3 with all L2s on the same product
        if (!l3ToL2.has(l3)) l3ToL2.set(l3, new Set())
        productL2s.forEach((l2) => l3ToL2.get(l3)!.add(l2))
      })
    })

    // Build groups: each L2 with its L3 children
    const groups: TagGroup[] = []

    Array.from(l2Counts.entries())
      // Highest-count L2 buckets first — matches merchandiser ordering and
      // matches the count-desc sort the nav uses, so the dense buckets
      // (Steaks, Roasts) sit on top of the sidebar instead of alphabetical.
      .sort(([, a], [, b]) => b - a)
      .forEach(([l2Name, l2Count]) => {
        // Hide the L2 that *is* the current page scope. If the user is on
        // /collections/kosher-beef, we don't render an L2: Beef parent —
        // checking it would filter to a tag they're already viewing, and
        // its L3s will show under the correct sub-bucket L2 instead.
        if (
          currentSlug &&
          slugifyTagValue(extractTagValueLocal(l2Name)) === currentSlug
        ) {
          return
        }

        const l2Label = l2Name.replace(/^L2:\s*/, "")

        // Find L3 tags that belong under this L2
        const children: FilterOption[] = []
        l3ToL2.forEach((parentL2s, l3Name) => {
          if (parentL2s.has(l2Name)) {
            const l3Label = l3Name.replace(/^L3:\s*/, "")
            children.push({
              label: l3Label,
              value: l3Name,
              count: l3Counts.get(l3Name) || 0,
            })
          }
        })

        children.sort((a, b) => b.count - a.count)

        groups.push({
          l2: { label: l2Label, value: l2Name, count: l2Count },
          l3Children: children,
        })
      })

    // Hide groups that wouldn't actually filter anything:
    // - L2 with no children (nothing to drill into)
    // - A single L2 whose lone L3 has the same count as the L2 itself
    //   (selecting either does nothing — already on the only category)
    const useful = groups.filter((g) => g.l3Children.length >= 1)
    if (useful.length === 1) {
      const g = useful[0]
      if (g.l3Children.length === 1 && g.l3Children[0].count === g.l2.count) {
        return []
      }
    }
    return useful
  }, [products, currentSlug])

  const totalFilterCount = getActiveFilterCount(activeFilters)

  const toggleTagFilter = (value: string) => {
    const current = activeFilters.tags
    const isActive = current.includes(value)
    const updated = isActive
      ? current.filter((v) => v !== value)
      : [...current, value]
    jitsuTrack("filter_applied", {
      filter_type: "tags",
      filter_value: value,
      action: isActive ? "removed" : "applied",
    })
    onFilterChange({ ...activeFilters, tags: updated })
  }

  const toggleMetadataFilter = (groupId: string, field: string) => {
    const current = activeFilters.metadata[groupId] || []
    const isActive = current.includes(field)
    const updated = isActive
      ? current.filter((v) => v !== field)
      : [...current, field]
    jitsuTrack("filter_applied", {
      filter_type: groupId,
      filter_value: field,
      action: isActive ? "removed" : "applied",
    })
    const nextMetadata = { ...activeFilters.metadata, [groupId]: updated }
    if (updated.length === 0) delete nextMetadata[groupId]
    onFilterChange({ ...activeFilters, metadata: nextMetadata })
  }

  const toggleAllergenFilter = (value: string) => {
    const allergen = value as AllergenKey
    const current = activeFilters.avoidAllergens || []
    const isActive = current.includes(allergen)
    const updated = isActive
      ? current.filter((item) => item !== allergen)
      : [...current, allergen]
    jitsuTrack("filter_applied", {
      filter_type: "avoid_allergens",
      filter_value: allergen,
      action: isActive ? "removed" : "applied",
    })
    onFilterChange({ ...activeFilters, avoidAllergens: updated })
  }

  const clearAll = () => {
    onFilterChange(getEmptyFilters())
  }

  const L3_VISIBLE_LIMIT = 7

  // Track which L2 groups have their L3 children expanded
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const toggleGroupExpanded = (l2Value: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(l2Value)) {
        next.delete(l2Value)
      } else {
        next.add(l2Value)
      }
      return next
    })
  }

  // Animated collapsible wrapper for L3 overflow children
  function AnimatedOverflow({
    isExpanded,
    children,
  }: {
    isExpanded: boolean
    children: React.ReactNode
  }) {
    const contentRef = useRef<HTMLDivElement>(null)
    const [height, setHeight] = useState<number>(0)

    useEffect(() => {
      if (contentRef.current) {
        setHeight(contentRef.current.scrollHeight)
      }
    }, [children, isExpanded])

    return (
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
        style={{
          maxHeight: isExpanded ? `${height}px` : "0px",
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div ref={contentRef}>{children}</div>
      </div>
    )
  }

  const hasFilters =
    allergenOptions.length > 0 || facetGroups.length > 0 || tagGroups.length > 0
  if (!hasFilters) return null

  return (
    <aside className="w-full lg:sticky lg:top-[72px] lg:self-start lg:max-h-[calc(100vh-88px)] lg:flex lg:flex-col" aria-label="Product filters">
      {!hideHeader && (
        <div className="flex items-center justify-between pb-4">
          <h2 className="text-h4 font-gyst font-bold text-Charcoal">Filters</h2>
          {totalFilterCount > 0 && (
            <button
              onClick={clearAll}
              className="text-p-sm font-maison-neue text-VibrantRed hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold rounded"
              aria-label="Clear all filters"
            >
              Clear All ({totalFilterCount})
            </button>
          )}
        </div>
      )}
      {hideHeader && totalFilterCount > 0 && (
        <div className="flex justify-end pb-3">
          <button
            onClick={clearAll}
            className="text-p-sm font-maison-neue text-VibrantRed hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold rounded"
            aria-label="Clear all filters"
          >
            Clear All ({totalFilterCount})
          </button>
        </div>
      )}

      <div className="lg:overflow-y-auto lg:pb-6 space-y-6 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
      {/* Hierarchical Category filters: L2 parents with L3 children */}
      {tagGroups.length > 0 && (
        <CategoryFilterSection>
          <div className="flex flex-col gap-3">
            {tagGroups.map((group) => {
              const isExpanded = expandedGroups.has(group.l2.value)
              const hasMore = group.l3Children.length > L3_VISIBLE_LIMIT
              const visibleChildren = isExpanded
                ? group.l3Children
                : group.l3Children.slice(0, L3_VISIBLE_LIMIT)
              const hiddenCount = group.l3Children.length - L3_VISIBLE_LIMIT

              return (
                <div key={group.l2.value}>
                  {/* L2 parent */}
                  <label className="flex items-center gap-2 cursor-pointer group pr-3">
                    <input
                      type="checkbox"
                      checked={activeFilters.tags.includes(group.l2.value)}
                      onChange={() => toggleTagFilter(group.l2.value)}
                      className="w-4 h-4 rounded border-gray-300 text-Charcoal focus:ring-Gold accent-Charcoal"
                    />
                    <span className="text-p-sm font-maison-neue text-Charcoal/70 group-hover:text-VibrantRed transition-colors">
                      {group.l2.label}
                    </span>
                    <span className="text-xs text-Charcoal/60 ml-auto">
                      ({group.l2.count})
                    </span>
                  </label>
                  {/* L3 children */}
                  {group.l3Children.length > 0 && (
                    <div className="flex flex-col gap-2 mt-2 ml-6 pb-3">
                      {/* Always-visible first 7 */}
                      {group.l3Children.slice(0, L3_VISIBLE_LIMIT).map((child) => (
                        <label
                          key={child.value}
                          className="flex items-center gap-2 cursor-pointer group pr-3"
                        >
                          <input
                            type="checkbox"
                            checked={activeFilters.tags.includes(child.value)}
                            onChange={() => toggleTagFilter(child.value)}
                            className="w-4 h-4 rounded border-gray-300 text-Charcoal focus:ring-Gold accent-Charcoal"
                          />
                          <span className="text-xs font-maison-neue text-Charcoal/70 group-hover:text-VibrantRed transition-colors">
                            {child.label}
                          </span>
                          <span className="text-xs text-Charcoal/60 ml-auto">
                            ({child.count})
                          </span>
                        </label>
                      ))}
                      {/* Animated overflow children */}
                      {hasMore && (
                        <>
                          <AnimatedOverflow isExpanded={isExpanded}>
                            <div className="flex flex-col gap-2">
                              {group.l3Children.slice(L3_VISIBLE_LIMIT).map((child) => (
                                <label
                                  key={child.value}
                                  className="flex items-center gap-2 cursor-pointer group pr-3"
                                >
                                  <input
                                    type="checkbox"
                                    checked={activeFilters.tags.includes(child.value)}
                                    onChange={() => toggleTagFilter(child.value)}
                                    className="w-4 h-4 rounded border-gray-300 text-Charcoal focus:ring-Gold accent-Charcoal"
                                  />
                                  <span className="text-p-sm font-maison-neue text-Charcoal group-hover:text-VibrantRed transition-colors">
                                    {child.label}
                                  </span>
                                  <span className="text-xs text-Charcoal/60 ml-auto">
                                    ({child.count})
                                  </span>
                                </label>
                              ))}
                            </div>
                          </AnimatedOverflow>
                          <button
                            onClick={() => toggleGroupExpanded(group.l2.value)}
                            className="text-p-sm font-maison-neue text-Charcoal/60 hover:text-Charcoal/80 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold rounded text-left transition-colors"
                          >
                            {isExpanded ? "View less" : `View more (${hiddenCount})`}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CategoryFilterSection>
      )}

      {allergenOptions.length > 0 && (
        <FilterSection
          storageKey="collection-filter-collapse-avoid-allergens"
          title="Avoid Allergens"
          options={allergenOptions}
          activeValues={activeFilters.avoidAllergens || []}
          onToggle={toggleAllergenFilter}
        />
      )}

      {facetGroups.map((group) => (
        <FilterSection
          key={group.id}
          storageKey={`collection-filter-collapse-${group.id}`}
          title={group.label}
          options={group.options.map((o) => ({
            label: o.label,
            value: String(o.field),
            count: o.count,
          }))}
          activeValues={activeFilters.metadata[group.id] || []}
          onToggle={(value) => toggleMetadataFilter(group.id, value)}
          includeAnyOption={group.includeAnyOption}
          totalCount={products.length}
          onClear={() => {
            const nextMetadata = { ...activeFilters.metadata }
            delete nextMetadata[group.id]
            onFilterChange({ ...activeFilters, metadata: nextMetadata })
          }}
        />
      ))}

      </div>
    </aside>
  )
}
