"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DatabaseZap,
  RefreshCw,
  Search,
} from "lucide-react"
import {
  getStaffQuickBooksSyncStatus,
  requeueStaffQuickBooksSyncOrder,
  type StaffQuickBooksSyncOrder,
  type StaffQuickBooksSyncStatus,
  type StaffQuickBooksSyncStatusFilter,
} from "@lib/data/staff/quickbooks-sync"

import { quickBooksSessionView } from "@lib/util/quickbooks-session-health"

const STATUS_FILTERS: Array<{
  key: StaffQuickBooksSyncStatusFilter
  label: string
}> = [
  { key: "open", label: "Open" },
  { key: "stuck", label: "Stuck" },
  { key: "waiting", label: "Waiting" },
  { key: "error", label: "Errors" },
  { key: "synced", label: "Synced" },
  { key: "all", label: "All" },
]

function labelClass() {
  return "text-xs font-maison-neue-mono uppercase text-Charcoal/55"
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Invalid timestamp"
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)
}

function formatMoney(value?: number | string | null, currencyCode = "usd") {
  if (value === null || value === undefined || value === "") return ""
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return ""

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(numeric)
}

function humanStatus(status: string) {
  const normalized = status.replace(/_/g, " ")
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function statusClass(status: string) {
  if (status === "synced")
    return "border-emerald-200 bg-emerald-50 text-emerald-800"
  if (status === "waiting_for_web_connector" || status === "pending") {
    return "border-blue-200 bg-blue-50 text-blue-800"
  }
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-800"
  if (status === "canceled_before_qb")
    return "border-gray-200 bg-gray-50 text-Charcoal/60"
  return "border-red-200 bg-red-50 text-red-800"
}

function statusIcon(status: string) {
  if (status === "synced") return CheckCircle2
  if (status === "waiting_for_web_connector" || status === "pending") {
    return Clock3
  }
  return AlertTriangle
}

function fulfillmentLabel(value?: string | null) {
  if (!value) return "Fulfillment unknown"
  return humanStatus(value)
}

function taxSummary(order: StaffQuickBooksSyncOrder) {
  const parts = [
    order.qbd_tax_county,
    order.qbd_tax_rate ? `${order.qbd_tax_rate}%` : "",
    order.qbd_tax_item_full_name ? `QBD ${order.qbd_tax_item_full_name}` : "",
  ].filter(Boolean)

  return parts.length ? parts.join(" | ") : "Tax mapping not recorded"
}

function orderTitle(order: StaffQuickBooksSyncOrder) {
  if (order.display_id) return `#${order.display_id}`
  if (order.medusa_id) return order.medusa_id
  return `Sync row ${order.id}`
}

function orderSubtext(order: StaffQuickBooksSyncOrder) {
  const customer = order.customer_name || order.email || "Customer unknown"
  const email = order.customer_name && order.email ? ` | ${order.email}` : ""
  return `${customer}${email}`
}

function SummaryTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: number | null
  tone?: "neutral" | "danger" | "warning" | "success"
}) {
  const toneClass =
    value === null
      ? "border-gray-200 bg-white text-Charcoal"
      : tone === "danger"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-gray-200 bg-white text-Charcoal"

  return (
    <div className={`rounded-md border px-3 py-3 ${toneClass}`}>
      <p className="text-[11px] font-maison-neue-mono uppercase opacity-70">
        {label}
      </p>
      <p
        className={`mt-1 font-maison-neue font-semibold ${
          value === null ? "text-base" : "text-2xl"
        }`}
      >
        {value === null ? "Unavailable" : value}
      </p>
    </div>
  )
}

function canRequeue(order: StaffQuickBooksSyncOrder) {
  return Boolean(
    !order.qb_synced_at &&
      order.status !== "synced" &&
      order.status !== "canceled_before_qb"
  )
}

function OrderRow({
  order,
  isRequeueing,
  onRequeue,
}: {
  order: StaffQuickBooksSyncOrder
  isRequeueing: boolean
  onRequeue: (order: StaffQuickBooksSyncOrder) => void
}) {
  const Icon = statusIcon(order.status)
  const amount = formatMoney(order.total, order.currency_code || "usd")

  return (
    <article className="rounded-md border border-gray-200 bg-white p-4">
      <div className="flex flex-col gap-3 large:flex-row large:items-start large:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-maison-neue text-lg font-semibold text-Charcoal">
              {orderTitle(order)}
            </h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-maison-neue-mono uppercase ${statusClass(
                order.status
              )}`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {humanStatus(order.status)}
            </span>
          </div>
          <p className="mt-1 break-words text-sm font-maison-neue text-Charcoal/65">
            {orderSubtext(order)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-maison-neue text-Charcoal/65">
            <span>{order.item_count || 0} items</span>
            {amount && <span>{amount}</span>}
            <span>{fulfillmentLabel(order.fulfillment_type)}</span>
            {order.scheduled_date && <span>{order.scheduled_date}</span>}
            {order.fulfillment_zip && <span>ZIP {order.fulfillment_zip}</span>}
          </div>
        </div>
        <div className="min-w-[180px] rounded-md border border-gray-200 bg-SilverPlate/25 px-3 py-2">
          <p className={labelClass()}>QuickBooks</p>
          <p className="mt-1 text-sm font-maison-neue text-Charcoal">
            {order.qb_txn_number
              ? `Txn ${order.qb_txn_number}`
              : order.qb_txn_id
              ? "Txn ID recorded"
              : "Not in QuickBooks yet"}
          </p>
          <p className="mt-1 text-xs font-maison-neue text-Charcoal/55">
            Updated {formatDateTime(order.updated_at)}
          </p>
          {canRequeue(order) && (
            <button
              className="mt-3 inline-flex min-h-[36px] w-full items-center justify-center gap-2 rounded-md border border-Charcoal px-3 text-xs font-maison-neue-mono uppercase text-Charcoal transition hover:bg-Charcoal hover:text-white disabled:cursor-wait disabled:opacity-50"
              disabled={isRequeueing}
              onClick={() => onRequeue(order)}
              type="button"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRequeueing ? "animate-spin" : ""}`}
                aria-hidden
              />
              Retry
            </button>
          )}
        </div>
      </div>

      {order.item_titles?.length ? (
        <p className="mt-3 truncate text-sm font-maison-neue text-Charcoal/75">
          {order.item_titles.join(", ")}
        </p>
      ) : null}

      <div className="mt-3 rounded-md bg-SilverPlate/30 px-3 py-2 text-xs font-maison-neue text-Charcoal/65">
        {taxSummary(order)}
      </div>

      {order.error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-maison-neue text-red-800">
          {order.error}
        </div>
      )}
    </article>
  )
}

export default function StaffQuickBooksSyncStatusConsole() {
  const [filter, setFilter] = useState<StaffQuickBooksSyncStatusFilter>("open")
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<StaffQuickBooksSyncStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [requeueingId, setRequeueingId] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef(0)
  const [receivedAt, setReceivedAt] = useState(0)
  const [clock, setClock] = useState(() => Date.now())
  const perPage = 20

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedQuery(query.trim())
      setPage(1)
    }, 350)
    return () => clearTimeout(timeout)
  }, [query])

  function load() {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setError(null)

    startTransition(async () => {
      try {
        const next = await getStaffQuickBooksSyncStatus({
          status: filter,
          search: debouncedQuery,
          page,
          perPage,
        })
        if (requestId !== requestIdRef.current) return
        setReceivedAt(Date.now())
        setClock(Date.now())
        setData(next)
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        setData(null)
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  useEffect(() => {
    load()
    const poll = setInterval(load, 60_000)
    return () => {
      clearInterval(poll)
      requestIdRef.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debouncedQuery, page])

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  function requeue(order: StaffQuickBooksSyncOrder) {
    if (requeueingId) return
    setError(null)
    setStatusMessage(null)
    setRequeueingId(order.id)

    startTransition(async () => {
      try {
        await requeueStaffQuickBooksSyncOrder(
          order.id,
          `Retry QuickBooks sync row ${orderTitle(order)} from staff console.`
        )
        setStatusMessage(`${orderTitle(order)} was requeued for Web Connector.`)
        load()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setRequeueingId(null)
      }
    })
  }

  const orders = data?.orders.data || []
  const syncStatus = data?.sync_status
  const activeSummary = useMemo(() => data?.summary, [data])
  const health = syncStatus?.health
  const sessionView = quickBooksSessionView(health, clock - receivedAt)
  const qbwcConfiguration = syncStatus?.qbwc_configuration
  const qbwcWarnings = qbwcConfiguration?.warnings?.filter(Boolean) || []

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-5">
        <div className="flex flex-col gap-4 large:flex-row large:items-start large:justify-between">
          <div>
            <p className="text-xs font-maison-neue-mono uppercase text-Gold">
              Admin tools
            </p>
            <h2 className="mt-1 text-2xl font-gyst font-bold text-Charcoal">
              Synchronization status
            </h2>
            <p className="mt-2 max-w-3xl text-sm font-maison-neue text-Charcoal/60">
              View website orders waiting for QuickBooks, stuck errors, recent
              Web Connector activity, and the reason a row needs attention.
            </p>
          </div>
          <button
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-Charcoal px-4 text-sm font-maison-neue font-semibold text-Charcoal transition hover:bg-Charcoal hover:text-white disabled:cursor-wait disabled:opacity-50"
            disabled={isPending}
            onClick={load}
            type="button"
          >
            <RefreshCw
              className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
              aria-hidden
            />
            Refresh
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 large:grid-cols-5">
          <SummaryTile label="Open" value={activeSummary?.open ?? null} />
          <SummaryTile
            label="Waiting"
            value={activeSummary?.waiting ?? null}
            tone="neutral"
          />
          <SummaryTile
            label="Stuck"
            value={
              activeSummary
                ? activeSummary.blocked +
                  activeSummary.error +
                  activeSummary.warning +
                  activeSummary.stale_pending
                : null
            }
            tone="danger"
          />
          <SummaryTile
            label="Skipped"
            value={activeSummary?.skipped ?? null}
            tone="warning"
          />
          <SummaryTile
            label="Recorded synced"
            value={activeSummary?.synced ?? null}
            tone="success"
          />
        </div>

        <div
          className={`mt-4 rounded-md border px-4 py-3 ${
            sessionView.state === "fresh"
              ? "border-gray-200 bg-SilverPlate/25"
              : "border-amber-300 bg-amber-50"
          }`}
        >
          <div role="status" aria-live="polite">
            <h3 className="text-sm font-maison-neue font-semibold text-Charcoal">
              {sessionView.title}
            </h3>
          </div>
          <div className="mt-2 space-y-1 text-xs font-maison-neue text-Charcoal/70">
            <p>
              Last sign-in attempt: {formatDateTime(health?.last_auth_at)} ·{" "}
              {health?.last_auth_status || "unknown"}
            </p>
            <p>
              Last accepted sign-in:{" "}
              {formatDateTime(health?.last_accepted_auth_at)}
            </p>
            <p>
              Status checked: {formatDateTime(health?.observed_at)}. All times
              UTC.
            </p>
            {health && (
              <p>
                A session becomes stale after {health.max_age_seconds / 60}{" "}
                minutes without a new accepted sign-in.
              </p>
            )}
            {sessionView.state !== "fresh" && (
              <p className="font-semibold">
                {health?.issue ||
                  "Current activity is unconfirmed. Refresh and check Web Connector with the sync operator."}
              </p>
            )}
            {syncStatus?.current_step && (
              <p>Last reported step: {humanStatus(syncStatus.current_step)}</p>
            )}
            <p>
              Sign-in does not prove a completed session or a posted order.
              Check each order’s QuickBooks transaction and accounting-action
              receipt separately.
            </p>
            <p>
              Monitoring owner: {health?.owner || "Not recorded"}. Monitor last
              checked: {formatDateTime(health?.monitor?.checked_at)}.
            </p>
            {health?.monitor?.delivery === "pending" && (
              <p className="font-semibold">
                The monitoring alert has not been accepted. Contact the sync
                operator.
              </p>
            )}
            {health?.monitor?.last_sink_accepted_at && (
              <p>
                Monitoring event accepted:{" "}
                {formatDateTime(health.monitor.last_sink_accepted_at)}. Confirm
                that the responsible operator received it.
              </p>
            )}
            {health?.monitor?.last_recovered_at && (
              <p>
                Session freshness recovered:{" "}
                {formatDateTime(health.monitor.last_recovered_at)}. Check queued
                work separately.
              </p>
            )}
          </div>
          {qbwcConfiguration?.username && (
            <p className="mt-1 text-xs font-maison-neue text-Charcoal/55">
              Configured Web Connector user: {qbwcConfiguration.username}
            </p>
          )}
          {qbwcWarnings.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <div className="flex gap-2">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
                  aria-hidden
                />
                <div className="space-y-1">
                  <p className="text-sm font-maison-neue font-semibold text-amber-900">
                    Web Connector needs attention
                  </p>
                  {qbwcWarnings.map((warning) => (
                    <p
                      className="text-xs font-maison-neue text-amber-900/80"
                      key={warning}
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-b border-gray-100 p-5">
        <div className="grid gap-3 large:grid-cols-[minmax(0,1fr)_auto] large:items-end">
          <label className="flex flex-col gap-1">
            <span className={labelClass()}>Order, email, or error</span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-Charcoal/45"
                aria-hidden
              />
              <input
                className="min-h-[44px] w-full rounded-md border border-gray-200 bg-white px-10 py-2 text-sm font-maison-neue text-Charcoal outline-none transition focus:border-Gold focus:ring-1 focus:ring-Gold"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Order #, email, customer, ZIP, tax item, or error"
                type="search"
                value={query}
              />
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((item) => {
              const active = item.key === filter
              return (
                <button
                  className={`min-h-[40px] rounded-md border px-3 text-xs font-maison-neue-mono uppercase transition ${
                    active
                      ? "border-Charcoal bg-Charcoal text-white"
                      : "border-gray-200 bg-white text-Charcoal hover:border-Charcoal"
                  }`}
                  key={item.key}
                  onClick={() => {
                    setFilter(item.key)
                    setPage(1)
                  }}
                  type="button"
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="m-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-maison-neue text-red-800">
          {error}
        </div>
      )}
      {statusMessage && !error && (
        <div className="m-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-maison-neue text-emerald-800">
          {statusMessage}
        </div>
      )}

      <div className="space-y-3 p-5">
        {orders.length ? (
          orders.map((order) => (
            <OrderRow
              isRequeueing={requeueingId === order.id}
              key={order.id}
              onRequeue={requeue}
              order={order}
            />
          ))
        ) : (
          <div className="rounded-md border border-dashed border-gray-200 bg-SilverPlate/20 px-4 py-10 text-center">
            <DatabaseZap
              className="mx-auto h-8 w-8 text-Charcoal/35"
              aria-hidden
            />
            <h3 className="mt-3 font-maison-neue text-lg font-semibold text-Charcoal">
              {data ? "No orders in this view" : "Queue status unavailable"}
            </h3>
            <p className="mt-1 text-sm font-maison-neue text-Charcoal/55">
              {data
                ? "Change the filter or search text to inspect another part of the QuickBooks queue."
                : "A successful status read is needed before the queue can be assessed."}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 small:flex-row small:items-center small:justify-between">
        <p className="text-sm font-maison-neue text-Charcoal/60">
          {data
            ? `Showing page ${data.orders.current_page} of ${Math.max(
                data.orders.last_page,
                1
              )} | ${data.orders.total} rows`
            : "Queue counts unavailable"}
        </p>
        <div className="flex gap-2">
          <button
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-maison-neue font-semibold text-Charcoal transition hover:border-Charcoal disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!data || page <= 1 || isPending}
            onClick={() => setPage((current) => Math.max(current - 1, 1))}
            type="button"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Previous
          </button>
          <button
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-md border border-gray-200 px-3 text-sm font-maison-neue font-semibold text-Charcoal transition hover:border-Charcoal disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!data?.orders.has_more_pages || isPending}
            onClick={() => setPage((current) => current + 1)}
            type="button"
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  )
}
