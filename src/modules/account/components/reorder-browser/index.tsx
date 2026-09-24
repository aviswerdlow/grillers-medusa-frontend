"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  History,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"
import {
  requestLegacyReorderAssistance,
  type LegacyCustomerOrder,
  type PurchaseHistoryItem,
} from "@lib/data/orders"
import { addToCart } from "@lib/data/cart"
import { experimentCartMetadata } from "@lib/experiments/client-context"
import { reportClientOpsAlert } from "@lib/client-ops-alert"
import { dispatchCartUpdated } from "@lib/util/cart-events"
import {
  freeDeliveryEligibilityMetadata,
  getProductFreeDeliveryEligibility,
} from "@lib/util/free-delivery-eligibility"
import { formatProductPriceDisplay } from "@lib/util/price-display"
import { isVariantPurchasable } from "@lib/util/product-availability"
import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { toast } from "@medusajs/ui"

type SortOption = "due" | "recent" | "frequent" | "az" | "price"
type DateFilter = "all" | "30" | "60" | "90" | "180"
type RequestState = "idle" | "submitting" | "sent" | "error"
type AddState = "idle" | "adding" | "added" | "error"
type ActiveTab = "due" | "staples" | "orders" | "all"

type HydratedHistoryItem = PurchaseHistoryItem & {
  strapiProduct: StrapiCollectionProduct
}

type SelectionMap = Record<string, number>

const RESTOCK_TABS: Array<{ id: ActiveTab; label: string }> = [
  { id: "due", label: "Due again" },
  { id: "staples", label: "Your staples" },
  { id: "orders", label: "Past orders" },
  { id: "all", label: "All purchased" },
]

const CATEGORY_RULES = [
  { label: "Chicken", terms: ["chicken", "capons", "pullet"] },
  { label: "Beef", terms: ["beef", "steak", "brisket", "burger", "rib"] },
  { label: "Lamb & Veal", terms: ["lamb", "veal"] },
  {
    label: "Prepared",
    terms: [
      "pie",
      "soup",
      "kugel",
      "fried",
      "prepared",
      "ready",
      "cooked",
      "heat",
      "serve",
    ],
  },
  { label: "Deli", terms: ["deli", "salami", "pastrami", "corned"] },
  { label: "Pantry", terms: ["sauce", "spice", "marinade", "rub"] },
]

function historyKey(item: PurchaseHistoryItem) {
  return (
    item.key ||
    item.variantId ||
    item.productId ||
    item.legacyItemId ||
    item.sku ||
    `${item.title}-${item.lastOrderedAt}`
  )
}

function itemTitle(
  item: PurchaseHistoryItem,
  strapiProduct?: StrapiCollectionProduct
) {
  if (strapiProduct?.Title) return strapiProduct.Title

  const productTitle = normalizedHistoryTitle(item.productTitle)
  if (productTitle) return productTitle

  const title = normalizedHistoryTitle(item.title)
  if (title) return title

  return item.sku || "Historical item"
}

function normalizedHistoryTitle(value?: string | null) {
  const title = value?.trim()
  if (!title) return ""

  const normalized = title.toLowerCase()
  if (
    normalized === "standard" ||
    normalized === "default" ||
    normalized === "default title"
  ) {
    return ""
  }

  return title
}

function normalizedSku(value?: string | null) {
  return value?.trim().toLowerCase() || ""
}

function lookupStrapiProductForHistory(
  item: PurchaseHistoryItem,
  strapiMap: Record<string, StrapiCollectionProduct>
) {
  return (
    (item.productId ? strapiMap[item.productId] : undefined) ||
    (item.variantId ? strapiMap[item.variantId] : undefined) ||
    (item.sku ? strapiMap[normalizedSku(item.sku)] : undefined)
  )
}

function isRenderableCatalogProduct(
  product?: StrapiCollectionProduct
): product is StrapiCollectionProduct {
  return Boolean(
    product?.MedusaProduct?.Handle &&
      product.MedusaProduct.Variants?.some((variant) => variant.VariantId)
  )
}

function catalogHistoryKey(
  item: PurchaseHistoryItem,
  product: StrapiCollectionProduct
) {
  return (
    product.documentId ||
    product.MedusaProduct?.ProductId ||
    product.MedusaProduct?.Handle ||
    historyKey(item)
  )
}

function formatLegacyDate(value?: string | null) {
  if (!value) return "Unknown date"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown date"

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function formatLegacyMoney(value?: number | null, currencyCode = "usd") {
  if (typeof value !== "number" || !Number.isFinite(value)) return ""

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(value)
}

function legacyOrderDisplayId(order: LegacyCustomerOrder) {
  return (
    order.ref_number || order.qbd_txn_id || order.legacy_order_id || order.id
  )
}

function legacyLineDisplayTitle(line: LegacyCustomerOrder["lines"][number]) {
  return (
    line.display_title ||
    line.medusa_variant_title ||
    line.medusa_product_title ||
    line.title ||
    line.description ||
    "Historical item"
  )
}

function legacyLineActionKey(line: LegacyCustomerOrder["lines"][number]) {
  return (
    line.purchase_history_key ||
    (line.medusa_variant_id ? `variant:${line.medusa_variant_id}` : "") ||
    line.qbd_item_list_id ||
    line.sku ||
    line.id
  )
}

function legacyLineStateKey(line: LegacyCustomerOrder["lines"][number]) {
  return `line:${line.id}`
}

function isStaffAssistedHistoryItem(item: PurchaseHistoryItem) {
  return item.mappingStatus === "staff_assisted"
}

function getPrimaryVariant(product?: StrapiCollectionProduct) {
  return product?.MedusaProduct?.Variants?.[0]
}

function itemVariant(item: HydratedHistoryItem) {
  const variants = item.strapiProduct.MedusaProduct?.Variants || []
  if (item.variantId) {
    return variants.find((variant) => variant.VariantId === item.variantId)
  }
  return getPrimaryVariant(item.strapiProduct)
}

function itemVariantId(item: HydratedHistoryItem) {
  return itemVariant(item)?.VariantId || ""
}

function itemImage(item: HydratedHistoryItem) {
  return (
    item.strapiProduct?.FeaturedImage?.url ||
    item.thumbnail ||
    "https://placehold.co/320x320/f4f2ee/2b2928?text=GP"
  )
}

function itemHandle(item: HydratedHistoryItem) {
  return item.strapiProduct?.MedusaProduct?.Handle
}

function categoryForItem(item: HydratedHistoryItem) {
  const title = itemTitle(item, item.strapiProduct).toLowerCase()
  const sku = item.sku?.toLowerCase() || ""
  const haystack = `${title} ${sku}`
  const match = CATEGORY_RULES.find((rule) =>
    rule.terms.some((term) => haystack.includes(term))
  )

  return match?.label || "Other"
}

function daysSince(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  )
}

function median(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0)
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
  return sorted[mid]
}

function reorderCadence(orders: LegacyCustomerOrder[]) {
  const timestamps = orders
    .map((order) => new Date(order.placed_at || "").getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)

  if (timestamps.length < 2) return null

  const gaps: number[] = []
  for (let index = 0; index < timestamps.length - 1; index += 1) {
    const diff = Math.round(
      (timestamps[index] - timestamps[index + 1]) / (1000 * 60 * 60 * 24)
    )
    if (diff > 0) gaps.push(diff)
  }

  return median(gaps)
}

function typicalQuantity(item: PurchaseHistoryItem) {
  const times = Math.max(1, item.timesOrdered || item.orderCount || 1)
  const average = Math.round((Number(item.totalQuantity) || 1) / times)
  return Math.min(Math.max(1, average), 24)
}

function dueScore(item: HydratedHistoryItem) {
  const frequency = Math.max(item.timesOrdered || item.orderCount || 1, 1)
  const quantity = Math.min(Number(item.totalQuantity) || 1, 20)
  const days = daysSince(item.lastOrderedAt) || 0
  const recencyNeed = days >= 21 ? Math.min(days / 7, 14) : days / 30
  const mappedBoost = itemVariantId(item) ? 8 : 0

  return frequency * 6 + quantity + recencyNeed + mappedBoost
}

function itemPriceNumber(item: HydratedHistoryItem) {
  const productPrice = itemVariant(item)?.Price?.CalculatedPriceNumber
  if (typeof productPrice === "number" && Number.isFinite(productPrice)) {
    return productPrice
  }
  return null
}

function itemPriceLabel(item: HydratedHistoryItem) {
  const variant = itemVariant(item)
  const price = variant?.Price?.CalculatedPriceNumber
  if (
    item.strapiProduct &&
    typeof price === "number" &&
    Number.isFinite(price)
  ) {
    const display = formatProductPriceDisplay(
      Number(price),
      item.strapiProduct.Metadata,
      variant?.Sku,
      (
        item.strapiProduct.MedusaProduct as
          | { PricingMode?: "per_lb" | "fixed_price" }
          | undefined
      )?.PricingMode
    )
    return `${display.primary}${
      display.primaryLabel ? ` ${display.primaryLabel}` : ""
    }`
  }

  return "Current price shown in cart"
}

function canAddItem(item: HydratedHistoryItem) {
  const variant = itemVariant(item)

  return (
    isRenderableCatalogProduct(item.strapiProduct) &&
    Boolean(variant?.VariantId) &&
    isVariantPurchasable(variant)
  )
}

function itemMetadata(item: HydratedHistoryItem) {
  const variant = itemVariant(item)
  const eligibility = item.strapiProduct
    ? freeDeliveryEligibilityMetadata(
        getProductFreeDeliveryEligibility(item.strapiProduct, variant?.Sku)
      )
    : {}

  return {
    ...experimentCartMetadata(),
    ...eligibility,
    source: "account_restock_hub",
    legacy_purchase_history_key: historyKey(item),
    legacy_item_id: item.legacyItemId || undefined,
    legacy_sku: item.sku || undefined,
    legacy_last_order_ref: item.lastOrderRef || undefined,
  }
}

function itemMatchesSearch(item: HydratedHistoryItem, query: string) {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  const title = itemTitle(item, item.strapiProduct)

  return (
    title.toLowerCase().includes(q) ||
    item.title.toLowerCase().includes(q) ||
    (item.productTitle || "").toLowerCase().includes(q) ||
    (item.sku || "").toLowerCase().includes(q) ||
    (item.lastOrderRef || "").toLowerCase().includes(q) ||
    categoryForItem(item).toLowerCase().includes(q)
  )
}

function legacyOrderMatchesSearch(order: LegacyCustomerOrder, query: string) {
  if (!query.trim()) return true
  const q = query.toLowerCase()

  return (
    legacyOrderDisplayId(order).toLowerCase().includes(q) ||
    formatLegacyDate(order.placed_at).toLowerCase().includes(q) ||
    order.lines.some((line) =>
      legacyLineDisplayTitle(line).toLowerCase().includes(q)
    )
  )
}

function legacyOrderMatchesDate(
  order: LegacyCustomerOrder,
  filter: DateFilter
) {
  if (filter === "all") return true
  if (!order.placed_at) return false
  const placedAt = new Date(order.placed_at)
  if (Number.isNaN(placedAt.getTime())) return false

  const cutoff = new Date(Date.now() - Number(filter) * 24 * 60 * 60 * 1000)
  return placedAt >= cutoff
}

function sortItems(items: HydratedHistoryItem[], sort: SortOption) {
  const sorted = [...items]

  switch (sort) {
    case "due":
      sorted.sort((a, b) => dueScore(b) - dueScore(a))
      break
    case "recent":
      sorted.sort(
        (a, b) =>
          new Date(b.lastOrderedAt).getTime() -
          new Date(a.lastOrderedAt).getTime()
      )
      break
    case "frequent":
      sorted.sort(
        (a, b) =>
          (b.timesOrdered || b.orderCount || 0) -
          (a.timesOrdered || a.orderCount || 0)
      )
      break
    case "az":
      sorted.sort((a, b) =>
        itemTitle(a, a.strapiProduct).localeCompare(
          itemTitle(b, b.strapiProduct)
        )
      )
      break
    case "price":
      sorted.sort((a, b) => {
        const aPrice = itemPriceNumber(a)
        const bPrice = itemPriceNumber(b)
        if (aPrice === null) return bPrice === null ? 0 : 1
        if (bPrice === null) return -1
        return aPrice - bPrice
      })
      break
  }

  return sorted
}

function useHydratedHistory(
  history: PurchaseHistoryItem[],
  strapiMap: Record<string, StrapiCollectionProduct>
) {
  return useMemo(() => {
    const seen = new Set<string>()
    const items: HydratedHistoryItem[] = []

    for (const h of history) {
      const strapiProduct = lookupStrapiProductForHistory(h, strapiMap)
      if (!isRenderableCatalogProduct(strapiProduct)) continue

      const key = catalogHistoryKey(h, strapiProduct)
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ ...h, strapiProduct })
    }

    return items
  }, [history, strapiMap])
}

function ItemThumb({ item }: { item: HydratedHistoryItem }) {
  const title = itemTitle(item, item.strapiProduct)
  const src = itemImage(item)

  return (
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-SilverPlate sm:h-24 sm:w-24">
      <Image src={src} alt={title} fill className="object-cover" sizes="96px" />
    </div>
  )
}

function QuantityStepper({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-grid h-10 grid-cols-[36px_38px_36px] overflow-hidden rounded-[5px] border border-gray-200 bg-white">
      <button
        type="button"
        className="inline-flex items-center justify-center text-Charcoal hover:bg-SilverPlate disabled:cursor-not-allowed disabled:text-Charcoal/25"
        disabled={disabled || value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
        aria-label="Decrease quantity"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="inline-flex items-center justify-center border-x border-gray-200 text-sm font-maison-neue font-semibold text-Charcoal">
        {value}
      </span>
      <button
        type="button"
        className="inline-flex items-center justify-center text-Charcoal hover:bg-SilverPlate disabled:cursor-not-allowed disabled:text-Charcoal/25"
        disabled={disabled}
        onClick={() => onChange(Math.min(99, value + 1))}
        aria-label="Increase quantity"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function RestockHero({
  history,
  legacyOrders,
  selectedCount,
  selectedCategories,
  onSelectUsuals,
  onRepeatLastOrder,
  canRepeatLastOrder,
}: {
  history: HydratedHistoryItem[]
  legacyOrders: LegacyCustomerOrder[]
  selectedCount: number
  selectedCategories: string[]
  onSelectUsuals: () => void
  onRepeatLastOrder: () => void
  canRepeatLastOrder: boolean
}) {
  const cadence = reorderCadence(legacyOrders)
  const latestOrder = legacyOrders
    .filter((order) => order.placed_at)
    .sort(
      (a, b) =>
        new Date(b.placed_at || "").getTime() -
        new Date(a.placed_at || "").getTime()
    )[0]
  const categoryCount = new Set(history.map(categoryForItem)).size

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm small:p-6">
      <div className="grid gap-5 large:grid-cols-[minmax(0,1fr)_auto] large:items-start">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-maison-neue-mono uppercase text-VibrantRed">
            <PackageCheck className="h-3.5 w-3.5" />
            Restock hub
          </p>
          <h2 className="mt-2 text-3xl font-gyst font-bold leading-tight text-Charcoal small:text-4xl">
            Build from what you actually buy
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-maison-neue leading-relaxed text-Charcoal/60 small:text-base">
            Your history is organized into usuals, due-again items, and full
            past orders so a long order history becomes a faster restock.
          </p>
        </div>

        <div className="grid gap-2 large:w-[320px]">
          <button
            type="button"
            onClick={onSelectUsuals}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[5px] bg-Gold px-4 py-3 text-sm font-rexton font-bold uppercase text-Charcoal transition-opacity hover:opacity-95"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="whitespace-nowrap">Build usual cart</span>
          </button>
          <button
            type="button"
            onClick={onRepeatLastOrder}
            disabled={!canRepeatLastOrder}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[5px] border border-Charcoal px-4 py-3 text-sm font-rexton font-bold uppercase text-Charcoal transition-colors hover:bg-Charcoal hover:text-white disabled:cursor-not-allowed disabled:border-Charcoal/25 disabled:text-Charcoal/35 disabled:hover:bg-transparent"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="whitespace-nowrap">Repeat last order</span>
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 large:grid-cols-4">
        <div className="rounded-lg bg-SilverPlate/45 p-4">
          <p className="flex items-center gap-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
            <History className="h-3.5 w-3.5" />
            History depth
          </p>
          <p className="mt-2 text-xl font-gyst font-bold text-Charcoal">
            {legacyOrders.length || history.length}
          </p>
          <p className="text-xs font-maison-neue text-Charcoal/50">
            {legacyOrders.length ? "past orders on file" : "items remembered"}
          </p>
        </div>
        <div className="rounded-lg bg-SilverPlate/45 p-4">
          <p className="flex items-center gap-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
            <Clock3 className="h-3.5 w-3.5" />
            Usual rhythm
          </p>
          <p className="mt-2 text-xl font-gyst font-bold text-Charcoal">
            {cadence ? `${cadence} days` : "Learning"}
          </p>
          <p className="text-xs font-maison-neue text-Charcoal/50">
            {cadence
              ? "typical gap between orders"
              : "more orders sharpen this"}
          </p>
        </div>
        <div className="rounded-lg bg-SilverPlate/45 p-4">
          <p className="flex items-center gap-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
            <CalendarDays className="h-3.5 w-3.5" />
            Last order
          </p>
          <p className="mt-2 text-xl font-gyst font-bold text-Charcoal">
            {latestOrder ? formatLegacyDate(latestOrder.placed_at) : "On file"}
          </p>
          <p className="text-xs font-maison-neue text-Charcoal/50">
            {latestOrder
              ? `${
                  latestOrder.customer_visible_line_count ??
                  latestOrder.lines.length
                } items`
              : "from product history"}
          </p>
        </div>
        <div className="rounded-lg bg-SilverPlate/45 p-4">
          <p className="flex items-center gap-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
            <Check className="h-3.5 w-3.5" />
            Restock cart
          </p>
          <p className="mt-2 text-xl font-gyst font-bold text-Charcoal">
            {selectedCount} selected
          </p>
          <p className="truncate text-xs font-maison-neue text-Charcoal/50">
            {selectedCategories.length
              ? selectedCategories.join(", ")
              : `${categoryCount} categories in history`}
          </p>
        </div>
      </div>
    </section>
  )
}

function SearchAndFilters({
  search,
  sort,
  dateFilter,
  resultCount,
  activeTab,
  onSearchChange,
  onSortChange,
  onDateFilterChange,
}: {
  search: string
  sort: SortOption
  dateFilter: DateFilter
  resultCount: number
  activeTab: ActiveTab
  onSearchChange: (value: string) => void
  onSortChange: (value: SortOption) => void
  onDateFilterChange: (value: DateFilter) => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 small:p-4">
      <div className="grid gap-3 small:grid-cols-[minmax(0,1fr)_160px_180px]">
        <label className="relative block min-w-0">
          <span className="sr-only">Search order history</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-Charcoal/35" />
          <input
            type="text"
            placeholder={
              activeTab === "orders"
                ? "Search invoices or order items..."
                : "Search your past purchases..."
            }
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm font-maison-neue text-Charcoal outline-none transition-colors placeholder:text-Charcoal/35 focus:border-Gold focus:ring-1 focus:ring-Gold"
          />
        </label>

        <label className="relative block">
          <span className="sr-only">Date filter</span>
          <select
            value={dateFilter}
            onChange={(e) => onDateFilterChange(e.target.value as DateFilter)}
            className="h-11 w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 pr-9 text-sm font-maison-neue text-Charcoal outline-none focus:border-Gold focus:ring-1 focus:ring-Gold"
          >
            <option value="all">All time</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
          </select>
          <SlidersHorizontal className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-Charcoal/35" />
        </label>

        <label className="relative block">
          <span className="sr-only">Sort history</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="h-11 w-full appearance-none rounded-lg border border-gray-200 bg-white px-3 pr-9 text-sm font-maison-neue text-Charcoal outline-none focus:border-Gold focus:ring-1 focus:ring-Gold"
          >
            <option value="due">Most due</option>
            <option value="recent">Most recent</option>
            <option value="frequent">Most bought</option>
            <option value="az">A - Z</option>
            <option value="price">Price: low to high</option>
          </select>
          <SlidersHorizontal className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-Charcoal/35" />
        </label>
      </div>
      <p className="mt-3 text-xs font-maison-neue text-Charcoal/45">
        {resultCount} {activeTab === "orders" ? "order" : "item"}
        {resultCount === 1 ? "" : "s"} found
      </p>
    </div>
  )
}

function HistoryItemRow({
  item,
  selectedQuantity,
  addState,
  requestState,
  onQuantityChange,
  onToggleSelect,
  onRequest,
}: {
  item: HydratedHistoryItem
  selectedQuantity?: number
  addState: AddState
  requestState: RequestState
  onQuantityChange: (quantity: number) => void
  onToggleSelect: () => void
  onRequest: () => void
}) {
  const key = historyKey(item)
  const title = itemTitle(item, item.strapiProduct)
  const category = categoryForItem(item)
  const variantId = itemVariantId(item)
  const canAdd = canAddItem(item)
  const selected = Boolean(selectedQuantity)
  const handle = itemHandle(item)
  const lastOrderedDays = daysSince(item.lastOrderedAt)
  const staffAssisted = isStaffAssistedHistoryItem(item)
  const requestLabel =
    requestState === "submitting"
      ? "Sending"
      : requestState === "sent"
      ? "Sent"
      : "Ask staff"

  return (
    <article className="grid gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md small:grid-cols-[96px_minmax(0,1fr)_auto] small:items-center small:p-4">
      {handle ? (
        <LocalizedClientLink href={`/products/${handle}`} className="block">
          <ItemThumb item={item} />
        </LocalizedClientLink>
      ) : (
        <ItemThumb item={item} />
      )}

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-SilverPlate px-2.5 py-1 text-[10px] font-maison-neue-mono uppercase text-Charcoal/60">
            {category}
          </span>
          <span className="text-[11px] font-maison-neue text-Charcoal/45">
            Last bought {formatLegacyDate(item.lastOrderedAt)}
            {lastOrderedDays !== null ? ` (${lastOrderedDays} days ago)` : ""}
          </span>
        </div>

        {handle ? (
          <LocalizedClientLink href={`/products/${handle}`} className="block">
            <h3 className="mt-2 text-lg font-gyst font-bold leading-tight text-Charcoal transition-colors hover:text-VibrantRed">
              {title}
            </h3>
          </LocalizedClientLink>
        ) : (
          <h3 className="mt-2 text-lg font-gyst font-bold leading-tight text-Charcoal">
            {title}
          </h3>
        )}

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-maison-neue text-Charcoal/55">
          {itemPriceLabel(item) ? <span>{itemPriceLabel(item)}</span> : null}
          <span>
            Bought {item.timesOrdered || item.orderCount || 1} time
            {(item.timesOrdered || item.orderCount || 1) === 1 ? "" : "s"}
          </span>
          {item.sku ? <span>SKU {item.sku}</span> : null}
          {staffAssisted ? <span>Staff-assisted reorder</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 small:justify-end">
        {variantId && canAdd ? (
          <>
            <QuantityStepper
              value={selectedQuantity || typicalQuantity(item)}
              onChange={onQuantityChange}
            />
            <button
              type="button"
              onClick={onToggleSelect}
              disabled={addState === "adding"}
              className={`inline-flex min-h-[40px] min-w-[116px] items-center justify-center gap-2 rounded-[5px] px-4 py-2 text-xs font-rexton font-bold uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                selected
                  ? "border border-Charcoal bg-Charcoal text-white"
                  : "border border-Charcoal bg-white text-Charcoal hover:bg-Charcoal hover:text-white"
              }`}
            >
              {selected ? (
                <Check className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {selected ? "Selected" : "Select"}
            </button>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {variantId ? (
              <span className="rounded-full bg-SilverPlate px-2.5 py-1 text-[10px] font-maison-neue-mono uppercase text-Charcoal/55">
                Unavailable
              </span>
            ) : null}
            <button
              type="button"
              onClick={onRequest}
              disabled={
                requestState === "submitting" || requestState === "sent"
              }
              className="inline-flex min-h-[40px] min-w-[116px] items-center justify-center rounded-[5px] border border-Charcoal px-4 py-2 text-xs font-rexton font-bold uppercase text-Charcoal transition-colors hover:bg-Charcoal hover:text-white disabled:cursor-not-allowed disabled:border-Charcoal/30 disabled:text-Charcoal/35 disabled:hover:bg-transparent"
            >
              {requestLabel}
            </button>
          </div>
        )}
      </div>
      <span className="sr-only">{key}</span>
    </article>
  )
}

function EmptyState({ activeTab }: { activeTab: ActiveTab }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
      <PackageCheck className="mx-auto h-12 w-12 text-Charcoal/20" />
      <p className="mt-4 text-lg font-gyst font-bold text-Charcoal">
        Nothing here yet
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm font-maison-neue text-Charcoal/50">
        {activeTab === "orders"
          ? "We could not find matching past orders. Try a different search."
          : "No products match this view. Try adjusting the search or filters."}
      </p>
    </div>
  )
}

function PastOrdersTab({
  orders,
  totalCount,
  search,
  dateFilter,
  addStates,
  requestStates,
  onAddOrder,
  onAddLine,
  onRequestLine,
  canAddLine,
}: {
  orders: LegacyCustomerOrder[]
  totalCount?: number
  search: string
  dateFilter: DateFilter
  addStates: Record<string, AddState>
  requestStates: Record<string, RequestState>
  onAddOrder: (order: LegacyCustomerOrder) => void
  onAddLine: (
    order: LegacyCustomerOrder,
    line: LegacyCustomerOrder["lines"][number]
  ) => void
  onRequestLine: (line: LegacyCustomerOrder["lines"][number]) => void
  canAddLine: (line: LegacyCustomerOrder["lines"][number]) => boolean
}) {
  const [expandedOrderIds, setExpandedOrderIds] = useState<
    Record<string, boolean>
  >({})

  const visibleOrders = orders
    .filter((order) => order.lines?.length)
    .filter((order) => legacyOrderMatchesSearch(order, search))
    .filter((order) => legacyOrderMatchesDate(order, dateFilter))

  if (!visibleOrders.length) return <EmptyState activeTab="orders" />

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-1 small:flex-row small:items-end small:justify-between">
          <div>
            <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
              Order replay
            </p>
            <h2 className="text-2xl font-gyst font-bold text-Charcoal">
              Start from a past order
            </h2>
          </div>
          <p className="text-xs font-maison-neue text-Charcoal/45">
            {visibleOrders.length}
            {totalCount && totalCount > visibleOrders.length
              ? ` of ${totalCount}`
              : ""}{" "}
            shown
          </p>
        </div>
      </div>

      {visibleOrders.map((order) => {
        const availableLines = order.lines.filter(canAddLine)
        const orderAdding = order.lines.some(
          (line) => addStates[legacyLineStateKey(line)] === "adding"
        )
        const isExpanded = Boolean(expandedOrderIds[order.id])
        const hasHiddenLines = order.lines.length > 6
        const displayLines = isExpanded ? order.lines : order.lines.slice(0, 6)

        return (
          <article
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            key={order.id}
          >
            <div className="grid gap-4 large:grid-cols-[minmax(0,1fr)_auto] large:items-start">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                  <ReceiptText className="h-3.5 w-3.5" />
                  Invoice {legacyOrderDisplayId(order)}
                </p>
                <h3 className="mt-2 text-xl font-gyst font-bold text-Charcoal">
                  {formatLegacyDate(order.placed_at)}
                </h3>
                <p className="mt-1 text-sm font-maison-neue text-Charcoal/55">
                  {order.status || "Imported"} |{" "}
                  {order.customer_visible_line_count ?? order.lines.length} item
                  {(order.customer_visible_line_count ?? order.lines.length) ===
                  1
                    ? ""
                    : "s"}{" "}
                  | {formatLegacyMoney(order.total, order.currency_code)}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onAddOrder(order)}
                disabled={!availableLines.length || orderAdding}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[5px] bg-Gold px-4 py-2 text-xs font-rexton font-bold uppercase text-Charcoal transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ShoppingCart className="h-4 w-4" />
                Add available items
              </button>
            </div>

            <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
              {displayLines.map((line) => {
                const stateKey = legacyLineStateKey(line)
                const lineAddState = addStates[stateKey] || "idle"
                const lineRequestState = requestStates[stateKey] || "idle"

                return (
                  <div
                    className="grid gap-2 px-3 py-3 text-sm font-maison-neue text-Charcoal/75 small:grid-cols-[minmax(0,1fr)_110px_132px] small:items-center"
                    key={line.id}
                  >
                    <span className="min-w-0 break-words">
                      {line.quantity} x {legacyLineDisplayTitle(line)}
                      {line.sku ? (
                        <span className="ml-2 text-xs uppercase text-Charcoal/40">
                          {line.sku}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-Charcoal/55 small:text-right">
                      {formatLegacyMoney(line.line_total, line.currency_code)}
                    </span>
                    {line.medusa_variant_id && canAddLine(line) ? (
                      <button
                        type="button"
                        onClick={() => onAddLine(order, line)}
                        disabled={
                          lineAddState === "adding" ||
                          lineAddState === "added"
                        }
                        className="inline-flex min-h-[34px] items-center justify-center rounded-[5px] border border-Charcoal px-3 text-xs font-rexton font-bold uppercase text-Charcoal transition-colors hover:bg-Charcoal hover:text-white disabled:cursor-not-allowed disabled:border-Charcoal/30 disabled:text-Charcoal/35 disabled:hover:bg-transparent"
                      >
                        {lineAddState === "adding"
                          ? "Adding"
                          : lineAddState === "added"
                          ? "Added"
                          : "Add line"}
                      </button>
                    ) : line.purchase_history_key ? (
                      <button
                        type="button"
                        onClick={() => onRequestLine(line)}
                        disabled={
                          lineRequestState === "submitting" ||
                          lineRequestState === "sent"
                        }
                        className="inline-flex min-h-[34px] items-center justify-center rounded-[5px] border border-Charcoal px-3 text-xs font-rexton font-bold uppercase text-Charcoal transition-colors hover:bg-Charcoal hover:text-white disabled:cursor-not-allowed disabled:border-Charcoal/30 disabled:text-Charcoal/35 disabled:hover:bg-transparent"
                      >
                        {lineRequestState === "submitting"
                          ? "Sending"
                          : lineRequestState === "sent"
                          ? "Sent"
                          : "Ask staff"}
                      </button>
                    ) : (
                      <span className="text-xs font-maison-neue text-Charcoal/40 small:text-right">
                        On file
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            {hasHiddenLines ? (
              <div className="mt-3 flex flex-col gap-2 small:flex-row small:items-center small:justify-between">
                <p className="text-xs font-maison-neue text-Charcoal/45">
                  {isExpanded
                    ? `Showing all ${order.lines.length} items from this order.`
                    : `Showing 6 of ${order.lines.length} items.`}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setExpandedOrderIds((current) => ({
                      ...current,
                      [order.id]: !isExpanded,
                    }))
                  }
                  className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-[5px] border border-gray-200 px-3 text-xs font-rexton font-bold uppercase text-Charcoal transition-colors hover:border-Charcoal hover:bg-Charcoal hover:text-white"
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? (
                    <>
                      Show fewer
                      <ChevronUp className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Show all {order.lines.length} items
                      <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}

function SelectionRail({
  selectedItems,
  selected,
  gapItems,
  isAdding,
  onQuantityChange,
  onRemove,
  onAddSelected,
  onSelectGapItem,
}: {
  selectedItems: HydratedHistoryItem[]
  selected: SelectionMap
  gapItems: HydratedHistoryItem[]
  isAdding: boolean
  onQuantityChange: (key: string, quantity: number) => void
  onRemove: (key: string) => void
  onAddSelected: () => void
  onSelectGapItem: (item: HydratedHistoryItem) => void
}) {
  const hasUnknownPrice = selectedItems.some(
    (item) => itemPriceNumber(item) === null
  )
  const subtotal = selectedItems.reduce((sum, item) => {
    const key = historyKey(item)
    return sum + (itemPriceNumber(item) ?? 0) * (selected[key] || 1)
  }, 0)
  const categories = Array.from(new Set(selectedItems.map(categoryForItem)))

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm large:sticky large:top-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
            Restock cart
          </p>
          <h2 className="mt-1 text-2xl font-gyst font-bold text-Charcoal">
            {selectedItems.length} selected
          </h2>
        </div>
        <ShoppingCart className="h-5 w-5 text-Charcoal/45" />
      </div>

      <div className="mt-4 rounded-lg bg-SilverPlate/45 p-3">
        <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
          Estimated subtotal
        </p>
        <p className="mt-1 text-3xl font-gyst text-Charcoal">
          {hasUnknownPrice
            ? "See cart for price"
            : formatLegacyMoney(subtotal, "usd") || "$0.00"}
        </p>
        <p className="mt-1 text-xs font-maison-neue text-Charcoal/50">
          Final price and delivery threshold are confirmed at checkout.
        </p>
      </div>

      {selectedItems.length ? (
        <div className="mt-4 space-y-3">
          {selectedItems.map((item) => {
            const key = historyKey(item)
            return (
              <div
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-gray-100 pb-3 last:border-b-0"
                key={key}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-maison-neue font-semibold text-Charcoal">
                    {itemTitle(item, item.strapiProduct)}
                  </p>
                  <p className="text-xs font-maison-neue text-Charcoal/45">
                    {categoryForItem(item)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(key)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-Charcoal/45 hover:bg-SilverPlate hover:text-Charcoal"
                  aria-label="Remove item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <div className="col-span-2">
                  <QuantityStepper
                    value={selected[key] || 1}
                    onChange={(quantity) => onQuantityChange(key, quantity)}
                    disabled={isAdding}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-4 text-sm font-maison-neue text-Charcoal/55">
          Select usuals or individual items to build a cart before adding
          everything at once.
        </div>
      )}

      <button
        type="button"
        onClick={onAddSelected}
        disabled={!selectedItems.length || isAdding}
        className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[5px] bg-Gold px-4 py-3 text-sm font-rexton font-bold uppercase text-Charcoal transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <ShoppingCart className="h-4 w-4" />
        {isAdding ? "Adding items" : "Add selected to cart"}
      </button>

      <div className="mt-4 flex flex-wrap gap-2">
        {categories.map((category) => (
          <span
            className="rounded-full bg-SilverPlate px-2.5 py-1 text-[10px] font-maison-neue-mono uppercase text-Charcoal/55"
            key={category}
          >
            {category}
          </span>
        ))}
      </div>

      {gapItems.length ? (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
            Round out this restock
          </p>
          <div className="mt-3 space-y-2">
            {gapItems.slice(0, 3).map((item) => (
              <button
                type="button"
                onClick={() => onSelectGapItem(item)}
                className="group flex w-full items-center justify-between gap-3 rounded-lg p-2 text-left transition-colors hover:bg-SilverPlate/60"
                key={historyKey(item)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-maison-neue font-semibold text-Charcoal">
                    {itemTitle(item, item.strapiProduct)}
                  </span>
                  <span className="block text-xs font-maison-neue text-Charcoal/45">
                    {categoryForItem(item)}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-Charcoal/35 group-hover:text-Charcoal" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  )
}

export default function ReorderBrowser({
  history,
  legacyOrders = [],
  legacyOrderCount = 0,
  strapiMap,
  countryCode,
  initialAction,
}: {
  history: PurchaseHistoryItem[]
  legacyOrders?: LegacyCustomerOrder[]
  legacyOrderCount?: number
  strapiMap: Record<string, StrapiCollectionProduct>
  countryCode: string
  initialAction?: "usuals"
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("due")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortOption>("due")
  const [dateFilter, setDateFilter] = useState<DateFilter>("all")
  const [selection, setSelection] = useState<SelectionMap>({})
  const [bulkAdding, setBulkAdding] = useState(false)
  const [requestStates, setRequestStates] = useState<
    Record<string, RequestState>
  >({})
  const [addStates, setAddStates] = useState<Record<string, AddState>>({})

  const hydratedHistory = useHydratedHistory(history, strapiMap)
  const reorderableItems = useMemo(
    () => hydratedHistory.filter(canAddItem),
    [hydratedHistory]
  )
  const selectedItems = useMemo(() => {
    const selectedKeys = new Set(Object.keys(selection))
    return reorderableItems.filter((item) => selectedKeys.has(historyKey(item)))
  }, [reorderableItems, selection])
  const selectedCategories = useMemo(
    () => Array.from(new Set(selectedItems.map(categoryForItem))),
    [selectedItems]
  )

  const dueItems = useMemo(
    () => sortItems(reorderableItems, "due"),
    [reorderableItems]
  )
  const stapleItems = useMemo(
    () => sortItems(hydratedHistory, "frequent"),
    [hydratedHistory]
  )
  const [initialActionApplied, setInitialActionApplied] = useState(false)

  useEffect(() => {
    if (
      initialActionApplied ||
      initialAction !== "usuals" ||
      !dueItems.length
    ) {
      return
    }

    setSelection((current) => {
      const next = { ...current }
      for (const item of dueItems.slice(0, 8)) {
        next[historyKey(item)] = next[historyKey(item)] || typicalQuantity(item)
      }
      return next
    })
    setInitialActionApplied(true)
  }, [dueItems, initialAction, initialActionApplied])

  const filteredItems = useMemo(() => {
    const base =
      activeTab === "due"
        ? dueItems
        : activeTab === "staples"
        ? stapleItems
        : hydratedHistory
    const cutoff =
      dateFilter === "all"
        ? null
        : new Date(Date.now() - Number(dateFilter) * 24 * 60 * 60 * 1000)

    const filtered = base.filter((item) => {
      if (!itemMatchesSearch(item, search)) return false
      if (!cutoff) return true
      return new Date(item.lastOrderedAt) >= cutoff
    })

    return sortItems(filtered, activeTab === "due" ? "due" : sort)
  }, [
    activeTab,
    dateFilter,
    dueItems,
    hydratedHistory,
    search,
    sort,
    stapleItems,
  ])

  const filteredLegacyOrderCount = useMemo(() => {
    return legacyOrders
      .filter((order) => order.lines?.length)
      .filter((order) => legacyOrderMatchesSearch(order, search))
      .filter((order) => legacyOrderMatchesDate(order, dateFilter)).length
  }, [dateFilter, legacyOrders, search])

  const gapItems = useMemo(() => {
    const selectedKeys = new Set(Object.keys(selection))
    const categories = new Set(selectedItems.map(categoryForItem))

    return dueItems.filter((item) => {
      const key = historyKey(item)
      if (selectedKeys.has(key)) return false
      if (!categories.size) return true
      return !categories.has(categoryForItem(item))
    })
  }, [dueItems, selectedItems, selection])

  const latestLegacyOrder = useMemo(() => {
    return [...legacyOrders]
      .filter((order) => order.lines?.length)
      .sort(
        (a, b) =>
          new Date(b.placed_at || "").getTime() -
          new Date(a.placed_at || "").getTime()
      )[0]
  }, [legacyOrders])

  const setSelectedQuantity = (key: string, quantity: number) => {
    setSelection((current) => {
      if (!current[key]) return current
      return { ...current, [key]: quantity }
    })
  }

  const toggleItemSelection = (item: HydratedHistoryItem) => {
    if (!canAddItem(item)) {
      toast.error("Item is not available", {
        description: "Ask staff if you want help finding a substitute.",
      })
      return
    }

    const key = historyKey(item)
    setSelection((current) => {
      if (current[key]) {
        const next = { ...current }
        delete next[key]
        return next
      }

      return { ...current, [key]: typicalQuantity(item) }
    })
  }

  const canAddLegacyLine = (line: LegacyCustomerOrder["lines"][number]) => {
    if (!line.medusa_variant_id) return false

    const product = strapiMap[line.medusa_variant_id]
    const variant = product?.MedusaProduct?.Variants?.find(
      (candidate) => candidate.VariantId === line.medusa_variant_id
    )

    return Boolean(variant && isVariantPurchasable(variant))
  }

  const selectUsuals = () => {
    const usuals = dueItems.slice(0, 8)
    if (!usuals.length) return

    setSelection((current) => {
      const next = { ...current }
      for (const item of usuals) {
        next[historyKey(item)] = next[historyKey(item)] || typicalQuantity(item)
      }
      return next
    })
    toast.success("Usuals selected", {
      description: "Review quantities before adding them to your cart.",
    })
  }

  const handleMappedAddToCart = async (
    item: HydratedHistoryItem,
    quantity: number
  ) => {
    const key = historyKey(item)
    const variantId = itemVariantId(item)
    const current = addStates[key] || "idle"
    if (current === "adding" || !variantId || !canAddItem(item)) return

    setAddStates((states) => ({ ...states, [key]: "adding" }))

    try {
      await addToCart({
        variantId,
        quantity,
        countryCode,
        metadata: itemMetadata(item),
      })
      dispatchCartUpdated({ action: "add", variantId, quantity })
      setAddStates((states) => ({ ...states, [key]: "added" }))
    } catch (error) {
      console.error("Failed to add history item to cart:", error)
      reportClientOpsAlert({
        alertKind: "client_add_to_cart_failed",
        title: "Storefront client add-to-cart failed",
        surface: "account_reorder_history_item",
        action: "add_to_cart",
        error,
        productId: item.strapiProduct.MedusaProduct?.ProductId,
        variantId,
        productHandle: itemHandle(item),
      })
      setAddStates((states) => ({ ...states, [key]: "error" }))
      throw error
    }
  }

  const handleSelectedAddToCart = async () => {
    if (!selectedItems.length || bulkAdding) return

    setBulkAdding(true)
    try {
      for (const item of selectedItems) {
        await handleMappedAddToCart(item, selection[historyKey(item)] || 1)
      }
      const count = selectedItems.length
      setSelection({})
      toast.success("Restock cart added", {
        description: `${count} item${count === 1 ? "" : "s"} added to cart.`,
      })
    } catch (error) {
      toast.error("Couldn't add every item", {
        description: "Some items may not have been added. Please try again.",
      })
    } finally {
      setBulkAdding(false)
    }
  }

  const handleLegacyLineAddToCart = async (
    order: LegacyCustomerOrder,
    line: LegacyCustomerOrder["lines"][number]
  ) => {
    const stateKey = legacyLineStateKey(line)
    const current = addStates[stateKey] || "idle"
    if (
      current === "adding" ||
      current === "added" ||
      !line.medusa_variant_id ||
      !canAddLegacyLine(line)
    ) {
      return
    }

    const quantity = Math.max(1, Math.round(Number(line.quantity) || 1))
    setAddStates((states) => ({ ...states, [stateKey]: "adding" }))

    try {
      await addToCart({
        variantId: line.medusa_variant_id,
        quantity,
        countryCode,
        metadata: {
          ...experimentCartMetadata(),
          source: "legacy_order_line",
          legacy_purchase_history_key: legacyLineActionKey(line),
          legacy_order_id: order.id,
          legacy_order_ref: legacyOrderDisplayId(order),
          legacy_order_line_id: line.id,
          legacy_item_id: line.qbd_item_list_id || undefined,
          legacy_sku: line.sku || undefined,
        },
      })
      dispatchCartUpdated({
        action: "add",
        variantId: line.medusa_variant_id,
        quantity,
      })
      setAddStates((states) => ({ ...states, [stateKey]: "added" }))
    } catch (error) {
      console.error("Failed to add legacy order line to cart:", error)
      reportClientOpsAlert({
        alertKind: "client_add_to_cart_failed",
        title: "Storefront client add-to-cart failed",
        surface: "account_legacy_order_line",
        action: "add_to_cart",
        error,
        productId: line.medusa_product_id,
        variantId: line.medusa_variant_id,
      })
      setAddStates((states) => ({ ...states, [stateKey]: "error" }))
      throw error
    }
  }

  const handleLegacyOrderAddToCart = async (order: LegacyCustomerOrder) => {
    const availableLines = order.lines.filter(canAddLegacyLine)
    if (!availableLines.length) return

    try {
      for (const line of availableLines) {
        await handleLegacyLineAddToCart(order, line)
      }
      toast.success("Past order added", {
        description: `${availableLines.length} available item${
          availableLines.length === 1 ? "" : "s"
        } added to cart.`,
      })
    } catch (error) {
      toast.error("Couldn't add every item", {
        description: "Some past-order items may not have been added.",
      })
    }
  }

  const repeatLastOrder = () => {
    if (!latestLegacyOrder) return
    handleLegacyOrderAddToCart(latestLegacyOrder)
  }

  const handleLegacyReorderRequest = async (item: PurchaseHistoryItem) => {
    const key = historyKey(item)
    const current = requestStates[key] || "idle"
    if (current === "submitting" || current === "sent") return

    setRequestStates((states) => ({ ...states, [key]: "submitting" }))

    const result = await requestLegacyReorderAssistance({ key })
    if (result.success) {
      setRequestStates((states) => ({ ...states, [key]: "sent" }))
      toast.success(
        result.status === "already_requested"
          ? "Request already sent"
          : "Request sent",
        {
          description:
            "Our staff will use your purchase history to match the item.",
        }
      )
      return
    }

    setRequestStates((states) => ({ ...states, [key]: "error" }))
    toast.error("Couldn't send request", {
      description: result.error || "Please call the store and we'll help.",
    })
  }

  const handleLegacyLineReorderRequest = async (
    line: LegacyCustomerOrder["lines"][number]
  ) => {
    const stateKey = legacyLineStateKey(line)
    const current = requestStates[stateKey] || "idle"
    if (current === "submitting" || current === "sent") return

    setRequestStates((states) => ({ ...states, [stateKey]: "submitting" }))

    const result = await requestLegacyReorderAssistance({
      key: legacyLineActionKey(line),
    })
    if (result.success) {
      setRequestStates((states) => ({ ...states, [stateKey]: "sent" }))
      toast.success(
        result.status === "already_requested"
          ? "Request already sent"
          : "Request sent",
        {
          description:
            "Our staff will use this exact order line to match the item.",
        }
      )
      return
    }

    setRequestStates((states) => ({ ...states, [stateKey]: "error" }))
    toast.error("Couldn't send request", {
      description: result.error || "Please call the store and we'll help.",
    })
  }

  if (history.length === 0 && legacyOrders.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <RotateCcw className="mx-auto mb-4 h-16 w-16 text-Charcoal/20" />
        <p className="mb-2 text-lg font-gyst font-bold text-Charcoal">
          No purchase history yet
        </p>
        <p className="mb-6 text-sm font-maison-neue text-Charcoal/50">
          Once you place an order, your usuals and past purchases will appear
          here for easier restocking.
        </p>
        <LocalizedClientLink
          href="/store"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[5px] bg-Gold px-6 py-3 text-sm font-rexton font-bold uppercase text-Charcoal transition-colors hover:bg-Gold/90"
        >
          Browse Products
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <RestockHero
        history={hydratedHistory}
        legacyOrders={legacyOrders}
        selectedCount={selectedItems.length}
        selectedCategories={selectedCategories}
        onSelectUsuals={selectUsuals}
        onRepeatLastOrder={repeatLastOrder}
        canRepeatLastOrder={Boolean(
          latestLegacyOrder?.lines?.some(canAddLegacyLine)
        )}
      />

      <div className="grid gap-5 large:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-4">
          <nav
            className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-2 small:grid-cols-4"
            aria-label="Reorder views"
          >
            {RESTOCK_TABS.map((tab) => (
              <button
                type="button"
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id === "due") setSort("due")
                  if (tab.id !== "due" && sort === "due") setSort("recent")
                }}
                className={`min-h-[40px] rounded-lg px-3 text-xs font-rexton font-bold uppercase transition-colors ${
                  activeTab === tab.id
                    ? "bg-Charcoal text-white"
                    : "text-Charcoal/60 hover:bg-SilverPlate hover:text-Charcoal"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <SearchAndFilters
            search={search}
            sort={sort}
            dateFilter={dateFilter}
            resultCount={
              activeTab === "orders"
                ? filteredLegacyOrderCount
                : filteredItems.length
            }
            activeTab={activeTab}
            onSearchChange={setSearch}
            onSortChange={setSort}
            onDateFilterChange={setDateFilter}
          />

          {activeTab === "orders" ? (
            <PastOrdersTab
              orders={legacyOrders}
              totalCount={legacyOrderCount}
              search={search}
              dateFilter={dateFilter}
              addStates={addStates}
              requestStates={requestStates}
              onAddOrder={handleLegacyOrderAddToCart}
              onAddLine={async (order, line) => {
                try {
                  await handleLegacyLineAddToCart(order, line)
                  toast.success("Added to cart", {
                    description: legacyLineDisplayTitle(line),
                  })
                } catch {
                  toast.error("Couldn't add to cart", {
                    description: "Please try again in a moment.",
                  })
                }
              }}
              onRequestLine={handleLegacyLineReorderRequest}
              canAddLine={canAddLegacyLine}
            />
          ) : filteredItems.length ? (
            <div className="space-y-3">
              {activeTab === "staples" ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                    Repeat favorites
                  </p>
                  <h2 className="mt-1 text-2xl font-gyst font-bold text-Charcoal">
                    Organized by what you buy most
                  </h2>
                </div>
              ) : activeTab === "due" ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                    Restock prompts
                  </p>
                  <h2 className="mt-1 text-2xl font-gyst font-bold text-Charcoal">
                    Likely useful for your next cart
                  </h2>
                </div>
              ) : null}

              {filteredItems.map((item) => {
                const key = historyKey(item)
                return (
                  <HistoryItemRow
                    key={key}
                    item={item}
                    selectedQuantity={selection[key]}
                    addState={addStates[key] || "idle"}
                    requestState={requestStates[key] || "idle"}
                    onQuantityChange={(quantity) => {
                      if (selection[key]) {
                        setSelectedQuantity(key, quantity)
                      } else {
                        setSelection((current) => ({
                          ...current,
                          [key]: quantity,
                        }))
                      }
                    }}
                    onToggleSelect={() => toggleItemSelection(item)}
                    onRequest={() => handleLegacyReorderRequest(item)}
                  />
                )
              })}
            </div>
          ) : (
            <EmptyState activeTab={activeTab} />
          )}
        </div>

        <SelectionRail
          selectedItems={selectedItems}
          selected={selection}
          gapItems={gapItems}
          isAdding={bulkAdding}
          onQuantityChange={setSelectedQuantity}
          onRemove={(key) => {
            setSelection((current) => {
              const next = { ...current }
              delete next[key]
              return next
            })
          }}
          onAddSelected={handleSelectedAddToCart}
          onSelectGapItem={(item) => {
            setSelection((current) => ({
              ...current,
              [historyKey(item)]:
                current[historyKey(item)] || typicalQuantity(item),
            }))
          }}
        />
      </div>
    </div>
  )
}
