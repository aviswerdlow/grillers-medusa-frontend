"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ImageIcon,
  ShieldCheck,
  Search,
  SlidersHorizontal,
  XCircle,
} from "lucide-react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { ProductMerchandisingTagSummary } from "@lib/data/staff/product-merchandising"

type Props = {
  tags: ProductMerchandisingTagSummary[]
}

type SortKey =
  | "name"
  | "productCount"
  | "imageCount"
  | "approvedImageCount"
  | "reviewedImageCount"
  | "rejectedImageCount"
  | "claimedImageCount"
  | "notReviewedImageCount"

type SortDirection = "asc" | "desc"

const TABLE_STATE_KEY = "gp_staff_merchandising_table_state:v1"

const sortLabels: Record<SortKey, string> = {
  name: "Name",
  productCount: "Products",
  imageCount: "Total images",
  approvedImageCount: "Approved",
  reviewedImageCount: "Reviewed",
  rejectedImageCount: "Rejected",
  claimedImageCount: "Claimed",
  notReviewedImageCount: "Not reviewed",
}

function percent(value: number, total: number) {
  if (!total) return "0%"
  return `${Math.round((value / total) * 100)}%`
}

function metricClass(kind: "neutral" | "good" | "warn" | "info") {
  if (kind === "good")
    return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (kind === "warn") return "border-red-200 bg-red-50 text-red-800"
  if (kind === "info") return "border-blue-200 bg-blue-50 text-blue-800"
  return "border-gray-200 bg-white text-Charcoal"
}

function ariaSortValue(
  key: SortKey,
  activeKey: SortKey,
  direction: SortDirection
): "ascending" | "descending" | undefined {
  if (key !== activeKey) return undefined
  return direction === "asc" ? "ascending" : "descending"
}

function SortButton({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  direction: SortDirection
  onSort: (key: SortKey) => void
}) {
  const active = activeKey === sortKey
  const Icon = direction === "asc" ? ArrowUp : ArrowDown

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={
        active
          ? `Sort by ${label}, currently ${
              direction === "asc" ? "ascending" : "descending"
            }`
          : `Sort by ${label}`
      }
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-2 text-left text-xs font-maison-neue-mono uppercase text-Charcoal/55 transition hover:bg-Scroll hover:text-Charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
    >
      {label}
      {active && <Icon className="h-3.5 w-3.5 text-Gold" aria-hidden />}
    </button>
  )
}

export default function ProductMerchandisingTable({ tags }: Props) {
  const [query, setQuery] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [direction, setDirection] = useState<SortDirection>("asc")
  const [stateRestored, setStateRestored] = useState(false)

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(TABLE_STATE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{
          query: string
          sortKey: SortKey
          direction: SortDirection
        }>
        if (typeof saved.query === "string") setQuery(saved.query)
        if (saved.sortKey && saved.sortKey in sortLabels) {
          setSortKey(saved.sortKey)
        }
        if (saved.direction === "asc" || saved.direction === "desc") {
          setDirection(saved.direction)
        }
      }
    } catch {
      // Resume state is a convenience only; a bad browser value must not block work.
    } finally {
      setStateRestored(true)
    }
  }, [])

  useEffect(() => {
    if (!stateRestored) return
    try {
      window.sessionStorage.setItem(
        TABLE_STATE_KEY,
        JSON.stringify({ direction, query, sortKey })
      )
    } catch {
      // Browser storage is best-effort only.
    }
  }, [direction, query, sortKey, stateRestored])

  const totals = useMemo(
    () =>
      tags.reduce(
        (acc, tag) => {
          acc.products += tag.productCount
          acc.images += tag.imageCount
          acc.reviewed += tag.reviewedImageCount
          acc.approved += tag.approvedImageCount
          acc.rejected += tag.rejectedImageCount
          acc.claimed += tag.claimedImageCount
          acc.notReviewed += tag.imageCount - tag.reviewedImageCount
          return acc
        },
        {
          products: 0,
          images: 0,
          reviewed: 0,
          approved: 0,
          rejected: 0,
          claimed: 0,
          notReviewed: 0,
        }
      ),
    [tags]
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = needle
      ? tags.filter((tag) =>
          [
            tag.displayName,
            tag.name,
            tag.description,
            tag.seoDescription,
            tag.l2Parents.join(" "),
            tag.metadata.join(" "),
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        )
      : tags

    return [...rows].sort((a, b) => {
      const multiplier = direction === "asc" ? 1 : -1
      const alphabetical = a.displayName.localeCompare(
        b.displayName,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        }
      )
      if (sortKey === "name") {
        return alphabetical * multiplier
      }
      if (sortKey === "notReviewedImageCount") {
        const difference =
          (a.imageCount -
            a.reviewedImageCount -
            (b.imageCount - b.reviewedImageCount)) *
          multiplier
        return difference || alphabetical
      }
      const difference =
        ((a[sortKey] as number) - (b[sortKey] as number)) * multiplier
      return difference || alphabetical
    })
  }, [direction, query, sortKey, tags])

  function updateSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setDirection(key === "name" ? "asc" : "desc")
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 medium:grid-cols-5">
        <div className={`rounded-md border p-4 ${metricClass("info")}`}>
          <p className="text-[11px] font-maison-neue-mono uppercase opacity-65">
            Total images
          </p>
          <p className="mt-2 text-3xl font-gyst font-bold">{totals.images}</p>
        </div>
        <div className={`rounded-md border p-4 ${metricClass("good")}`}>
          <p className="text-[11px] font-maison-neue-mono uppercase opacity-65">
            Total approved
          </p>
          <p className="mt-2 text-3xl font-gyst font-bold">{totals.approved}</p>
        </div>
        <div className={`rounded-md border p-4 ${metricClass("warn")}`}>
          <p className="text-[11px] font-maison-neue-mono uppercase opacity-65">
            Total rejected
          </p>
          <p className="mt-2 text-3xl font-gyst font-bold">{totals.rejected}</p>
        </div>
        <div className={`rounded-md border p-4 ${metricClass("neutral")}`}>
          <p className="text-[11px] font-maison-neue-mono uppercase opacity-65">
            Total not reviewed
          </p>
          <p className="mt-2 text-3xl font-gyst font-bold">
            {totals.notReviewed}
          </p>
        </div>
        <div className={`rounded-md border p-4 ${metricClass("neutral")}`}>
          <p className="text-[11px] font-maison-neue-mono uppercase opacity-65">
            Total claimed
          </p>
          <p className="mt-2 text-3xl font-gyst font-bold">{totals.claimed}</p>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <div className="flex flex-col gap-3 large:flex-row large:items-center large:justify-between">
            <label className="relative block large:w-[420px]">
              <span className="sr-only">Search image categories</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-Charcoal/35"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search image categories or parent groups"
                aria-describedby="merchandising-search-results"
                className="min-h-[44px] w-full rounded-md border border-gray-200 bg-Scroll/35 pl-10 pr-3 text-sm font-maison-neue text-Charcoal outline-none transition focus:border-Gold focus:bg-white focus:ring-2 focus:ring-Gold/15"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <span
                id="merchandising-search-results"
                role="status"
                aria-live="polite"
                className="inline-flex items-center rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs font-maison-neue-mono uppercase text-Charcoal/55"
              >
                {filtered.length} of {tags.length} categories /{" "}
                {totals.products} products
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs font-maison-neue-mono uppercase text-Charcoal/55">
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                Sort by {sortLabels[sortKey].toLowerCase()}
              </span>
              <select
                aria-label="Sort image categories"
                value={sortKey}
                onChange={(event) => updateSort(event.target.value as SortKey)}
                className="min-h-[44px] rounded-md border border-gray-200 bg-white px-2 text-sm font-maison-neue text-Charcoal outline-none focus:border-Gold focus:ring-2 focus:ring-Gold/15"
              >
                {Object.entries(sortLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="min-h-[44px] rounded-md border border-gray-200 bg-white px-3 text-xs font-rexton font-bold uppercase text-Charcoal transition hover:border-Charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
                >
                  Clear search
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          className="divide-y divide-gray-100 medium:hidden"
          data-testid="merchandising-mobile-list"
        >
          {filtered.map((tag) => {
            const notReviewed = tag.imageCount - tag.reviewedImageCount
            return (
              <article key={tag.documentId} className="p-4">
                <LocalizedClientLink
                  href={`/account/staff/merchandising/${encodeURIComponent(
                    tag.documentId
                  )}`}
                  className="group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-Charcoal text-white">
                      <ImageIcon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-base font-maison-neue font-semibold text-Charcoal group-hover:text-Gold">
                        {tag.displayName}
                      </span>
                      <span className="mt-1 block break-words text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                        {tag.l2Parents.length
                          ? tag.l2Parents.join(" / ")
                          : "No L2 parent detected"}
                      </span>
                    </span>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-Gold"
                      style={{
                        width: percent(tag.reviewedImageCount, tag.imageCount),
                      }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-maison-neue text-Charcoal/65">
                    <span>{tag.productCount} products</span>
                    <span>{tag.imageCount} images</span>
                    <span className="text-emerald-700">
                      {tag.approvedImageCount} approved
                    </span>
                    <span className={notReviewed ? "text-amber-800" : ""}>
                      {notReviewed} not reviewed
                    </span>
                    {tag.rejectedImageCount > 0 && (
                      <span className="text-red-700">
                        {tag.rejectedImageCount} rejected
                      </span>
                    )}
                    <span>
                      {percent(tag.reviewedImageCount, tag.imageCount)} done
                    </span>
                  </div>
                </LocalizedClientLink>
              </article>
            )
          })}
        </div>

        <div className="hidden overflow-x-auto medium:block">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-Scroll/45">
                <th
                  aria-sort={ariaSortValue("name", sortKey, direction)}
                  className="px-4 py-3 text-left"
                >
                  <SortButton
                    label="Name"
                    sortKey="name"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={updateSort}
                  />
                </th>
                <th
                  aria-sort={ariaSortValue("productCount", sortKey, direction)}
                  className="px-4 py-3 text-center"
                >
                  <SortButton
                    label="Products"
                    sortKey="productCount"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={updateSort}
                  />
                </th>
                <th
                  aria-sort={ariaSortValue("imageCount", sortKey, direction)}
                  className="px-4 py-3 text-center"
                >
                  <SortButton
                    label="Total images"
                    sortKey="imageCount"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={updateSort}
                  />
                </th>
                <th
                  aria-sort={ariaSortValue(
                    "approvedImageCount",
                    sortKey,
                    direction
                  )}
                  className="px-4 py-3 text-center"
                >
                  <SortButton
                    label="Approved"
                    sortKey="approvedImageCount"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={updateSort}
                  />
                </th>
                <th
                  aria-sort={ariaSortValue(
                    "rejectedImageCount",
                    sortKey,
                    direction
                  )}
                  className="px-4 py-3 text-center"
                >
                  <SortButton
                    label="Rejected"
                    sortKey="rejectedImageCount"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={updateSort}
                  />
                </th>
                <th
                  aria-sort={ariaSortValue(
                    "claimedImageCount",
                    sortKey,
                    direction
                  )}
                  className="px-4 py-3 text-center"
                >
                  <SortButton
                    label="Claimed"
                    sortKey="claimedImageCount"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={updateSort}
                  />
                </th>
                <th
                  aria-sort={ariaSortValue(
                    "notReviewedImageCount",
                    sortKey,
                    direction
                  )}
                  className="px-4 py-3 text-center"
                >
                  <SortButton
                    label="Not reviewed"
                    sortKey="notReviewedImageCount"
                    activeKey={sortKey}
                    direction={direction}
                    onSort={updateSort}
                  />
                </th>
                <th className="px-4 py-3 text-left">Review status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tag) => (
                <tr
                  key={tag.documentId}
                  className="border-b border-gray-100 transition hover:bg-Gold/5"
                >
                  <td className="px-4 py-4 align-top">
                    <LocalizedClientLink
                      href={`/account/staff/merchandising/${encodeURIComponent(
                        tag.documentId
                      )}`}
                      className="group block"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-Charcoal text-white">
                          <ImageIcon className="h-4 w-4" aria-hidden />
                        </span>
                        <span>
                          <span className="block text-base font-maison-neue font-semibold text-Charcoal group-hover:text-Gold">
                            {tag.displayName}
                          </span>
                          <span className="mt-1 block text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                            {tag.l2Parents.length
                              ? tag.l2Parents.join(" / ")
                              : "No L2 parent detected"}
                          </span>
                        </span>
                      </div>
                    </LocalizedClientLink>
                  </td>
                  <td className="px-4 py-4 text-center align-top text-lg font-maison-neue font-semibold text-Charcoal">
                    {tag.productCount}
                  </td>
                  <td className="px-4 py-4 text-center align-top">
                    <div className="font-maison-neue text-lg font-semibold text-Charcoal">
                      {tag.imageCount}
                    </div>
                    {tag.noImageProductCount > 0 && (
                      <div className="text-xs font-maison-neue text-red-700">
                        {tag.noImageProductCount} product
                        {tag.noImageProductCount === 1 ? "" : "s"} missing
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center align-top text-lg font-maison-neue font-semibold text-emerald-700">
                    {tag.approvedImageCount}
                  </td>
                  <td className="px-4 py-4 text-center align-top text-lg font-maison-neue font-semibold text-red-700">
                    {tag.rejectedImageCount}
                  </td>
                  <td className="px-4 py-4 text-center align-top text-lg font-maison-neue font-semibold text-amber-700">
                    {tag.claimedImageCount}
                  </td>
                  <td className="px-4 py-4 text-center align-top text-lg font-maison-neue font-semibold text-Charcoal">
                    {tag.imageCount - tag.reviewedImageCount}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-col gap-2">
                      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-Gold"
                          style={{
                            width: percent(
                              tag.reviewedImageCount,
                              tag.imageCount
                            ),
                          }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-maison-neue text-Charcoal/60">
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2
                            className="h-3.5 w-3.5 text-emerald-600"
                            aria-hidden
                          />
                          {tag.approvedImageCount} approved
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <XCircle
                            className="h-3.5 w-3.5 text-red-600"
                            aria-hidden
                          />
                          {tag.rejectedImageCount} rejected
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck
                            className="h-3.5 w-3.5 text-amber-600"
                            aria-hidden
                          />
                          {tag.imageCount - tag.reviewedImageCount} open
                        </span>
                        {tag.claimedImageCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck
                              className="h-3.5 w-3.5 text-blue-600"
                              aria-hidden
                            />
                            {tag.claimedImageCount} claimed
                          </span>
                        )}
                        <span>
                          {percent(tag.reviewedImageCount, tag.imageCount)} done
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filtered.length && (
          <div className="px-4 py-14 text-center">
            <p className="font-maison-neue text-sm text-Charcoal/55">
              No L3 groups match that search.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
