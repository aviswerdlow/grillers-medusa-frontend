"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { ChevronDown } from "lucide-react"
import Button from "@modules/common/components/button"
import {
  addCatchWeightFinalizationLine,
  approveCatchWeightFinalization,
  chargeAndReleaseCatchWeightOrder,
  fulfillReleasedCatchWeightOrder,
  getCatchWeightFinalizationDetail,
  listCatchWeightFinalizationQueue,
  markCatchWeightReadyForPacking,
  returnCatchWeightOrderToPacking,
  returnCatchWeightOrderToPicking,
  startCatchWeightFinalization,
  unclaimCatchWeightPick,
  updateCatchWeightFinalizationLine,
  updateCatchWeightFinalizationPackages,
  type StaffCatchWeightFinalizationDetail,
  type StaffCatchWeightFinalizationSummary,
  type StaffFinalizationPackage,
  type StaffCatchWeightLine,
} from "@lib/data/staff/catch-weight-finalization"
import {
  catchWeightReadyForFulfillment,
  hasActiveFulfillment,
} from "@lib/util/catch-weight-fulfillment"
import {
  searchStaffProducts,
  type StaffProductSearchResult,
} from "@lib/data/staff/order-entry"
import {
  parseStaffAuditLog,
  type StaffAuditEntry,
} from "@lib/data/staff/exception-types"
import {
  replacementPriceLabel,
  replacementUnitPrice,
} from "./replacement-pricing"
import { resolveStaffLinePricingBasis } from "./pricing-basis"

const statusLabels: Record<string, string> = {
  pending_pick: "Needs picking",
  picking: "Picking",
  ready_for_packing: "Ready for packing",
  pending_pack: "Needs picking",
  packing: "Packing",
  packed_pending_review: "Packing review",
  packed_pending_charge: "Ready to charge",
  charge_attempting: "Charging",
  charge_failed_hold: "Charge hold",
  charged_ready_to_ship: "Ready to ship",
  released_to_fulfillment: "Released",
  ready: "Ready",
  needs_pick: "Needs pick",
  needs_weight: "Needs weight",
  removed: "Removed",
  substituted: "Substituted",
}

const statusClass: Record<string, string> = {
  charge_failed_hold: "border-red-200 bg-red-50 text-red-800",
  packed_pending_charge: "border-emerald-200 bg-emerald-50 text-emerald-800",
  charged_ready_to_ship: "border-blue-200 bg-blue-50 text-blue-800",
  released_to_fulfillment: "border-blue-200 bg-blue-50 text-blue-800",
  ready_for_packing: "border-blue-200 bg-blue-50 text-blue-800",
  pending_pick: "border-amber-200 bg-amber-50 text-amber-800",
  pending_pack: "border-amber-200 bg-amber-50 text-amber-800",
  picking: "border-amber-200 bg-amber-50 text-amber-800",
  packing: "border-amber-200 bg-amber-50 text-amber-800",
  packed_pending_review: "border-amber-200 bg-amber-50 text-amber-800",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  needs_pick: "border-amber-200 bg-amber-50 text-amber-800",
  needs_weight: "border-amber-200 bg-amber-50 text-amber-800",
  removed: "border-red-200 bg-red-50 text-red-800",
  substituted: "border-blue-200 bg-blue-50 text-blue-800",
}

const fieldClass =
  "min-h-[42px] w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-Charcoal outline-none transition focus:border-Gold focus:ring-2 focus:ring-Gold/20 disabled:bg-gray-50 disabled:text-Charcoal/40"

const labelClass =
  "text-[11px] font-maison-neue-mono uppercase tracking-[0.08em] text-Charcoal/55"

const secondaryButtonClass =
  "min-h-[42px] rounded-md border border-Charcoal bg-white px-4 text-xs font-rexton font-bold uppercase text-Charcoal"

const primaryButtonClass =
  "min-h-[42px] rounded-md bg-Charcoal px-4 text-xs font-rexton font-bold uppercase text-white"

const disabledButtonClass =
  "min-h-[42px] cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-4 text-xs font-rexton font-bold uppercase text-Charcoal/35 shadow-none"

const OUT_OF_STOCK_REASON = "out_of_stock"
const OUT_OF_STOCK_LABEL = "Out of stock"

const shipperOptions = [
  {
    value: "Shipper-Micro",
    label: "Micro",
    detail: "16x14x13 OD",
    qbdListId: "8000085A-1415899147",
  },
  {
    value: "Shipper-330-Medium",
    label: "330 Medium",
    detail: "18x15x13 OD",
    qbdListId: "8000085B-1415899316",
  },
  {
    value: "Shipper-345-Large",
    label: "345 Large",
    detail: "24x17x13 OD",
    qbdListId: "8000085C-1415899425",
  },
  {
    value: "Shipper-360-ExtraLarge",
    label: "360 Extra large",
    detail: "24x21x17 OD",
    qbdListId: "8000085D-1415899521",
  },
  {
    value: "Cooler-Igloo",
    label: "Cooler / igloo",
    detail: "Pickup or delivery cooler",
    qbdListId: "",
  },
  {
    value: "Other",
    label: "Other",
    detail: "Describe packaging",
    qbdListId: "",
  },
]

type FinalizationPhase = "picking" | "packing"
// #269: the queue sort dropdown only offers ship-date ordering. The other four
// keys (order_newest/order_oldest/total_desc/total_asc) were removed from the
// UI; narrow the type so the dead switch branches can be dropped too.
type QueueSortKey = "ship_date_asc" | "ship_date_desc"

function money(value?: number | string | null, currencyCode = "usd") {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return "-"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amount)
}

function numberText(value?: number | string | null) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return ""
  return String(amount)
}

const fulfillmentTypeLabels: Record<string, string> = {
  plant_pickup: "Plant pickup",
  atlanta_delivery: "Atlanta delivery",
  ups_shipping: "UPS shipping",
  southeast_pickup: "Southeast pickup",
}

function fulfillmentTypeLabel(value?: string | null) {
  if (!value) return ""
  return fulfillmentTypeLabels[value] || value.replace(/_/g, " ")
}

function shortDateLabel(value?: string | null) {
  if (!value) return ""
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const date = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : us
    ? new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function queueDateKey(item: StaffCatchWeightFinalizationSummary) {
  if (item.fulfillment_date_key) return item.fulfillment_date_key
  const raw = item.fulfillment_date || ""
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10)
}

function longDateLabel(value?: string | null) {
  if (!value) return "No ship / pickup date"
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const date = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function queueDateSortValue(item: StaffCatchWeightFinalizationSummary) {
  const key = queueDateKey(item)
  if (!key) return Number.POSITIVE_INFINITY
  const date = new Date(`${key}T00:00:00`)
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime()
}

function queueDisplayIdValue(item: StaffCatchWeightFinalizationSummary) {
  const displayId = Number(item.display_id)
  if (Number.isFinite(displayId)) return displayId
  const fallback = Number(item.order_id?.match(/\d+$/)?.[0])
  return Number.isFinite(fallback) ? fallback : 0
}

function compareQueueDates(
  a: StaffCatchWeightFinalizationSummary,
  b: StaffCatchWeightFinalizationSummary,
  direction: "asc" | "desc" = "asc"
) {
  const keyA = queueDateKey(a)
  const keyB = queueDateKey(b)
  if (!keyA && !keyB) return 0
  if (!keyA) return 1
  if (!keyB) return -1
  const diff = queueDateSortValue(a) - queueDateSortValue(b)
  return direction === "desc" ? -diff : diff
}

function compareQueueOrders(
  a: StaffCatchWeightFinalizationSummary,
  b: StaffCatchWeightFinalizationSummary,
  sortKey: QueueSortKey
) {
  const orderA = queueDisplayIdValue(a)
  const orderB = queueDisplayIdValue(b)

  switch (sortKey) {
    case "ship_date_desc": {
      const dateCompare = compareQueueDates(a, b, "desc")
      if (dateCompare) return dateCompare
      return orderA - orderB
    }
    case "ship_date_asc":
    default: {
      const dateCompare = compareQueueDates(a, b)
      if (dateCompare) return dateCompare
      return orderA - orderB
    }
  }
}

function dateKeySortValue(key: string) {
  if (!key || key === "unscheduled") return Number.POSITIVE_INFINITY
  const date = new Date(`${key}T00:00:00`)
  return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime()
}

function compareGroupDates(
  a: { key: string },
  b: { key: string },
  direction: "asc" | "desc" = "asc"
) {
  const valueA = dateKeySortValue(a.key)
  const valueB = dateKeySortValue(b.key)
  if (valueA === valueB) return 0
  if (!Number.isFinite(valueA)) return 1
  if (!Number.isFinite(valueB)) return -1
  return direction === "desc" ? valueB - valueA : valueA - valueB
}

function groupQueueByShipDate(
  items: StaffCatchWeightFinalizationSummary[],
  direction: "asc" | "desc" = "asc"
) {
  const groups: Array<{
    key: string
    label: string
    items: StaffCatchWeightFinalizationSummary[]
  }> = []
  const groupMap = new Map<string, (typeof groups)[number]>()

  for (const item of items) {
    const key = queueDateKey(item) || "unscheduled"
    const label =
      key === "unscheduled"
        ? "No ship / pickup date"
        : longDateLabel(item.fulfillment_date || key)
    const group =
      groupMap.get(key) ||
      (() => {
        const nextGroup = { key, label, items: [] }
        groupMap.set(key, nextGroup)
        groups.push(nextGroup)
        return nextGroup
      })()
    group.items.push(item)
  }

  return groups.sort((a, b) => compareGroupDates(a, b, direction))
}

function statusBadge(status?: string) {
  const safe = status || "pending_pack"
  return (
    <span
      className={`inline-flex min-h-[26px] items-center rounded-full border px-2.5 text-[11px] font-maison-neue-mono uppercase ${
        statusClass[safe] || "border-gray-200 bg-gray-50 text-Charcoal/65"
      }`}
    >
      {statusLabels[safe] || safe.replace(/_/g, " ")}
    </span>
  )
}

function messagesFromLineValue(value: StaffCatchWeightLine["errors"]) {
  if (!Array.isArray(value) || !value.length) return null
  const messages = value
    .map((item) => (typeof item === "string" ? item : item.message))
    .filter((message): message is string => Boolean(message))
  return messages.length ? messages : null
}

function lineMessage(value: StaffCatchWeightLine["errors"]) {
  return messagesFromLineValue(value)?.join(" ") || null
}

function finalizationBlockingIssues(
  detail: StaffCatchWeightFinalizationDetail | null
) {
  if (!detail) return []

  const linesByItemId = new Map(
    (detail.lines || []).map((line) => [line.line_item_id, line])
  )
  const issues: string[] = []
  const seen = new Set<string>()
  const pushIssue = (message?: string | null, lineItemId?: string | null) => {
    if (!message) return
    const line = lineItemId ? linesByItemId.get(lineItemId) : null
    const title = line?.customer_title || line?.title_snapshot
    const text = title ? `${title}: ${message}` : message
    const key = `${lineItemId || "order"}:${message}`
    if (seen.has(key)) return
    seen.add(key)
    issues.push(text)
  }

  for (const error of detail.errors || []) {
    if (typeof error === "string") {
      pushIssue(error)
    } else {
      pushIssue(error.message, error.line_item_id)
    }
  }

  for (const line of detail.lines || []) {
    for (const message of messagesFromLineValue(line.errors) || []) {
      pushIssue(message, line.line_item_id)
    }
  }

  return issues
}

function lineDisplayTitle(line: StaffCatchWeightLine) {
  return line.customer_title || line.title_snapshot || "Order line"
}

function lineActualQuantity(line: StaffCatchWeightLine) {
  const amount = Number(line.actual_quantity)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

type ReadinessIssue = {
  lineKey: string
  title: string
  message: string
  tone: "blocker" | "warning"
}

function lineIssueKey(line: StaffCatchWeightLine) {
  return line.line_item_id || line.id
}

function finalizationPickerReadiness(
  detail: StaffCatchWeightFinalizationDetail | null
) {
  if (!detail) return { blockers: [], warnings: [], lineIssues: {} }

  const blockers: string[] = []
  const warnings: string[] = []
  const lineIssues: Record<string, ReadinessIssue[]> = {}

  function addLineIssue(
    line: StaffCatchWeightLine,
    tone: ReadinessIssue["tone"],
    message: string
  ) {
    const title = lineDisplayTitle(line)
    const issue = {
      lineKey: lineIssueKey(line),
      title,
      message,
      tone,
    }
    lineIssues[issue.lineKey] = [...(lineIssues[issue.lineKey] || []), issue]

    if (tone === "blocker") {
      blockers.push(`${title}: ${message}`)
    } else {
      warnings.push(`${title}: ${message}`)
    }
  }

  for (const line of detail.lines || []) {
    const ordered = orderedQuantity(line)
    const picked = lineActualQuantity(line)
    const status = line.status || "needs_pick"

    if (status === "removed") {
      if (!line.short_reason && !line.note) {
        addLineIssue(
          line,
          "blocker",
          "Removed lines need an out-of-stock reason."
        )
      } else {
        addLineIssue(line, "warning", "Removed as out of stock.")
      }
      continue
    }

    if (status === "substituted") {
      if (
        !line.replacement_variant_id ||
        !line.replacement_qbd_list_id ||
        !line.replacement_reason
      ) {
        addLineIssue(line, "blocker", "Finish the substitution before handoff.")
      } else {
        addLineIssue(line, "warning", "Substitution selected.")
      }
      continue
    }

    if (picked <= 0) {
      addLineIssue(
        line,
        "blocker",
        `Picked is 0 of ${
          ordered || 0
        }. Enter a picked count, or use Out of Stock/Substitute if it is out of stock.`
      )
      continue
    }

    if (status !== "ready") {
      addLineIssue(
        line,
        "blocker",
        "Save the picked count so the line is marked ready."
      )
      continue
    }

    if (ordered > 0 && picked < ordered && !line.short_reason) {
      addLineIssue(
        line,
        "blocker",
        `Picked ${picked} of ${ordered}; save the line so the out-of-stock shortage is recorded.`
      )
      continue
    }

    if (ordered > 0 && picked < ordered) {
      addLineIssue(
        line,
        "warning",
        `Picked ${picked} of ${ordered}; shortage will be recorded as out of stock.`
      )
    }
  }

  return { blockers, warnings, lineIssues }
}

function draftFromLine(line: StaffCatchWeightLine) {
  const title = line.customer_title || line.title_snapshot || "Order line"
  const unitWeights = Array.isArray(line.metadata?.actual_unit_weights_lb)
    ? line.metadata?.actual_unit_weights_lb
        .map((value: unknown) => numberText(value as number | string))
        .filter(Boolean)
    : []

  return {
    actual_weight_total: numberText(line.actual_weight_total),
    actual_unit_weights: unitWeights,
    actual_piece_count: numberText(line.actual_piece_count ?? 0),
    actual_quantity: numberText(line.actual_quantity ?? 0),
    actual_unit_price: numberText(line.actual_unit_price),
    status: line.status || "needs_pick",
    replacement_variant_id: line.replacement_variant_id || "",
    replacement_qbd_list_id: line.replacement_qbd_list_id || "",
    replacement_reason: line.replacement_reason || "",
    short_reason: line.short_reason || "",
    note: line.note || "",
  }
}

function draftSignature(draft: ReturnType<typeof draftFromLine>) {
  return JSON.stringify(draft)
}

function weightTotal(weights: string[]) {
  const total = weights.reduce((sum, value) => {
    const amount = Number(value)
    return Number.isFinite(amount) && amount > 0 ? sum + amount : sum
  }, 0)
  return total > 0 ? Math.round(total * 1000) / 1000 : 0
}

function positiveWeightCount(weights: string[]) {
  return weights.filter((value) => {
    const amount = Number(value)
    return Number.isFinite(amount) && amount > 0
  }).length
}

function positiveDraftQuantity(value: string) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function orderedQuantity(line: StaffCatchWeightLine) {
  const amount = Number(line.ordered_quantity)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function pickedQuantity(line: StaffCatchWeightLine) {
  const amount = Number(line.metadata?.picked_quantity ?? line.actual_quantity)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function actualQuantityValue(draft: ReturnType<typeof draftFromLine>) {
  const amount = Number(draft.actual_quantity)
  return Number.isFinite(amount) && amount >= 0 ? amount : 0
}

function lineHasShortage(
  line: StaffCatchWeightLine,
  draft: ReturnType<typeof draftFromLine>
) {
  const ordered = orderedQuantity(line)
  const actual = actualQuantityValue(draft)
  return ordered > 0 && actual >= 0 && actual < ordered
}

function readinessIssueAppliesToDraft(
  issue: ReadinessIssue,
  line: StaffCatchWeightLine,
  draft: ReturnType<typeof draftFromLine>,
  packingPhase: boolean
) {
  const message = issue.message
  const actual = actualQuantityValue(draft)
  const ordered = orderedQuantity(line)
  const isException =
    draft.status === "removed" || draft.status === "substituted"

  if (message === "Removed as out of stock.") {
    return draft.status === "removed"
  }

  if (message === "Substitution selected.") {
    return draft.status === "substituted"
  }

  if (message.includes("Removed lines need")) {
    return draft.status === "removed" && !draft.short_reason && !draft.note
  }

  if (message.includes("Finish the substitution")) {
    return (
      draft.status === "substituted" &&
      (!draft.replacement_variant_id ||
        !draft.replacement_qbd_list_id ||
        !draft.replacement_reason)
    )
  }

  if (message.startsWith("Picked is 0")) {
    return !packingPhase && !isException && actual <= 0
  }

  if (message.includes("Save the picked count")) {
    return !isException && draft.status !== "ready"
  }

  if (message.startsWith("Picked ") || message.includes("shortage")) {
    return ordered > 0 && actual < ordered
  }

  return true
}

function positiveWholeQuantity(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.ceil(amount) : 0
}

function expectedUnitWeightCount(
  line: StaffCatchWeightLine,
  draft: ReturnType<typeof draftFromLine>
) {
  return (
    Math.max(
      positiveWholeQuantity(line.metadata?.picked_quantity)
    ) ||
    positiveWholeQuantity(line.ordered_quantity) ||
    positiveWholeQuantity(line.actual_quantity) ||
    positiveWholeQuantity(line.actual_piece_count) ||
    positiveWeightCount(draft.actual_unit_weights) ||
    1
  )
}

function unitWeightRows(
  line: StaffCatchWeightLine,
  draft: ReturnType<typeof draftFromLine>
) {
  const rowCount = expectedUnitWeightCount(line, draft)
  return Array.from(
    { length: rowCount },
    (_, index) => draft.actual_unit_weights[index] || ""
  )
}

function deriveLineStatus(
  draft: ReturnType<typeof draftFromLine>,
  requiresActualWeight: boolean,
  packingPhase: boolean,
  expectedWeightCount = 0
) {
  if (draft.status === "removed" || draft.status === "substituted") {
    return draft.status
  }
  if (requiresActualWeight && packingPhase) {
    const neededWeights = Math.max(1, expectedWeightCount)
    return positiveWeightCount(draft.actual_unit_weights) >= neededWeights
      ? "ready"
      : "needs_weight"
  }
  return positiveDraftQuantity(draft.actual_quantity) > 0
    ? "ready"
    : "needs_pick"
}

function withDerivedLineStatus(
  draft: ReturnType<typeof draftFromLine>,
  requiresActualWeight: boolean,
  packingPhase: boolean,
  expectedWeightCount = 0,
  line?: StaffCatchWeightLine
) {
  if (draft.status === "substituted") return draft

  if (draft.status === "removed") {
    return {
      ...draft,
      short_reason: draft.short_reason || OUT_OF_STOCK_REASON,
    }
  }

  const derivedStatus = deriveLineStatus(
    draft,
    requiresActualWeight,
    packingPhase,
    expectedWeightCount
  )

  if (line && lineHasShortage(line, draft)) {
    const actual = actualQuantityValue(draft)
    const picked = pickedQuantity(line)
    if (packingPhase && picked > 0 && actual < picked) {
      return {
        ...draft,
        status: requiresActualWeight ? "needs_weight" : "needs_pick",
      }
    }
    return {
      ...draft,
      short_reason: draft.short_reason || OUT_OF_STOCK_REASON,
      status:
        actual > 0
          ? derivedStatus === "needs_weight"
            ? "needs_weight"
            : "ready"
          : packingPhase
          ? derivedStatus
          : "removed",
    }
  }

  const nextDraft =
    draft.short_reason === OUT_OF_STOCK_REASON
      ? { ...draft, short_reason: "" }
      : draft

  return {
    ...nextDraft,
    status: derivedStatus,
  }
}

function pricingBasisBadge(requiresActualWeight: boolean) {
  return (
    <span
      className={`inline-flex min-h-[26px] items-center rounded-full border px-2.5 text-[11px] font-maison-neue-mono uppercase ${
        requiresActualWeight
          ? "border-blue-200 bg-blue-50 text-blue-800"
          : "border-gray-200 bg-gray-50 text-Charcoal/65"
      }`}
    >
      {requiresActualWeight ? "By weight" : "Per pack"}
    </span>
  )
}

function auditActionLabel(entry: StaffAuditEntry) {
  return (entry.action || entry.staff_action || "staff action").replace(
    /_/g,
    " "
  )
}

function OrderAuditTrail({ order }: { order: Record<string, any> }) {
  const auditLog = parseStaffAuditLog(order?.metadata || {})
  const recent = auditLog.slice(-8).reverse()

  return (
    <details className="group border-b border-gray-200 bg-white px-4 py-3 sm:px-5">
      <summary className="flex min-h-[40px] cursor-pointer list-none items-center justify-between gap-4 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold/30 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-xs font-maison-neue-mono uppercase text-Gold">
            Super admin
          </span>
          <span className="mt-0.5 block text-sm font-maison-neue font-semibold text-Charcoal">
            Audit trail
          </span>
        </span>
        <span className="flex items-center gap-3 text-xs font-maison-neue text-Charcoal/45">
          {auditLog.length
            ? `${auditLog.length} recorded actions`
            : "No actions yet"}
          <ChevronDown
            aria-hidden="true"
            className="h-4 w-4 text-Charcoal/45 transition group-open:rotate-180"
          />
        </span>
      </summary>

      {recent.length ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {recent.map((entry, index) => (
            <div
              className="rounded-md border border-gray-100 bg-SilverPlate/20 px-3 py-2"
              key={`${entry.at || "audit"}-${index}`}
            >
              <p className="text-sm font-maison-neue font-semibold capitalize text-Charcoal">
                {auditActionLabel(entry)}
              </p>
              <p className="mt-1 text-xs font-maison-neue text-Charcoal/55">
                {[
                  entry.status,
                  entry.staff_actor_name ||
                    entry.staff_actor_email ||
                    entry.staff_actor_customer_id ||
                    entry.staff_actor_id,
                  entry.at,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </p>
              {(entry.line_item_id ||
                entry.sku ||
                entry.finalization_id ||
                entry.charge_attempt_id) && (
                <p className="mt-1 truncate text-xs font-maison-neue text-Charcoal/45">
                  {[
                    entry.sku ? `SKU ${entry.sku}` : "",
                    entry.line_item_id ? `Line ${entry.line_item_id}` : "",
                    entry.charge_attempt_id
                      ? `Charge ${entry.charge_attempt_id}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-gray-100 bg-SilverPlate/20 px-3 py-2 text-sm font-maison-neue text-Charcoal/55">
          This order has no recorded staff actions yet.
        </p>
      )}
    </details>
  )
}

function LineEditor({
  orderId,
  line,
  currencyCode,
  phase,
  canEdit,
  readinessIssues = [],
  onSaved,
}: {
  orderId: string
  line: StaffCatchWeightLine
  currencyCode: string
  phase: FinalizationPhase
  canEdit: boolean
  readinessIssues?: ReadinessIssue[]
  onSaved: () => void
}) {
  const [draft, setDraft] = useState(() => draftFromLine(line))
  const [replacementQuery, setReplacementQuery] = useState("")
  const [replacementResults, setReplacementResults] = useState<
    StaffProductSearchResult[]
  >([])
  const [error, setError] = useState<string | null>(null)
  const [lineStatusMessage, setLineStatusMessage] = useState<string | null>(
    null
  )
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle")
  const [isPending, startTransition] = useTransition()
  const [isSearchPending, startSearchTransition] = useTransition()
  // #271: collapse each line to a single row by default; the operator can open
  // the exception controls, and they auto-open when a line needs attention.
  const [manuallyExpanded, setManuallyExpanded] = useState(false)
  const lastSavedSignature = useRef(draftSignature(draft))
  const latestDraftSignature = useRef(draftSignature(draft))
  const isRemoved = draft.status === "removed"
  const isSubstituted = draft.status === "substituted"
  const title = line.customer_title || line.title_snapshot || "Order line"
  const pricingBasis = resolveStaffLinePricingBasis(line, title)
  const requiresActualWeight = pricingBasis === "by_weight"
  const fixedPriceLine = pricingBasis === "per_pack"
  const packingPhase = phase === "packing"
  const pickedCount = pickedQuantity(line)
  const orderedCount = orderedQuantity(line)
  const actualCount = actualQuantityValue(draft)
  const lineHasFullQuantity = orderedCount > 0 && actualCount >= orderedCount
  const lineHasPartialShortage =
    orderedCount > 0 && actualCount > 0 && actualCount < orderedCount
  const canPickLineExceptions = !packingPhase
  const stockExceptionDisabled =
    !canEdit || orderedCount <= 0 || lineHasFullQuantity
  const removeActionLabel = lineHasPartialShortage
    ? "Some Out Of Stock"
    : "Out Of Stock"
  const quantityInputLabel = packingPhase ? "Packed" : "Picked"
  const effectiveUnitWeightTotal = weightTotal(draft.actual_unit_weights)
  const expectedWeights = expectedUnitWeightCount(line, draft)
  const enteredWeightCount = positiveWeightCount(draft.actual_unit_weights)
  const effectiveActualQuantity = draft.actual_quantity
  const skuSummary = [
    line.sku,
    line.qbd_list_id ? `QBD ${line.qbd_list_id}` : "Missing QBD",
  ]
    .filter(Boolean)
    .join(" | ")
  const replacementSummary = [
    line.replacement_variant_id ? `Variant ${line.replacement_variant_id}` : "",
    line.replacement_qbd_list_id ? `QBD ${line.replacement_qbd_list_id}` : "",
  ]
    .filter(Boolean)
    .join(" | ")
  const visibleReadinessIssues = readinessIssues.filter((issue) =>
    readinessIssueAppliesToDraft(issue, line, draft, packingPhase)
  )
  const hasBlockingReadinessIssue = visibleReadinessIssues.some(
    (issue) => issue.tone === "blocker"
  )
  const staleWeightErrorResolved =
    requiresActualWeight &&
    packingPhase &&
    enteredWeightCount >= Math.max(1, expectedWeights) &&
    effectiveUnitWeightTotal > 0
  const serverLineErrorMessage = staleWeightErrorResolved
    ? null
    : lineMessage(line.errors)
  const serverLineWarningMessage = lineMessage(line.warnings)

  useEffect(() => {
    const nextDraft = draftFromLine(line)
    const nextSignature = draftSignature(nextDraft)
    setDraft(nextDraft)
    lastSavedSignature.current = nextSignature
    latestDraftSignature.current = nextSignature
    setSaveState("idle")
    setLineStatusMessage(null)
    setReplacementQuery("")
    setReplacementResults([])
  }, [line])

  function update(key: keyof typeof draft, value: string) {
    setError(null)
    setLineStatusMessage(null)
    setDraft((current) => {
      const nextDraft = {
        ...current,
        [key]: value,
        ...(key === "actual_quantity" ? { actual_piece_count: value } : {}),
      }
      return withDerivedLineStatus(
        nextDraft,
        requiresActualWeight,
        packingPhase,
        expectedUnitWeightCount(line, nextDraft),
        line
      )
    })
  }

  function updateUnitWeight(index: number, value: string) {
    setError(null)
    setLineStatusMessage(null)
    setDraft((current) => {
      const rowCount = Math.max(
        expectedUnitWeightCount(line, current),
        index + 1
      )
      const actualUnitWeights = Array.from(
        { length: rowCount },
        (_, rowIndex) => current.actual_unit_weights[rowIndex] || ""
      )
      actualUnitWeights[index] = value
      const nextDraft = {
        ...current,
        actual_unit_weights: actualUnitWeights,
        actual_quantity: numberText(positiveWeightCount(actualUnitWeights)),
        actual_piece_count: numberText(positiveWeightCount(actualUnitWeights)),
        actual_weight_total: numberText(weightTotal(actualUnitWeights)),
      }
      return {
        ...nextDraft,
        status: deriveLineStatus(
          nextDraft,
          requiresActualWeight,
          packingPhase,
          expectedUnitWeightCount(line, nextDraft)
        ),
      }
    })
  }

  function runReplacementSearch() {
    const query = replacementQuery.trim()
    setError(null)
    setLineStatusMessage(null)
    if (query.length < 2) {
      setError("Search by product name or SKU.")
      return
    }

    startSearchTransition(async () => {
      try {
        const results = await searchStaffProducts(query, "us")
        setReplacementResults(results)
        if (!results.length) setError("No replacement products found.")
      } catch (err: any) {
        setError(err.message || "Could not search replacement products.")
      }
    })
  }

  function selectReplacement(product: StaffProductSearchResult) {
    setLineStatusMessage(null)
    const replacementTitle =
      product.variantTitle && product.variantTitle !== "Default"
        ? `${product.title} - ${product.variantTitle}`
        : product.title

    setDraft((current) => ({
      ...current,
      status: "substituted",
      replacement_variant_id: product.variantId,
      replacement_qbd_list_id:
        product.qbdListId || current.replacement_qbd_list_id,
      actual_unit_price:
        replacementUnitPrice(product) !== null
          ? String(replacementUnitPrice(product))
          : current.actual_unit_price,
      replacement_reason:
        current.replacement_reason || `Substituted with ${replacementTitle}`,
    }))
    setReplacementQuery(
      [replacementTitle, product.sku ? `SKU ${product.sku}` : ""]
        .filter(Boolean)
        .join(" | ")
    )
    setReplacementResults([])
  }

  async function persistDraft(
    draftToSave: ReturnType<typeof draftFromLine>,
    options: { validate: boolean; refresh: boolean }
  ) {
    const normalizedDraft = withDerivedLineStatus(
      draftToSave,
      requiresActualWeight,
      packingPhase,
      expectedUnitWeightCount(line, draftToSave),
      line
    )
    const signature = draftSignature(normalizedDraft)
    const actualWeight = requiresActualWeight
      ? weightTotal(normalizedDraft.actual_unit_weights)
      : Number(normalizedDraft.actual_weight_total)
    const expectedWeightRows = expectedUnitWeightCount(line, normalizedDraft)
    const enteredWeights = positiveWeightCount(
      normalizedDraft.actual_unit_weights
    )

    if (
      options.validate &&
      normalizedDraft.status === "ready" &&
      requiresActualWeight &&
      packingPhase &&
      (!Number.isFinite(actualWeight) || actualWeight <= 0)
    ) {
      setError(
        "Enter each packed item's weight before marking this line ready."
      )
      return
    }
    if (
      options.validate &&
      requiresActualWeight &&
      packingPhase &&
      expectedWeightRows > 0 &&
      enteredWeights < expectedWeightRows
    ) {
      setError(
        `Enter ${expectedWeightRows} item weight${
          expectedWeightRows === 1 ? "" : "s"
        } before marking this line ready.`
      )
      return
    }

    const actualQuantity =
      Number(normalizedDraft.actual_quantity) ||
      (requiresActualWeight ? enteredWeights : 0)
    if (
      options.validate &&
      normalizedDraft.status === "ready" &&
      (!Number.isFinite(actualQuantity) || actualQuantity <= 0)
    ) {
      setError("Enter the fulfilled quantity before marking this line ready.")
      return
    }

    if (
      options.validate &&
      normalizedDraft.status === "removed" &&
      !normalizedDraft.short_reason.trim()
    ) {
      setError("Add a removal reason before saving this line.")
      return
    }

    if (
      options.validate &&
      normalizedDraft.status === "substituted" &&
      (!normalizedDraft.replacement_variant_id.trim() ||
        !normalizedDraft.replacement_qbd_list_id.trim() ||
        !normalizedDraft.replacement_reason.trim())
    ) {
      setError("Choose a replacement and add the substitution reason.")
      return
    }

    setSaveState("saving")
    try {
      await updateCatchWeightFinalizationLine({
        orderId,
        lineItemId: line.line_item_id,
        ...normalizedDraft,
        actual_weight_total: requiresActualWeight
          ? numberText(weightTotal(normalizedDraft.actual_unit_weights))
          : normalizedDraft.actual_weight_total,
        actual_unit_weights: requiresActualWeight
          ? normalizedDraft.actual_unit_weights
          : [],
        short_reason:
          normalizedDraft.short_reason ||
          (lineHasShortage(line, normalizedDraft) ? OUT_OF_STOCK_REASON : ""),
        metadata: packingPhase ? { packing_phase: true } : undefined,
      })
      lastSavedSignature.current = signature
      if (latestDraftSignature.current === signature) {
        setSaveState("saved")
      }
      if (options.refresh && latestDraftSignature.current === signature) {
        onSaved()
      }
    } catch (err: any) {
      setSaveState("error")
      setError(err.message || "Could not save line.")
    }
  }

  function save() {
    setError(null)
    setLineStatusMessage(null)
    startTransition(async () => {
      await persistDraft(draft, { validate: true, refresh: true })
    })
  }

  function markRemoved() {
    setLineStatusMessage(null)
    setDraft((current) => ({
      ...current,
      status: "removed",
      short_reason: current.short_reason || OUT_OF_STOCK_REASON,
    }))
  }

  function markPartialOutOfStock() {
    setLineStatusMessage(null)
    setDraft((current) =>
      withDerivedLineStatus(
        {
          ...current,
          status: "ready",
          short_reason: current.short_reason || OUT_OF_STOCK_REASON,
        },
        requiresActualWeight,
        packingPhase,
        expectedUnitWeightCount(line, current),
        line
      )
    )
  }

  function markSubstituted() {
    setLineStatusMessage(null)
    setDraft((current) => ({
      ...current,
      status: "substituted",
    }))
  }

  function restoreOriginalLine() {
    setError(null)
    setLineStatusMessage(
      isRemoved
        ? "Stock found. Picked count was restored to the ordered count."
        : "Original item restored. Changes save automatically."
    )
    setDraft((current) => {
      const restoredCount = numberText(
        packingPhase ? pickedCount || orderedCount : orderedCount
      )
      const nextDraft = {
        ...current,
        actual_quantity: restoredCount || current.actual_quantity,
        actual_piece_count: restoredCount || current.actual_piece_count,
        replacement_variant_id: "",
        replacement_qbd_list_id: "",
        replacement_reason: "",
        short_reason: "",
        status: "needs_pick",
      }

      return withDerivedLineStatus(
        nextDraft,
        requiresActualWeight,
        packingPhase,
        expectedUnitWeightCount(line, nextDraft),
        line
      )
    })
  }

  useEffect(() => {
    const signature = draftSignature(draft)
    latestDraftSignature.current = signature
    if (signature === lastSavedSignature.current) return

    setSaveState("idle")
    const timer = window.setTimeout(() => {
      persistDraft(draft, { validate: false, refresh: true })
    }, 900)

    return () => window.clearTimeout(timer)
    // Save state is intentionally debounced from the current draft only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, orderId, line.line_item_id])

  // #271: one-line-per-item. The row is collapsed by default; it auto-expands
  // (and can't be collapsed) while the line still needs the operator.
  const orderedText = numberText(line.ordered_quantity) || "0"
  const needsPackWeights =
    requiresActualWeight &&
    packingPhase &&
    enteredWeightCount < Math.max(1, expectedWeights)
  // An unresolved error (local validation, failed autosave, or a server-reported
  // line error) must auto-expand so the error banner + Save Line are never
  // hidden behind a collapsed row.
  const lineHasError =
    Boolean(error) || saveState === "error" || Boolean(serverLineErrorMessage)
  // A non-blocking exception (saved partial shortage, server warning) keeps a
  // visible row state even when collapsed, so it isn't mistaken for a clean line.
  const hasWarning =
    !hasBlockingReadinessIssue &&
    !isRemoved &&
    !isSubstituted &&
    !lineHasError &&
    (visibleReadinessIssues.length > 0 || Boolean(serverLineWarningMessage))
  const autoExpand =
    hasBlockingReadinessIssue ||
    isRemoved ||
    isSubstituted ||
    needsPackWeights ||
    lineHasError
  const expanded = manuallyExpanded || autoExpand

  function setFull() {
    if (!canEdit || orderedCount <= 0) return
    update("actual_quantity", String(orderedCount))
  }

  const rowGlyph = lineHasError
    ? { icon: "⚠", cls: "text-red-600", label: "Save error — open to fix" }
    : isRemoved
      ? { icon: "⊘", cls: "text-amber-600", label: "Out of stock" }
      : isSubstituted
        ? { icon: "⇄", cls: "text-blue-600", label: "Substituted" }
        : hasBlockingReadinessIssue
          ? { icon: "⚠", cls: "text-amber-600", label: "Needs attention" }
          : needsPackWeights
            ? { icon: "◐", cls: "text-blue-600", label: "Needs weights" }
            : hasWarning
              ? { icon: "!", cls: "text-blue-600", label: "Exception recorded" }
              : draft.status === "ready"
                ? { icon: "✓", cls: "text-emerald-600", label: "Ready" }
                : { icon: "○", cls: "text-Charcoal/30", label: "Not started" }

  const saveGlyph =
    saveState === "saving"
      ? { icon: "⟳", cls: "text-Charcoal/40", label: "Saving" }
      : saveState === "saved"
        ? { icon: "✓", cls: "text-emerald-600", label: "Saved" }
        : saveState === "error"
          ? { icon: "⚠", cls: "text-red-600", label: "Autosave failed" }
          : { icon: "", cls: "", label: "" }

  return (
    <div className="border-b border-gray-200 px-4 py-4 last:border-b-0">
      <div
        className={`rounded-md border p-2 ${
          lineHasError
            ? "border-red-300 bg-red-50/40"
            : hasBlockingReadinessIssue
              ? "border-amber-300 bg-amber-50/40"
              : isRemoved
                ? "border-amber-200 bg-amber-50/25"
                : isSubstituted
                  ? "border-blue-200 bg-blue-50/25"
                  : hasWarning
                    ? "border-blue-200 bg-blue-50/20"
                    : "border-gray-100 bg-white"
        }`}
      >
        {/* #271: compact one-line row — read item, enter qty, done. */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className={`shrink-0 text-base leading-none ${rowGlyph.cls}`}
            role="img"
            aria-label={rowGlyph.label}
            title={rowGlyph.label}
          >
            {rowGlyph.icon}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate text-sm font-maison-neue font-semibold text-Charcoal">
                {title}
              </span>
              {pricingBasisBadge(requiresActualWeight)}
              {statusBadge(draft.status)}
            </div>
            <span className="block truncate text-[11px] font-maison-neue-mono uppercase text-Charcoal/45">
              {skuSummary}
            </span>
          </div>

          <div className="hidden shrink-0 whitespace-nowrap text-sm font-maison-neue text-Charcoal/55 sm:block">
            Ord {orderedText}
          </div>

          {isRemoved ? (
            <span className="shrink-0 whitespace-nowrap text-sm font-maison-neue font-semibold text-amber-700">
              Out of stock
            </span>
          ) : requiresActualWeight && packingPhase ? (
            <button
              type="button"
              onClick={() => setManuallyExpanded(true)}
              className="shrink-0 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs font-maison-neue text-blue-900"
            >
              Weigh {enteredWeightCount}/{expectedWeights || "?"}
              {effectiveUnitWeightTotal > 0
                ? ` · ${numberText(effectiveUnitWeightTotal)} lb`
                : ""}
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden text-[11px] font-maison-neue-mono uppercase text-Charcoal/45 sm:inline">
                {quantityInputLabel}
              </span>
              <input
                className={`${fieldClass} w-14 text-center`}
                inputMode="decimal"
                value={draft.actual_quantity}
                disabled={!canEdit || isRemoved}
                onChange={(event) =>
                  update("actual_quantity", event.target.value)
                }
                aria-label={`${quantityInputLabel} quantity for ${title}`}
              />
              {canEdit &&
                orderedCount > 0 &&
                actualQuantityValue(draft) !== orderedCount && (
                  <button
                    type="button"
                    onClick={setFull}
                    className="rounded-md border border-gray-200 bg-white px-2 py-2 text-[11px] font-rexton font-bold uppercase text-Charcoal hover:border-Gold/70"
                  >
                    Full
                  </button>
                )}
            </div>
          )}

          <span
            className={`inline-block w-5 shrink-0 text-center text-sm ${saveGlyph.cls}`}
            title={saveGlyph.label}
            aria-label={saveGlyph.label || undefined}
          >
            {saveGlyph.icon}
          </span>

          <button
            type="button"
            onClick={() => setManuallyExpanded((value) => !value)}
            disabled={autoExpand && !manuallyExpanded}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse line details" : "Open line details"}
            className={`shrink-0 rounded-md border px-2 py-2 text-xs leading-none ${
              autoExpand && !manuallyExpanded
                ? "cursor-default border-transparent text-Charcoal/25"
                : "border-gray-200 text-Charcoal/60 hover:border-Gold/70"
            }`}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 rounded-md border border-gray-100 bg-SilverPlate/20 p-4">
          <p className="text-sm font-maison-neue text-Charcoal/60">
            Ordered {orderedText} | {quantityInputLabel}{" "}
            {effectiveActualQuantity || "0"}
            {packingPhase && pickedCount > 0
              ? ` | picked ${numberText(pickedCount)}`
              : ""}
            {requiresActualWeight && packingPhase
              ? ` | weighed ${enteredWeightCount}/${expectedWeights || "?"}`
              : ""}
            {line.estimated_weight_total !== null &&
            line.estimated_weight_total !== undefined
              ? ` | est. ${numberText(line.estimated_weight_total)} lb`
              : ""}
            {requiresActualWeight && effectiveUnitWeightTotal > 0
              ? ` | actual ${numberText(effectiveUnitWeightTotal)} lb`
              : ""}
            {line.final_line_total !== null &&
            line.final_line_total !== undefined
              ? ` | final ${money(line.final_line_total, currencyCode)}`
              : ""}
          </p>
          {replacementSummary && (
            <p className="mt-1 truncate text-xs font-maison-neue text-blue-700">
              Replacement: {replacementSummary}
            </p>
          )}
          {visibleReadinessIssues.length > 0 && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                hasBlockingReadinessIssue
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-blue-100 bg-blue-50/70 text-blue-900"
              }`}
            >
              <p className="font-maison-neue font-semibold">
                {hasBlockingReadinessIssue
                  ? "Needs attention before handoff"
                  : "Intentional exception"}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 font-maison-neue">
                {visibleReadinessIssues.map((issue) => (
                  <li key={`${issue.tone}-${issue.message}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {requiresActualWeight && packingPhase ? (
            <div className="min-w-0 sm:col-span-2 xl:col-span-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className={labelClass}>Item weights</span>
                  <p className="mt-1 text-xs font-maison-neue text-Charcoal/45">
                    Enter one weight per packed item. Total and packed count
                    calculate automatically.
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {unitWeightRows(line, draft).map((weight, index) => (
                  <label
                    className="flex min-w-0 flex-col gap-1"
                    key={`weight-${index}`}
                  >
                    <span className={labelClass}>Item {index + 1} lb</span>
                    <input
                      className={fieldClass}
                      inputMode="decimal"
                      value={weight}
                      disabled={!canEdit || isRemoved}
                      onChange={(event) =>
                        updateUnitWeight(index, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-maison-neue text-Charcoal/70">
                  Total weight: {numberText(effectiveUnitWeightTotal) || "0"} lb
                </div>
                <div className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm font-maison-neue text-Charcoal/70">
                  Weighed packs: {enteredWeightCount}/{expectedWeights || "?"}
                </div>
              </div>
            </div>
          ) : requiresActualWeight ? (
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
              <span className={labelClass}>Weight</span>
              <div className="rounded-md border border-blue-100 bg-blue-50/50 px-3 py-3 text-sm text-blue-900">
                <p className="font-maison-neue font-semibold">
                  Weight entry opens after Claim Pack.
                </p>
                <p className="mt-1 text-xs font-maison-neue text-blue-900/70">
                  Pickers enter the fulfilled count here. Packers will get one
                  weight box for each picked pack.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClass}>Weight</span>
              <div className="flex min-h-[42px] items-center rounded-md border border-gray-100 bg-gray-50 px-3 text-sm text-Charcoal/55">
                No weight needed
              </div>
            </div>
          )}

          {/* Ordered + picked/packed qty now live on the compact row (#271). */}

          {canPickLineExceptions && (
            <div className="flex min-w-0 flex-col gap-1 sm:col-span-2 xl:col-span-2">
              <span className={labelClass}>Line action</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {isRemoved || isSubstituted ? (
                  <button
                    className={`${secondaryButtonClass} w-full min-w-0 px-3 text-center`}
                    disabled={!canEdit}
                    onClick={restoreOriginalLine}
                    type="button"
                  >
                    {isRemoved ? "Found Stock" : "Use Original"}
                  </button>
                ) : (
                  <>
                    <button
                      className={`w-full min-w-0 px-3 text-center ${
                        stockExceptionDisabled
                          ? disabledButtonClass
                          : secondaryButtonClass
                      }`}
                      disabled={stockExceptionDisabled}
                      onClick={
                        lineHasPartialShortage
                          ? markPartialOutOfStock
                          : markRemoved
                      }
                      title={
                        lineHasFullQuantity
                          ? "Picked already matches ordered quantity."
                          : undefined
                      }
                      type="button"
                    >
                      {removeActionLabel}
                    </button>
                    <button
                      className={`${secondaryButtonClass} w-full min-w-0 px-3 text-center`}
                      disabled={!canEdit}
                      onClick={markSubstituted}
                      type="button"
                    >
                      Substitute
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {fixedPriceLine && (
          <p className="mt-2 text-xs font-maison-neue text-Charcoal/45">
            Fixed-price line: final amount follows fulfilled quantity, not
            weight.
          </p>
        )}

        {isRemoved && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-maison-neue text-amber-900">
            <p>
              Reason:{" "}
              {draft.short_reason === OUT_OF_STOCK_REASON
                ? OUT_OF_STOCK_LABEL
                : draft.short_reason || OUT_OF_STOCK_LABEL}
            </p>
            {canPickLineExceptions ? (
              <p className="mt-1 text-xs text-amber-900/70">
                Found the item? Use Found Stock to restore the ordered count and
                clear this exception.
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-900/70">
                If this exception is wrong, send the order back to picking.
              </p>
            )}
          </div>
        )}

        {!isRemoved &&
          !isSubstituted &&
          lineHasShortage(line, draft) &&
          (draft.short_reason === OUT_OF_STOCK_REASON ||
            (!packingPhase && actualQuantityValue(draft) > 0)) && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-maison-neue text-amber-900">
              Shortage reason: {OUT_OF_STOCK_LABEL}
            </div>
          )}

        {isSubstituted && canPickLineExceptions && (
          <div className="mt-4 rounded-md border border-blue-100 bg-blue-50/40 p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClass}>Find replacement</span>
                <input
                  className={fieldClass}
                  type="search"
                  value={replacementQuery}
                  disabled={!canEdit}
                  onChange={(event) => setReplacementQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") runReplacementSearch()
                  }}
                />
              </label>
              <Button
                className={`${secondaryButtonClass} w-full lg:w-auto`}
                isLoading={isSearchPending}
                disabled={!canEdit}
                onClick={runReplacementSearch}
                type="button"
              >
                Search
              </Button>
            </div>

            {replacementResults.length > 0 && (
              <div className="mt-3 max-h-56 overflow-auto rounded-md border border-gray-200 bg-white">
                {replacementResults.map((product) => (
                  <button
                    className="flex w-full flex-col gap-1 border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-SilverPlate/40"
                    key={product.variantId}
                    onClick={() => selectReplacement(product)}
                    type="button"
                  >
                    <span className="text-sm font-maison-neue font-semibold text-Charcoal">
                      {product.title}
                    </span>
                    <span className="text-xs font-maison-neue text-Charcoal/55">
                      {[
                        product.variantTitle,
                        product.sku,
                        replacementPriceLabel(product, currencyCode),
                        product.qbdListId ? "QBD saved" : "Missing QBD",
                      ]
                        .filter(Boolean)
                        .join(" | ")}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClass}>Replacement variant ID</span>
                <input
                  className={fieldClass}
                  value={draft.replacement_variant_id}
                  disabled={!canEdit}
                  onChange={(event) =>
                    update("replacement_variant_id", event.target.value)
                  }
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClass}>Replacement QBD ListID</span>
                <input
                  className={fieldClass}
                  value={draft.replacement_qbd_list_id}
                  disabled={!canEdit}
                  onChange={(event) =>
                    update("replacement_qbd_list_id", event.target.value)
                  }
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClass}>Replacement unit price</span>
                <input
                  className={fieldClass}
                  inputMode="decimal"
                  value={draft.actual_unit_price}
                  disabled={!canEdit}
                  onChange={(event) =>
                    update("actual_unit_price", event.target.value)
                  }
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1 md:col-span-3">
                <span className={labelClass}>Substitution reason</span>
                <input
                  className={fieldClass}
                  value={draft.replacement_reason}
                  disabled={!canEdit}
                  onChange={(event) =>
                    update("replacement_reason", event.target.value)
                  }
                />
              </label>
            </div>
          </div>
        )}

        <label className="mt-4 flex flex-col gap-1">
          <span className={labelClass}>Note</span>
          <input
            className={fieldClass}
            value={draft.note}
            disabled={!canEdit}
            onChange={(event) => update("note", event.target.value)}
          />
        </label>

        {(lineStatusMessage ||
          serverLineErrorMessage ||
          serverLineWarningMessage ||
          error) && (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-sm ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : lineStatusMessage
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {error ||
              lineStatusMessage ||
              serverLineErrorMessage ||
              serverLineWarningMessage}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-xs font-maison-neue text-Charcoal/45">
            {saveState === "saving"
              ? "Autosaving..."
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Autosave failed"
                  : "Changes save automatically"}
          </p>
          <Button
            className={`${primaryButtonClass} w-full sm:w-auto`}
            disabled={!canEdit}
            isLoading={isPending || saveState === "saving"}
            onClick={save}
            type="button"
          >
            Save Line
          </Button>
        </div>
        </div>
      )}
    </div>
  )
}

function AddFinalizationItem({
  orderId,
  currencyCode,
  canEdit,
  onSaved,
}: {
  orderId: string
  currencyCode: string
  canEdit: boolean
  onSaved: () => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<StaffProductSearchResult[]>([])
  const [quantity, setQuantity] = useState("1")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSearchPending, startSearchTransition] = useTransition()
  const [isAddPending, startAddTransition] = useTransition()

  function runSearch() {
    const q = query.trim()
    setError(null)
    if (q.length < 2) {
      setError("Search by product name or SKU.")
      return
    }
    startSearchTransition(async () => {
      try {
        const nextResults = await searchStaffProducts(q, "us")
        setResults(nextResults)
        if (!nextResults.length) setError("No products found.")
      } catch (err: any) {
        setError(err.message || "Could not search products.")
      }
    })
  }

  function addProduct(product: StaffProductSearchResult) {
    const amount = Number(quantity)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a fulfilled quantity greater than zero.")
      return
    }
    if (!product.qbdListId) {
      setError("This product is missing a QuickBooks item ID.")
      return
    }
    const title =
      product.variantTitle && product.variantTitle !== "Default"
        ? `${product.title} - ${product.variantTitle}`
        : product.title
    const unitPrice = replacementUnitPrice(product)

    startAddTransition(async () => {
      try {
        await addCatchWeightFinalizationLine({
          orderId,
          product_id: product.productId,
          variant_id: product.variantId,
          sku: product.sku,
          qbd_list_id: product.qbdListId,
          title,
          customer_title: title,
          pricing_mode: product.pricingMode,
          actual_unit_price:
            unitPrice !== null && unitPrice !== undefined
              ? String(unitPrice)
              : "",
          actual_quantity: quantity,
          actual_piece_count: quantity,
          note,
        })
        setQuery("")
        setResults([])
        setQuantity("1")
        setNote("")
        setError(null)
        onSaved()
      } catch (err: any) {
        setError(err.message || "Could not add item.")
      }
    })
  }

  if (!canEdit) return null

  return (
    <div className="border-b border-gray-200 bg-SilverPlate/20 p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={labelClass}>Add item</span>
          <input
            className={fieldClass}
            type="search"
            placeholder="Search product or SKU"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runSearch()
            }}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 lg:w-28">
          <span className={labelClass}>Fulfilled</span>
          <input
            className={fieldClass}
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={labelClass}>Note</span>
          <input
            className={fieldClass}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <Button
          className={`${secondaryButtonClass} w-full lg:w-auto`}
          isLoading={isSearchPending}
          onClick={runSearch}
          type="button"
        >
          Search
        </Button>
      </div>

      {results.length > 0 && (
        <div className="mt-3 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white">
          {results.map((product) => (
            <button
              className="grid w-full gap-2 border-b border-gray-100 px-3 py-3 text-left last:border-b-0 hover:bg-SilverPlate/35 sm:grid-cols-[minmax(0,1fr)_auto]"
              disabled={isAddPending}
              key={product.variantId}
              onClick={() => addProduct(product)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-maison-neue font-semibold text-Charcoal">
                  {product.variantTitle && product.variantTitle !== "Default"
                    ? `${product.title} - ${product.variantTitle}`
                    : product.title}
                </span>
                <span className="mt-1 block text-xs font-maison-neue text-Charcoal/55">
                  {[
                    product.sku,
                    replacementPriceLabel(product, currencyCode),
                    product.qbdListId ? "QBD saved" : "Missing QBD",
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </span>
              </span>
              <span className="flex items-center gap-2 sm:justify-end">
                {pricingBasisBadge(product.pricingMode === "per_lb")}
                <span className="text-xs font-maison-neue-mono uppercase text-Gold">
                  Add
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </p>
      )}
    </div>
  )
}

function packageDrafts(packages: StaffFinalizationPackage[] | undefined) {
  const rows = packages?.length
    ? packages
    : [
        {
          package_type: "",
          shipper_qbd_list_id: "",
          count: "1",
          packed_weight_lb: "",
          dry_ice_lb: "",
          note: "",
        },
      ]

  return rows.map((pkg) => ({
    id: pkg.id || "",
    package_type: pkg.package_type || "",
    shipper_qbd_list_id: pkg.shipper_qbd_list_id || "",
    count: "1",
    packed_weight_lb: numberText(pkg.packed_weight_lb),
    dry_ice_lb: numberText(pkg.dry_ice_lb),
    note: pkg.note || "",
  }))
}

function cleanPackageDrafts(
  packages: ReturnType<typeof packageDrafts>
): StaffFinalizationPackage[] {
  return packages
    .map((pkg) => ({
      id: pkg.id || undefined,
      package_type: pkg.package_type.trim(),
      shipper_qbd_list_id: pkg.shipper_qbd_list_id.trim(),
      count: "1",
      packed_weight_lb: pkg.packed_weight_lb.trim(),
      dry_ice_lb: pkg.dry_ice_lb.trim(),
      note: pkg.note.trim(),
    }))
    .filter(
      (pkg) =>
        pkg.package_type ||
        pkg.shipper_qbd_list_id ||
        pkg.packed_weight_lb ||
        pkg.dry_ice_lb ||
        pkg.note
    )
}

function packageSignature(packages: ReturnType<typeof packageDrafts>) {
  return JSON.stringify(cleanPackageDrafts(packages))
}

function PackageCapture({
  orderId,
  detail,
  canEdit,
  onSaved,
}: {
  orderId: string
  detail: StaffCatchWeightFinalizationDetail
  canEdit: boolean
  onSaved: () => void
}) {
  const [packages, setPackages] = useState(() => packageDrafts(detail.packages))
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  )
  const [isPending, startTransition] = useTransition()
  const lastSavedSignature = useRef(packageSignature(packages))
  const latestPackageSignature = useRef(packageSignature(packages))

  useEffect(() => {
    const nextPackages = packageDrafts(detail.packages)
    const nextSignature = packageSignature(nextPackages)
    setPackages(nextPackages)
    lastSavedSignature.current = nextSignature
    latestPackageSignature.current = nextSignature
    setError(null)
    setSaveState("idle")
  }, [detail.packages])

  function update(
    index: number,
    key: keyof (typeof packages)[number],
    value: string
  ) {
    if (!canEdit) return
    setPackages((current) =>
      current.map((pkg, rowIndex) =>
        rowIndex === index ? { ...pkg, [key]: value } : pkg
      )
    )
  }

  function selectShipper(index: number, value: string) {
    if (!canEdit) return
    const option = shipperOptions.find((item) => item.value === value)
    setPackages((current) =>
      current.map((pkg, rowIndex) =>
        rowIndex === index
          ? {
              ...pkg,
              package_type: value,
              shipper_qbd_list_id: option?.qbdListId || "",
            }
          : pkg
      )
    )
  }

  function addRow() {
    if (!canEdit) return
    setPackages((current) => [
      ...current,
      {
        id: "",
        package_type: "",
        shipper_qbd_list_id: "",
        count: "1",
        packed_weight_lb: "",
        dry_ice_lb: "",
        note: "",
      },
    ])
  }

  function removeRow(index: number) {
    if (!canEdit) return
    setPackages((current) =>
      current.length <= 1
        ? current
        : current.filter((_, rowIndex) => rowIndex !== index)
    )
  }

  async function persistPackages(
    packagesToSave: ReturnType<typeof packageDrafts>,
    options: { refresh: boolean }
  ) {
    setError(null)
    const cleanPackages = cleanPackageDrafts(packagesToSave)
    const signature = JSON.stringify(cleanPackages)
    const overweightRow = cleanPackages.findIndex((pkg) => {
      const packedWeight = Number(pkg.packed_weight_lb)
      return Number.isFinite(packedWeight) && packedWeight > 50
    })
    if (overweightRow >= 0) {
      setError(
        `Package ${
          overweightRow + 1
        } is over 50 lb including dry ice and packaging.`
      )
      return
    }
    setSaveState("saving")
    try {
      await updateCatchWeightFinalizationPackages({
        orderId,
        packages: cleanPackages,
      })
      lastSavedSignature.current = signature
      if (latestPackageSignature.current === signature) {
        setSaveState("saved")
      }
      if (options.refresh && latestPackageSignature.current === signature) {
        onSaved()
      }
    } catch (err: any) {
      setSaveState("idle")
      setError(err.message || "Could not save package details.")
    }
  }

  useEffect(() => {
    const signature = packageSignature(packages)
    latestPackageSignature.current = signature
    if (!canEdit) return
    if (signature === lastSavedSignature.current) return

    setSaveState("idle")
    const timer = window.setTimeout(() => {
      startTransition(async () => {
        await persistPackages(packages, { refresh: true })
      })
    }, 900)

    return () => window.clearTimeout(timer)
    // Package save is intentionally debounced from the current draft only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages, orderId, canEdit])

  return (
    <div className="border-b border-gray-200 bg-SilverPlate/20 p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-maison-neue-mono uppercase text-Gold">
            Boxes and coolers
          </p>
          <h4 className="mt-1 text-base font-maison-neue font-semibold text-Charcoal">
            Packing complete details
          </h4>
          <p className="mt-1 max-w-2xl text-sm font-maison-neue text-Charcoal/60">
            {detail.package_capture_required
              ? "Add one row per physical container. Packed lb is the full scale weight, including the box or cooler and dry ice; record dry ice separately."
              : "Add one row per cooler, igloo, or other container used before marking the pack ready."}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <span className="text-xs font-maison-neue text-Charcoal/50">
            {isPending || saveState === "saving"
              ? "Saving package details..."
              : saveState === "saved"
              ? "Package details saved."
              : "Changes save automatically"}
          </span>
          {canEdit && (
            <Button
              className={secondaryButtonClass}
              onClick={addRow}
              type="button"
            >
              Add Package
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {packages.map((pkg, index) => (
          <div
            className="grid gap-3 rounded-md border border-gray-200 bg-white p-3 md:grid-cols-[minmax(220px,1.2fr)_120px_120px_minmax(0,1fr)_116px] md:items-start"
            key={`${pkg.id || "new"}-${index}`}
          >
            <label className="flex min-w-0 flex-col gap-1">
              <span className={labelClass}>Package</span>
              <select
                className={fieldClass}
                disabled={!canEdit}
                value={pkg.package_type}
                onChange={(event) => selectShipper(index, event.target.value)}
              >
                <option value="">Choose package</option>
                {shipperOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} - {option.detail}
                  </option>
                ))}
              </select>
              {pkg.shipper_qbd_list_id && (
                <span className="truncate text-[11px] font-maison-neue text-Charcoal/45">
                  QBD item saved
                </span>
              )}
              {pkg.package_type === "Other" && (
                <input
                  className={fieldClass}
                  disabled={!canEdit}
                  placeholder="Describe package or cooler"
                  value={pkg.note}
                  onChange={(event) =>
                    update(index, "note", event.target.value)
                  }
                />
              )}
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className={labelClass}>Full packed lb</span>
              <input
                className={fieldClass}
                disabled={!canEdit}
                inputMode="decimal"
                placeholder="Box + product + dry ice"
                value={pkg.packed_weight_lb}
                onChange={(event) =>
                  update(index, "packed_weight_lb", event.target.value)
                }
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className={labelClass}>Dry ice lb</span>
              <input
                className={fieldClass}
                disabled={!canEdit}
                inputMode="decimal"
                placeholder="Dry ice only"
                value={pkg.dry_ice_lb}
                onChange={(event) =>
                  update(index, "dry_ice_lb", event.target.value)
                }
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className={labelClass}>Note</span>
              <input
                className={fieldClass}
                disabled={!canEdit}
                value={pkg.note}
                onChange={(event) => update(index, "note", event.target.value)}
              />
            </label>
            <button
              className={`mt-[22px] min-h-[42px] rounded-md border px-3 text-xs font-maison-neue-mono uppercase ${
                canEdit && packages.length > 1
                  ? "border-gray-200 text-Charcoal/60 hover:border-Gold/60"
                  : "cursor-not-allowed border-gray-100 bg-gray-50 text-Charcoal/30"
              }`}
              disabled={!canEdit || packages.length <= 1}
              onClick={() => removeRow(index)}
              title={
                packages.length <= 1
                  ? "Every order needs at least one package row."
                  : undefined
              }
              type="button"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {(error || saveState === "saved") && (
        <p
          className={`mt-3 rounded-md border px-3 py-2 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || "Package details saved."}
        </p>
      )}
    </div>
  )
}

export default function StaffCatchWeightFinalizationConsole({
  canChargeFinalOrders = false,
  canPickOrders = true,
  canPackOrders = true,
  canViewAuditTrail = false,
}: {
  canChargeFinalOrders?: boolean
  canPickOrders?: boolean
  canPackOrders?: boolean
  canViewAuditTrail?: boolean
}) {
  const [queue, setQueue] = useState<StaffCatchWeightFinalizationSummary[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [detail, setDetail] =
    useState<StaffCatchWeightFinalizationDetail | null>(null)
  const [filter, setFilter] = useState(() =>
    canPickOrders
      ? "pending_pick,picking,pending_pack"
      : "ready_for_packing,packing,packed_pending_review"
  )
  const [queueQuery, setQueueQuery] = useState("")
  const [fulfillmentTypeFilter, setFulfillmentTypeFilter] = useState("")
  const [dateFromFilter, setDateFromFilter] = useState("")
  const [dateToFilter, setDateToFilter] = useState("")
  const [queueSort, setQueueSort] = useState<QueueSortKey>("ship_date_asc")
  const [groupByShipDate, setGroupByShipDate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const queueRequestRef = useRef(0)

  const selectedSummary = useMemo(
    () => queue.find((item) => item.order_id === selectedOrderId),
    [queue, selectedOrderId]
  )
  const currencyCode =
    detail?.finalization?.currency_code ||
    selectedSummary?.currency_code ||
    "usd"
  const blockingIssues = useMemo(
    () => finalizationBlockingIssues(detail),
    [detail]
  )
  const blockingErrorCount = blockingIssues.length
  const pickerReadiness = useMemo(
    () => finalizationPickerReadiness(detail),
    [detail]
  )
  const sortedQueue = useMemo(
    () => [...queue].sort((a, b) => compareQueueOrders(a, b, queueSort)),
    [queue, queueSort]
  )
  const queueGroups = useMemo(
    () =>
      groupByShipDate
        ? groupQueueByShipDate(
            sortedQueue,
            queueSort === "ship_date_desc" ? "desc" : "asc"
          )
        : [{ key: "all", label: "", items: sortedQueue }],
    [groupByShipDate, queueSort, sortedQueue]
  )

  function loadQueue(
    nextSelectedOrderId?: string | null,
    filterOverride?: {
      query?: string
      fulfillmentType?: string
      dateFrom?: string
      dateTo?: string
    }
  ) {
    const requestId = queueRequestRef.current + 1
    queueRequestRef.current = requestId
    const nextQuery = filterOverride?.query ?? queueQuery
    const nextFulfillmentType =
      filterOverride?.fulfillmentType ?? fulfillmentTypeFilter
    const nextDateFrom = filterOverride?.dateFrom ?? dateFromFilter
    const nextDateTo = filterOverride?.dateTo ?? dateToFilter

    startTransition(async () => {
      try {
        const rows = await listCatchWeightFinalizationQueue({
          status: filter,
          limit: 100,
          query: nextQuery.trim(),
          fulfillmentType: nextFulfillmentType,
          dateFrom: nextDateFrom,
          dateTo: nextDateTo,
        })
        if (requestId !== queueRequestRef.current) return
        setQueue(rows)
        const requestedId =
          nextSelectedOrderId === undefined
            ? selectedOrderId
            : nextSelectedOrderId
        const nextId =
          requestedId && rows.some((row) => row.order_id === requestedId)
            ? requestedId
            : null
        setSelectedOrderId(nextId)
        if (nextId) {
          setDetail(await getCatchWeightFinalizationDetail(nextId))
        } else {
          setDetail(null)
        }
      } catch (err: any) {
        if (requestId !== queueRequestRef.current) return
        setError(err.message || "Could not load finalization queue.")
      }
    })
  }

  function clearQueueFilters() {
    setQueueQuery("")
    setFulfillmentTypeFilter("")
    setDateFromFilter("")
    setDateToFilter("")
    setError(null)
    setStatus(null)
    loadQueue(null, {
      query: "",
      fulfillmentType: "",
      dateFrom: "",
      dateTo: "",
    })
  }

  function loadDetail(orderId: string) {
    setSelectedOrderId(orderId)
    setError(null)
    startTransition(async () => {
      try {
        setDetail(await getCatchWeightFinalizationDetail(orderId))
      } catch (err: any) {
        setError(err.message || "Could not load order.")
      }
    })
  }

  function runAction(
    actionKey: string,
    label: string,
    action: (orderId: string) => Promise<StaffCatchWeightFinalizationDetail>
  ) {
    if (!selectedOrderId || pendingAction) return
    setPendingAction(actionKey)
    setError(null)
    setStatus(null)
    startTransition(async () => {
      try {
        const result = await action(selectedOrderId)
        setDetail({
          ...result,
          order: result.order || detail?.order || { id: selectedOrderId },
          lines: result.lines || detail?.lines || [],
        })
        setStatus(label)
        loadQueue(selectedOrderId)
      } catch (err: any) {
        setError(err.message || "Action failed.")
      } finally {
        setPendingAction(null)
      }
    })
  }

  function sendBackToPicking(
    defaultReason = "Packer found a mismatch during packing."
  ) {
    if (!selectedOrderId || pendingAction) return
    const reason =
      window.prompt(
        "Why is this order going back to picking?",
        defaultReason
      ) || ""
    if (!reason.trim()) return
    runAction("return-picking", "Order sent back to picking.", (orderId) =>
      returnCatchWeightOrderToPicking({ orderId, reason: reason.trim() })
    )
  }

  function sendBackToPacking() {
    if (!selectedOrderId || pendingAction) return
    const reason =
      window.prompt(
        "What should packing correct before this order is charged?",
        "Front office requested packing correction before charge."
      ) || ""
    if (!reason.trim()) return
    runAction("return-packing", "Order sent back to packing.", (orderId) =>
      returnCatchWeightOrderToPacking({ orderId, reason: reason.trim() })
    )
  }

  function unclaimPick() {
    if (!selectedOrderId || pendingAction) return
    if (
      !window.confirm(
        "Release this pick so another picker can claim it? Saved line work stays on the order."
      )
    ) {
      return
    }
    runAction("unclaim-pick", "Pick released.", (orderId) =>
      unclaimCatchWeightPick({
        orderId,
        reason: "Picker released the claimed pick.",
      })
    )
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadQueue()
    }, 250)

    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, queueQuery, fulfillmentTypeFilter, dateFromFilter, dateToFilter])

  const totals = detail?.totals || detail?.finalization || {}
  const currentStatus = detail?.finalization?.status || ""
  const pickingStatuses = new Set(["pending_pick", "picking", "pending_pack"])
  const packingWorkStatuses = new Set(["packing", "packed_pending_review"])
  const chargeReviewStatuses = new Set([
    "packed_pending_charge",
    "charge_failed_hold",
  ])
  const fulfillmentReadyStatuses = new Set([
    "charged_ready_to_ship",
    "released_to_fulfillment",
  ])
  const inPickingPhase = pickingStatuses.has(currentStatus)
  const pickClaimed = currentStatus === "picking"
  const waitingForPacker = currentStatus === "ready_for_packing"
  const inPackingPhase =
    waitingForPacker || packingWorkStatuses.has(currentStatus)
  const inChargeReviewPhase = chargeReviewStatuses.has(currentStatus)
  const inFulfillmentReadyPhase = fulfillmentReadyStatuses.has(currentStatus)
  const packWorkClaimed = packingWorkStatuses.has(currentStatus)
  const canEditPackingLines = packWorkClaimed && canPackOrders
  const showPackingDetail =
    (inPackingPhase && !waitingForPacker) ||
    inChargeReviewPhase ||
    inFulfillmentReadyPhase
  const editorPhase: FinalizationPhase = inPickingPhase ? "picking" : "packing"
  const canEditLines = inPickingPhase
    ? canPickOrders && pickClaimed
    : canEditPackingLines
  const readyForFulfillment = catchWeightReadyForFulfillment(detail)
  const fulfilled = hasActiveFulfillment(detail?.order)
  const permissionChargeDisabledReason = !canChargeFinalOrders
    ? "This staff account is not allowed to charge saved cards."
    : null
  const chargeDisabledReason =
    permissionChargeDisabledReason ||
    (blockingErrorCount > 0
      ? "Resolve the listed packing issues before charging."
      : null)
  const packingReadyDisabledReason = !canPackOrders
    ? "This staff account is not allowed to pack orders."
    : blockingErrorCount > 0
    ? "Resolve the listed packing issues before marking this order ready for charge."
    : null
  const readyForPackingDisabledReason = !canPickOrders
    ? "This staff account is not allowed to pick orders."
    : !pickClaimed
    ? "Claim the pick before handing this order to packing."
    : pickerReadiness.blockers.length
    ? "Resolve the listed pick issues before handing this order to packing."
    : null
  const readyForPackingBlocked = Boolean(readyForPackingDisabledReason)
  const readyForPackingBlockerId = "ready-for-packing-blockers"
  const activeQueueFilters = Boolean(
    queueQuery || fulfillmentTypeFilter || dateFromFilter || dateToFilter
  )

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-maison-neue-mono uppercase text-Gold">
              Pack and finalize
            </p>
            <h2 className="mt-1 text-xl font-maison-neue font-semibold text-Charcoal">
              Pack & finalize queue
            </h2>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
            {[
              ["Picking", "pending_pick,picking,pending_pack"],
              ["Packing", "ready_for_packing,packing,packed_pending_review"],
              ["Ready to charge", "packed_pending_charge"],
              ["Charge holds", "charge_failed_hold"],
              ["Ready ship", "charged_ready_to_ship,released_to_fulfillment"],
            ]
              .filter(([label]) => {
                if (label === "Picking") return canPickOrders
                if (label === "Packing") return canPackOrders || canPickOrders
                return canPackOrders || canChargeFinalOrders
              })
              .map(([label, value]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`min-h-[36px] shrink-0 rounded-md border px-3 text-xs font-maison-neue-mono uppercase ${
                    filter === value
                      ? "border-Charcoal bg-Charcoal text-white"
                      : "border-gray-200 bg-white text-Charcoal hover:border-Gold/60"
                  }`}
                >
                  {label}
                </button>
              ))}
          </div>
        </div>
      </div>

      {(error || status) && (
        <div
          className={`mx-4 mt-4 rounded-md border px-4 py-3 text-sm sm:mx-5 sm:mt-5 ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || status}
        </div>
      )}

      <div className="grid min-h-[620px] lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-gray-200 lg:border-b-0 lg:border-r">
          <div className="border-b border-gray-200 bg-SilverPlate/20 p-3">
            <div className="grid gap-2">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClass}>Search queue</span>
                <input
                  className={fieldClass}
                  placeholder="Order, email, name, ZIP"
                  value={queueQuery}
                  onChange={(event) => setQueueQuery(event.target.value)}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClass}>Fulfillment</span>
                <select
                  className={fieldClass}
                  value={fulfillmentTypeFilter}
                  onChange={(event) =>
                    setFulfillmentTypeFilter(event.target.value)
                  }
                >
                  <option value="">All methods</option>
                  <option value="plant_pickup">Plant pickup</option>
                  <option value="atlanta_delivery">Atlanta delivery</option>
                  <option value="ups_shipping">UPS shipping</option>
                  <option value="southeast_pickup">Southeast pickup</option>
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass}>Ship / pickup from</span>
                  <input
                    className={fieldClass}
                    type="date"
                    value={dateFromFilter}
                    onChange={(event) => setDateFromFilter(event.target.value)}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass}>Through</span>
                  <input
                    className={fieldClass}
                    type="date"
                    value={dateToFilter}
                    onChange={(event) => setDateToFilter(event.target.value)}
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass}>Sort orders</span>
                  <select
                    className={fieldClass}
                    value={queueSort}
                    onChange={(event) =>
                      setQueueSort(event.target.value as QueueSortKey)
                    }
                  >
                    {/* #269: Peter only wants Ship Date (= due date the order
                        must leave the plant) sort. Order-# and Total sorts
                        removed; the queue still defaults to earliest. */}
                    <option value="ship_date_asc">Ship date, earliest</option>
                    <option value="ship_date_desc">Ship date, latest</option>
                  </select>
                </label>
                <label className="flex min-h-[42px] items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-maison-neue text-Charcoal">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-Gold focus:ring-Gold/30"
                    checked={groupByShipDate}
                    onChange={(event) =>
                      setGroupByShipDate(event.target.checked)
                    }
                  />
                  Group by date
                </label>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-maison-neue text-Charcoal/45">
                  {isPending
                    ? "Updating queue..."
                    : "Results update as you filter."}
                </p>
                <button
                  className={`min-h-[42px] shrink-0 rounded-md border px-4 text-xs font-rexton font-bold uppercase ${
                    activeQueueFilters
                      ? "border-Charcoal bg-white text-Charcoal hover:border-Gold/70"
                      : "cursor-not-allowed border-gray-200 bg-gray-50 text-Charcoal/35"
                  }`}
                  disabled={!activeQueueFilters}
                  onClick={clearQueueFilters}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[72px_minmax(0,1fr)_84px] border-b border-gray-200 px-4 py-3 text-[11px] font-maison-neue-mono uppercase text-Charcoal/45 sm:grid-cols-[84px_minmax(0,1fr)_96px]">
            <span>Order</span>
            <span>Customer</span>
            <span className="text-right">Total</span>
          </div>
          <div className="max-h-[360px] overflow-auto lg:max-h-[620px]">
            {queueGroups.map((group) => (
              <div key={group.key}>
                {groupByShipDate && (
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-SilverPlate px-4 py-2 text-[11px] font-maison-neue-mono uppercase text-Charcoal/55">
                    <span>{group.label}</span>
                    <span>
                      {group.items.length} order
                      {group.items.length === 1 ? "" : "s"}
                    </span>
                  </div>
                )}
                {group.items.map((item) => {
                  const selected = item.order_id === selectedOrderId
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => loadDetail(item.order_id)}
                      className={`grid w-full grid-cols-[72px_minmax(0,1fr)_84px] gap-2 border-b border-gray-100 px-4 py-3 text-left transition sm:grid-cols-[84px_minmax(0,1fr)_96px] ${
                        selected ? "bg-Gold/10" : "hover:bg-SilverPlate/30"
                      }`}
                    >
                      <span>
                        <span className="block font-maison-neue-mono text-sm text-Charcoal">
                          {item.display_id
                            ? `#${item.display_id}`
                            : item.order_id.slice(-6)}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-maison-neue text-Charcoal">
                          {item.order_email ||
                            item.customer_email ||
                            "Customer"}
                        </span>
                        {(item.fulfillment_type || item.fulfillment_date) && (
                          <span className="mt-1 block truncate text-xs font-maison-neue text-Charcoal/50">
                            {[
                              fulfillmentTypeLabel(item.fulfillment_type),
                              shortDateLabel(item.fulfillment_date),
                            ]
                              .filter(Boolean)
                              .join(" | ")}
                          </span>
                        )}
                        <span className="mt-1 block">
                          {statusBadge(item.status)}
                        </span>
                        {item.blocked_reason && (
                          <span className="mt-1 block truncate text-xs text-red-700">
                            {item.blocked_reason.replace(/_/g, " ")}
                          </span>
                        )}
                      </span>
                      <span className="text-right text-sm font-maison-neue text-Charcoal">
                        {money(
                          item.final_order_total ?? item.estimated_order_total,
                          item.currency_code
                        )}
                        {item.delta_total !== null &&
                        item.delta_total !== undefined ? (
                          <span className="block text-xs text-Charcoal/50">
                            {money(item.delta_total, item.currency_code)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
            {!queue.length && (
              <p className="px-4 py-8 text-sm font-maison-neue text-Charcoal/55">
                {activeQueueFilters
                  ? "No orders match these filters."
                  : "No submitted orders are waiting for catch-weight finalization."}
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0">
          {detail ? (
            <>
              <div className="border-b border-gray-200 p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-all text-xl font-maison-neue font-semibold text-Charcoal">
                        {detail.order?.display_id
                          ? `#${detail.order.display_id}`
                          : detail.order?.id}
                      </h3>
                      {statusBadge(detail.finalization.status)}
                    </div>
                    <p className="mt-1 text-sm font-maison-neue text-Charcoal/60">
                      {detail.order?.email ||
                        detail.finalization.customer_email}
                    </p>
                  </div>
                  <div className="grid w-full grid-cols-3 gap-2 rounded-md bg-SilverPlate/30 p-3 text-left sm:w-auto sm:min-w-[260px] sm:text-right">
                    <div>
                      <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                        Estimate
                      </p>
                      <p className="font-maison-neue text-sm text-Charcoal">
                        {money(
                          detail.finalization.estimated_order_total,
                          currencyCode
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                        Final
                      </p>
                      <p className="font-maison-neue text-sm text-Charcoal">
                        {money(totals.final_order_total, currencyCode)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                        Change
                      </p>
                      <p className="font-maison-neue text-sm text-Charcoal">
                        {money(totals.delta_total, currencyCode)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {["pending_pick", "pending_pack"].includes(currentStatus) && (
                    <Button
                      className={`${primaryButtonClass} w-full sm:w-auto`}
                      disabled={!canPickOrders || Boolean(pendingAction)}
                      isLoading={pendingAction === "start-pick"}
                      onClick={() =>
                        runAction("start-pick", "Picking claimed.", (orderId) =>
                          startCatchWeightFinalization(orderId, "pick")
                        )
                      }
                      type="button"
                    >
                      Claim Pick
                    </Button>
                  )}
                  {pickClaimed && (
                    <Button
                      className={`${secondaryButtonClass} w-full sm:w-auto`}
                      disabled={Boolean(pendingAction)}
                      isLoading={pendingAction === "unclaim-pick"}
                      onClick={unclaimPick}
                      type="button"
                    >
                      Unclaim Pick
                    </Button>
                  )}
                  {pickClaimed && (
                    <Button
                      className={`w-full sm:w-auto ${
                        readyForPackingBlocked
                          ? disabledButtonClass
                          : secondaryButtonClass
                      }`}
                      disabled={
                        Boolean(pendingAction) || readyForPackingBlocked
                      }
                      isLoading={pendingAction === "ready-pack"}
                      aria-describedby={
                        readyForPackingBlocked
                          ? readyForPackingBlockerId
                          : undefined
                      }
                      aria-disabled={readyForPackingBlocked || undefined}
                      onClick={() =>
                        runAction(
                          "ready-pack",
                          "Order ready for packing.",
                          markCatchWeightReadyForPacking
                        )
                      }
                      title={readyForPackingDisabledReason || undefined}
                      type="button"
                    >
                      Ready For Packing
                    </Button>
                  )}
                  {waitingForPacker && (
                    <Button
                      className={`${primaryButtonClass} w-full sm:w-auto`}
                      disabled={!canPackOrders || Boolean(pendingAction)}
                      isLoading={pendingAction === "start-pack"}
                      onClick={() =>
                        runAction("start-pack", "Packing claimed.", (orderId) =>
                          startCatchWeightFinalization(orderId, "pack")
                        )
                      }
                      type="button"
                    >
                      Claim Pack
                    </Button>
                  )}
                  {packWorkClaimed && (
                    <Button
                      className={`${secondaryButtonClass} w-full sm:w-auto`}
                      disabled={!canPackOrders || Boolean(pendingAction)}
                      isLoading={pendingAction === "return-picking"}
                      onClick={() =>
                        sendBackToPicking(
                          "Packer found missing, short, or wrong items during packing."
                        )
                      }
                      type="button"
                    >
                      Send Back To Picking
                    </Button>
                  )}
                  {packWorkClaimed && (
                    <Button
                      className={`${primaryButtonClass} w-full sm:w-auto`}
                      disabled={
                        Boolean(pendingAction) ||
                        Boolean(packingReadyDisabledReason)
                      }
                      isLoading={pendingAction === "approve"}
                      onClick={() =>
                        runAction(
                          "approve",
                          "Ready for final charge.",
                          approveCatchWeightFinalization
                        )
                      }
                      type="button"
                    >
                      Mark Ready For Charge
                    </Button>
                  )}
                  {inChargeReviewPhase && (
                    <Button
                      className={`${secondaryButtonClass} w-full sm:w-auto`}
                      disabled={Boolean(pendingAction)}
                      isLoading={pendingAction === "return-picking"}
                      onClick={() =>
                        sendBackToPicking(
                          "Front office found missing, short, or wrong items before charge."
                        )
                      }
                      type="button"
                    >
                      Send Back To Picking
                    </Button>
                  )}
                  {inChargeReviewPhase && (
                    <Button
                      className={`${secondaryButtonClass} w-full sm:w-auto`}
                      disabled={Boolean(pendingAction)}
                      isLoading={pendingAction === "return-packing"}
                      onClick={sendBackToPacking}
                      type="button"
                    >
                      Send Back To Packing
                    </Button>
                  )}
                  {inChargeReviewPhase && (
                    <Button
                      className="min-h-[42px] w-full rounded-md bg-Gold px-4 text-xs font-rexton font-bold uppercase text-Charcoal sm:w-auto"
                      disabled={
                        Boolean(pendingAction) || Boolean(chargeDisabledReason)
                      }
                      isLoading={pendingAction === "charge"}
                      onClick={() =>
                        runAction(
                          "charge",
                          "Card charged; order ready to ship.",
                          chargeAndReleaseCatchWeightOrder
                        )
                      }
                      type="button"
                    >
                      Charge Card & Release
                    </Button>
                  )}
                  {readyForFulfillment && (
                    <Button
                      className={`min-h-[42px] w-full rounded-md px-4 text-xs font-rexton font-bold uppercase sm:w-auto ${
                        fulfilled
                          ? "border border-gray-200 bg-gray-50 text-Charcoal/50"
                          : "bg-Charcoal px-4 text-white"
                      }`}
                      disabled={fulfilled || Boolean(pendingAction)}
                      isLoading={pendingAction === "fulfill"}
                      onClick={() =>
                        runAction(
                          "fulfill",
                          "Fulfillment created.",
                          fulfillReleasedCatchWeightOrder
                        )
                      }
                      type="button"
                    >
                      {fulfilled ? "Fulfilled" : "Mark Fulfilled"}
                    </Button>
                  )}
                </div>
                {inFulfillmentReadyPhase && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-maison-neue text-emerald-900">
                    <span aria-hidden className="mt-0.5 font-bold leading-none">
                      ✓
                    </span>
                    <p>
                      <span className="font-semibold">
                        Card charged
                        {totals.final_order_total !== null &&
                        totals.final_order_total !== undefined
                          ? ` — ${money(totals.final_order_total, currencyCode)} captured`
                          : ""}
                        .
                      </span>{" "}
                      {fulfilled
                        ? "Order fulfilled and released to shipping."
                        : "Order is ready to ship — click Mark Fulfilled to release it."}
                    </p>
                  </div>
                )}
                {inPickingPhase && !pickClaimed && (
                  <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/50 px-3 py-2 text-sm text-blue-900">
                    <p className="font-maison-neue font-semibold">
                      Claim this pick before editing or handing it to packing.
                    </p>
                    <p className="mt-1 font-maison-neue text-blue-900/75">
                      Claiming records who owns the pick and unlocks the picked
                      count, remove, and substitute controls.
                    </p>
                  </div>
                )}
                {pickClaimed &&
                  (pickerReadiness.blockers.length > 0 ||
                    pickerReadiness.warnings.length > 0) && (
                    <div
                      aria-live="polite"
                      className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                      id={readyForPackingBlockerId}
                    >
                      {pickerReadiness.blockers.length > 0 && (
                        <>
                          <p className="font-maison-neue font-semibold">
                            Ready For Packing is blocked.
                          </p>
                          <p className="mt-1 font-maison-neue text-amber-900/75">
                            {pickerReadiness.blockers.length} highlighted line
                            {pickerReadiness.blockers.length === 1
                              ? ""
                              : "s"}{" "}
                            need attention below.
                          </p>
                        </>
                      )}
                      {pickerReadiness.warnings.length > 0 && (
                        <>
                          <p
                            className={`font-maison-neue font-semibold ${
                              pickerReadiness.blockers.length > 0 ? "mt-3" : ""
                            }`}
                          >
                            Review intentional exceptions:
                          </p>
                          <p className="mt-1 font-maison-neue text-amber-900/75">
                            {pickerReadiness.warnings.length} highlighted
                            exception
                            {pickerReadiness.warnings.length === 1
                              ? ""
                              : "s"}{" "}
                            should be reviewed on the affected line
                            {pickerReadiness.warnings.length === 1 ? "" : "s"}.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                {packWorkClaimed && packingReadyDisabledReason && (
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {blockingIssues.length ? (
                      <>
                        <p className="font-maison-neue font-semibold">
                          Resolve these before marking ready for charge:
                        </p>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {blockingIssues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      packingReadyDisabledReason
                    )}
                  </div>
                )}
                {inChargeReviewPhase && chargeDisabledReason && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {blockingIssues.length ? (
                        <>
                          <p className="font-maison-neue font-semibold">
                            Resolve these before charging:
                          </p>
                          <ul className="mt-2 list-disc space-y-1 pl-5">
                            {blockingIssues.map((issue) => (
                              <li key={issue}>{issue}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        chargeDisabledReason
                      )}
                    </div>
                  )}
              </div>

              {canViewAuditTrail && <OrderAuditTrail order={detail.order} />}

              {canEditLines && inPickingPhase && (
                <AddFinalizationItem
                  orderId={detail.order.id}
                  currencyCode={currencyCode}
                  canEdit={canEditLines}
                  onSaved={() => loadDetail(detail.order.id)}
                />
              )}

              {showPackingDetail && (
                <PackageCapture
                  orderId={detail.order.id}
                  detail={detail}
                  canEdit={canEditPackingLines}
                  onSaved={() => loadDetail(detail.order.id)}
                />
              )}

              <div>
                {detail.lines.map((line) => (
                  <LineEditor
                    key={line.id}
                    orderId={detail.order.id}
                    line={line}
                    currencyCode={currencyCode}
                    phase={editorPhase}
                    canEdit={canEditLines}
                    readinessIssues={
                      pickerReadiness.lineIssues[lineIssueKey(line)] || []
                    }
                    onSaved={() => loadDetail(detail.order.id)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="p-8 text-sm font-maison-neue text-Charcoal/55">
              {isPending ? "Loading..." : "Select an order."}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
