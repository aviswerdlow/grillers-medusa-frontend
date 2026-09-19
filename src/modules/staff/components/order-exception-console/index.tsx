"use client"

import AccountingHistory, { accountingActionLabel } from "./accounting-history"
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import {
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  History,
  ListPlus,
  Minus,
  NotebookText,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  ShoppingBasket,
  Truck,
  WalletCards,
  XCircle,
} from "lucide-react"

import { ATLANTA_DELIVERY_ZIP_DAYS } from "@lib/data/strapi/checkout"
import {
  searchStaffProducts,
  type StaffProductSearchResult,
} from "@lib/data/staff/order-entry"
import {
  applyStaffOrderException,
  getStaffExceptionOrderDetail,
  previewStaffOrderException,
  searchStaffExceptionOrdersResult,
  type StaffExceptionActionInput,
  type StaffExceptionActionPreview,
  type StaffExceptionFulfillmentFilter,
  type StaffExceptionOrderItemAddition,
  type StaffExceptionOrderDetail,
  type StaffExceptionOrderQueueFilter,
  type StaffExceptionOrderSortKey,
  type StaffExceptionOrderSummary,
  type StaffExceptionPaymentFilter,
  type StaffFulfillmentType,
} from "@lib/data/staff/order-exceptions"
import { formatStaffMoney as formatMoney } from "@lib/data/staff/money"
import {
  STAFF_EXCEPTION_REASON_CODES,
  VISIBLE_STAFF_EXCEPTION_ACTIONS,
  actionIsAuditOnly,
  actionMovesMoney,
  actionMutatesMedusa,
  actionRequiresCustomerConsent,
  staffOrderItemEditEligibility,
  staffOrderSupportActionAvailability,
  type StaffConsentMethod,
  type StaffExceptionActionType,
  type StaffExceptionReasonCode,
  type StaffOrderSupportRole,
} from "@lib/data/staff/exception-types"
import {
  computeEligibleArrivalDates,
  toIsoDate,
  type ArrivalMethod,
} from "@lib/util/eligible-arrival-dates"
import Button from "@modules/common/components/button"

const FULFILLMENT_OPTIONS: Array<{
  value: StaffFulfillmentType
  label: string
}> = [
  { value: "plant_pickup", label: "Plant pickup" },
  { value: "atlanta_delivery", label: "Atlanta delivery" },
  { value: "ups_shipping", label: "UPS shipping" },
  { value: "southeast_pickup", label: "Southeast pickup" },
]

const ORDER_SUPPORT_PAGE_SIZE_OPTIONS = [10, 25, 50]

const ORDER_SUPPORT_SORT_OPTIONS: Array<{
  value: StaffExceptionOrderSortKey
  label: string
}> = [
  { value: "created_desc", label: "Created, newest" },
  { value: "created_asc", label: "Created, oldest" },
  { value: "fulfillment_date_asc", label: "Ship date, earliest" },
  { value: "fulfillment_date_desc", label: "Ship date, latest" },
  { value: "order_newest", label: "Order #, newest" },
  { value: "order_oldest", label: "Order #, oldest" },
  { value: "total_desc", label: "Total, high to low" },
  { value: "total_asc", label: "Total, low to high" },
]

const ACTION_META: Record<
  StaffExceptionActionType,
  {
    shortLabel: string
    description: string
    icon: typeof FileText
    group: "support" | "money" | "risk"
  }
> = {
  record_note: {
    shortLabel: "Internal note",
    description: "Append a staff note and queue it for QuickBooks notes.",
    icon: NotebookText,
    group: "support",
  },
  shipping_override: {
    shortLabel: "Shipping override",
    description: "Change requested date or mode with current state preserved.",
    icon: Truck,
    group: "support",
  },
  edit_order_items: {
    shortLabel: "Edit items",
    description: "Add, remove, or change quantities before a picker claims it.",
    icon: ListPlus,
    group: "support",
  },
  refund_payment: {
    shortLabel: "Refund card",
    description: "Refund an already captured Stripe card payment.",
    icon: CreditCard,
    group: "money",
  },
  capture_payment: {
    shortLabel: "Capture card",
    description: "Capture an authorized Stripe payment.",
    icon: ShieldCheck,
    group: "money",
  },
  record_offline_payment: {
    shortLabel: "Offline payment",
    description: "Record check, cash, ACH, Zelle, or another offline payment.",
    icon: WalletCards,
    group: "money",
  },
  credit_memo: {
    shortLabel: "Account credit",
    description: "Create a future customer credit. This is not a card refund.",
    icon: FileText,
    group: "money",
  },
  retry_qbd_posting: {
    shortLabel: "Retry QBD",
    description: "Reopen a failed QuickBooks writer task.",
    icon: RefreshCw,
    group: "risk",
  },
  cancel_order: {
    shortLabel: "Cancel order",
    description: "Cancel in Medusa and queue the QuickBooks SalesOrder close.",
    icon: XCircle,
    group: "risk",
  },
  record_check_refund: {
    shortLabel: "Check refund",
    description: "Hidden from this console for launch.",
    icon: WalletCards,
    group: "risk",
  },
}

function fieldClass() {
  return "min-h-[44px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-maison-neue text-Charcoal outline-none transition focus:border-Gold focus:ring-1 focus:ring-Gold"
}

function labelClass() {
  return "text-xs font-maison-neue-mono uppercase text-Charcoal/55"
}

function formatOrderDate(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString()
}

// <input type="date"> expects a YYYY-MM-DD value in the user's local date.
function localIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// The business calendar date (America/New_York) as YYYY-MM-DD. Order dates are
// compared in ET on the server (businessCalendarDate), so the default window
// must anchor on the ET "today" too — otherwise a staffer west of ET could see
// a default `dateTo` that's a day behind the business day. #268 P2.
function easternIsoDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const year = parts.find((p) => p.type === "year")?.value
  const month = parts.find((p) => p.type === "month")?.value
  const day = parts.find((p) => p.type === "day")?.value
  return year && month && day ? `${year}-${month}-${day}` : localIsoDate(date)
}

// Default order-support date window: one year back through today, computed in
// America/New_York so it's consistent regardless of the staff browser's TZ.
function defaultOrderDateRange() {
  const todayEastern = easternIsoDate(new Date())
  // Subtract a year from the ET calendar date by string math (no TZ drift):
  // YYYY-MM-DD → (YYYY-1)-MM-DD.
  const [year, monthDay] = [
    todayEastern.slice(0, 4),
    todayEastern.slice(4),
  ]
  const oneYearBack = `${Number(year) - 1}${monthDay}`
  return {
    dateFrom: oneYearBack,
    dateTo: todayEastern,
  }
}

function statusChip(
  value: string,
  tone: "neutral" | "gold" | "green" | "red" = "neutral"
) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "gold"
      ? "border-Gold/35 bg-Gold/10 text-Charcoal"
      : "border-gray-200 bg-white text-Charcoal/65"

  return (
    <span
      className={`inline-flex min-h-[28px] items-center rounded-full border px-2.5 py-1 text-[11px] font-maison-neue-mono uppercase ${toneClass}`}
    >
      {String(value || "unknown").replace(/_/g, " ")}
    </span>
  )
}

function parseDate(value?: string): Date | null {
  if (!value) return null
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  }
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    return new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]))
  }
  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDateForOrder(date: Date) {
  return date.toLocaleDateString("en-US")
}

function dateInputValue(value?: string) {
  const date = parseDate(value)
  return date ? toIsoDate(date) : ""
}

function dateFromInputValue(value: string) {
  const date = parseDate(value)
  return date ? formatDateForOrder(date) : ""
}

function methodForFulfillment(
  type: StaffFulfillmentType,
  shippingMethodName?: string
): ArrivalMethod {
  if (type === "plant_pickup") return "plant_pickup"
  if (type === "atlanta_delivery") return "atlanta_delivery"
  if (type === "southeast_pickup") return "southeast_pickup"

  const method = String(shippingMethodName || "").toLowerCase()
  if (method.includes("overnight")) return "ups_overnight"
  if (
    method.includes("2nd day") ||
    method.includes("second day") ||
    method.includes("two day")
  ) {
    return "ups_2day"
  }
  return "ups_ground"
}

function isStripePayment(
  payment: StaffExceptionOrderDetail["payments"][number]
) {
  return String(payment.providerId || "")
    .toLowerCase()
    .includes("stripe")
}

function remainingCaptureAmount(
  payment?: StaffExceptionOrderDetail["payments"][number]
) {
  if (!payment || !isStripePayment(payment)) return undefined
  const remaining = Math.max(0, payment.amount - payment.capturedAmount)
  return remaining > 0 ? Number(remaining.toFixed(2)) : undefined
}

function actionUnavailableReason(
  action: StaffExceptionActionType,
  order: StaffExceptionOrderDetail | null,
  staffRole?: StaffOrderSupportRole
): string {
  if (!order || order.source === "legacy") return ""

  const availability = staffOrderSupportActionAvailability(action, order, {
    staffRole,
  })
  if (!availability.available) return availability.reason

  if (action === "refund_payment") {
    const refundable = order.payments.some(
      (payment) => isStripePayment(payment) && payment.refundableAmount > 0
    )
    return refundable
      ? ""
      : "No refundable Stripe card payment is available for this order."
  }

  if (action === "capture_payment") {
    const capturable = order.payments.some(
      (payment) =>
        isStripePayment(payment) &&
        Math.max(0, payment.amount - payment.capturedAmount) > 0
    )
    return capturable
      ? ""
      : "No authorized Stripe payment balance is available to capture."
  }

  if (
    action === "retry_qbd_posting" &&
    order.metadata?.qbd_posting_status !== "failed" &&
    !order.accountingActions?.some((row) => ["failed", "blocked"].includes(row.status))
  ) {
    return "QuickBooks retry is available only after a failed QBD posting."
  }

  if (action === "edit_order_items") {
    const eligibility = staffOrderItemEditEligibility(order)
    return eligibility.canEdit ? "" : eligibility.reason
  }

  return ""
}

function actionPhaseAvailable(
  action: StaffExceptionActionType,
  order: StaffExceptionOrderDetail | null,
  staffRole?: StaffOrderSupportRole
) {
  if (!order || order.source === "legacy") return true
  return staffOrderSupportActionAvailability(action, order, {
    staffRole,
  }).available
}

function emptyAction(
  orderId = "",
  order?: StaffExceptionOrderDetail | null
): StaffExceptionActionInput {
  const plan = order?.fulfillmentPlan
  return {
    orderId,
    requestId: globalThis.crypto.randomUUID(),
    action: "record_note",
    reasonCode: "customer_request",
    staffNote: "",
    customerVisibleNote: "",
    customerConsentMethod: "not_applicable",
    amount: undefined,
    paymentId: "",
    offlinePaymentMethod: "",
    offlinePaymentReference: "",
    shippingChangeSummary: "",
    shippingFulfillmentType: plan?.fulfillmentType || "ups_shipping",
    shippingRequestedDate: plan?.dateLabel || "",
    shippingZip: plan?.zip || "",
    shippingMethodName: plan?.shippingMethodName || "",
    itemQuantityChanges: [],
    itemAdditions: [],
    notifyCustomer: false,
  }
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <dt className={labelClass()}>{label}</dt>
      <dd className="mt-1 text-sm font-maison-neue text-Charcoal">{value}</dd>
    </div>
  )
}

// Like DetailRow, but always renders the field with an em dash placeholder when
// no real backing data exists. Used for the QuickBooks document essentials so
// staff see the full QB Docs list and know which fields are not yet populated.
function DetailRowAlways({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className={labelClass()}>{label}</dt>
      <dd className="mt-1 text-sm font-maison-neue text-Charcoal">
        {value || "—"}
      </dd>
    </div>
  )
}

function formatOptionalDate(value?: string) {
  return formatOrderDate(value) || undefined
}

function LegacyOrderReadOnlyPanel({
  order,
}: {
  order: StaffExceptionOrderDetail
}) {
  const legacy = order.legacy
  const hasItems = order.items.length > 0

  // Map the QB Docs essentials onto the data we actually have.
  // Sales Order ≈ the QuickBooks ref number + placed date.
  const salesOrderNumber =
    legacy?.refNumber || order.displayId.replace(/^Legacy\s+/i, "")
  const salesOrderDate = formatOptionalDate(legacy?.placedAt || order.createdAt)
  // Invoice number / date are not distinguished from the Sales Order in the
  // current legacy import — no real backing data, so these stay placeholders.
  const invoiceNumber: string | undefined = undefined
  const invoiceDate: string | undefined = undefined
  // "Order Source" (Staff ID vs Customer Submitted) is not captured for
  // historical QuickBooks orders — no real backing data.
  const orderSource: string | undefined = undefined

  const totalSalesOrder = formatMoney(order.total, order.currencyCode)
  // A distinct invoiced total is not imported separately from the SO total.
  const totalInvoiced: string | undefined = undefined

  return (
    <div className="grid gap-5 p-5">
      <div className="rounded-md border border-Gold/35 bg-Gold/10 p-4 text-sm font-maison-neue text-Charcoal/75">
        This is imported QuickBooks history. It is read-only in Order Support:
        use it to answer customer questions, then handle any adjustment in
        QuickBooks or the operations workflow.
      </div>

      <section className="rounded-md border border-gray-100 p-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-Charcoal/55" />
          <h3 className="text-sm font-maison-neue font-semibold text-Charcoal">
            QuickBooks document
          </h3>
        </div>
        <dl className="mt-4 grid gap-3 small:grid-cols-2">
          <DetailRowAlways label="Invoice number" value={invoiceNumber} />
          <DetailRowAlways label="Invoice date" value={invoiceDate} />
          <DetailRowAlways label="Sales order number" value={salesOrderNumber} />
          <DetailRowAlways label="Sales order date" value={salesOrderDate} />
          <DetailRowAlways label="Order source" value={orderSource} />
          <DetailRowAlways
            label="Total sales order"
            value={totalSalesOrder}
          />
          <DetailRowAlways label="Total invoiced" value={totalInvoiced} />
        </dl>
      </section>

      <section className="rounded-md border border-gray-100 p-4">
        <div className="flex flex-col gap-2 small:flex-row small:items-center small:justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBasket className="h-4 w-4 text-Charcoal/55" />
            <h3 className="text-sm font-maison-neue font-semibold text-Charcoal">
              Invoice lines
            </h3>
          </div>
          {statusChip(
            `${order.itemCount} ${order.itemCount === 1 ? "line" : "lines"}`,
            "gold"
          )}
        </div>

        {hasItems ? (
          <div className="mt-4">
            <div className="hidden grid-cols-[minmax(0,1fr)_104px_104px] gap-3 border-b border-gray-100 pb-2 lg:grid">
              <span className={labelClass()}>Description</span>
              <span className={`${labelClass()} lg:text-right`}>
                Qty ordered
              </span>
              <span className={`${labelClass()} lg:text-right`}>
                Qty invoiced
              </span>
            </div>
            <div className="divide-y divide-gray-100">
              {order.items.map((item) => (
                <div
                  className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_104px_104px]"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                      {item.title}
                    </p>
                  </div>
                  <div className="lg:text-right">
                    <p className={`${labelClass()} lg:hidden`}>Qty ordered</p>
                    <p className="mt-1 text-sm font-maison-neue font-semibold text-Charcoal lg:mt-0">
                      {item.quantity}
                    </p>
                  </div>
                  <div className="lg:text-right">
                    <p className={`${labelClass()} lg:hidden`}>Qty invoiced</p>
                    <p className="mt-1 text-sm font-maison-neue font-semibold text-Charcoal lg:mt-0">
                      {item.fulfilledQuantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-gray-100 bg-SilverPlate/30 p-4">
            <p className="text-sm font-maison-neue text-Charcoal/55">
              No imported line detail is available for this QuickBooks record.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function FulfillmentDatePicker({
  fulfillmentType,
  shippingMethodName,
  zip,
  value,
  onChange,
}: {
  fulfillmentType: StaffFulfillmentType
  shippingMethodName?: string
  zip?: string
  value?: string
  onChange: (value: string) => void
}) {
  const method = useMemo(
    () => methodForFulfillment(fulfillmentType, shippingMethodName),
    [fulfillmentType, shippingMethodName]
  )
  const eligibility = useMemo(
    () =>
      computeEligibleArrivalDates({
        method,
        destinationZip: zip || "",
        atlantaZipConfig: ATLANTA_DELIVERY_ZIP_DAYS,
      }),
    [method, zip]
  )
  const selectedIso = dateInputValue(value)
  const visibleDates = eligibility.dates.slice(0, 6)

  if (!eligibility.earliest || !visibleDates.length) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-maison-neue text-amber-800">
        No eligible dates were found in the next 30 days. Use the manual date
        field and confirm with operations before applying the override.
        <input
          className={`${fieldClass()} mt-3 w-full`}
          type="date"
          value={selectedIso}
          onChange={(event) => onChange(dateFromInputValue(event.target.value))}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 small:grid-cols-3">
        {visibleDates.map((date) => {
          const iso = toIsoDate(date)
          const selected = iso === selectedIso
          return (
            <button
              aria-pressed={selected}
              className={`min-h-[72px] rounded-md border px-2 py-2 text-center transition ${
                selected
                  ? "border-Gold bg-Gold/10 text-Charcoal"
                  : "border-gray-200 bg-white text-Charcoal hover:border-Gold/60"
              }`}
              key={iso}
              onClick={() => onChange(formatDateForOrder(date))}
              type="button"
            >
              <span className="block text-[11px] font-maison-neue-mono uppercase text-Charcoal/55">
                {date.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="mt-1 block text-xl font-maison-neue font-semibold">
                {date.getDate()}
              </span>
              <span className="block text-[11px] font-maison-neue-mono uppercase text-Charcoal/55">
                {date.toLocaleDateString("en-US", { month: "short" })}
              </span>
            </button>
          )
        })}
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClass()}>Manual date</span>
        <input
          className={fieldClass()}
          type="date"
          value={selectedIso}
          onChange={(event) => onChange(dateFromInputValue(event.target.value))}
        />
      </label>
      <p className="text-xs font-maison-neue text-Charcoal/55">
        {eligibility.reason}
      </p>
    </div>
  )
}

function OrderList({
  orders,
  selectedOrderId,
  onSelect,
  page,
  pageSize,
  total,
  hasNextPage,
  onPageChange,
}: {
  orders: StaffExceptionOrderSummary[]
  selectedOrderId?: string
  onSelect: (orderId: string) => void
  page: number
  pageSize: number
  total: number
  hasNextPage: boolean
  onPageChange: (page: number) => void
}) {
  const start = total ? (page - 1) * pageSize + 1 : 0
  const end = total ? Math.min(page * pageSize, total) : 0

  if (!orders.length) {
    return (
      <div className="rounded-md border border-gray-200 bg-white px-4 py-8 text-center text-sm font-maison-neue text-Charcoal/55">
        No orders match these filters.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
      <div className="grid grid-cols-[76px_minmax(0,1fr)_76px] gap-2 bg-SilverPlate/40 px-3 py-2 text-[11px] font-maison-neue-mono uppercase text-Charcoal/45 sm:grid-cols-[88px_minmax(0,1fr)_84px]">
        <span>Order</span>
        <span>Customer</span>
        <span className="text-right">State</span>
      </div>
      {orders.map((order) => (
        <button
          className={`grid w-full grid-cols-[76px_minmax(0,1fr)_76px] gap-2 border-t border-gray-100 px-3 py-3 text-left transition hover:bg-SilverPlate/35 sm:grid-cols-[88px_minmax(0,1fr)_84px] ${
            selectedOrderId === order.id
              ? "bg-Gold/10 shadow-[inset_0_0_0_1px_rgba(228,174,83,0.35)]"
              : ""
          }`}
          key={order.id}
          onClick={() => onSelect(order.id)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block text-sm font-maison-neue font-semibold text-Charcoal">
              {order.displayId}
            </span>
            <span className="block text-xs font-maison-neue text-Charcoal/45">
              {formatOrderDate(order.createdAt) || "No date"}
            </span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-maison-neue font-semibold text-Charcoal">
              {order.customerName}
            </span>
            <span className="block truncate text-xs font-maison-neue text-Charcoal/55">
              {order.email || "No email"}
            </span>
            {(order.fulfillmentLabel || order.fulfillmentDate) && (
              <span className="mt-1 block truncate text-xs font-maison-neue text-Charcoal/45">
                {[
                  order.fulfillmentLabel,
                  formatOrderDate(order.fulfillmentDate),
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </span>
            )}
          </span>
          <span className="flex flex-col items-end gap-1">
            {order.source === "legacy"
              ? statusChip("qbd", "gold")
              : statusChip(order.paymentStatus)}
            <span className="text-xs font-maison-neue text-Charcoal/45">
              {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
            </span>
          </span>
        </button>
      ))}
      <div className="flex flex-col gap-3 border-t border-gray-100 bg-SilverPlate/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-maison-neue text-Charcoal/55">
          Showing {start}-{end} of {total}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <Button
            className="min-h-[36px] rounded-md border border-gray-200 bg-white px-3 text-xs font-maison-neue font-semibold text-Charcoal disabled:cursor-not-allowed disabled:text-Charcoal/35"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            type="button"
          >
            Previous
          </Button>
          <Button
            className="min-h-[36px] rounded-md border border-gray-200 bg-white px-3 text-xs font-maison-neue font-semibold text-Charcoal disabled:cursor-not-allowed disabled:text-Charcoal/35"
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

function hasOrderItemEditDraft(draft: StaffExceptionActionInput) {
  return Boolean(
    draft.itemQuantityChanges?.length || draft.itemAdditions?.length
  )
}

function orderItemChangeTone(
  itemId: string,
  order: StaffExceptionOrderDetail,
  draft: StaffExceptionActionInput
) {
  const item = order.items.find((candidate) => candidate.id === itemId)
  const change = draft.itemQuantityChanges?.find(
    (candidate) => candidate.itemId === itemId
  )
  if (!item || !change) return null
  if (change.quantity === 0) return statusChip("remove", "red")
  if (change.quantity > item.quantity) return statusChip("increase", "gold")
  return statusChip("reduce", "gold")
}

function OrderItemEditPanel({
  order,
  draft,
  onChange,
}: {
  order: StaffExceptionOrderDetail
  draft: StaffExceptionActionInput
  onChange: (patch: Partial<StaffExceptionActionInput>) => void
}) {
  const eligibility = staffOrderItemEditEligibility(order)
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [additions, setAdditions] = useState<StaffExceptionOrderItemAddition[]>(
    []
  )
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<StaffProductSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    setQuantities(
      Object.fromEntries(
        order.items.map((item) => [item.id, String(item.quantity)])
      )
    )
    setAdditions([])
    onChange({
      itemQuantityChanges: [],
      itemAdditions: [],
    })
    // Reset only when a different order is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id])

  useEffect(() => {
    const q = query.trim()
    setSearchError(null)
    if (q.length < 2) {
      setResults([])
      setIsSearching(false)
      return
    }
    let cancelled = false
    setIsSearching(true)
    const timer = window.setTimeout(async () => {
      try {
        const nextResults = await searchStaffProducts(q, "us", {
          fulfillmentType: order.fulfillmentPlan.fulfillmentType,
          scheduledDate:
            order.fulfillmentPlan.requestedFulfillmentDate ||
            order.fulfillmentPlan.dateLabel,
        })
        if (!cancelled) setResults(nextResults)
      } catch (err) {
        if (!cancelled) {
          setSearchError(err instanceof Error ? err.message : String(err))
          setResults([])
        }
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    order.fulfillmentPlan.dateLabel,
    order.fulfillmentPlan.fulfillmentType,
    order.fulfillmentPlan.requestedFulfillmentDate,
    query,
  ])

  function syncDraft(
    nextQuantities: Record<string, string>,
    nextAdditions: StaffExceptionOrderItemAddition[]
  ) {
    const itemQuantityChanges = order.items
      .map((item) => {
        const raw = nextQuantities[item.id]
        const quantity = raw === "" ? item.quantity : Number(raw)
        if (
          !Number.isFinite(quantity) ||
          !Number.isInteger(quantity) ||
          quantity < 0 ||
          quantity === item.quantity
        ) {
          return null
        }
        return {
          itemId: item.id,
          quantity,
        }
      })
      .filter(Boolean) as StaffExceptionActionInput["itemQuantityChanges"]

    onChange({
      itemQuantityChanges,
      itemAdditions: nextAdditions,
    })
  }

  function setLineQuantity(itemId: string, quantity: string) {
    const next = { ...quantities, [itemId]: quantity }
    setQuantities(next)
    syncDraft(next, additions)
  }

  function setAddedQuantity(index: number, quantity: string) {
    const numeric = Number(quantity)
    const next = additions
      .map((addition, additionIndex) =>
        additionIndex === index
          ? {
              ...addition,
              quantity:
                Number.isFinite(numeric) && numeric > 0
                  ? Math.floor(numeric)
                  : addition.quantity,
            }
          : addition
      )
      .filter((addition) => addition.quantity > 0)
    setAdditions(next)
    syncDraft(quantities, next)
  }

  function addProduct(product: StaffProductSearchResult) {
    if (!product.qbdListId) return
    const next = [
      ...additions,
      {
        variantId: product.variantId,
        quantity: 1,
        title: product.title,
        sku: product.sku,
        productId: product.productId,
        qbdListId: product.qbdListId,
        unitPrice: product.calculatedAmount,
        pricingMode: product.pricingMode,
      },
    ]
    setAdditions(next)
    setQuery("")
    setResults([])
    syncDraft(quantities, next)
  }

  function removeAddedLine(index: number) {
    const next = additions.filter((_, additionIndex) => additionIndex !== index)
    setAdditions(next)
    syncDraft(quantities, next)
  }

  if (!eligibility.canEdit) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-maison-neue text-amber-900">
        <p className="font-semibold">Order items are locked.</p>
        <p className="mt-1">{eligibility.reason}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.08em] text-amber-800">
          Pick status: {eligibility.label}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-md border border-gray-100 p-4">
      <div className="flex flex-col gap-2 small:flex-row small:items-start small:justify-between">
        <div>
          <p className={labelClass()}>Before picking starts</p>
          <h4 className="mt-1 text-base font-maison-neue font-semibold text-Charcoal">
            Edit order items
          </h4>
          <p className="mt-1 text-sm font-maison-neue text-Charcoal/60">
            Change quantities, zero a line, or add a mapped catalog item. This
            does not charge the customer.
          </p>
        </div>
        {statusChip(eligibility.label, "green")}
      </div>

      <div className="space-y-3">
        <p className={labelClass()}>Current lines</p>
        {order.items.map((item) => {
          const currentDraftQuantity =
            quantities[item.id] ?? String(item.quantity)
          const canRemove = item.fulfilledQuantity <= 0
          return (
            <div
              className="rounded-md border border-gray-200 p-3"
              key={item.id}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                      {item.title}
                    </p>
                    {orderItemChangeTone(item.id, order, draft)}
                  </div>
                  <p className="mt-1 text-xs font-maison-neue text-Charcoal/55">
                    {[item.subtitle, item.sku].filter(Boolean).join(" | ")}
                  </p>
                  <p className="mt-1 text-xs font-maison-neue text-Charcoal/55">
                    Current {item.quantity}
                    {item.fulfilledQuantity
                      ? ` | Fulfilled ${item.fulfilledQuantity}`
                      : ""}
                    {" | "}
                    {formatMoney(item.total, order.currencyCode)}
                  </p>
                </div>

                <div className="grid gap-2 small:grid-cols-[132px_104px]">
                  <label className="flex flex-col gap-1">
                    <span className={labelClass()}>New quantity</span>
                    <input
                      className={fieldClass()}
                      min={item.fulfilledQuantity}
                      step="1"
                      type="number"
                      inputMode="numeric"
                      value={currentDraftQuantity}
                      onChange={(event) =>
                        setLineQuantity(item.id, event.target.value)
                      }
                    />
                  </label>
                  <Button
                    className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-Charcoal bg-white px-3 text-sm font-maison-neue font-semibold text-Charcoal disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-Charcoal/35"
                    disabled={!canRemove}
                    onClick={() => setLineQuantity(item.id, "0")}
                    type="button"
                  >
                    <Minus className="h-4 w-4" aria-hidden />
                    Zero
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-3 rounded-md border border-gray-200 bg-SilverPlate/25 p-3">
        <div className="flex items-center gap-2">
          <ShoppingBasket className="h-4 w-4 text-Charcoal/55" aria-hidden />
          <p className={labelClass()}>Add catalog item</p>
        </div>
        <input
          className={fieldClass()}
          placeholder="Search by product name or SKU"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
        />
        {searchError && (
          <p className="text-sm font-maison-neue text-red-700">{searchError}</p>
        )}
        {isSearching && (
          <p className="text-sm font-maison-neue text-Charcoal/55">
            Searching catalog...
          </p>
        )}
        {results.length > 0 && (
          <div className="max-h-[320px] overflow-auto rounded-md border border-gray-200 bg-white">
            {results.map((product) => {
              const disabled = !product.qbdListId
              return (
                <button
                  className={`flex w-full items-start justify-between gap-3 border-b border-gray-100 px-3 py-3 text-left transition last:border-b-0 ${
                    disabled
                      ? "cursor-not-allowed bg-SilverPlate/30 text-Charcoal/35"
                      : "hover:bg-Gold/10"
                  }`}
                  disabled={disabled}
                  key={`${product.productId}-${product.variantId}`}
                  onClick={() => addProduct(product)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-maison-neue font-semibold text-Charcoal">
                      {product.title}
                    </span>
                    <span className="mt-1 block text-xs font-maison-neue text-Charcoal/55">
                      {[product.variantTitle, product.sku, product.pricingMode]
                        .filter(Boolean)
                        .join(" | ")}
                    </span>
                    {disabled && (
                      <span className="mt-1 block text-xs font-maison-neue text-red-700">
                        Missing QuickBooks ListID
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-maison-neue font-semibold text-Charcoal">
                    {product.calculatedAmount !== undefined
                      ? formatMoney(
                          product.calculatedAmount,
                          product.currencyCode || order.currencyCode
                        )
                      : "Add"}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {additions.length > 0 && (
          <div className="space-y-2">
            <p className={labelClass()}>Added lines</p>
            {additions.map((addition, index) => (
              <div
                className="grid gap-2 rounded-md border border-gray-200 bg-white p-3 small:grid-cols-[minmax(0,1fr)_112px_44px] small:items-center"
                key={`${addition.variantId}-${index}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-maison-neue font-semibold text-Charcoal">
                    {addition.title}
                  </p>
                  <p className="mt-1 text-xs font-maison-neue text-Charcoal/55">
                    {[addition.sku, addition.pricingMode]
                      .filter(Boolean)
                      .join(" | ")}
                  </p>
                </div>
                <label className="flex flex-col gap-1">
                  <span className={labelClass()}>Qty</span>
                  <input
                    className={fieldClass()}
                    min="1"
                    step="1"
                    type="number"
                    inputMode="numeric"
                    value={addition.quantity}
                    onChange={(event) =>
                      setAddedQuantity(index, event.target.value)
                    }
                  />
                </label>
                <Button
                  aria-label={`Remove ${addition.title}`}
                  className="min-h-[44px] rounded-md border border-Charcoal bg-white px-3 text-sm font-maison-neue font-semibold text-Charcoal"
                  onClick={() => removeAddedLine(index)}
                  type="button"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {hasOrderItemEditDraft(draft) ? (
        <div className="rounded-md border border-Gold/35 bg-Gold/10 p-3 text-sm font-maison-neue text-Charcoal/70">
          Review will confirm the item edit and queue the QuickBooks SalesOrder
          update before Apply is enabled.
        </div>
      ) : (
        <div className="rounded-md border border-gray-200 bg-white p-3 text-sm font-maison-neue text-Charcoal/55">
          No item changes staged yet.
        </div>
      )}
    </div>
  )
}

export default function StaffOrderExceptionConsole({
  staffRole = "staff",
}: {
  staffRole?: StaffOrderSupportRole
}) {
  const [query, setQuery] = useState("")
  const [queueFilter, setQueueFilter] =
    useState<StaffExceptionOrderQueueFilter>("open")
  const [fulfillmentFilter, setFulfillmentFilter] =
    useState<StaffExceptionFulfillmentFilter>("all")
  const [paymentFilter, setPaymentFilter] =
    useState<StaffExceptionPaymentFilter>("all")
  const [fulfillmentTypeFilter, setFulfillmentTypeFilter] = useState<
    StaffFulfillmentType | ""
  >("")
  // Default the window to one year back through today. Staff can clear or
  // widen it; an empty value means "no bound" on that side.
  const [dateFromFilter, setDateFromFilter] = useState(
    () => defaultOrderDateRange().dateFrom
  )
  const [dateToFilter, setDateToFilter] = useState(
    () => defaultOrderDateRange().dateTo
  )
  const [orderSort, setOrderSort] =
    useState<StaffExceptionOrderSortKey>("created_desc")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [totalOrders, setTotalOrders] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [orders, setOrders] = useState<StaffExceptionOrderSummary[]>([])
  const [selectedOrder, setSelectedOrder] =
    useState<StaffExceptionOrderDetail | null>(null)
  const [actionDraft, setActionDraft] = useState<StaffExceptionActionInput>(
    emptyAction()
  )
  const [preview, setPreview] = useState<StaffExceptionActionPreview | null>(
    null
  )
  const [typedConfirmation, setTypedConfirmation] = useState("")
  const [acknowledged, setAcknowledged] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSearchingOrders, setIsSearchingOrders] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [isPending, startTransition] = useTransition()
  const orderSearchRequestRef = useRef(0)

  const selectedAction = actionDraft.action
  const selectedIsLegacy = selectedOrder?.source === "legacy"
  const requiresConsent = actionRequiresCustomerConsent(selectedAction)
  const movesMoney = actionMovesMoney(selectedAction)
  const needsAmount =
    movesMoney ||
    selectedAction === "record_offline_payment" ||
    selectedAction === "refund_payment" ||
    selectedAction === "capture_payment"
  const destructiveConfirmation = preview?.requiredConfirmation
  const typedConfirmationMatches =
    !destructiveConfirmation ||
    typedConfirmation.trim().toUpperCase() === destructiveConfirmation

  const visibleActions = useMemo(() => {
    return VISIBLE_STAFF_EXCEPTION_ACTIONS.filter((action) => {
      if (!selectedOrder || selectedOrder.source === "legacy") {
        return action.value !== "retry_qbd_posting"
      }
      return actionPhaseAvailable(action.value, selectedOrder, staffRole)
    })
  }, [
    selectedOrder,
    selectedOrder?.metadata?.qbd_posting_status,
    selectedOrder?.metadata?.finalization_status,
    selectedOrder?.metadata?.catch_weight_status,
    selectedOrder?.metadata?.pick_pack_status,
    selectedOrder?.metadata?.payment_workflow,
    staffRole,
  ])

  const selectedActionMeta = ACTION_META[selectedAction]
  const SelectedActionIcon = selectedActionMeta.icon

  useEffect(() => {
    if (!selectedOrder || selectedIsLegacy) return
    if (actionPhaseAvailable(selectedAction, selectedOrder, staffRole)) return

    setAcknowledged(false)
    setPreview(null)
    setTypedConfirmation("")
    setActionDraft(emptyAction(selectedOrder.id, selectedOrder))
  }, [
    selectedAction,
    selectedIsLegacy,
    selectedOrder,
    selectedOrder?.metadata?.finalization_status,
    selectedOrder?.metadata?.catch_weight_status,
    selectedOrder?.metadata?.pick_pack_status,
    selectedOrder?.metadata?.payment_workflow,
    staffRole,
  ])

  const canSubmit = useMemo(() => {
    if (selectedIsLegacy) return false
    if (!selectedOrder || !acknowledged) return false
    if (!preview?.ok) return false
    if (!typedConfirmationMatches) return false
    if (!actionDraft.staffNote.trim()) return false
    if (!actionDraft.reasonCode) return false
    if (
      requiresConsent &&
      (!actionDraft.customerConsentMethod ||
        actionDraft.customerConsentMethod === "not_applicable")
    ) {
      return false
    }
    if (needsAmount && !Number(actionDraft.amount)) return false
    if (
      selectedAction === "record_offline_payment" &&
      !actionDraft.offlinePaymentMethod?.trim()
    ) {
      return false
    }
    if (
      selectedAction === "shipping_override" &&
      (!actionDraft.shippingFulfillmentType ||
        !actionDraft.shippingRequestedDate?.trim())
    ) {
      return false
    }
    if (
      selectedAction === "edit_order_items" &&
      !hasOrderItemEditDraft(actionDraft)
    ) {
      return false
    }
    return true
  }, [
    acknowledged,
    actionDraft,
    needsAmount,
    preview,
    requiresConsent,
    selectedAction,
    selectedIsLegacy,
    selectedOrder,
    typedConfirmationMatches,
  ])

  const activeOrderFilters = Boolean(
    query ||
      queueFilter !== "open" ||
      fulfillmentFilter !== "all" ||
      paymentFilter !== "all" ||
      fulfillmentTypeFilter ||
      dateFromFilter ||
      dateToFilter ||
      orderSort !== "created_desc" ||
      pageSize !== 25
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runOrderSearch()
    }, 250)

    return () => window.clearTimeout(timer)
    // Search filters intentionally drive the debounced server action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query,
    queueFilter,
    fulfillmentFilter,
    paymentFilter,
    fulfillmentTypeFilter,
    dateFromFilter,
    dateToFilter,
    orderSort,
    page,
    pageSize,
  ])

  function updateActionDraft(patch: Partial<StaffExceptionActionInput>) {
    setPreview(null)
    setTypedConfirmation("")
    setAcknowledged(false)
    setActionDraft((current) => ({ ...current, ...patch }))
  }

  function runOrderSearch(
    overrides: Partial<{
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
    }> = {}
  ) {
    const requestId = orderSearchRequestRef.current + 1
    orderSearchRequestRef.current = requestId
    setError(null)
    setStatus(null)
    setIsSearchingOrders(true)
    const nextQuery = overrides.query ?? query
    const nextQueue = overrides.queue ?? queueFilter
    const nextFulfillment = overrides.fulfillmentStatus ?? fulfillmentFilter
    const nextPayment = overrides.paymentStatus ?? paymentFilter
    const nextFulfillmentType =
      overrides.fulfillmentType ?? fulfillmentTypeFilter
    const nextDateFrom = overrides.dateFrom ?? dateFromFilter
    const nextDateTo = overrides.dateTo ?? dateToFilter
    const nextSort = overrides.sort ?? orderSort
    const nextPage = overrides.page ?? page
    const nextPageSize = overrides.pageSize ?? pageSize
    startTransition(async () => {
      try {
        const result = await searchStaffExceptionOrdersResult({
          query: nextQuery,
          queue: nextQuery.trim() ? "all" : nextQueue,
          fulfillmentStatus: nextFulfillment,
          paymentStatus: nextPayment,
          fulfillmentType: nextFulfillmentType,
          dateFrom: nextDateFrom,
          dateTo: nextDateTo,
          sort: nextSort,
          page: nextPage,
          pageSize: nextPageSize,
        })
        if (requestId !== orderSearchRequestRef.current) return
        if (!result.ok) {
          setError(result.error || "Order lookup could not refresh.")
          setOrders([])
          setTotalOrders(0)
          setHasNextPage(false)
          return
        }
        const results = result.orders
        setOrders(results)
        setTotalOrders(result.total)
        setHasNextPage(result.hasNextPage)
        if (result.page !== nextPage) setPage(result.page)
        if (result.pageSize !== nextPageSize) setPageSize(result.pageSize)
        if (!results.length) {
          setStatus(
            nextQuery.trim()
              ? "No matching current or historical orders found."
              : nextQueue === "open"
              ? "No open orders found."
              : "No orders found."
          )
        }
      } catch (err) {
        if (requestId !== orderSearchRequestRef.current) return
        setError(err instanceof Error ? err.message : String(err))
        setOrders([])
        setTotalOrders(0)
        setHasNextPage(false)
      } finally {
        if (requestId === orderSearchRequestRef.current) {
          setIsSearchingOrders(false)
        }
      }
    })
  }

  function clearOrderFilters() {
    setQuery("")
    setQueueFilter("open")
    setFulfillmentFilter("all")
    setPaymentFilter("all")
    setFulfillmentTypeFilter("")
    setDateFromFilter("")
    setDateToFilter("")
    setOrderSort("created_desc")
    setPage(1)
    setPageSize(25)
    setError(null)
    setStatus(null)
    setIsSearchingOrders(false)
  }

  function selectOrder(orderId: string) {
    setError(null)
    setStatus(null)
    setAcknowledged(false)
    setPreview(null)
    setTypedConfirmation("")
    startTransition(async () => {
      try {
        const detail = await getStaffExceptionOrderDetail(orderId)
        setSelectedOrder(detail)
        setActionDraft(emptyAction(detail.id, detail))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  function chooseAction(action: StaffExceptionActionType) {
    if (!selectedOrder) return
    const nextDraft: StaffExceptionActionInput = {
      ...emptyAction(selectedOrder.id, selectedOrder),
      action,
      customerConsentMethod: actionRequiresCustomerConsent(action)
        ? "phone"
        : "not_applicable",
    }
    if (action === "capture_payment") {
      const payment = selectedOrder.payments.find(
        (candidate) => remainingCaptureAmount(candidate) !== undefined
      )
      nextDraft.paymentId = payment?.id || ""
      nextDraft.amount = remainingCaptureAmount(payment)
    }
    setAcknowledged(false)
    setPreview(null)
    setTypedConfirmation("")
    setActionDraft(nextDraft)
  }

  async function reviewAction() {
    if (!selectedOrder || isReviewing || isApplying) return
    setError(null)
    setStatus(null)
    setAcknowledged(false)
    setTypedConfirmation("")
    setIsReviewing(true)
    try {
      const result = await previewStaffOrderException({
        ...actionDraft,
        orderId: selectedOrder.id,
      })
      setPreview(result)
      if (!result.ok) {
        setError(result.error || "Review found a blocking issue.")
      } else {
        setStatus("Review complete. Confirm the action before applying it.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsReviewing(false)
    }
  }

  async function applyAction(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (!selectedOrder || !canSubmit || isApplying) return
    setError(null)
    setStatus("Applying audited staff action.")
    setIsApplying(true)
    try {
      const result = await applyStaffOrderException({
        ...actionDraft,
        orderId: selectedOrder.id,
        typedConfirmation,
      })
      if (!result.ok || !result.order) {
        setError(result.error || "Could not apply staff action.")
        return
      }
      setSelectedOrder(result.order)
      setActionDraft(emptyAction(result.order.id, result.order))
      setAcknowledged(false)
      setPreview(null)
      setTypedConfirmation("")
      runOrderSearch()
      setStatus("Staff action recorded and audited.")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsApplying(false)
    }
  }

  const actionGroups = [
    { id: "support", label: "Order support" },
    { id: "money", label: "Money actions" },
    { id: "risk", label: "Risk controls" },
  ] as const

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(290px,430px)_minmax(0,1fr)] xl:items-start">
      <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-4">
          <p className="text-xs font-maison-neue-mono uppercase text-Gold">
            Existing order support
          </p>
          <h2 className="mt-1 text-xl font-maison-neue font-semibold text-Charcoal">
            Order lookup
          </h2>
          <p className="mt-1 text-sm font-maison-neue text-Charcoal/55">
            Find the order first, then apply one audited front-office action.
          </p>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div className="rounded-md border border-gray-200 bg-SilverPlate/20 p-3">
            <div className="grid gap-2">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClass()}>Search orders</span>
                <input
                  className={fieldClass()}
                  placeholder="Order, invoice, email, name, phone, ZIP"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setPage(1)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") runOrderSearch()
                  }}
                  type="search"
                />
              </label>

              <div className="grid gap-2 small:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass()}>Queue</span>
                  <select
                    className={fieldClass()}
                    value={queueFilter}
                    onChange={(event) => {
                      setQueueFilter(
                        event.target.value as StaffExceptionOrderQueueFilter
                      )
                      setPage(1)
                    }}
                  >
                    <option value="open">Open only</option>
                    <option value="all">All current</option>
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass()}>Fulfillment state</span>
                  <select
                    className={fieldClass()}
                    value={fulfillmentFilter}
                    onChange={(event) => {
                      const value = event.target
                        .value as StaffExceptionFulfillmentFilter
                      setFulfillmentFilter(value)
                      if (value === "fulfilled" && queueFilter === "open") {
                        setQueueFilter("all")
                      }
                      setPage(1)
                    }}
                  >
                    <option value="all">All fulfillment</option>
                    <option value="unfulfilled">Unfulfilled</option>
                    <option value="partially_fulfilled">
                      Partially fulfilled
                    </option>
                    <option value="fulfilled">Fulfilled</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-2 small:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass()}>Payment</span>
                  <select
                    className={fieldClass()}
                    value={paymentFilter}
                    onChange={(event) => {
                      setPaymentFilter(
                        event.target.value as StaffExceptionPaymentFilter
                      )
                      setPage(1)
                    }}
                  >
                    <option value="all">All payment</option>
                    <option value="awaiting_payment">Awaiting</option>
                    <option value="paid">Paid</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass()}>Fulfillment method</span>
                  <select
                    className={fieldClass()}
                    value={fulfillmentTypeFilter}
                    onChange={(event) => {
                      setFulfillmentTypeFilter(
                        event.target.value as StaffFulfillmentType | ""
                      )
                      setPage(1)
                    }}
                  >
                    <option value="">All methods</option>
                    {FULFILLMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-2 small:grid-cols-2">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass()}>Order date from</span>
                  <input
                    className={fieldClass()}
                    type="date"
                    value={dateFromFilter}
                    max={dateToFilter || undefined}
                    onChange={(event) => {
                      setDateFromFilter(event.target.value)
                      setPage(1)
                    }}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass()}>Order date through</span>
                  <input
                    className={fieldClass()}
                    type="date"
                    value={dateToFilter}
                    min={dateFromFilter || undefined}
                    onChange={(event) => {
                      setDateToFilter(event.target.value)
                      setPage(1)
                    }}
                  />
                </label>
              </div>

              <div className="grid gap-2 small:grid-cols-[minmax(0,1fr)_112px]">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass()}>Sort orders</span>
                  <select
                    className={fieldClass()}
                    value={orderSort}
                    onChange={(event) => {
                      setOrderSort(
                        event.target.value as StaffExceptionOrderSortKey
                      )
                      setPage(1)
                    }}
                  >
                    {ORDER_SUPPORT_SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClass()}>Per page</span>
                  <select
                    className={fieldClass()}
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value))
                      setPage(1)
                    }}
                  >
                    {ORDER_SUPPORT_PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-2 small:flex-row small:items-center small:justify-between">
                <p className="text-xs font-maison-neue text-Charcoal/45">
                  {isSearchingOrders
                    ? "Updating orders..."
                    : "Results update as you filter."}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className={`min-h-[40px] rounded-md border px-3 text-xs font-maison-neue font-semibold ${
                      activeOrderFilters
                        ? "border-Charcoal bg-white text-Charcoal hover:border-Gold/70"
                        : "cursor-not-allowed border-gray-200 bg-gray-50 text-Charcoal/35"
                    }`}
                    disabled={!activeOrderFilters}
                    onClick={clearOrderFilters}
                    type="button"
                  >
                    Clear
                  </Button>
                  <Button
                    className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-Charcoal bg-white px-3 text-xs font-maison-neue font-semibold text-Charcoal"
                    disabled={isSearchingOrders}
                    onClick={() => runOrderSearch()}
                    type="button"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {(error || status) && (
            <div
              className={`rounded-md border px-4 py-3 text-sm font-maison-neue ${
                error
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-green-200 bg-green-50 text-green-700"
              }`}
            >
              {error || status}
            </div>
          )}

          <OrderList
            orders={orders}
            selectedOrderId={selectedOrder?.id}
            onSelect={selectOrder}
            page={page}
            pageSize={pageSize}
            total={totalOrders}
            hasNextPage={hasNextPage}
            onPageChange={setPage}
          />
        </div>
      </section>

      {!selectedOrder ? (
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
            <ClipboardList className="h-10 w-10 text-Charcoal/35" />
            <h2 className="mt-4 text-xl font-maison-neue font-semibold text-Charcoal">
              Select an order
            </h2>
            <p className="mt-2 max-w-md text-sm font-maison-neue text-Charcoal/55">
              Order support actions stay disabled until a live Medusa order is
              selected. Historical QuickBooks orders remain read-only.
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex flex-col gap-3 large:flex-row large:items-start large:justify-between">
              <div>
                <p className={labelClass()}>Selected order</p>
                <h2 className="mt-1 text-2xl font-gyst font-bold text-Charcoal">
                  {selectedOrder.displayId}
                </h2>
                <p className="mt-1 text-sm font-maison-neue text-Charcoal/55">
                  {selectedOrder.customerName} | {selectedOrder.email}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedOrder.source === "legacy" && statusChip("qbd", "gold")}
                {statusChip(selectedOrder.status)}
                {statusChip(selectedOrder.paymentStatus)}
                {statusChip(selectedOrder.fulfillmentStatus)}
                {selectedOrder.source === "medusa" &&
                  statusChip(selectedOrder.operationalState, "gold")}
              </div>
            </div>
          </div>

          {selectedIsLegacy ? (
            <LegacyOrderReadOnlyPanel order={selectedOrder} />
          ) : (
            <div className="grid gap-6 p-5">
              <AccountingHistory actions={selectedOrder.accountingActions} error={selectedOrder.accountingHistoryError} />
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
                <div className="rounded-md border border-gray-100 p-4">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-Charcoal/55" />
                    <h3 className="text-sm font-maison-neue font-semibold text-Charcoal">
                      Current fulfillment
                    </h3>
                  </div>
                  <dl className="mt-4 grid gap-3 small:grid-cols-2">
                    <DetailRow
                      label="Mode"
                      value={selectedOrder.fulfillmentPlan.fulfillmentLabel}
                    />
                    <DetailRow
                      label="Date"
                      value={selectedOrder.fulfillmentPlan.dateLabel || "None"}
                    />
                    <DetailRow
                      label="ZIP"
                      value={selectedOrder.fulfillmentPlan.zip}
                    />
                    <DetailRow
                      label="Shipping method"
                      value={selectedOrder.fulfillmentPlan.shippingMethodName}
                    />
                    <DetailRow
                      label="Address"
                      value={selectedOrder.fulfillmentPlan.addressSummary}
                    />
                  </dl>
                </div>

                <div className="rounded-md border border-gray-100 p-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-Charcoal/55" />
                    <h3 className="text-sm font-maison-neue font-semibold text-Charcoal">
                      Payments and totals
                    </h3>
                  </div>
                  <dl className="mt-4 grid gap-3 small:grid-cols-2">
                    <DetailRow
                      label="Subtotal"
                      value={formatMoney(
                        selectedOrder.subtotal,
                        selectedOrder.currencyCode
                      )}
                    />
                    <DetailRow
                      label="Shipping"
                      value={formatMoney(
                        selectedOrder.shippingTotal,
                        selectedOrder.currencyCode
                      )}
                    />
                    <DetailRow
                      label="Tax"
                      value={formatMoney(
                        selectedOrder.taxTotal,
                        selectedOrder.currencyCode
                      )}
                    />
                    <DetailRow
                      label="Total"
                      value={formatMoney(
                        selectedOrder.total,
                        selectedOrder.currencyCode
                      )}
                    />
                  </dl>
                  <div className="mt-4 space-y-2">
                    {selectedOrder.payments.length ? (
                      selectedOrder.payments.map((payment) => (
                        <div
                          className="rounded-md border border-gray-100 px-3 py-2"
                          key={payment.id}
                        >
                          <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                            {formatMoney(payment.amount, payment.currencyCode)}
                          </p>
                          <p className="text-xs font-maison-neue text-Charcoal/55">
                            Captured{" "}
                            {formatMoney(
                              payment.capturedAmount,
                              payment.currencyCode
                            )}
                            {" | "}Refundable{" "}
                            {formatMoney(
                              payment.refundableAmount,
                              payment.currencyCode
                            )}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm font-maison-neue text-Charcoal/55">
                        No payment records returned.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-gray-100 p-4">
                <div className="flex items-center gap-2">
                  <PackageCheck className="h-4 w-4 text-Charcoal/55" />
                  <h3 className="text-sm font-maison-neue font-semibold text-Charcoal">
                    Items
                  </h3>
                </div>
                <div className="mt-3 divide-y divide-gray-100">
                  {selectedOrder.items.map((item) => (
                    <div
                      className="flex items-start justify-between gap-4 py-3"
                      key={item.id}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                          {item.quantity} x {item.title}
                        </p>
                        <p className="mt-1 text-xs font-maison-neue text-Charcoal/55">
                          {[item.subtitle, item.sku]
                            .filter(Boolean)
                            .join(" | ")}
                        </p>
                      </div>
                      <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                        {formatMoney(item.total, selectedOrder.currencyCode)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-gray-200">
                <div className="border-b border-gray-100 px-4 py-4">
                  <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                    Apply audited action
                  </p>
                  <h3 className="mt-1 text-lg font-maison-neue font-semibold text-Charcoal">
                    Front-office controls
                  </h3>
                </div>

                <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)]">
                  <div className="space-y-4">
                    {actionGroups.map((group) => {
                      const groupActions = visibleActions.filter(
                        (action) => ACTION_META[action.value].group === group.id
                      )
                      if (!groupActions.length) return null
                      return (
                        <div key={group.id}>
                          <p className={labelClass()}>{group.label}</p>
                          <div className="mt-2 grid gap-2">
                            {groupActions.map((action) => {
                              const meta = ACTION_META[action.value]
                              const Icon = meta.icon
                              const unavailable = actionUnavailableReason(
                                action.value,
                                selectedOrder,
                                staffRole
                              )
                              const active = selectedAction === action.value
                              return (
                                <button
                                  className={`flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition ${
                                    active
                                      ? "border-Charcoal bg-Charcoal text-white"
                                      : unavailable
                                      ? "cursor-not-allowed border-gray-100 bg-SilverPlate/30 text-Charcoal/35"
                                      : "border-gray-200 bg-white text-Charcoal hover:border-Gold/60"
                                  }`}
                                  disabled={Boolean(unavailable)}
                                  key={action.value}
                                  onClick={() => chooseAction(action.value)}
                                  title={unavailable}
                                  type="button"
                                >
                                  <Icon
                                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                                      active ? "text-white" : "text-Charcoal/55"
                                    }`}
                                  />
                                  <span className="min-w-0">
                                    <span className="block text-sm font-maison-neue font-semibold">
                                      {meta.shortLabel}
                                    </span>
                                    <span
                                      className={`mt-1 block text-xs font-maison-neue ${
                                        active
                                          ? "text-white/75"
                                          : "text-Charcoal/55"
                                      }`}
                                    >
                                      {meta.description}
                                    </span>
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <form className="space-y-4" onSubmit={applyAction}>
                    <div className="rounded-md border border-gray-100 p-4">
                      <div className="flex items-start gap-3">
                        <SelectedActionIcon className="mt-1 h-5 w-5 text-Charcoal/55" />
                        <div>
                          <p className={labelClass()}>Selected action</p>
                          <h4 className="mt-1 text-base font-maison-neue font-semibold text-Charcoal">
                            {selectedActionMeta.shortLabel}
                          </h4>
                          <p className="mt-1 text-sm font-maison-neue text-Charcoal/60">
                            {selectedActionMeta.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 small:grid-cols-2">
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>Reason</span>
                        <select
                          className={fieldClass()}
                          value={actionDraft.reasonCode}
                          onChange={(event) =>
                            updateActionDraft({
                              reasonCode: event.target
                                .value as StaffExceptionReasonCode,
                            })
                          }
                        >
                          {STAFF_EXCEPTION_REASON_CODES.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      {requiresConsent && (
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>
                            Customer authorization
                          </span>
                          <select
                            className={fieldClass()}
                            value={actionDraft.customerConsentMethod}
                            onChange={(event) =>
                              updateActionDraft({
                                customerConsentMethod: event.target
                                  .value as StaffConsentMethod,
                              })
                            }
                          >
                            <option value="phone">Phone</option>
                            <option value="email">Email</option>
                            <option value="sms">SMS</option>
                            <option value="in_person">In person</option>
                          </select>
                        </label>
                      )}
                    </div>

                    {selectedAction === "edit_order_items" && (
                      <OrderItemEditPanel
                        order={selectedOrder}
                        draft={actionDraft}
                        onChange={updateActionDraft}
                      />
                    )}

                    {needsAmount && (
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>Amount</span>
                        <input
                          className={fieldClass()}
                          min="0"
                          step="0.01"
                          type="number"
                          disabled={selectedAction === "capture_payment"}
                          value={actionDraft.amount ?? ""}
                          onChange={(event) =>
                            updateActionDraft({
                              amount: event.target.value
                                ? Number(event.target.value)
                                : undefined,
                            })
                          }
                        />
                      </label>
                    )}

                    {(selectedAction === "refund_payment" ||
                      selectedAction === "capture_payment") &&
                      selectedOrder.payments.length > 0 && (
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Payment</span>
                          <select
                            className={fieldClass()}
                            value={actionDraft.paymentId || ""}
                            onChange={(event) => {
                              const paymentId = event.target.value
                              const payment = selectedOrder.payments.find(
                                (candidate) => candidate.id === paymentId
                              )
                              updateActionDraft({
                                paymentId,
                                amount:
                                  selectedAction === "capture_payment"
                                    ? remainingCaptureAmount(payment)
                                    : actionDraft.amount,
                              })
                            }}
                          >
                            <option value="">Auto select</option>
                            {selectedOrder.payments.map((payment) => (
                              <option key={payment.id} value={payment.id}>
                                {payment.id} |{" "}
                                {formatMoney(
                                  payment.amount,
                                  payment.currencyCode
                                )}
                              </option>
                            ))}
                          </select>
                          {selectedAction === "capture_payment" && (
                            <span className="text-xs font-maison-neue text-Charcoal/55">
                              Stripe captures the full remaining authorization.
                              Partial capture is blocked until the payment
                              provider supports it safely.
                            </span>
                          )}
                        </label>
                      )}

                    {selectedAction === "record_offline_payment" && (
                      <div className="grid gap-3 small:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Payment method</span>
                          <input
                            className={fieldClass()}
                            placeholder="Check, ACH, Zelle, cash"
                            value={actionDraft.offlinePaymentMethod || ""}
                            onChange={(event) =>
                              updateActionDraft({
                                offlinePaymentMethod: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>Reference</span>
                          <input
                            className={fieldClass()}
                            value={actionDraft.offlinePaymentReference || ""}
                            onChange={(event) =>
                              updateActionDraft({
                                offlinePaymentReference: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    )}

                    {selectedAction === "shipping_override" && (
                      <div className="space-y-4 rounded-md border border-gray-100 p-4">
                        <div className="grid gap-3 small:grid-cols-2">
                          <div>
                            <p className={labelClass()}>Current</p>
                            <div className="mt-2 rounded-md border border-gray-100 bg-SilverPlate/35 p-3 text-sm font-maison-neue text-Charcoal">
                              <p className="font-semibold">
                                {selectedOrder.fulfillmentPlan.fulfillmentLabel}
                              </p>
                              <p className="mt-1 text-Charcoal/60">
                                {selectedOrder.fulfillmentPlan.dateLabel ||
                                  "No date"}
                              </p>
                              {selectedOrder.fulfillmentPlan.zip && (
                                <p className="mt-1 text-Charcoal/60">
                                  ZIP {selectedOrder.fulfillmentPlan.zip}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="space-y-3">
                            <label className="flex flex-col gap-1">
                              <span className={labelClass()}>
                                Requested mode
                              </span>
                              <select
                                className={fieldClass()}
                                value={actionDraft.shippingFulfillmentType}
                                onChange={(event) =>
                                  updateActionDraft({
                                    shippingFulfillmentType: event.target
                                      .value as StaffFulfillmentType,
                                    shippingRequestedDate: "",
                                  })
                                }
                              >
                                {FULFILLMENT_OPTIONS.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className={labelClass()}>ZIP</span>
                              <input
                                className={fieldClass()}
                                value={actionDraft.shippingZip || ""}
                                onChange={(event) =>
                                  updateActionDraft({
                                    shippingZip: event.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-Charcoal/55" />
                            <p className={labelClass()}>Requested date</p>
                          </div>
                          <FulfillmentDatePicker
                            fulfillmentType={
                              actionDraft.shippingFulfillmentType ||
                              selectedOrder.fulfillmentPlan.fulfillmentType
                            }
                            shippingMethodName={
                              actionDraft.shippingMethodName ||
                              selectedOrder.fulfillmentPlan.shippingMethodName
                            }
                            zip={
                              actionDraft.shippingZip ||
                              selectedOrder.fulfillmentPlan.zip
                            }
                            value={actionDraft.shippingRequestedDate}
                            onChange={(value) =>
                              updateActionDraft({
                                shippingRequestedDate: value,
                              })
                            }
                          />
                        </div>
                        <label className="flex flex-col gap-1">
                          <span className={labelClass()}>
                            Optional operations note
                          </span>
                          <textarea
                            className={`${fieldClass()} min-h-[76px]`}
                            value={actionDraft.shippingChangeSummary || ""}
                            onChange={(event) =>
                              updateActionDraft({
                                shippingChangeSummary: event.target.value,
                              })
                            }
                          />
                        </label>
                        {actionDraft.shippingFulfillmentType !==
                          selectedOrder.fulfillmentPlan.fulfillmentType && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-maison-neue text-amber-800">
                            Mode changes are marked for checkout-style reprice
                            and operations review before shipment.
                          </div>
                        )}
                      </div>
                    )}

                    {actionDraft.action === "retry_qbd_posting" && (
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>Accounting action to retry</span>
                        <select className={fieldClass()} value={actionDraft.accountingRequestKey || ""}
                          onChange={(event) => updateActionDraft({ accountingRequestKey: event.target.value })}>
                          <option value="">Select a failed or blocked action</option>
                          {(selectedOrder.accountingActions || []).filter((row) => ["failed", "blocked"].includes(row.status)).map((row) => (
                            <option key={row.id} value={row.request_key}>{accountingActionLabel(row.action)} · {row.request_key}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>Internal staff note</span>
                      <textarea
                        className={`${fieldClass()} min-h-[108px]`}
                        placeholder="Required. This note is audited and queued for QuickBooks when applicable."
                        value={actionDraft.staffNote}
                        onChange={(event) =>
                          updateActionDraft({ staffNote: event.target.value })
                        }
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className={labelClass()}>Customer note</span>
                      <textarea
                        className={`${fieldClass()} min-h-[78px]`}
                        value={actionDraft.customerVisibleNote || ""}
                        onChange={(event) =>
                          updateActionDraft({
                            customerVisibleNote: event.target.value,
                          })
                        }
                      />
                    </label>

                    {actionIsAuditOnly(selectedAction) && (
                      <div className="rounded-md border border-gray-200 bg-SilverPlate/40 p-3 text-sm font-maison-neue text-Charcoal/70">
                        This action records an audited staff decision.
                        QuickBooks work remains pending until the accounting
                        bridge posts it.
                      </div>
                    )}

                    {actionMutatesMedusa(selectedAction) && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-maison-neue text-red-700">
                        This action can change Medusa order or payment state.
                        Review it first
                        {destructiveConfirmation
                          ? ", then type the confirmation word"
                          : ""}{" "}
                        before applying it.
                      </div>
                    )}

                    {preview && (
                      <div
                        className={`rounded-md border p-4 ${
                          preview.ok
                            ? "border-green-200 bg-green-50"
                            : "border-red-200 bg-red-50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={labelClass()}>Review</p>
                            <h4 className="mt-1 text-base font-maison-neue font-semibold text-Charcoal">
                              {preview.actionLabel}
                            </h4>
                          </div>
                          {statusChip(
                            preview.willMutateMedusa ? "external" : "audit",
                            preview.willMutateMedusa ? "red" : "gold"
                          )}
                        </div>
                        <p className="mt-3 text-sm font-maison-neue text-Charcoal/75">
                          {preview.summary}
                        </p>
                        <dl className="mt-3 grid gap-2 text-xs font-maison-neue text-Charcoal/65">
                          {preview.amount !== undefined && (
                            <div className="flex justify-between gap-3">
                              <dt>Amount</dt>
                              <dd className="font-semibold text-Charcoal">
                                {formatMoney(
                                  preview.amount,
                                  selectedOrder.currencyCode
                                )}
                              </dd>
                            </div>
                          )}
                          <div className="flex justify-between gap-3">
                            <dt>QBD follow-up</dt>
                            <dd className="font-semibold text-Charcoal">
                              {preview.qbdReconciliationNeeded
                                ? "Required"
                                : "No"}
                            </dd>
                          </div>
                        </dl>
                        {preview.blockingReasons.length > 0 && (
                          <ul className="mt-3 space-y-1 text-sm font-maison-neue text-red-700">
                            {preview.blockingReasons.map((reason) => (
                              <li key={reason}>{reason}</li>
                            ))}
                          </ul>
                        )}
                        {preview.warnings.length > 0 && (
                          <ul className="mt-3 space-y-1 text-xs font-maison-neue text-Charcoal/65">
                            {preview.warnings.map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {destructiveConfirmation && preview?.ok && (
                      <label className="flex flex-col gap-1">
                        <span className={labelClass()}>
                          Type {destructiveConfirmation} to confirm
                        </span>
                        <input
                          className={fieldClass()}
                          value={typedConfirmation}
                          onChange={(event) =>
                            setTypedConfirmation(event.target.value)
                          }
                        />
                      </label>
                    )}

                    <label className="flex items-start gap-3 rounded-md border border-Gold/35 bg-Gold/10 p-3 text-sm font-maison-neue text-Charcoal">
                      <input
                        checked={acknowledged}
                        disabled={!preview?.ok}
                        className="mt-1"
                        onChange={(event) =>
                          setAcknowledged(event.target.checked)
                        }
                        type="checkbox"
                      />
                      I reviewed the action, the customer authorized it where
                      required, and the audit trail should attribute it to me.
                    </label>

                    <div className="grid gap-2 small:grid-cols-2">
                      <Button
                        className="min-h-[48px] rounded-md border border-Charcoal bg-white px-4 text-sm font-rexton font-bold uppercase text-Charcoal"
                        disabled={!selectedOrder || isApplying}
                        isLoading={isReviewing}
                        onClick={reviewAction}
                        type="button"
                      >
                        Review
                      </Button>

                      <Button
                        className="min-h-[48px] rounded-md bg-Gold px-4 text-sm font-rexton font-bold uppercase text-Charcoal"
                        disabled={!canSubmit || isReviewing}
                        isLoading={isApplying}
                        type="submit"
                      >
                        Apply
                      </Button>
                    </div>
                  </form>
                </div>
              </div>

              <div className="rounded-md border border-gray-100 p-4">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-Charcoal/55" />
                  <h3 className="text-sm font-maison-neue font-semibold text-Charcoal">
                    Audit trail
                  </h3>
                </div>
                {selectedOrder.auditLog.length ? (
                  <div className="mt-4 divide-y divide-gray-100">
                    {selectedOrder.auditLog
                      .slice(-10)
                      .reverse()
                      .map((entry, index) => (
                        <div
                          className="grid gap-2 py-3"
                          key={`${entry.at}-${index}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-maison-neue font-semibold text-Charcoal">
                              {(
                                entry.action ||
                                entry.staff_action ||
                                "staff action"
                              ).replace(/_/g, " ")}
                            </p>
                            {statusChip(entry.status || "recorded")}
                          </div>
                          <p className="text-xs font-maison-neue text-Charcoal/55">
                            {[entry.staff_actor_name, entry.at]
                              .filter(Boolean)
                              .join(" | ")}
                          </p>
                          {(entry.qbd_posting_status ||
                            entry.stripe_refund_status ||
                            entry.payment_capture_status) && (
                            <p className="text-xs font-maison-neue text-Charcoal/55">
                              {[
                                entry.qbd_posting_status
                                  ? `QBD: ${entry.qbd_posting_status}`
                                  : "",
                                entry.stripe_refund_status
                                  ? `Stripe: ${entry.stripe_refund_status}`
                                  : "",
                                entry.payment_capture_status
                                  ? `Capture: ${entry.payment_capture_status}`
                                  : "",
                                entry.qbd_txn_id
                                  ? `Txn: ${entry.qbd_txn_id}`
                                  : "",
                                entry.qbd_ref_number
                                  ? `Ref: ${entry.qbd_ref_number}`
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" | ")}
                            </p>
                          )}
                          {entry.staff_note && (
                            <p className="text-sm font-maison-neue text-Charcoal/70">
                              {entry.staff_note}
                            </p>
                          )}
                          {(entry.qbd_posting_error ||
                            entry.stripe_refund_error ||
                            entry.payment_capture_error ||
                            entry.downstream_error) && (
                            <p className="text-sm font-maison-neue text-red-700">
                              {entry.qbd_posting_error ||
                                entry.stripe_refund_error ||
                                entry.payment_capture_error ||
                                entry.downstream_error}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-md border border-gray-100 bg-SilverPlate/30 p-4">
                    <p className="text-sm font-maison-neue text-Charcoal/55">
                      No staff actions recorded yet.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
