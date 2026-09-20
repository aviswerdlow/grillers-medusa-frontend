"use client"
import { FormEvent, useEffect, useId, useRef, useState } from "react"
import {
  getIncomingExceptions,
  getIncomingStock,
  saveIncomingStock,
  searchIncomingProducts,
} from "@lib/data/staff/incoming-stock"
import type {
  IncomingAction,
  IncomingBatch,
  IncomingCommand,
  IncomingDemand,
  IncomingProduct,
  IncomingQueue,
  IncomingResult,
  IncomingStockView,
} from "@lib/data/staff/incoming-stock-types"
import {
  incomingExceptionLabel,
  RECEIVING_TIMEZONES,
  receivingDisplay,
  receivingLocal,
} from "@lib/util/incoming-stock"

const field =
  "min-h-11 w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-Charcoal disabled:bg-gray-100"
const button =
  "inline-flex min-h-11 items-center justify-center rounded border border-Charcoal px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
const statusNames = {
  draft: "Unconfirmed",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  receipt_pending: "Receipt awaiting reconciliation",
}
const actionNames: Record<IncomingAction, string> = {
  create: "Record expected batch",
  confirm: "Confirm incoming quantity",
  revise: "Revise confirmed batch",
  cancel: "Cancel batch",
  stage_receipt: "Record final receipt",
}
type Pending = { product: IncomingProduct; command: IncomingCommand }
type Draft = {
  action: IncomingAction
  batch?: IncomingBatch
  quantity: string
  usable: string
  stockUnit: string
  sourceSystem: string
  sourceRef: string
  reason: string
  finalReceipt: boolean
}
const emptyDraft = (): Draft => ({
  action: "create",
  quantity: "",
  usable: "",
  stockUnit: "",
  sourceSystem: "",
  sourceRef: "",
  reason: "",
  finalReceipt: false,
})

export default function IncomingStockConsole({
  actorId,
  initialQueue,
}: {
  actorId: string
  initialQueue: IncomingResult<IncomingQueue>
}) {
  const prefix = useId(),
    storageKey = `gp-incoming-pending:${actorId}`
  const [queue, setQueue] = useState<IncomingQueue | null>(
    initialQueue.ok ? initialQueue.data : null
  )
  const [queueError, setQueueError] = useState(
    initialQueue.ok ? "" : initialQueue.error
  )
  const [search, setSearch] = useState(""),
    [products, setProducts] = useState<IncomingProduct[]>([])
  const [product, setProduct] = useState<IncomingProduct | null>(null),
    [stock, setStock] = useState<IncomingStockView | null>(null)
  const [timezone, setTimezone] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null)
  const [pending, setPending] = useState<Pending | null>(null),
    [uncertain, setUncertain] = useState(false)
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false)
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("")
  const searchVersion = useRef(0),
    productVersion = useRef(0),
    sending = useRef(false)
  const productHeading = useRef<HTMLHeadingElement>(null)
  const changeHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (stock) productHeading.current?.focus()
  }, [stock])
  useEffect(() => {
    if (draft) changeHeading.current?.focus()
  }, [draft?.action, draft?.batch?.id])
  const writable = stock?.can_manage === true && !uncertain && !loading && !busy
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return
      const saved = JSON.parse(raw) as Pending
      if (!saved?.command?.request_id || !saved?.product?.variant_id) return
      setPending(saved)
      setProduct(saved.product)
      setUncertain(true)
      setTimezone(saved.command.timezone || "")
      setError(
        "A receiving request may still need confirmation. Retry the saved request before starting another change."
      )
    } catch {
      setError(
        "The saved receiving request could not be read. Ask the receiving owner to reconcile it before recording another change."
      )
      setUncertain(true)
    }
  }, [storageKey])
  async function refreshQueue(append = false) {
    try {
      const result = await getIncomingExceptions(
        append ? queue?.next_cursor || undefined : undefined
      )
      if (!result.ok) {
        setQueueError(result.error)
        return
      }
      setQueue((prev) => ({
        ...result.data,
        demands: append
          ? [...(prev?.demands || []), ...result.data.demands].filter(
              (row, index, all) =>
                all.findIndex((x) => x.id === row.id) === index
            )
          : result.data.demands,
      }))
      setQueueError("")
    } catch {
      setQueueError(
        "The affected-order list could not be refreshed. Existing rows may be out of date."
      )
    }
  }
  async function loadProduct(next: IncomingProduct) {
    const version = ++productVersion.current
    setProduct(next)
    setStock(null)
    setDraft(null)
    setError("")
    setNotice("")
    setLoading(true)
    try {
      const result = await getIncomingStock(next.variant_id)
      if (version !== productVersion.current) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      setStock(result.data)
    } catch {
      if (version === productVersion.current)
        setError(
          "Stock records could not be refreshed. No changes are available until they load."
        )
    } finally {
      if (version === productVersion.current) setLoading(false)
    }
  }
  async function runSearch(event: FormEvent) {
    event.preventDefault()
    const version = ++searchVersion.current
    setError("")
    setProducts([])
    try {
      const result = await searchIncomingProducts(search)
      if (version !== searchVersion.current) return
      if (!result.ok) setError(result.error)
      else {
        setProducts(result.data)
        if (!result.data.length) setNotice("No matching products found.")
      }
    } catch {
      if (version === searchVersion.current)
        setError("Product search could not be completed.")
    }
  }
  function begin(action: IncomingAction, batch?: IncomingBatch) {
    setError("")
    setNotice("")
    setDraft({
      ...emptyDraft(),
      action,
      batch,
      quantity: batch
        ? String(
            batch.status === "draft"
              ? batch.expected_quantity
              : batch.confirmed_quantity
          )
        : "",
      usable:
        batch && timezone ? receivingLocal(batch.usable_at, timezone) : "",
      stockUnit: batch?.stock_unit || "",
    })
  }
  async function send(request: Pending) {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await saveIncomingStock(request.command)
      if (!result.ok) {
        setError(result.error)
        setUncertain(result.uncertain === true)
        if (!result.uncertain) {
          sessionStorage.removeItem(storageKey)
          setPending(null)
        }
        return
      }
      sessionStorage.removeItem(storageKey)
      setPending(null)
      setUncertain(false)
      setDraft(null)
      await loadProduct(request.product)
      await refreshQueue()
      setNotice(
        result.data.receipt_pending
          ? "Final receipt recorded. It is awaiting reconciliation; usable stock has not increased."
          : `Receiving change recorded.${
              result.data.affected_count
                ? ` ${result.data.affected_count} affected order or cart commitments need review.`
                : ""
            }`
      )
    } catch {
      setUncertain(true)
      setError(
        "The save result is uncertain. Retry this same request; do not record it as another batch or receipt."
      )
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!product || !draft || !writable || sending.current) return
    const request: Pending = {
      product,
      command: {
        action: draft.action,
        request_id: crypto.randomUUID(),
        variant_id: product.variant_id,
        reason: draft.reason,
        batch_id: draft.batch?.id,
        expected_revision: draft.batch?.revision,
        stock_unit: draft.stockUnit,
        source_system: draft.sourceSystem,
        source_ref: draft.sourceRef,
        quantity: Number(draft.quantity),
        usable_local: draft.usable,
        timezone,
        receipt_final_confirmed: draft.finalReceipt,
      },
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(request))
    } catch {
      setError(
        "This browser could not preserve the request for a safe retry. Enable session storage before saving."
      )
      return
    }
    setPending(request)
    await send(request)
  }
  const set = (key: keyof Draft, value: string | boolean) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  const exceptions = (rows: IncomingDemand[], allowSelection: boolean) => (
    <ul className="divide-y divide-gray-200">
      {rows.map((row) => (
        <li key={row.id} className="py-4">
          <p className="font-semibold">
            {incomingExceptionLabel(row.exception_reason)}
          </p>
          <p className="mt-1 text-sm">
            {row.product_title || product?.title || "Product needs review"}
            {row.sku ? ` · ${row.sku}` : ""}
          </p>
          <p className="mt-1 text-sm">
            {row.remaining_quantity} {row.stock_unit} · Customer date{" "}
            {row.customer_date.slice(0, 10)} · Needed for preparation:{" "}
            {receivingDisplay(row.needed_by, timezone)}
          </p>
          <p className="mt-1 break-all text-xs text-gray-600">
            {row.order_id ? `Order: ${row.order_id}` : `Cart: ${row.cart_id}`} ·
            Line: {row.line_item_id}
          </p>
          <p className="mt-2 text-sm">
            Contact the receiving owner and order-support team. Keep the
            original promise until an approved correction is recorded.
          </p>
          {allowSelection && (
            <button
              className={`${button} mt-3`}
              disabled={busy || uncertain}
              onClick={() =>
                loadProduct({
                  variant_id: row.variant_id,
                  title: row.product_title || "Product needs review",
                  sku: row.sku || "",
                })
              }
            >
              Review incoming stock
            </button>
          )}
        </li>
      ))}
    </ul>
  )
  return (
    <div className="mt-4 space-y-8 font-maison-neue text-Charcoal">
      <header>
        <h1 className="text-3xl font-semibold">Incoming stock</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-700">
          Record what is expected, confirm what is dependable, and review orders
          affected by a shortage or delay.
        </p>
        <p className="mt-4 border-l-2 border-amber-500 pl-3 text-sm">
          Future ordering is not enabled. Recorded receipts remain unavailable
          until stock reconciliation is complete.
        </p>
      </header>
      <label className="block max-w-sm text-sm font-semibold">
        Receiving timezone
        <select
          className={`${field} mt-1`}
          value={timezone}
          disabled={busy || uncertain || !!draft}
          onChange={(e) => setTimezone(e.target.value)}
        >
          <option value="">Choose the receiving timezone</option>
          {RECEIVING_TIMEZONES.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="border-l-2 border-red-600 pl-3 text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {uncertain && (
        <section
          aria-label="Unconfirmed receiving request"
          className="border border-amber-400 p-4"
        >
          <h2 className="font-semibold">Check the last request</h2>
          <p className="mt-2 text-sm">
            Other changes are paused. The same saved request can be retried
            without recording it twice.
          </p>
          {pending && (
            <>
              <p className="mt-2 text-sm">
                {actionNames[pending.command.action]} · {pending.product.title}
              </p>
              <button
                className={`${button} mt-3`}
                disabled={busy}
                onClick={() => send(pending)}
              >
                {busy ? "Checking…" : "Retry saved request"}
              </button>
            </>
          )}
        </section>
      )}
      <section
        aria-labelledby={`${prefix}-queue`}
        className="border-t border-gray-200 pt-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id={`${prefix}-queue`} className="text-xl font-semibold">
            Affected orders and carts
          </h2>
          <button
            className={button}
            disabled={busy}
            onClick={() => refreshQueue()}
          >
            Refresh affected orders
          </button>
        </div>
        {queueError && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {queueError}
          </p>
        )}
        {queue?.demands.length
          ? exceptions(queue.demands, true)
          : !queueError && (
              <p className="mt-3 text-sm text-gray-600">
                No unresolved incoming-stock exceptions.
              </p>
            )}
        {queue?.next_cursor && (
          <button
            className={`${button} mt-3`}
            onClick={() => refreshQueue(true)}
          >
            Load more affected orders
          </button>
        )}
      </section>
      <section
        aria-labelledby={`${prefix}-product`}
        className="border-t border-gray-200 pt-6"
      >
        <h2 id={`${prefix}-product`} className="text-xl font-semibold">
          Review a product
        </h2>
        <form
          onSubmit={runSearch}
          className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-end"
        >
          <label className="w-full max-w-lg text-sm font-semibold">
            Product name or SKU
            <input
              type="search"
              required
              minLength={2}
              maxLength={100}
              className={`${field} mt-1`}
              value={search}
              disabled={busy || uncertain}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button className={button} disabled={busy || uncertain}>
            Search products
          </button>
        </form>
        {!!products.length && (
          <ul className="mt-3 divide-y divide-gray-200">
            {products.map((item) => (
              <li key={item.variant_id}>
                <button
                  className="min-h-11 w-full py-3 text-left underline focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
                  disabled={busy || uncertain}
                  onClick={() => loadProduct(item)}
                >
                  {item.title}
                  <span className="ml-2 text-xs text-gray-600">{item.sku}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {product && (
        <section
          aria-labelledby={`${prefix}-selected`}
          className="border-t border-gray-200 pt-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                ref={productHeading}
                tabIndex={-1}
                id={`${prefix}-selected`}
                className="text-xl font-semibold"
              >
                {product.title}
              </h2>
              <p className="text-sm text-gray-600">{product.sku}</p>
            </div>
            <button
              className={button}
              disabled={busy || uncertain || loading}
              onClick={() => loadProduct(product)}
            >
              Refresh product
            </button>
          </div>
          {loading && (
            <p role="status" className="mt-4 text-sm">
              Loading incoming stock…
            </p>
          )}
          {stock && (
            <>
              <p className="mt-3 text-sm">
                {stock.can_manage
                  ? "Your receiving access is confirmed. Every change records your identity and reason."
                  : "You can review these records. An approved receiving operator must make changes."}
              </p>
              <div
                className="mt-4 overflow-x-auto"
                tabIndex={0}
                aria-label="Incoming batches table"
              >
                <table className="w-full min-w-[680px] text-left text-sm">
                  <caption className="sr-only">
                    Expected, confirmed and committed incoming batches
                  </caption>
                  <thead className="border-b-2 border-Charcoal">
                    <tr>
                      {[
                        "Source",
                        "Status",
                        "Expected",
                        "Confirmed",
                        "Committed",
                        "Available",
                        "Usable time",
                        "Actions",
                      ].map((value) => (
                        <th key={value} scope="col" className="px-2 py-3">
                          {value}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stock.batches.map((batch) => (
                      <tr key={batch.id} className="border-b border-gray-200">
                        <th scope="row" className="px-2 py-3 font-normal">
                          <span className="block">{batch.source_ref}</span>
                          <span className="block text-xs text-gray-600">
                            {batch.source_system} · {batch.stock_unit}
                          </span>
                        </th>
                        <td className="px-2 py-3">
                          {statusNames[batch.status]}
                        </td>
                        <td className="px-2 py-3">{batch.expected_quantity}</td>
                        <td className="px-2 py-3">
                          {batch.confirmed_quantity}
                        </td>
                        <td className="px-2 py-3">
                          {batch.committed_quantity}
                        </td>
                        <td className="px-2 py-3">
                          {batch.available_quantity}
                        </td>
                        <td className="px-2 py-3">
                          {receivingDisplay(batch.usable_at, timezone)}
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex flex-wrap gap-2">
                            {batch.status === "draft" && (
                              <button
                                className={button}
                                disabled={!writable || !timezone}
                                onClick={() => begin("confirm", batch)}
                              >
                                Confirm
                              </button>
                            )}
                            {batch.status === "confirmed" && (
                              <>
                                <button
                                  className={button}
                                  disabled={!writable || !timezone}
                                  onClick={() => begin("revise", batch)}
                                >
                                  Revise
                                </button>
                                <button
                                  className={button}
                                  disabled={!writable || !timezone}
                                  onClick={() => begin("stage_receipt", batch)}
                                >
                                  Record receipt
                                </button>
                              </>
                            )}
                            {["draft", "confirmed"].includes(batch.status) && (
                              <button
                                className={button}
                                disabled={!writable}
                                onClick={() => begin("cancel", batch)}
                              >
                                Cancel batch
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!stock.batches.length && (
                <p className="mt-3 text-sm text-gray-600">
                  No incoming batches recorded for this product.
                </p>
              )}
              {stock.can_manage && (
                <button
                  className={`${button} mt-4`}
                  disabled={!writable || !timezone}
                  onClick={() => begin("create")}
                >
                  Add expected batch
                </button>
              )}
              {!timezone && (
                <p className="mt-3 text-sm">
                  Choose the receiving timezone before reviewing or entering
                  usable times.
                </p>
              )}
              {stock.receipts.length > 0 && (
                <div className="mt-5">
                  <h3 className="font-semibold">
                    Receipts awaiting reconciliation
                  </h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {stock.receipts.map((receipt) => (
                      <li key={receipt.id}>
                        {receipt.source_ref}: {receipt.quantity} recorded.
                        Usable stock has not increased. Do not enter another
                        adjustment for this receipt.
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!stock.demands.filter(
                (row) => row.exception_reason && row.remaining_quantity > 0
              ).length && (
                <div className="mt-5">
                  <h3 className="font-semibold">Commitments needing review</h3>
                  {exceptions(
                    stock.demands.filter(
                      (row) =>
                        row.exception_reason && row.remaining_quantity > 0
                    ),
                    false
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
      {draft && product && (
        <section
          className="border-t-2 border-Charcoal pt-6"
          aria-labelledby={`${prefix}-change`}
        >
          <h2
            ref={changeHeading}
            tabIndex={-1}
            id={`${prefix}-change`}
            className="text-xl font-semibold"
          >
            {actionNames[draft.action]}
          </h2>
          <p className="mt-1 text-sm">
            {product.title}
            {draft.batch ? ` · ${draft.batch.source_ref}` : ""}
          </p>
          {draft.action === "cancel" && (
            <p className="mt-3 text-sm">
              This removes the batch from future supply and flags affected
              commitments. It does not change customer dates or cancel their
              orders.
            </p>
          )}
          {draft.action === "stage_receipt" && (
            <p className="mt-3 text-sm">
              Record the final usable quantity, including a short delivery.
              Further deliveries must be reviewed separately. This records
              receipt evidence; stock remains unavailable until reconciliation.
            </p>
          )}
          <form onSubmit={submit} className="mt-4 max-w-2xl space-y-4">
            <fieldset
              disabled={busy || uncertain}
              className="grid gap-4 sm:grid-cols-2"
            >
              <legend className="sr-only">Receiving change details</legend>
              {draft.action !== "cancel" && (
                <>
                  <label className="text-sm font-semibold">
                    {draft.action === "create"
                      ? "Expected quantity"
                      : draft.action === "stage_receipt"
                      ? "Final usable quantity"
                      : "Confirmed quantity"}
                    <input
                      className={`${field} mt-1`}
                      type="number"
                      required
                      min={
                        draft.action === "create" ||
                        draft.action === "stage_receipt"
                          ? 0
                          : 1
                      }
                      step={1}
                      max={2147483647}
                      value={draft.quantity}
                      onChange={(e) => set("quantity", e.target.value)}
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Usable for preparation (
                    {
                      RECEIVING_TIMEZONES.find(
                        (zone) => zone.value === timezone
                      )?.label
                    }
                    )
                    <input
                      className={`${field} mt-1`}
                      type="datetime-local"
                      required
                      value={draft.usable}
                      onChange={(e) => set("usable", e.target.value)}
                    />
                  </label>
                </>
              )}
              {draft.action === "create" && (
                <label className="text-sm font-semibold">
                  Sellable stock unit
                  <input
                    className={`${field} mt-1`}
                    required
                    maxLength={80}
                    value={draft.stockUnit}
                    onChange={(e) => set("stockUnit", e.target.value)}
                  />
                  <span className="mt-1 block text-xs font-normal">
                    Use the receiving owner’s approved unit; do not convert
                    packs to pounds.
                  </span>
                </label>
              )}
              {["create", "stage_receipt"].includes(draft.action) && (
                <>
                  <label className="text-sm font-semibold">
                    Source record type
                    <input
                      className={`${field} mt-1`}
                      required
                      maxLength={200}
                      value={draft.sourceSystem}
                      onChange={(e) => set("sourceSystem", e.target.value)}
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    Unique source reference
                    <input
                      className={`${field} mt-1`}
                      required
                      maxLength={200}
                      value={draft.sourceRef}
                      onChange={(e) => set("sourceRef", e.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="text-sm font-semibold sm:col-span-2">
                Reason and evidence
                <textarea
                  className={`${field} mt-1`}
                  required
                  maxLength={1000}
                  rows={3}
                  value={draft.reason}
                  onChange={(e) => set("reason", e.target.value)}
                />
              </label>
              {draft.action === "stage_receipt" && (
                <label className="flex min-h-11 items-start gap-2 text-sm sm:col-span-2">
                  <input
                    className="mt-1"
                    type="checkbox"
                    required
                    checked={draft.finalReceipt}
                    onChange={(e) => set("finalReceipt", e.target.checked)}
                  />
                  This is the final delivery for this batch; no further
                  deliveries remain.
                </label>
              )}
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <button
                className={`${button} bg-Charcoal text-white`}
                disabled={!writable}
              >
                {busy ? "Saving…" : actionNames[draft.action]}
              </button>
              <button
                className={button}
                type="button"
                disabled={busy || uncertain}
                onClick={() => setDraft(null)}
              >
                Discard unsaved change
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  )
}
