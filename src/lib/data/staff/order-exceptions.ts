"use server"

import "server-only"

import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import {
  canManageOrderSupport,
  staffAccessRole,
  staffDisplayName,
} from "@lib/util/staff-access"
import { adminFetch } from "./admin"
import {
  actionIsBlockedByOperationalState,
  actionIsAuditOnly,
  actionMovesMoney,
  actionMutatesMedusa,
  actionRequiredConfirmation,
  actionRequiresQuickBooksPosting,
  actionRequiresCustomerConsent,
  parseStaffAuditLog,
  staffExceptionActionConfig,
  staffOrderItemEditEligibility,
  staffOrderOperationalState,
  staffOrderSupportActionAvailability,
  type StaffAuditEntry,
  type StaffConsentMethod,
  type StaffExceptionActionType,
  type StaffExceptionReasonCode,
  type StaffOrderOperationalState,
  type StaffOrderSupportRole,
} from "./exception-types"
import {
  staffCurrencyAmount,
  staffMinorUnitsFromCurrency,
  staffPositiveCurrencyAmount,
} from "./money"
import {
  collectStaffOrderPayments,
  validateFullStripeCaptureAmount,
  type StaffOrderPayment,
} from "./order-exception-payments"

type AnyRecord = Record<string, any>
type StaffActionStatus =
  | "requested"
  | "completed"
  | "recorded"
  | "pending_manual"
  | "failed"

type OrderListResponse = {
  orders?: AnyRecord[]
  count?: number | string
}

export type StaffExceptionOrderSummary = {
  id: string
  source: "medusa" | "legacy"
  displayId: string
  email: string
  customerName: string
  createdAt: string
  updatedAt?: string
  status: string
  fulfillmentStatus: string
  paymentStatus: string
  total: number
  currencyCode: string
  itemCount: number
  operationalState: StaffOrderOperationalState
  fulfillmentType?: StaffFulfillmentType
  fulfillmentLabel?: string
  fulfillmentDate?: string
  fulfillmentZip?: string
  shippingMethodName?: string
  latestStaffAction?: string
}

export type StaffExceptionOrderQueueFilter = "open" | "all"
export type StaffExceptionFulfillmentFilter =
  | "all"
  | "unfulfilled"
  | "partially_fulfilled"
  | "fulfilled"
export type StaffExceptionPaymentFilter =
  | "all"
  | "awaiting_payment"
  | "paid"
  | "refunded"

export type StaffExceptionOrderSortKey =
  | "created_desc"
  | "created_asc"
  | "fulfillment_date_asc"
  | "fulfillment_date_desc"
  | "order_newest"
  | "order_oldest"
  | "total_desc"
  | "total_asc"

export type StaffExceptionOrderSearchInput = {
  query?: string
  queue?: StaffExceptionOrderQueueFilter
  fulfillmentStatus?: StaffExceptionFulfillmentFilter
  paymentStatus?: StaffExceptionPaymentFilter
  fulfillmentType?: StaffFulfillmentType | "all" | ""
  dateFrom?: string
  dateTo?: string
  sort?: StaffExceptionOrderSortKey
  page?: number
  pageSize?: number
  limit?: number
}

export type StaffExceptionOrderSearchResult = {
  ok: boolean
  orders: StaffExceptionOrderSummary[]
  total: number
  page: number
  pageSize: number
  hasNextPage: boolean
  error?: string
}

export type StaffExceptionOrderItem = {
  id: string
  productId?: string
  variantId?: string
  title: string
  subtitle?: string
  sku?: string
  qbdListId?: string
  qbdTxnLineId?: string
  mappingStatus?: string
  lineKind?: string
  customerVisible?: boolean
  quantity: number
  fulfilledQuantity: number
  unitPrice: number
  total: number
}

export type StaffExceptionOrderItemQuantityChange = {
  itemId: string
  quantity: number
}

export type StaffExceptionOrderItemAddition = {
  variantId: string
  quantity: number
  title: string
  sku?: string
  productId?: string
  qbdListId?: string
  unitPrice?: number
  pricingMode?: string
}

export type StaffExceptionPayment = StaffOrderPayment

export type StaffExceptionAddress = {
  name: string
  company?: string
  line1?: string
  line2?: string
  cityLine?: string
  phone?: string
}

export type StaffFulfillmentType =
  | "plant_pickup"
  | "atlanta_delivery"
  | "ups_shipping"
  | "southeast_pickup"

export type StaffExceptionFulfillmentPlan = {
  fulfillmentType: StaffFulfillmentType
  fulfillmentLabel: string
  dateLabel: string
  scheduledDate?: string
  requestedDeliveryDate?: string
  requestedFulfillmentDate?: string
  timeWindow?: string
  pickupLocationId?: string
  zip?: string
  shippingMethodName?: string
  addressSummary?: string
}

export type StaffExceptionLegacyDocument = {
  source?: string
  sourceOrderId?: string
  refNumber?: string
  qbdTxnId?: string
  legacyOrderId?: string
  legacyCustomerId?: string
  qbdCustomerListId?: string
  medusaCustomerId?: string
  placedAt?: string
  shipDate?: string
  importedAt?: string
}

export type StaffExceptionOrderDetail = StaffExceptionOrderSummary & {
  accountingActions?: Array<{ id: string; request_key: string; action: string; status: string; amount_minor: number;
    currency_code: string; depends_on_request_key?: string; last_error?: string; created_at: string;
    receipt?: { no_effect_reason?: string; transactions?: Array<{ kind: string; txn_id: string }> } }>
  accountingHistoryError?: string
  subtotal: number
  shippingTotal: number
  taxTotal: number
  discountTotal: number
  items: StaffExceptionOrderItem[]
  payments: StaffExceptionPayment[]
  shippingMethods: string[]
  fulfillmentPlan: StaffExceptionFulfillmentPlan
  fulfillments: {
    id: string
    status?: string
    shippedAt?: string
    deliveredAt?: string
  }[]
  shippingAddress?: StaffExceptionAddress
  billingAddress?: StaffExceptionAddress
  metadata: AnyRecord
  auditLog: StaffAuditEntry[]
  legacy?: StaffExceptionLegacyDocument
}

export type StaffExceptionActionInput = {
  requestId?: string
  accountingRequestKey?: string
  orderId: string
  action: StaffExceptionActionType
  reasonCode: StaffExceptionReasonCode
  staffNote: string
  customerVisibleNote?: string
  customerConsentMethod?: StaffConsentMethod
  amount?: number
  paymentId?: string
  offlinePaymentMethod?: string
  offlinePaymentReference?: string
  shippingChangeSummary?: string
  shippingFulfillmentType?: StaffFulfillmentType
  shippingRequestedDate?: string
  shippingZip?: string
  shippingMethodName?: string
  itemQuantityChanges?: StaffExceptionOrderItemQuantityChange[]
  itemAdditions?: StaffExceptionOrderItemAddition[]
  notifyCustomer?: boolean
  typedConfirmation?: string
}

export type StaffExceptionActionResult = {
  ok: boolean
  error?: string
  order?: StaffExceptionOrderDetail
}

export type StaffExceptionActionPreview = {
  ok: boolean
  error?: string
  action: StaffExceptionActionType
  actionLabel: string
  operationalState: StaffOrderOperationalState
  orderDisplayId: string
  amount?: number
  paymentId?: string
  willWriteAuditLog: boolean
  willMutateMedusa: boolean
  qbdReconciliationNeeded: boolean
  customerNotificationStatus: "not_requested" | "recorded_only_not_sent"
  requiredConfirmation: string | null
  summary: string
  warnings: string[]
  blockingReasons: string[]
}

const ORDER_LIST_FIELDS =
  "id,display_id,email,status,fulfillment_status,payment_status,total,currency_code,created_at,updated_at,+metadata,*customer,*items,*shipping_address,*shipping_methods"

const ORDER_DETAIL_FIELDS =
  "id,display_id,email,status,fulfillment_status,payment_status,total,subtotal,shipping_total,tax_total,discount_total,currency_code,created_at,updated_at,canceled_at,+metadata,*customer,*items,*items.detail,*items.variant,*items.product,*shipping_address,*billing_address,*shipping_methods,*fulfillments,*payment_collections,*payment_collections.payments,*payment_collections.payments.captures,*payment_collections.payments.refunds"

function amount(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function displayId(order: AnyRecord): string {
  return order.display_id ? `#${order.display_id}` : order.id
}

function staffOrderSupportErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function orderSupportSearchQueryKind(query: string) {
  const trimmed = query.trim()
  if (!trimmed) return "empty"
  if (trimmed.includes("@")) return "email"
  if (/^#?\d+$/.test(trimmed)) return "order_number"
  if (trimmed.replace(/\D/g, "").length >= 7) return "phone"
  return "text"
}

async function emitStaffOrderSupportSearchFailureAlert(input: {
  searchInput: StaffExceptionOrderSearchInput
  error: unknown
}) {
  const query = input.searchInput.query || ""
  await emitStorefrontOpsAlert({
    alertKind: "staff_order_support_search_failed",
    severity: "warn",
    title: "Staff order support search failed",
    path: "src/lib/data/staff/order-exceptions.ts",
    source: "medusa-server",
    fingerprint: "staff_order_support:search_failed",
    meta: {
      staff_module: "order_support",
      action: "search_orders",
      query_kind: orderSupportSearchQueryKind(query),
      query_length_bucket: query.trim()
        ? Math.min(50, Math.ceil(query.trim().length / 10) * 10)
        : 0,
      queue: input.searchInput.queue || "open",
      fulfillment_status: input.searchInput.fulfillmentStatus || "all",
      payment_status: input.searchInput.paymentStatus || "all",
      page: input.searchInput.page,
      page_size: input.searchInput.pageSize,
      error_message: staffOrderSupportErrorMessage(input.error).slice(0, 300),
    },
  })
}

async function emitStaffOrderSupportActionFailureAlert(input: {
  action: StaffExceptionActionType
  order: AnyRecord
  stage: string
  requestKey?: string
  error: unknown
}) {
  await emitStorefrontOpsAlert({
    alertKind: "staff_order_support_action_failed",
    severity: actionMovesMoney(input.action) ? "page" : "warn",
    title: "Staff order support action failed",
    path: "src/lib/data/staff/order-exceptions.ts",
    source: "medusa-server",
    fingerprint: `staff_order_support:${input.action}:${input.stage}:failed`,
    meta: {
      staff_module: "order_support",
      action: input.action,
      stage: input.stage,
      order_id: input.order.id || "",
      order_display_id: displayId(input.order),
      moves_money: actionMovesMoney(input.action),
      mutates_medusa: actionMutatesMedusa(input.action),
      qbd_reconciliation_needed: qbdReconciliationNeeded(input.action),
      downstream_request_key: input.requestKey || "",
      error_message: staffOrderSupportErrorMessage(input.error).slice(0, 300),
    },
  })
}

function customerName(order: AnyRecord): string {
  const customer = order.customer || {}
  const fromCustomer = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()
  const fromShipping = [
    order.shipping_address?.first_name,
    order.shipping_address?.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()
  return fromCustomer || fromShipping || order.email || "Customer"
}

function latestStaffAction(
  metadata: AnyRecord | null | undefined
): string | undefined {
  const latest = parseStaffAuditLog(metadata).slice(-1)[0]
  return latest?.action || latest?.staff_action
}

function summarizeOrder(order: AnyRecord): StaffExceptionOrderSummary {
  const items = Array.isArray(order.items) ? order.items : []
  const fulfillmentPlan = orderFulfillmentPlan(order)
  return {
    id: order.id,
    source: "medusa",
    displayId: displayId(order),
    email: order.email || order.customer?.email || "",
    customerName: customerName(order),
    createdAt: order.created_at || "",
    updatedAt: order.updated_at || "",
    status: order.status || "unknown",
    fulfillmentStatus: order.fulfillment_status || "unknown",
    paymentStatus: order.payment_status || "unknown",
    total: staffCurrencyAmount(order.total),
    currencyCode: order.currency_code || "usd",
    itemCount: items.reduce((sum: number, item: AnyRecord) => {
      return sum + amount(item.quantity)
    }, 0),
    operationalState: staffOrderOperationalState(order),
    fulfillmentType: fulfillmentPlan.fulfillmentType,
    fulfillmentLabel: fulfillmentPlan.fulfillmentLabel,
    fulfillmentDate:
      fulfillmentPlan.requestedFulfillmentDate ||
      fulfillmentPlan.dateLabel ||
      fulfillmentPlan.scheduledDate ||
      fulfillmentPlan.requestedDeliveryDate,
    fulfillmentZip: fulfillmentPlan.zip,
    shippingMethodName: fulfillmentPlan.shippingMethodName,
    latestStaffAction: latestStaffAction(order.metadata),
  }
}

function legacyDisplayId(order: AnyRecord): string {
  return (
    order.ref_number || order.qbd_txn_id || order.legacy_order_id || order.id
  )
}

function summarizeLegacyOrder(order: AnyRecord): StaffExceptionOrderSummary {
  const lines = Array.isArray(order.lines) ? order.lines : []
  return {
    id: order.id,
    source: "legacy",
    displayId: `Legacy ${legacyDisplayId(order)}`,
    email: order.email_lower || "",
    customerName: order.customer_name || order.email_lower || "Legacy customer",
    createdAt: order.placed_at || order.imported_at || "",
    updatedAt: order.imported_at || "",
    status: order.status || "imported",
    fulfillmentStatus: "historical",
    paymentStatus: "historical",
    total: staffCurrencyAmount(order.total),
    currencyCode: order.currency_code || "usd",
    itemCount:
      Number(order.line_count || 0) ||
      lines.reduce(
        (sum: number, line: AnyRecord) => sum + amount(line.quantity),
        0
      ),
    operationalState: "completed_or_shipped",
  }
}

type NormalizedStaffExceptionOrderSearchInput = {
  query: string
  queue: StaffExceptionOrderQueueFilter
  fulfillmentStatus: StaffExceptionFulfillmentFilter
  paymentStatus: StaffExceptionPaymentFilter
  fulfillmentType: StaffFulfillmentType | ""
  dateFrom: string
  dateTo: string
  sort: StaffExceptionOrderSortKey
  page: number
  pageSize: number
}

function normalizePositiveInteger(
  value: unknown,
  fallback: number,
  max = 100
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(Math.floor(parsed), max)
}

function normalizeSearchInput(
  input: string | StaffExceptionOrderSearchInput
): NormalizedStaffExceptionOrderSearchInput {
  if (typeof input === "string") {
    return {
      query: input,
      queue: input.trim() ? "all" : "open",
      fulfillmentStatus: "all",
      paymentStatus: "all",
      fulfillmentType: "",
      dateFrom: "",
      dateTo: "",
      sort: "created_desc",
      page: 1,
      pageSize: 30,
    }
  }

  const query = input.query || ""
  const fulfillmentType = normalizeFulfillmentType(input.fulfillmentType)
  return {
    query,
    queue: input.queue || (query.trim() ? "all" : "open"),
    fulfillmentStatus: input.fulfillmentStatus || "all",
    paymentStatus: input.paymentStatus || "all",
    fulfillmentType: fulfillmentType || "",
    dateFrom: textValue(input.dateFrom),
    dateTo: textValue(input.dateTo),
    sort: input.sort || "created_desc",
    page: normalizePositiveInteger(input.page, 1, 500),
    pageSize: normalizePositiveInteger(
      input.pageSize ?? input.limit,
      input.limit || 30,
      100
    ),
  }
}

function isCanceledOrder(order: StaffExceptionOrderSummary): boolean {
  const status = String(order.status || "").toLowerCase()
  const fulfillmentStatus = String(order.fulfillmentStatus || "").toLowerCase()
  return (
    status === "canceled" ||
    status === "cancelled" ||
    fulfillmentStatus === "canceled" ||
    fulfillmentStatus === "cancelled"
  )
}

function isFulfilledOrder(order: StaffExceptionOrderSummary): boolean {
  const value = String(order.fulfillmentStatus || "").toLowerCase()
  return ["fulfilled", "shipped", "delivered"].includes(value)
}

function isPartiallyFulfilledOrder(order: StaffExceptionOrderSummary): boolean {
  return String(order.fulfillmentStatus || "")
    .toLowerCase()
    .includes("partial")
}

function isOpenOrder(order: StaffExceptionOrderSummary): boolean {
  return (
    order.source === "medusa" &&
    !isCanceledOrder(order) &&
    !isFulfilledOrder(order)
  )
}

function orderMatchesFulfillmentFilter(
  order: StaffExceptionOrderSummary,
  filter: StaffExceptionFulfillmentFilter
): boolean {
  if (filter === "all") return true
  if (filter === "partially_fulfilled") return isPartiallyFulfilledOrder(order)
  if (filter === "fulfilled") return isFulfilledOrder(order)
  return (
    !isCanceledOrder(order) &&
    !isFulfilledOrder(order) &&
    !isPartiallyFulfilledOrder(order)
  )
}

function orderMatchesPaymentFilter(
  order: StaffExceptionOrderSummary,
  filter: StaffExceptionPaymentFilter
): boolean {
  if (filter === "all") return true
  const value = String(order.paymentStatus || "").toLowerCase()
  if (filter === "awaiting_payment") {
    return (
      value === "pending" ||
      value === "not_paid" ||
      value === "awaiting" ||
      value === "requires_action" ||
      value === "authorized"
    )
  }
  if (filter === "paid") {
    return (
      value === "paid" || value === "captured" || value === "partially_refunded"
    )
  }
  return value.includes("refund")
}

function isoDateOnly(value: unknown): string {
  const text = textValue(value)
  if (!text) return ""
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10)
  const parsed = Date.parse(text)
  if (!Number.isFinite(parsed)) return ""
  return new Date(parsed).toISOString().slice(0, 10)
}

// Convert a timestamp to the business-timezone (US Eastern) calendar date
// (YYYY-MM-DD). Order createdAt is stored in UTC, but staff — and the
// date-range bounds, which come from the browser's local "today" — think in
// Eastern time. Slicing the raw UTC string off-by-ones late-evening orders
// (an 11:30pm ET June 15 order is 03:30 UTC June 16, so a "through June 15"
// filter would wrongly exclude it). #268 P2 (Codex review). Deterministic
// regardless of whether this runs on the server (UTC) or the client.
function businessCalendarDate(value: unknown): string {
  const text = textValue(value)
  if (!text) return ""
  // A bare `YYYY-MM-DD` (no time component) is ALREADY a calendar date — it
  // has no timezone, so reparsing it via Date.parse treats it as UTC midnight,
  // which `toLocaleDateString('America/New_York', …)` then shifts back to the
  // PRIOR ET date. Preserve date-only strings verbatim. #268 P2 (Codex
  // review).
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = Date.parse(text)
  if (!Number.isFinite(parsed)) return isoDateOnly(text)
  try {
    // Derive the Eastern-time calendar date from a full timestamp via
    // formatToParts (deterministic across server-UTC and client-local),
    // assembled as YYYY-MM-DD.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(parsed))
    const year = parts.find((p) => p.type === "year")?.value
    const month = parts.find((p) => p.type === "month")?.value
    const day = parts.find((p) => p.type === "day")?.value
    if (year && month && day) return `${year}-${month}-${day}`
    return isoDateOnly(text)
  } catch {
    return isoDateOnly(text)
  }
}

function orderDisplayNumber(order: StaffExceptionOrderSummary): number {
  const match = order.displayId.match(/\d+/)
  return match ? Number(match[0]) : 0
}

function compareText(a: string | undefined, b: string | undefined): number {
  return String(a || "").localeCompare(String(b || ""))
}

function compareOrderSearchResults(
  a: StaffExceptionOrderSummary,
  b: StaffExceptionOrderSummary,
  sort: StaffExceptionOrderSortKey
): number {
  if (sort === "created_asc") {
    return compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id)
  }
  if (sort === "fulfillment_date_asc") {
    return (
      compareText(
        isoDateOnly(a.fulfillmentDate),
        isoDateOnly(b.fulfillmentDate)
      ) || compareText(a.createdAt, b.createdAt)
    )
  }
  if (sort === "fulfillment_date_desc") {
    return (
      compareText(
        isoDateOnly(b.fulfillmentDate),
        isoDateOnly(a.fulfillmentDate)
      ) || compareText(b.createdAt, a.createdAt)
    )
  }
  if (sort === "order_newest") {
    return orderDisplayNumber(b) - orderDisplayNumber(a)
  }
  if (sort === "order_oldest") {
    return orderDisplayNumber(a) - orderDisplayNumber(b)
  }
  if (sort === "total_desc") {
    return b.total - a.total || compareText(b.createdAt, a.createdAt)
  }
  if (sort === "total_asc") {
    return a.total - b.total || compareText(b.createdAt, a.createdAt)
  }
  return compareText(b.createdAt, a.createdAt) || compareText(b.id, a.id)
}

function orderMatchesFulfillmentTypeFilter(
  order: StaffExceptionOrderSummary,
  filter: StaffFulfillmentType | ""
): boolean {
  if (!filter) return true
  return order.fulfillmentType === filter
}

function orderMatchesDateFilter(
  order: StaffExceptionOrderSummary,
  dateFrom: string,
  dateTo: string
): boolean {
  if (!dateFrom && !dateTo) return true
  // Filter on the order/invoice date (createdAt), which is populated for both
  // Medusa (created_at) and legacy QuickBooks (placed_at || imported_at)
  // orders. fulfillmentDate is undefined for legacy orders, which previously
  // caused every legacy order to be silently dropped when a date range was set.
  const date = businessCalendarDate(order.createdAt)
  // If the order genuinely has no comparable date, don't drop it — a missing
  // date should not silently hide an order from a date-filtered search.
  if (!date) return true
  const from = isoDateOnly(dateFrom)
  const to = isoDateOnly(dateTo)
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function applyOrderQueueFilters(
  orders: StaffExceptionOrderSummary[],
  input: NormalizedStaffExceptionOrderSearchInput
): StaffExceptionOrderSummary[] {
  return orders
    .filter((order) => {
      if (input.queue === "open" && !isOpenOrder(order)) return false
      if (!orderMatchesFulfillmentFilter(order, input.fulfillmentStatus)) {
        return false
      }
      if (!orderMatchesPaymentFilter(order, input.paymentStatus)) return false
      if (!orderMatchesFulfillmentTypeFilter(order, input.fulfillmentType)) {
        return false
      }
      if (!orderMatchesDateFilter(order, input.dateFrom, input.dateTo)) {
        return false
      }
      return true
    })
    .sort((a, b) => compareOrderSearchResults(a, b, input.sort))
}

function paginateOrderSearchResults(
  orders: StaffExceptionOrderSummary[],
  input: NormalizedStaffExceptionOrderSearchInput
): Omit<StaffExceptionOrderSearchResult, "ok" | "error"> {
  const filtered = applyOrderQueueFilters(orders, input)
  const total = filtered.length
  const totalPages = total ? Math.ceil(total / input.pageSize) : 1
  const page = Math.min(input.page, totalPages)
  const start = (page - 1) * input.pageSize
  const pageOrders = filtered.slice(start, start + input.pageSize)

  return {
    orders: pageOrders,
    total,
    page,
    pageSize: input.pageSize,
    hasNextPage: start + input.pageSize < total,
  }
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function shouldSearchCustomersForOrderQuery(query: string): boolean {
  const q = query.trim()
  if (!q) return false
  if (q.includes("@") || q.includes("+")) return true

  // Customer searches fan out into order lookups. Avoid that expensive branch
  // while staff are still typing broad one- or two-character fragments.
  return q.replace(/^#/, "").length >= 3 && /[a-z]/i.test(q)
}

function detailLegacyOrder(order: AnyRecord): StaffExceptionOrderDetail {
  const summary = summarizeLegacyOrder(order)
  const lines = Array.isArray(order.lines) ? order.lines : []

  return {
    ...summary,
    subtotal: staffCurrencyAmount(order.subtotal),
    shippingTotal: staffCurrencyAmount(order.shipping_total),
    taxTotal: staffCurrencyAmount(order.tax_total),
    discountTotal: staffCurrencyAmount(order.discount_total),
    items: lines.map((line: AnyRecord) => ({
      id: line.id,
      productId: line.medusa_product_id || undefined,
      variantId: line.medusa_variant_id || undefined,
      title:
        line.display_title ||
        line.medusa_variant_title ||
        line.medusa_product_title ||
        line.title ||
        line.description ||
        "Legacy item",
      subtitle:
        line.description && line.description !== line.title
          ? line.description
          : line.medusa_variant_title,
      sku: line.sku || undefined,
      qbdListId: line.qbd_item_list_id || undefined,
      qbdTxnLineId: line.qbd_txn_line_id || undefined,
      mappingStatus: line.mapping_status || undefined,
      lineKind: line.line_kind || line.metadata?.line_kind || undefined,
      customerVisible:
        typeof line.customer_visible === "boolean"
          ? line.customer_visible
          : undefined,
      quantity: amount(line.quantity),
      fulfilledQuantity: amount(line.fulfilled_quantity),
      unitPrice: staffCurrencyAmount(line.unit_price),
      total: staffCurrencyAmount(line.line_total),
    })),
    payments: [],
    shippingMethods: [],
    fulfillmentPlan: {
      fulfillmentType: "ups_shipping",
      fulfillmentLabel: "Historical QuickBooks",
      dateLabel: "",
    },
    fulfillments: [],
    legacy: {
      source: order.source || undefined,
      sourceOrderId: order.source_order_id || undefined,
      refNumber: order.ref_number || undefined,
      qbdTxnId: order.qbd_txn_id || undefined,
      legacyOrderId: order.legacy_order_id || undefined,
      legacyCustomerId: order.legacy_customer_id || undefined,
      qbdCustomerListId: order.qbd_customer_list_id || undefined,
      medusaCustomerId: order.medusa_customer_id || undefined,
      placedAt: order.placed_at || undefined,
      shipDate: order.ship_date || undefined,
      importedAt: order.imported_at || undefined,
    },
    metadata: {
      legacy_order_id: order.id,
      legacy_ref_number: order.ref_number || "",
      qbd_txn_id: order.qbd_txn_id || "",
      staff_exception_status: "historical_quickbooks_order",
    },
    auditLog: [],
  }
}

function toAddress(
  address: AnyRecord | null | undefined
): StaffExceptionAddress | undefined {
  if (!address) return undefined
  const cityLine = [
    address.city,
    address.province,
    address.postal_code,
    address.country_code?.toUpperCase?.(),
  ]
    .filter(Boolean)
    .join(", ")
  return {
    name: [address.first_name, address.last_name].filter(Boolean).join(" "),
    company: address.company || "",
    line1: address.address_1 || "",
    line2: address.address_2 || "",
    cityLine,
    phone: address.phone || "",
  }
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return ""
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textValue(value)
    if (text) return text
  }
  return ""
}

function qbdListIdFromOrderItem(item: AnyRecord): string | undefined {
  const metadata = item.metadata || {}
  const variantMetadata = item.variant?.metadata || {}
  const productMetadata =
    item.product?.metadata || item.variant?.product?.metadata || {}
  const value =
    metadata.qbd_list_id ||
    metadata.quickbooks_list_id ||
    variantMetadata.qbd_list_id ||
    variantMetadata.quickbooks_list_id ||
    productMetadata.qbd_list_id ||
    productMetadata.quickbooks_list_id

  return value ? String(value) : undefined
}

function normalizeFulfillmentType(value: unknown): StaffFulfillmentType | null {
  const text = textValue(value).toLowerCase()
  if (
    text === "plant_pickup" ||
    text === "atlanta_delivery" ||
    text === "ups_shipping" ||
    text === "southeast_pickup"
  ) {
    return text
  }
  return null
}

function fulfillmentLabel(type: StaffFulfillmentType): string {
  switch (type) {
    case "plant_pickup":
      return "Plant pickup"
    case "atlanta_delivery":
      return "Atlanta delivery"
    case "southeast_pickup":
      return "Southeast pickup"
    case "ups_shipping":
      return "UPS shipping"
  }
}

function shippingMethodName(order: AnyRecord): string {
  const methods = Array.isArray(order.shipping_methods)
    ? order.shipping_methods
    : []
  const latest = methods[methods.length - 1] || {}
  return firstText(latest.name, latest.shipping_option?.name)
}

function inferFulfillmentType(order: AnyRecord): StaffFulfillmentType {
  const metadata = order.metadata || {}
  const direct = normalizeFulfillmentType(
    firstText(metadata.fulfillmentType, metadata.fulfillment_type)
  )
  if (direct) return direct

  const method = shippingMethodName(order).toLowerCase()
  if (method.includes("delivery") && !method.includes("ups")) {
    return "atlanta_delivery"
  }
  if (method.includes("pickup") && method.includes("southeast")) {
    return "southeast_pickup"
  }
  if (method.includes("pickup")) {
    return "plant_pickup"
  }
  return "ups_shipping"
}

function addressSummary(address: AnyRecord | null | undefined): string {
  if (!address) return ""
  return [
    [address.first_name, address.last_name].filter(Boolean).join(" "),
    address.address_1,
    address.address_2,
    [
      address.city,
      address.province,
      address.postal_code,
      address.country_code?.toUpperCase?.(),
    ]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(", ")
}

function orderFulfillmentPlan(order: AnyRecord): StaffExceptionFulfillmentPlan {
  const metadata = order.metadata || {}
  const fulfillmentType = inferFulfillmentType(order)
  const scheduledDate = firstText(
    metadata.scheduledDate,
    metadata.scheduled_date,
    fulfillmentType !== "ups_shipping"
      ? metadata.requested_fulfillment_date
      : ""
  )
  const requestedDeliveryDate = firstText(
    metadata.requestedDeliveryDate,
    metadata.requested_delivery_date,
    fulfillmentType === "ups_shipping"
      ? metadata.requested_fulfillment_date
      : ""
  )
  const requestedFulfillmentDate = firstText(
    metadata.requested_fulfillment_date,
    requestedDeliveryDate,
    scheduledDate
  )
  const zip = firstText(
    metadata.fulfillmentZip,
    metadata.fulfillment_zip,
    order.shipping_address?.postal_code
  )
  const method = shippingMethodName(order)

  return {
    fulfillmentType,
    fulfillmentLabel: fulfillmentLabel(fulfillmentType),
    dateLabel:
      fulfillmentType === "ups_shipping"
        ? requestedDeliveryDate || requestedFulfillmentDate
        : scheduledDate || requestedFulfillmentDate,
    scheduledDate: scheduledDate || undefined,
    requestedDeliveryDate: requestedDeliveryDate || undefined,
    requestedFulfillmentDate: requestedFulfillmentDate || undefined,
    timeWindow:
      firstText(metadata.scheduledTimeWindow, metadata.scheduled_time_window) ||
      undefined,
    pickupLocationId:
      firstText(metadata.pickupLocationId, metadata.pickup_location_id) ||
      undefined,
    zip: zip || undefined,
    shippingMethodName: method || undefined,
    addressSummary: addressSummary(order.shipping_address) || undefined,
  }
}

function shippingOverridePlan(
  input: StaffExceptionActionInput,
  order: AnyRecord
) {
  const current = orderFulfillmentPlan(order)
  const requestedType = input.shippingFulfillmentType || current.fulfillmentType
  const requestedDate = textValue(input.shippingRequestedDate)
  const requestedZip = textValue(input.shippingZip) || current.zip || ""
  const requestedMethod =
    textValue(input.shippingMethodName) || current.shippingMethodName || ""

  return {
    current,
    requested: {
      fulfillmentType: requestedType,
      fulfillmentLabel: fulfillmentLabel(requestedType),
      dateLabel: requestedDate,
      zip: requestedZip || undefined,
      shippingMethodName: requestedMethod || undefined,
    },
    modeChanged: requestedType !== current.fulfillmentType,
    dateChanged: Boolean(requestedDate && requestedDate !== current.dateLabel),
  }
}

function shippingOverrideSummary(
  input: StaffExceptionActionInput,
  order: AnyRecord
): string {
  const plan = shippingOverridePlan(input, order)
  const parts = [
    `${plan.current.fulfillmentLabel || "Current"} ${
      plan.current.dateLabel || "no date"
    }`,
    "to",
    `${plan.requested.fulfillmentLabel || "Requested"} ${
      plan.requested.dateLabel || "no date"
    }`,
  ]
  if (plan.requested.zip) parts.push(`ZIP ${plan.requested.zip}`)
  if (input.shippingChangeSummary?.trim()) {
    parts.push(input.shippingChangeSummary.trim())
  }
  return parts.join(" ")
}

type NormalizedOrderItemQuantityChange = {
  itemId: string
  title: string
  fromQuantity: number
  quantity: number
  fulfilledQuantity: number
}

type NormalizedOrderItemAddition = {
  variantId: string
  quantity: number
  title: string
  sku?: string
  productId?: string
  qbdListId?: string
  unitPrice?: number
  pricingMode?: string
}

type NormalizedOrderItemEditPlan = {
  quantityChanges: NormalizedOrderItemQuantityChange[]
  additions: NormalizedOrderItemAddition[]
  summary: string
  qbdPlan: AnyRecord
}

function wholeQuantity(value: unknown, label: string): number {
  const quantity = Number(value)
  if (
    !Number.isFinite(quantity) ||
    !Number.isInteger(quantity) ||
    quantity < 0
  ) {
    throw new Error(`${label} must be a whole number of 0 or more.`)
  }
  return quantity
}

function positiveWholeQuantity(value: unknown, label: string): number {
  const quantity = wholeQuantity(value, label)
  if (quantity <= 0) {
    throw new Error(`${label} must be greater than 0.`)
  }
  return quantity
}

function orderItemTitle(item: AnyRecord): string {
  return (
    item.title ||
    item.product_title ||
    item.variant?.product?.title ||
    item.variant_title ||
    item.variant?.title ||
    item.id ||
    "Item"
  )
}

function normalizeOrderItemEditPlan(
  input: StaffExceptionActionInput,
  order: AnyRecord
): NormalizedOrderItemEditPlan {
  const eligibility = staffOrderItemEditEligibility(order)
  if (!eligibility.canEdit) {
    throw new Error(eligibility.reason)
  }

  const orderItems = Array.isArray(order.items) ? order.items : []
  const itemsById = new Map(
    orderItems
      .filter((item: AnyRecord) => item?.id)
      .map((item: AnyRecord) => [String(item.id), item])
  )
  const quantityByItemId = new Map<string, number>()

  ;(input.itemQuantityChanges || []).forEach((change) => {
    if (!change?.itemId) return
    quantityByItemId.set(
      String(change.itemId),
      wholeQuantity(change.quantity, "Line quantity")
    )
  })

  const quantityChanges: NormalizedOrderItemQuantityChange[] = []
  quantityByItemId.forEach((quantity, itemId) => {
    const item = itemsById.get(itemId)
    if (!item) {
      throw new Error("One of the selected order lines no longer exists.")
    }
    const currentQuantity = wholeQuantity(
      item.quantity,
      "Current line quantity"
    )
    const fulfilledQuantity = wholeQuantity(
      item.detail?.fulfilled_quantity || 0,
      "Fulfilled quantity"
    )
    if (quantity < fulfilledQuantity) {
      throw new Error(
        `${orderItemTitle(
          item
        )} already has fulfilled quantity and cannot be reduced below ${fulfilledQuantity}.`
      )
    }
    if (quantity !== currentQuantity) {
      quantityChanges.push({
        itemId,
        title: orderItemTitle(item),
        fromQuantity: currentQuantity,
        quantity,
        fulfilledQuantity,
      })
    }
  })

  const additions: NormalizedOrderItemAddition[] = (input.itemAdditions || [])
    .map((addition) => {
      const variantId = textValue(addition?.variantId)
      const title = textValue(addition?.title) || "Added item"
      if (!variantId) {
        throw new Error("Choose a catalog item to add.")
      }
      const qbdListId = textValue(addition?.qbdListId)
      if (!qbdListId) {
        throw new Error(
          `${title} is missing its QuickBooks ListID. Choose a mapped catalog item before editing this order.`
        )
      }
      return {
        variantId,
        quantity: positiveWholeQuantity(addition.quantity, "Added quantity"),
        title,
        sku: textValue(addition?.sku) || undefined,
        productId: textValue(addition?.productId) || undefined,
        qbdListId,
        unitPrice:
          addition?.unitPrice !== undefined && addition?.unitPrice !== null
            ? staffCurrencyAmount(addition.unitPrice)
            : undefined,
        pricingMode: textValue(addition?.pricingMode) || undefined,
      }
    })
    .filter((addition) => addition.quantity > 0)

  const nextExistingQuantity = orderItems.reduce((sum, item: AnyRecord) => {
    const override = quantityByItemId.get(String(item.id))
    return sum + (override ?? amount(item.quantity))
  }, 0)
  const addedQuantity = additions.reduce(
    (sum, addition) => sum + addition.quantity,
    0
  )
  if (!quantityChanges.length && !additions.length) {
    throw new Error("Change a quantity, remove a line, or add an item first.")
  }
  if (nextExistingQuantity + addedQuantity <= 0) {
    throw new Error(
      "Order item edits cannot leave the order with zero items. Cancel the order instead."
    )
  }

  const changedLineCopy = quantityChanges.map((change) => {
    if (change.quantity === 0) {
      return `remove ${change.title}`
    }
    return `${change.title}: ${change.fromQuantity} to ${change.quantity}`
  })
  const addedLineCopy = additions.map(
    (addition) => `add ${addition.quantity} x ${addition.title}`
  )
  const summary = [...changedLineCopy, ...addedLineCopy].join("; ")

  return {
    quantityChanges,
    additions,
    summary,
    qbdPlan: {
      source: "staff_order_support",
      action: "edit_order_items",
      quantity_changes: quantityChanges.map((change) => ({
        line_item_id: change.itemId,
        title: change.title,
        from_quantity: change.fromQuantity,
        to_quantity: change.quantity,
      })),
      additions: additions.map((addition) => ({
        variant_id: addition.variantId,
        product_id: addition.productId,
        title: addition.title,
        sku: addition.sku,
        qbd_list_id: addition.qbdListId,
        quantity: addition.quantity,
        unit_price: addition.unitPrice,
        pricing_mode: addition.pricingMode,
      })),
    },
  }
}

function orderItemEditFingerprint(plan: NormalizedOrderItemEditPlan): string {
  return stableRequestKey([
    ...plan.quantityChanges.map(
      (change) => `${change.itemId}:${change.fromQuantity}:${change.quantity}`
    ),
    ...plan.additions.map(
      (addition) =>
        `${addition.variantId}:${addition.quantity}:${addition.qbdListId || ""}`
    ),
  ])
}

const collectPayments = collectStaffOrderPayments

function staffTimeline(
  metadata: AnyRecord | null | undefined
): StaffAuditEntry[] {
  const auditLog = parseStaffAuditLog(metadata)
  const qbdStatus = metadata?.qbd_posting_status

  if (!qbdStatus) return auditLog

  const qbdWriteJobId = metadata?.qbd_write_job_id
  const alreadyRepresented = auditLog.some((entry) => {
    return (
      entry.qbd_posting_status === qbdStatus &&
      String(entry.qbd_write_job_id || "") === String(qbdWriteJobId || "")
    )
  })

  if (alreadyRepresented) return auditLog

  return [
    ...auditLog,
    {
      at:
        metadata?.qbd_posting_posted_at ||
        metadata?.qbd_posting_failed_at ||
        metadata?.qbd_posting_requested_at,
      action: "quickbooks_posting",
      status:
        qbdStatus === "posted"
          ? "completed"
          : qbdStatus === "failed"
          ? "failed"
          : "pending_manual",
      qbd_posting_status: qbdStatus,
      qbd_posting_action: metadata?.qbd_posting_action,
      qbd_posting_amount: metadata?.qbd_posting_amount,
      qbd_write_job_id: qbdWriteJobId,
      qbd_txn_id: metadata?.qbd_txn_id,
      qbd_ref_number: metadata?.qbd_ref_number,
      qbd_posting_error: metadata?.qbd_posting_error,
      staff_actor_name: "QuickBooks writer",
    },
  ]
}

function detailOrder(order: AnyRecord): StaffExceptionOrderDetail {
  const summary = summarizeOrder(order)
  const items = Array.isArray(order.items) ? order.items : []
  const shippingMethods = Array.isArray(order.shipping_methods)
    ? order.shipping_methods
        .map((method: AnyRecord) => method.name || method.shipping_option?.name)
        .filter(Boolean)
    : []
  const fulfillments = Array.isArray(order.fulfillments)
    ? order.fulfillments.map((fulfillment: AnyRecord) => ({
        id: fulfillment.id,
        status: fulfillment.status,
        shippedAt: fulfillment.shipped_at,
        deliveredAt: fulfillment.delivered_at,
      }))
    : []

  return {
    ...summary,
    accountingActions: order.accountingActions || [],
    accountingHistoryError: order.accountingHistoryError,
    subtotal: staffCurrencyAmount(order.subtotal),
    shippingTotal: staffCurrencyAmount(order.shipping_total),
    taxTotal: staffCurrencyAmount(order.tax_total),
    discountTotal: staffCurrencyAmount(order.discount_total),
    items: items.map((item: AnyRecord) => ({
      id: item.id,
      productId: item.product_id || item.product?.id || undefined,
      variantId: item.variant_id || item.variant?.id || undefined,
      title:
        item.title ||
        item.product_title ||
        item.variant?.product?.title ||
        "Item",
      subtitle: item.subtitle || item.variant_title || item.variant?.title,
      sku: item.variant_sku || item.variant?.sku || item.sku,
      qbdListId: qbdListIdFromOrderItem(item),
      quantity: amount(item.quantity),
      fulfilledQuantity: amount(item.detail?.fulfilled_quantity),
      unitPrice: staffCurrencyAmount(item.unit_price),
      total: staffCurrencyAmount(item.total),
    })),
    payments: collectPayments(order),
    shippingMethods,
    fulfillmentPlan: orderFulfillmentPlan(order),
    fulfillments,
    shippingAddress: toAddress(order.shipping_address),
    billingAddress: toAddress(order.billing_address),
    metadata: order.metadata || {},
    auditLog: staffTimeline(order.metadata || {}),
  }
}

async function requireStaffOperator() {
  const staff = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!staff) {
    throw new Error("Sign in with a staff account to use staff exceptions.")
  }
  // Order support (lookups, notes, refunds, captures, cancellations, edits) is
  // gated to office/manager/super-admin — never picker/packer/merchandising.
  if (!canManageOrderSupport(staff)) {
    throw new Error("Order support access required.")
  }
  return staff
}

async function retrieveOrder(orderId: string): Promise<AnyRecord> {
  const { order } = await adminFetch<{ order: AnyRecord }>(
    `/admin/orders/${orderId}`,
    {
      query: { fields: ORDER_DETAIL_FIELDS },
    }
  )
  if (!order) throw new Error("Order not found.")
  try {
    const history = await adminFetch<{ actions: StaffExceptionOrderDetail["accountingActions"] }>(`/admin/grillers/orders/${orderId}/accounting-action`)
    order.accountingActions = history?.actions || []
    if (!Array.isArray(history?.actions)) order.accountingHistoryError = "Accounting history is unavailable. Do not assume pending work is complete."
  } catch {
    order.accountingHistoryError = "Accounting history is unavailable. Do not assume pending work is complete."
  }
  return order
}

async function appendOrderAudit(
  orderId: string,
  entry: AnyRecord,
  patch: AnyRecord = {}
): Promise<AnyRecord> {
  const safePatch = { ...patch }
  const safeEntry = { ...entry }
  // Refund posting is owned by the backend that received the provider refund ID.
  // Other provider actions enter accounting only after their confirmed success.
  if (entry.status === "requested" || entry.action === "refund_payment") {
    for (const value of [safePatch, safeEntry]) {
      for (const key of Object.keys(value)) if (key.startsWith("qbd_posting_")) delete value[key]
    }
  }
  if (entry.action === "refund_payment") {
    for (const key of Object.keys(safePatch)) if (key.startsWith("stripe_refund_") || key === "stripe_provider_refund_id") delete safePatch[key]
  }
  const response = await adminFetch<{ order: AnyRecord }>(
    `/admin/grillers/orders/${orderId}/accounting-action`,
    { method: "POST", body: JSON.stringify({ entry: safeEntry, patch: safePatch }) }
  )
  return response.order
}

function baseAuditEntry({
  staff,
  input,
  order,
  status,
}: {
  staff: AnyRecord
  input: StaffExceptionActionInput
  order: AnyRecord
  status: StaffActionStatus
}): AnyRecord {
  return {
    action: input.action,
    status,
    reason_code: input.reasonCode,
    staff_note: input.staffNote.trim(),
    customer_visible_note: input.customerVisibleNote?.trim() || undefined,
    notify_customer: Boolean(input.notifyCustomer),
    customer_notification_status: input.notifyCustomer
      ? "recorded_only_not_sent"
      : "not_requested",
    medusa_mutation: actionMutatesMedusa(input.action),
    typed_confirmation_required:
      actionRequiredConfirmation(input.action) || undefined,
    typed_confirmation_received: actionRequiredConfirmation(input.action)
      ? true
      : undefined,
    customer_consent_method: input.customerConsentMethod || "not_applicable",
    staff_actor_customer_id: staff.id,
    staff_actor_email: staff.email,
    staff_actor_name: staffDisplayName(staff as any),
    order_id: order.id,
    order_display_id: displayId(order),
    order_operational_state: staffOrderOperationalState(order),
  }
}

function actionLabel(action: StaffExceptionActionType): string {
  return staffExceptionActionConfig(action)?.label || action.replace(/_/g, " ")
}

function qbdReconciliationNeeded(action: StaffExceptionActionType): boolean {
  return actionRequiresQuickBooksPosting(action)
}

function quickBooksAction(
  action: StaffExceptionActionType
): string | undefined {
  switch (action) {
    case "record_note":
      return "append_order_note"
    case "record_offline_payment":
      return "record_offline_payment"
    case "credit_memo":
      return "issue_account_credit"
    case "record_check_refund":
      return "pending_check_refund"
    case "refund_payment":
      return "card_refund_accounting_record"
    case "capture_payment":
      return "payment_capture_accounting_record"
    case "edit_order_items":
      return "update_sales_order_items"
    case "cancel_order":
      return "close_sales_order"
    default:
      return undefined
  }
}

function qbdPendingFields(
  input: StaffExceptionActionInput,
  amountMinor?: number,
  extra: AnyRecord = {}
): AnyRecord {
  const action = quickBooksAction(input.action)
  if (!action) return {}

  return {
    qbd_posting_required: true,
    qbd_posting_status: "pending_manual",
    qbd_posting_action: action,
    qbd_posting_amount: amountMinor,
    qbd_posting_requested_at: new Date().toISOString(),
    qbd_posting_note: input.staffNote.trim(),
    qbd_posting_reason_code: input.reasonCode,
    qbd_customer_visible_note: input.customerVisibleNote?.trim() || undefined,
    ...extra,
  }
}

function stableRequestKey(parts: Array<string | number | undefined | null>) {
  const text = parts
    .map((part) =>
      String(part ?? "")
        .trim()
        .toLowerCase()
    )
    .join("|")
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

function downstreamRequestKey(
  input: StaffExceptionActionInput,
  order: AnyRecord,
  amountValue?: number,
  paymentId?: string
) {
  return [
    "staff-exception",
    order.id,
    input.action,
    paymentId || "",
    amountValue || "",
    input.reasonCode,
    stableRequestKey([input.staffNote]),
    ...(input.requestId ? [input.requestId] : []),
  ].join("-")
}

function isStripeProvider(providerId?: string) {
  return String(providerId || "")
    .toLowerCase()
    .includes("stripe")
}

function isFinalChargePayment(payment: StaffExceptionPayment) {
  return payment.id.startsWith("final_charge:")
}

function latestRefundFromPayment(payment: AnyRecord | null | undefined) {
  const refunds = Array.isArray(payment?.refunds) ? payment.refunds : []
  return refunds[refunds.length - 1] || null
}

function previewSummary(input: StaffExceptionActionInput): string {
  switch (input.action) {
    case "record_note":
      return "This will append an internal staff note to the order audit trail and queue the note for QuickBooks."
    case "record_offline_payment":
      return "This records an offline payment and leaves a required QuickBooks posting task. It will not charge a card."
    case "shipping_override":
      return "This records the current fulfillment state, the requested replacement date or mode, and marks mode changes for checkout-style reprice/review."
    case "edit_order_items":
      return "This edits order items before picking starts, refreshes the catch-weight picking snapshot, and leaves a required QuickBooks SalesOrder update task."
    case "credit_memo":
      return "This records an account credit request and leaves a required QuickBooks credit memo/accounting task. It will not refund a card."
    case "record_check_refund":
      return "This records a pending check refund and leaves a required QuickBooks/manual check task. It will not refund a card."
    case "retry_qbd_posting":
      return "This reopens the existing failed QuickBooks posting for the writer to retry. It does not create a new Stripe refund or a new accounting request."
    case "cancel_order":
      return "This will call Medusa's order cancellation endpoint after writing a staff audit entry, then leave a required QuickBooks SalesOrder close task."
    case "refund_payment":
      return "This writes a staff audit entry, submits the Stripe card refund through Medusa, and leaves a required QuickBooks refund record task."
    case "capture_payment":
      return "This writes a staff audit entry, captures the payment through Medusa, and leaves a required QuickBooks payment record task."
  }
}

function previewWarnings(
  input: StaffExceptionActionInput,
  order: AnyRecord
): string[] {
  const warnings: string[] = []

  if (actionRequiresQuickBooksPosting(input.action)) {
    warnings.push(
      "QuickBooks/QBD posting is required for this action. Until an accounting sync confirms it, the order stays marked as pending/manual for QBD."
    )
  }

  if (actionIsAuditOnly(input.action)) {
    warnings.push(
      "Storefront-only action: this records the request/status on the order and does not move money by itself."
    )
  } else {
    warnings.push(
      "External action: this can change Medusa order/payment state after final confirmation."
    )
  }

  if (input.action === "edit_order_items") {
    const eligibility = staffOrderItemEditEligibility(order)
    warnings.push(
      eligibility.canEdit
        ? "Item edits are allowed only because the order is not actively claimed by a picker."
        : eligibility.reason
    )
  }

  if (input.customerVisibleNote?.trim() || input.notifyCustomer) {
    warnings.push(
      "Customer messaging is not sent from this console yet. The customer note is recorded for staff follow-up only."
    )
  }

  if (
    staffOrderOperationalState(order) !== "open" &&
    staffOrderOperationalState(order) !== "confirmed"
  ) {
    warnings.push(
      "Fulfillment is no longer fully open. Shipping and cancellation actions may require operations review."
    )
  }

  return warnings
}

function previewAmount(input: StaffExceptionActionInput): number | undefined {
  if (
    !actionMovesMoney(input.action) &&
    input.action !== "record_offline_payment"
  ) {
    return undefined
  }

  try {
    return staffPositiveCurrencyAmount(input.amount)
  } catch {
    return undefined
  }
}

function validateAction(
  input: StaffExceptionActionInput,
  order: AnyRecord,
  staffRole?: StaffOrderSupportRole
) {
  if (!input.orderId) throw new Error("Choose an order first.")
  if (!input.reasonCode) throw new Error("Choose a reason code.")
  if (!input.staffNote?.trim()) throw new Error("Add an internal staff note.")

  const availability = staffOrderSupportActionAvailability(
    input.action,
    order,
    {
      staffRole,
      offlineMoneyActionsEnabled:
        process.env.STAFF_ALLOW_OFFLINE_MONEY_ACTIONS === "true",
    }
  )
  if (!availability.available) {
    throw new Error(availability.reason)
  }

  if (
    input.action === "record_check_refund" &&
    process.env.STAFF_ALLOW_OFFLINE_MONEY_ACTIONS !== "true"
  ) {
    throw new Error(
      "Pending check refunds are disabled in this console. Use Stripe card refund, account credit, offline payment, or an internal note for accounting follow-up."
    )
  }

  const state = staffOrderOperationalState(order)
  if (actionIsBlockedByOperationalState(input.action, state)) {
    throw new Error(
      "That action is blocked for the current fulfillment state. Record a note or credit follow-up instead."
    )
  }

  if (
    actionRequiresCustomerConsent(input.action) &&
    (!input.customerConsentMethod ||
      input.customerConsentMethod === "not_applicable")
  ) {
    throw new Error("Record how the customer authorized this action.")
  }

  if (
    actionMovesMoney(input.action) &&
    input.action !== "record_offline_payment"
  ) {
    staffPositiveCurrencyAmount(input.amount)
  }

  if (input.action === "record_offline_payment") {
    if (process.env.STAFF_ALLOW_OFFLINE_MONEY_ACTIONS !== "true") {
      throw new Error(
        "Offline payments are disabled in this console. Use Stripe card flows or record an internal note for accounting follow-up."
      )
    }
    staffPositiveCurrencyAmount(input.amount)
    if (!input.offlinePaymentMethod?.trim()) {
      throw new Error("Choose or enter an offline payment method.")
    }
  }

  if (input.action === "refund_payment") {
    const selected = refundableStripePayment(order, input.paymentId)
    const refundAmount = staffPositiveCurrencyAmount(input.amount)
    if (refundAmount > selected.refundableAmount) {
      throw new Error(
        `Refund amount exceeds the refundable card balance of ${selected.refundableAmount.toFixed(
          2
        )}.`
      )
    }
  }

  if (input.action === "capture_payment") {
    const selected = capturablePayment(order, input.paymentId)
    const captureAmount = staffPositiveCurrencyAmount(input.amount)
    const remaining = Math.max(0, selected.amount - selected.capturedAmount)
    if (!isStripeProvider(selected.providerId)) {
      throw new Error("Payment capture is available only for Stripe payments.")
    }
    if (remaining <= 0) {
      throw new Error(
        "This payment does not have an authorized balance to capture."
      )
    }
    validateFullStripeCaptureAmount({ captureAmount, remaining })
  }

  if (input.action === "retry_qbd_posting") {
    const selected = order.accountingActions?.find((row: AnyRecord) => row.request_key === input.accountingRequestKey)
    if (!selected || !["failed", "blocked"].includes(selected.status)) throw new Error("Select a failed or blocked accounting action from this order's history. Legacy requests require reconciliation.")
  }

  if (input.action === "shipping_override") {
    if (!input.shippingFulfillmentType) {
      throw new Error("Choose the requested fulfillment mode.")
    }
    if (!input.shippingRequestedDate?.trim()) {
      throw new Error("Choose the requested delivery, pickup, or arrival date.")
    }
  }

  if (input.action === "edit_order_items") {
    normalizeOrderItemEditPlan(input, order)
  }
}

function validateTypedConfirmation(input: StaffExceptionActionInput) {
  const required = actionRequiredConfirmation(input.action)
  if (!required) return

  if ((input.typedConfirmation || "").trim().toUpperCase() !== required) {
    throw new Error(`Type ${required} to confirm this action.`)
  }
}

function refundableStripePayment(
  order: AnyRecord,
  paymentId?: string
): StaffExceptionPayment {
  const payments = collectPayments(order)
  const selected = paymentId
    ? payments.find((payment) => payment.id === paymentId)
    : payments.find(
        (payment) =>
          isStripeProvider(payment.providerId) &&
          payment.capturedAmount > payment.refundedAmount
      )

  if (!selected) {
    throw new Error(
      "No refundable Stripe card payment was found for this order."
    )
  }
  if (!isStripeProvider(selected.providerId)) {
    throw new Error(
      "Card refunds are only available for refundable Stripe payments. Use account credit or pending check refund for non-card payments."
    )
  }
  if (selected.capturedAmount <= selected.refundedAmount) {
    throw new Error("No refundable captured payment was found for this order.")
  }

  return selected
}

function capturablePayment(
  order: AnyRecord,
  paymentId?: string
): StaffExceptionPayment {
  const payments = collectPayments(order)
  const selected = paymentId
    ? payments.find((payment) => payment.id === paymentId)
    : payments[0]

  if (!selected) {
    throw new Error("No payment was found for this order.")
  }
  if (!isStripeProvider(selected.providerId)) {
    throw new Error("Payment capture is available only for Stripe payments.")
  }
  if (selected.amount <= selected.capturedAmount) {
    throw new Error(
      "No remaining authorized balance was found for this payment."
    )
  }

  return selected
}

async function applyMedusaOrderItemEdit({
  order,
  input,
  plan,
  requestKey,
}: {
  order: AnyRecord
  input: StaffExceptionActionInput
  plan: NormalizedOrderItemEditPlan
  requestKey: string
}): Promise<string> {
  let orderChangeId = ""

  try {
    const createResponse = await adminFetch<{
      order_change?: AnyRecord
      order_edit?: AnyRecord
      orderEdit?: AnyRecord
    }>("/admin/order-edits", {
      method: "POST",
      headers: { "Idempotency-Key": requestKey },
      body: JSON.stringify({
        order_id: order.id,
        description: "Staff Order Support item edit before picking",
        internal_note: input.staffNote.trim(),
        metadata: {
          source: "staff_order_support",
          action: "edit_order_items",
          request_key: requestKey,
        },
      }),
    })
    orderChangeId =
      createResponse.order_change?.id ||
      createResponse.order_edit?.id ||
      createResponse.orderEdit?.id ||
      ""
    if (!orderChangeId) {
      throw new Error("Medusa did not return an order edit ID.")
    }

    for (const change of plan.quantityChanges) {
      await adminFetch(
        `/admin/order-edits/${orderChangeId}/items/item/${change.itemId}`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": `${requestKey}-item-${change.itemId}`,
          },
          body: JSON.stringify({
            quantity: change.quantity,
            internal_note: input.staffNote.trim(),
          }),
        }
      )
    }

    if (plan.additions.length) {
      await adminFetch(`/admin/order-edits/${orderChangeId}/items`, {
        method: "POST",
        headers: { "Idempotency-Key": `${requestKey}-add-items` },
        body: JSON.stringify({
          items: plan.additions.map((addition) => ({
            variant_id: addition.variantId,
            quantity: addition.quantity,
            internal_note: input.staffNote.trim(),
            metadata: {
              source: "staff_order_support",
              customer_title: addition.title,
              sku: addition.sku,
              product_id: addition.productId,
              qbd_list_id: addition.qbdListId,
              pricing_mode: addition.pricingMode,
              staff_added_before_pick: true,
            },
          })),
        }),
      })
    }

    await adminFetch(`/admin/order-edits/${orderChangeId}/request`, {
      method: "POST",
      headers: { "Idempotency-Key": `${requestKey}-request` },
    })
    await adminFetch(`/admin/order-edits/${orderChangeId}/confirm`, {
      method: "POST",
      headers: { "Idempotency-Key": `${requestKey}-confirm` },
    })

    try {
      await adminFetch(`/admin/grillers/orders/${order.id}/finalization`)
    } catch (err) {
      console.error(
        "[staff-order-support] finalization refresh after item edit failed",
        err
      )
      void emitStaffOrderSupportActionFailureAlert({
        action: input.action,
        order,
        stage: "finalization_refresh",
        requestKey,
        error: err,
      })
    }

    return orderChangeId
  } catch (err) {
    if (orderChangeId) {
      await adminFetch(`/admin/order-edits/${orderChangeId}`, {
        method: "DELETE",
        headers: { "Idempotency-Key": `${requestKey}-cancel` },
      }).catch(() => undefined)
    }
    throw err
  }
}

async function searchStaffExceptionOrderPage(
  input: string | StaffExceptionOrderSearchInput
): Promise<Omit<StaffExceptionOrderSearchResult, "ok" | "error">> {
  await requireStaffOperator()
  const searchInput = normalizeSearchInput(input)
  const trimmed = searchInput.query.trim()
  const baseParams: Record<string, unknown> = {
    limit: trimmed ? 20 : 100,
    order: "-created_at",
    fields: ORDER_LIST_FIELDS,
  }

  if (!trimmed) {
    const pageSize = 100
    const maxScannedOrders = 500
    const orders: AnyRecord[] = []
    let offset = 0
    let total: number | null = null

    while (offset < maxScannedOrders) {
      const response = await adminFetch<OrderListResponse>("/admin/orders", {
        query: {
          ...baseParams,
          limit: pageSize,
          offset,
        },
      })
      const pageOrders = response.orders || []
      orders.push(...pageOrders)
      total = numericValue(response.count)
      offset += pageSize

      if (pageOrders.length < pageSize) break
      if (total !== null && offset >= total) break
    }

    return paginateOrderSearchResults(orders.map(summarizeOrder), searchInput)
  }

  const seenOrders = new Set<string>()
  const seenLegacyOrders = new Set<string>()
  const orders: AnyRecord[] = []
  const legacyOrders: AnyRecord[] = []
  const addOrders = (items: AnyRecord[] | undefined) => {
    ;(items || []).forEach((order) => {
      if (!order?.id || seenOrders.has(order.id)) return
      seenOrders.add(order.id)
      orders.push(order)
    })
  }
  const addLegacyOrders = (items: AnyRecord[] | undefined) => {
    ;(items || []).forEach((order) => {
      if (!order?.id || seenLegacyOrders.has(order.id)) return
      seenLegacyOrders.add(order.id)
      legacyOrders.push(order)
    })
  }

  const q = trimmed.replace(/^#/, "")
  let lastError: unknown = null

  const directOrderSearch = (async () => {
    try {
      const direct = await adminFetch<{ orders: AnyRecord[] }>(
        "/admin/orders",
        {
          query: {
            ...baseParams,
            q,
          },
        }
      )
      addOrders(direct.orders)
    } catch (err) {
      lastError = err
    }
  })()

  const legacyOrderSearch = (async () => {
    try {
      const legacy = await adminFetch<{ orders: AnyRecord[] }>(
        "/admin/legacy-orders",
        {
          query: {
            q,
            // #268: legacy orders come back newest-first (placed_at desc) and
            // the date filter is applied client-side. A `limit: 20` dropped
            // older matching orders from a date-filtered search. The backend
            // endpoint does NOT support date params and clamps `limit` to 100
            // (server max), so request the full clamp window to give the
            // client-side date filter enough rows without fetching unbounded.
            limit: 100,
          },
        }
      )
      addLegacyOrders(legacy.orders)
    } catch (err) {
      lastError = err
    }
  })()

  const customerSearch = shouldSearchCustomersForOrderQuery(q)
    ? (async () => {
        const customerAttempts: Array<Record<string, string | number>> = [
          { q, limit: 10 },
        ]
        if (q.includes("@")) customerAttempts.push({ email: q, limit: 10 })
        if (q.includes("+")) {
          customerAttempts.push({ q: q.split("+")[0], limit: 10 })
        }

        const seenCustomers = new Set<string>()
        await Promise.all(
          customerAttempts.map(async (attempt) => {
            try {
              const { customers } = await adminFetch<{
                customers: AnyRecord[]
              }>("/admin/customers", {
                query: {
                  ...attempt,
                  fields: "id,email,first_name,last_name,phone",
                },
              })

              await Promise.all(
                (customers || []).map(async (customer) => {
                  if (!customer?.id || seenCustomers.has(customer.id)) return
                  seenCustomers.add(customer.id)

                  await Promise.all([
                    (async () => {
                      try {
                        const byCustomer = await adminFetch<{
                          orders: AnyRecord[]
                        }>("/admin/orders", {
                          query: {
                            ...baseParams,
                            customer_id: customer.id,
                            limit: 10,
                          },
                        })
                        addOrders(byCustomer.orders)
                      } catch (err) {
                        lastError = err
                      }
                    })(),
                    (async () => {
                      try {
                        const legacyByCustomer = await adminFetch<{
                          orders: AnyRecord[]
                        }>("/admin/legacy-orders", {
                          query: {
                            customer_id: customer.id,
                            // #268: same date-filter coverage fix as the
                            // keyword search above — newest-first results need
                            // a wider window (backend clamps to 100, no date
                            // params) so a date-filtered search doesn't drop
                            // older matching legacy orders for this customer.
                            limit: 100,
                          },
                        })
                        addLegacyOrders(legacyByCustomer.orders)
                      } catch (err) {
                        lastError = err
                      }
                    })(),
                  ])
                })
              )
            } catch (err) {
              lastError = err
            }
          })
        )
      })()
    : Promise.resolve()

  await Promise.all([directOrderSearch, legacyOrderSearch, customerSearch])

  if (!orders.length && !legacyOrders.length && lastError) {
    console.error("[staff-order-support] order search failed", lastError)
    await emitStaffOrderSupportSearchFailureAlert({
      searchInput,
      error: lastError,
    })
    throw new Error(
      "Order lookup failed. Try searching by order number, email, or customer name, then try again."
    )
  }

  const results = [
    ...orders.map(summarizeOrder),
    ...legacyOrders.map(summarizeLegacyOrder),
  ]

  return paginateOrderSearchResults(results, searchInput)
}

export async function searchStaffExceptionOrders(
  input: string | StaffExceptionOrderSearchInput
): Promise<StaffExceptionOrderSummary[]> {
  const result = await searchStaffExceptionOrderPage(input)
  return result.orders
}

export async function searchStaffExceptionOrdersResult(
  input: string | StaffExceptionOrderSearchInput
): Promise<StaffExceptionOrderSearchResult> {
  const fallback = normalizeSearchInput(input)
  try {
    return {
      ok: true,
      ...(await searchStaffExceptionOrderPage(input)),
    }
  } catch (err) {
    console.error("[staff-order-support] order lookup action failed", err)
    return {
      ok: false,
      orders: [],
      total: 0,
      page: fallback.page,
      pageSize: fallback.pageSize,
      hasNextPage: false,
      error:
        "Order lookup could not refresh. Try again, or search by order number, email, or customer name.",
    }
  }
}

export async function getStaffExceptionOrderDetail(
  orderId: string
): Promise<StaffExceptionOrderDetail> {
  await requireStaffOperator()

  if (orderId.startsWith("lgord_")) {
    const { order } = await adminFetch<{ order: AnyRecord }>(
      `/admin/legacy-orders/${orderId}`
    )
    if (!order) throw new Error("Historical order not found.")
    return detailLegacyOrder(order)
  }

  return detailOrder(await retrieveOrder(orderId))
}

export async function previewStaffOrderException(
  input: StaffExceptionActionInput
): Promise<StaffExceptionActionPreview> {
  const fallbackAction = input.action || "record_note"

  try {
    const staff = await requireStaffOperator()
    const role = staffAccessRole(staff)
    if (input.orderId.startsWith("lgord_")) {
      return {
        ok: false,
        error:
          "Historical QuickBooks orders are read-only in this console. Use this result for context, then handle money or shipping changes in QuickBooks/operations.",
        action: fallbackAction,
        actionLabel: actionLabel(fallbackAction),
        operationalState: "completed_or_shipped",
        orderDisplayId: input.orderId,
        willWriteAuditLog: false,
        willMutateMedusa: false,
        qbdReconciliationNeeded: false,
        customerNotificationStatus: "not_requested",
        requiredConfirmation: null,
        summary:
          "This is imported order history, not a live Medusa order. Staff actions cannot be applied here.",
        warnings: [
          "Use QuickBooks or operations workflows for historical order adjustments.",
        ],
        blockingReasons: ["Historical order is read-only."],
      }
    }

    const order = await retrieveOrder(input.orderId)
    const state = staffOrderOperationalState(order)
    const blockingReasons: string[] = []

    try {
      validateAction(input, order, role)
    } catch (err) {
      blockingReasons.push(err instanceof Error ? err.message : String(err))
    }

    return {
      ok: blockingReasons.length === 0,
      error: blockingReasons[0],
      action: fallbackAction,
      actionLabel: actionLabel(fallbackAction),
      operationalState: state,
      orderDisplayId: displayId(order),
      amount: previewAmount(input),
      paymentId: input.paymentId || undefined,
      willWriteAuditLog: true,
      willMutateMedusa: actionMutatesMedusa(fallbackAction),
      qbdReconciliationNeeded: qbdReconciliationNeeded(fallbackAction),
      customerNotificationStatus:
        input.customerVisibleNote?.trim() || input.notifyCustomer
          ? "recorded_only_not_sent"
          : "not_requested",
      requiredConfirmation: actionRequiredConfirmation(fallbackAction),
      summary: previewSummary(input),
      warnings: previewWarnings(input, order),
      blockingReasons,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      action: fallbackAction,
      actionLabel: actionLabel(fallbackAction),
      operationalState: "open",
      orderDisplayId: input.orderId || "Order",
      willWriteAuditLog: false,
      willMutateMedusa: false,
      qbdReconciliationNeeded: false,
      customerNotificationStatus: "not_requested",
      requiredConfirmation: actionRequiredConfirmation(fallbackAction),
      summary: previewSummary(input),
      warnings: [],
      blockingReasons: [err instanceof Error ? err.message : String(err)],
    }
  }
}

export async function applyStaffOrderException(
  input: StaffExceptionActionInput
): Promise<StaffExceptionActionResult> {
  try {
    const staff = await requireStaffOperator()
    if (input.orderId.startsWith("lgord_")) {
      throw new Error(
        "Historical QuickBooks orders are read-only in this console. Use QuickBooks or operations workflows for adjustments."
      )
    }

    const order = await retrieveOrder(input.orderId)
    validateAction(input, order, staffAccessRole(staff))
    validateTypedConfirmation(input)

    const baseEntry = baseAuditEntry({
      staff,
      input,
      order,
      status:
        input.action === "record_note" ||
        input.action === "record_offline_payment" ||
        input.action === "shipping_override" ||
        input.action === "credit_memo" ||
        input.action === "record_check_refund" ||
        input.action === "retry_qbd_posting"
          ? "recorded"
          : "requested",
    })

    switch (input.action) {
      case "record_note": {
        const requestKey = downstreamRequestKey(input, order, 0, "note")
        const qbdFields = qbdPendingFields(input, 0, {
          qbd_posting_request_key: requestKey,
          qbd_note_append_text: input.staffNote.trim(),
          qbd_note_source: "staff_order_support",
        })
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            ...qbdFields,
            downstream_request_key: requestKey,
          },
          {
            staff_exception_status: "note_qbd_pending",
            staff_internal_note_latest: input.staffNote.trim(),
            ...qbdFields,
            downstream_request_key: requestKey,
          }
        )
        break
      }
      case "record_offline_payment": {
        const offlinePaymentAmount = staffPositiveCurrencyAmount(input.amount)
        const qbdAmountMinor = staffMinorUnitsFromCurrency(offlinePaymentAmount)
        const requestKey = downstreamRequestKey(
          input,
          order,
          qbdAmountMinor,
          input.offlinePaymentReference?.trim() ||
            input.offlinePaymentMethod?.trim()
        )
        const qbdFields = qbdPendingFields(input, qbdAmountMinor, {
          qbd_posting_request_key: requestKey,
          qbd_offline_payment_method: input.offlinePaymentMethod?.trim(),
          qbd_offline_payment_reference:
            input.offlinePaymentReference?.trim() || undefined,
        })
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            amount: offlinePaymentAmount,
            offline_payment_method: input.offlinePaymentMethod?.trim(),
            offline_payment_reference:
              input.offlinePaymentReference?.trim() || undefined,
            ...qbdFields,
          },
          {
            staff_exception_status: "offline_payment_qbd_pending",
            ...qbdFields,
          }
        )
        break
      }
      case "shipping_override": {
        const override = shippingOverridePlan(input, order)
        const summary = shippingOverrideSummary(input, order)
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            shipping_change_summary: summary,
            shipping_override_current: override.current,
            shipping_override_requested: override.requested,
            shipping_mode_changed: override.modeChanged,
            shipping_date_changed: override.dateChanged,
          },
          {
            staff_exception_status: override.modeChanged
              ? "shipping_override_needs_checkout_reprice"
              : staffOrderOperationalState(order) === "confirmed"
              ? "shipping_override_recorded"
              : "shipping_override_needs_ops_review",
            fulfillmentType: override.requested.fulfillmentType,
            fulfillment_type: override.requested.fulfillmentType,
            fulfillmentZip: override.requested.zip || "",
            fulfillment_zip: override.requested.zip || "",
            scheduledDate:
              override.requested.fulfillmentType === "ups_shipping"
                ? ""
                : override.requested.dateLabel,
            requestedDeliveryDate:
              override.requested.fulfillmentType === "ups_shipping"
                ? override.requested.dateLabel
                : "",
            requested_fulfillment_date: override.requested.dateLabel,
            shipping_override_current: JSON.stringify(override.current),
            shipping_override_requested: JSON.stringify(override.requested),
            shipping_override_summary: summary,
            shipping_override_mode_changed: override.modeChanged,
            shipping_override_reprice_required: override.modeChanged,
          }
        )
        break
      }
      case "edit_order_items": {
        const plan = normalizeOrderItemEditPlan(input, order)
        const requestKey = downstreamRequestKey(
          input,
          order,
          0,
          orderItemEditFingerprint(plan)
        )
        const qbdFields = qbdPendingFields(input, 0, {
          qbd_posting_request_key: requestKey,
          qbd_order_edit_summary: plan.summary,
          qbd_order_edit_plan: JSON.stringify(plan.qbdPlan),
        })
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            ...qbdFields,
            order_item_edit_summary: plan.summary,
            order_item_edit_plan: plan.qbdPlan,
            downstream_request_key: requestKey,
          },
          {
            staff_exception_status: "order_item_edit_requested",
            ...qbdFields,
            order_item_edit_summary: plan.summary,
            downstream_request_key: requestKey,
          }
        )

        let orderChangeId = ""
        try {
          orderChangeId = await applyMedusaOrderItemEdit({
            order,
            input,
            plan,
            requestKey,
          })
        } catch (err) {
          await appendOrderAudit(
            order.id,
            {
              ...baseAuditEntry({ staff, input, order, status: "failed" }),
              ...qbdFields,
              qbd_posting_required: false,
              order_item_edit_summary: plan.summary,
              order_item_edit_plan: plan.qbdPlan,
              order_item_edit_status: "failed",
              medusa_order_edit_id: orderChangeId || undefined,
              downstream_request_key: requestKey,
              downstream_error:
                err instanceof Error ? err.message : String(err),
            },
            {
              staff_exception_status: "order_item_edit_failed",
              ...qbdFields,
              qbd_posting_required: false,
              qbd_posting_status: "blocked_by_order_edit_failure",
              order_item_edit_status: "failed",
              medusa_order_edit_id: orderChangeId || undefined,
              downstream_request_key: requestKey,
            }
          )
          await emitStaffOrderSupportActionFailureAlert({
            action: input.action,
            order,
            stage: "medusa_order_edit",
            requestKey,
            error: err,
          })
          throw err
        }

        await appendOrderAudit(
          order.id,
          {
            ...baseAuditEntry({
              staff,
              input,
              order,
              status: "pending_manual",
            }),
            ...qbdFields,
            order_item_edit_summary: plan.summary,
            order_item_edit_plan: plan.qbdPlan,
            order_item_edit_status: "completed",
            medusa_order_edit_id: orderChangeId,
            downstream_request_key: requestKey,
          },
          {
            staff_exception_status: "order_item_edit_qbd_pending",
            ...qbdFields,
            order_item_edit_status: "completed",
            medusa_order_edit_id: orderChangeId,
            downstream_request_key: requestKey,
          }
        )
        break
      }
      case "credit_memo": {
        const creditAmount = staffPositiveCurrencyAmount(input.amount)
        const qbdAmountMinor = staffMinorUnitsFromCurrency(creditAmount)
        const requestKey = downstreamRequestKey(input, order, qbdAmountMinor)
        const qbdFields = qbdPendingFields(input, qbdAmountMinor, {
          qbd_posting_request_key: requestKey,
          qbd_account_credit_plan: JSON.stringify([
            {
              entry_type: "credit_memo",
              purpose: "Create future customer account credit",
              amount_minor: qbdAmountMinor,
            },
            {
              entry_type: "customer_account_balance",
              purpose: "Leave unapplied credit available for a future order",
              amount_minor: qbdAmountMinor,
            },
          ]),
        })
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            amount: creditAmount,
            ...qbdFields,
          },
          {
            staff_exception_status: "account_credit_qbd_pending",
            ...qbdFields,
          }
        )
        break
      }
      case "record_check_refund": {
        const checkRefundAmount = staffPositiveCurrencyAmount(input.amount)
        const qbdAmountMinor = staffMinorUnitsFromCurrency(checkRefundAmount)
        const requestKey = downstreamRequestKey(input, order, qbdAmountMinor)
        const qbdFields = qbdPendingFields(input, qbdAmountMinor, {
          qbd_posting_request_key: requestKey,
        })
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            amount: checkRefundAmount,
            ...qbdFields,
          },
          {
            staff_exception_status: "check_refund_qbd_pending",
            ...qbdFields,
          }
        )
        break
      }
      case "retry_qbd_posting": {
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            qbd_posting_status: "pending_manual",
            qbd_posting_action: order.metadata?.qbd_posting_action,
            qbd_posting_amount: order.metadata?.qbd_posting_amount,
            qbd_posting_request_key: input.accountingRequestKey,
            qbd_write_job_id: order.metadata?.qbd_write_job_id,
            previous_qbd_posting_status: order.metadata?.qbd_posting_status,
            previous_qbd_posting_error: order.metadata?.qbd_posting_error,
          },
          {
            staff_exception_status: "qbd_retry_requested",
            qbd_posting_required: true,
            qbd_posting_status: "pending_manual",
            qbd_posting_retry_requested_at: new Date().toISOString(),
            qbd_posting_error: "",
          }
        )
        break
      }
      case "cancel_order": {
        const requestKey = downstreamRequestKey(input, order, 0, "cancel")
        const qbdFields = qbdPendingFields(input, 0, {
          qbd_posting_request_key: requestKey,
          qbd_sales_order_close_required: true,
          qbd_sales_order_closed_flag: true,
        })
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            ...qbdFields,
            downstream_request_key: requestKey,
          },
          {
            staff_exception_status: "cancel_requested_qbd_pending",
            medusa_cancel_status: "requested",
            ...qbdFields,
            downstream_request_key: requestKey,
          }
        )
        try {
          await adminFetch<{ order: AnyRecord }>(
            `/admin/orders/${order.id}/cancel`,
            {
              method: "POST",
              headers: { "Idempotency-Key": requestKey },
            }
          )
        } catch (err) {
          await appendOrderAudit(
            order.id,
            {
              ...baseAuditEntry({ staff, input, order, status: "failed" }),
              ...qbdFields,
              qbd_posting_required: false,
              medusa_cancel_status: "failed",
              medusa_cancel_error:
                err instanceof Error ? err.message : String(err),
              downstream_request_key: requestKey,
              downstream_error:
                err instanceof Error ? err.message : String(err),
            },
            {
              staff_exception_status: "cancel_failed",
              ...qbdFields,
              qbd_posting_required: false,
              qbd_posting_status: "blocked_by_cancel_failure",
              medusa_cancel_status: "failed",
              medusa_cancel_error:
                err instanceof Error ? err.message : String(err),
              downstream_request_key: requestKey,
            }
          )
          await emitStaffOrderSupportActionFailureAlert({
            action: input.action,
            order,
            stage: "medusa_cancel",
            requestKey,
            error: err,
          })
          throw err
        }
        // The backend audit/outbox endpoint can record the confirmed cancellation
        // without attempting another native Medusa order mutation.
        await appendOrderAudit(order.id, {
          ...baseAuditEntry({ staff, input, order, status: "pending_manual" }),
          ...qbdFields, downstream_request_key: requestKey,
        }, { ...qbdFields, medusa_cancel_status: "completed", staff_exception_status: "cancel_qbd_pending" })
        return {
          ok: true,
          order: await getStaffExceptionOrderDetail(order.id),
        }
      }
      case "refund_payment": {
        const payment = refundableStripePayment(order, input.paymentId)
        const refundAmount = staffPositiveCurrencyAmount(input.amount)
        const qbdAmountMinor = staffMinorUnitsFromCurrency(refundAmount)
        const requestKey = downstreamRequestKey(
          input,
          order,
          qbdAmountMinor,
          payment.id
        )
        const qbdFields = qbdPendingFields(input, qbdAmountMinor, {
          qbd_posting_request_key: requestKey,
        })
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            payment_id: payment.id,
            amount: refundAmount,
            ...qbdFields,
            stripe_refund_required: true,
            stripe_refund_status: "requested",
            downstream_request_key: requestKey,
          },
          {
            staff_exception_status: "refund_requested",
            ...qbdFields,
            stripe_refund_required: true,
            stripe_refund_status: "requested",
            downstream_request_key: requestKey,
          }
        )
        let refundResponse: { payment: AnyRecord }
        try {
          const refundPath = isFinalChargePayment(payment)
            ? `/admin/grillers/orders/${order.id}/finalization/refund-final-charge`
            : `/admin/grillers/payments/${payment.id}/refund`
          refundResponse = await adminFetch<{ payment: AnyRecord }>(
            refundPath,
            {
              method: "POST",
              headers: { "Idempotency-Key": requestKey },
              body: JSON.stringify({
                amount: refundAmount,
                note: input.staffNote.trim(),
              }),
            }
          )
        } catch (err) {
          await appendOrderAudit(
            order.id,
            {
              ...baseAuditEntry({ staff, input, order, status: "failed" }),
              payment_id: payment.id,
              amount: refundAmount,
              ...qbdFields,
              qbd_posting_required: false,
              stripe_refund_required: true,
              stripe_refund_status: "failed",
              stripe_refund_error:
                err instanceof Error ? err.message : String(err),
              downstream_request_key: requestKey,
              downstream_error:
                err instanceof Error ? err.message : String(err),
            },
            {
              staff_exception_status: "refund_stripe_failed",
              ...qbdFields,
              qbd_posting_required: false,
              qbd_posting_status: "blocked_by_stripe_failure",
              stripe_refund_required: true,
              stripe_refund_status: "failed",
              stripe_refund_error:
                err instanceof Error ? err.message : String(err),
              downstream_request_key: requestKey,
            }
          )
          await emitStaffOrderSupportActionFailureAlert({
            action: input.action,
            order,
            stage: "stripe_refund",
            requestKey,
            error: err,
          })
          throw err
        }
        const refund = latestRefundFromPayment(refundResponse.payment)
        await appendOrderAudit(
          order.id,
          {
            ...baseAuditEntry({
              staff,
              input,
              order,
              status: "pending_manual",
            }),
            payment_id: payment.id,
            amount: refundAmount,
            ...qbdFields,
            stripe_refund_required: true,
            stripe_refund_status: "submitted",
            stripe_refund_id: refund?.id,
            stripe_provider_refund_id:
              refund?.data?.id ||
              refund?.provider_refund_id ||
              refund?.external_id,
            downstream_request_key: requestKey,
          },
          {
            staff_exception_status: "refund_stripe_submitted_qbd_pending",
            ...qbdFields,
            stripe_refund_required: true,
            stripe_refund_status: "submitted",
            stripe_refund_id: refund?.id,
            stripe_provider_refund_id:
              refund?.data?.id ||
              refund?.provider_refund_id ||
              refund?.external_id,
            downstream_request_key: requestKey,
          }
        )
        break
      }
      case "capture_payment": {
        const payment = capturablePayment(order, input.paymentId)
        const captureAmount = staffPositiveCurrencyAmount(input.amount)
        const qbdAmountMinor = staffMinorUnitsFromCurrency(captureAmount)
        const requestKey = downstreamRequestKey(
          input,
          order,
          qbdAmountMinor,
          payment.id
        )
        const qbdFields = qbdPendingFields(input, qbdAmountMinor, {
          qbd_posting_request_key: requestKey,
        })
        await appendOrderAudit(
          order.id,
          {
            ...baseEntry,
            payment_id: payment.id,
            amount: captureAmount,
            ...qbdFields,
            payment_capture_status: "requested",
            downstream_request_key: requestKey,
          },
          {
            staff_exception_status: "capture_requested",
            ...qbdFields,
            payment_capture_status: "requested",
            downstream_request_key: requestKey,
          }
        )
        try {
          await adminFetch<{ payment: AnyRecord }>(
            `/admin/payments/${payment.id}/capture`,
            {
              method: "POST",
              headers: { "Idempotency-Key": requestKey },
              body: JSON.stringify({ amount: captureAmount }),
            }
          )
        } catch (err) {
          await appendOrderAudit(
            order.id,
            {
              ...baseAuditEntry({ staff, input, order, status: "failed" }),
              payment_id: payment.id,
              amount: captureAmount,
              ...qbdFields,
              qbd_posting_required: false,
              payment_capture_status: "failed",
              payment_capture_error:
                err instanceof Error ? err.message : String(err),
              downstream_request_key: requestKey,
              downstream_error:
                err instanceof Error ? err.message : String(err),
            },
            {
              staff_exception_status: "capture_failed",
              ...qbdFields,
              qbd_posting_required: false,
              qbd_posting_status: "blocked_by_capture_failure",
              payment_capture_status: "failed",
              payment_capture_error:
                err instanceof Error ? err.message : String(err),
              downstream_request_key: requestKey,
            }
          )
          await emitStaffOrderSupportActionFailureAlert({
            action: input.action,
            order,
            stage: "stripe_capture",
            requestKey,
            error: err,
          })
          throw err
        }
        await appendOrderAudit(
          order.id,
          {
            ...baseAuditEntry({
              staff,
              input,
              order,
              status: "pending_manual",
            }),
            payment_id: payment.id,
            amount: captureAmount,
            ...qbdFields,
            payment_capture_status: "submitted",
            downstream_request_key: requestKey,
          },
          {
            staff_exception_status: "capture_submitted_qbd_pending",
            ...qbdFields,
            payment_capture_status: "submitted",
            downstream_request_key: requestKey,
          }
        )
        break
      }
    }

    return {
      ok: true,
      order: await getStaffExceptionOrderDetail(order.id),
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
