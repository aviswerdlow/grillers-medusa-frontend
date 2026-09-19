import type { StaffExceptionOrderDetail } from "@lib/data/staff/order-exceptions"

export function accountingActionLabel(action: string) {
  const labels: Record<string, string> = {
    final_card_charge_accounting_record: "Final card charge", invoice_ar_accounting_record: "Invoice on account",
    card_refund_accounting_record: "Card refund", payment_capture_accounting_record: "Card payment",
    issue_account_credit: "Account credit", close_sales_order: "Cancel sales order", append_order_note: "Staff note",
    update_sales_order_items: "Order item changes", record_offline_payment: "Offline payment", pending_check_refund: "Check refund",
  }
  return labels[action] || "Accounting adjustment"
}

export default function AccountingHistory({ actions = [], error }: {
  actions?: StaffExceptionOrderDetail["accountingActions"]; error?: string
}) {
  const statuses: Record<string, string> = { pending: "Waiting to send", delivered: "Awaiting QuickBooks",
    posted: "Recorded", failed: "Needs review", blocked: "Blocked" }
  return (
    <section className="min-w-0 rounded-md border border-gray-100 p-4" aria-label="Accounting action history">
      <h3 className="text-sm font-maison-neue font-semibold text-Charcoal">Accounting actions</h3>
      <p className="mt-1 text-sm text-Charcoal/65">Check each charge and refund separately. An action is recorded only after its accounting receipt is confirmed.</p>
      {error ? <p role="alert" className="mt-2 text-sm text-amber-800">{error}</p> : (
        <ul className="mt-3 grid max-h-96 gap-3 overflow-y-auto">
          {actions.map((row) => {
            const currency = row.currency_code.toUpperCase()
            const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency })
            const precision = formatter.resolvedOptions().maximumFractionDigits ?? 2
            return (
              <li key={row.id} className="min-w-0 border-t border-gray-100 pt-2 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{accountingActionLabel(row.action)} · {formatter.format(Number(row.amount_minor) / 10 ** precision)}</p>
                  <p>{row.receipt?.no_effect_reason === "note_merged_into_pending_sales_order" ? "Saved for sales order" : statuses[row.status] || "Needs review"}</p>
                </div>
                {row.last_error && <p className="mt-1 text-amber-800">{row.last_error}</p>}
                <details className="mt-1 text-Charcoal/65">
                  <summary className="cursor-pointer py-2">Accounting references</summary>
                  <p className="break-all">Request: {row.request_key}</p>
                  {row.depends_on_request_key && <p className="break-all">Preceding action: {row.depends_on_request_key}</p>}
                  {row.receipt?.transactions?.map((receipt) => <p className="break-all" key={`${receipt.kind}:${receipt.txn_id}`}>{receipt.kind}: {receipt.txn_id}</p>)}
                </details>
              </li>
            )
          })}
          {!actions.length && <li className="text-Charcoal/65">No durable accounting actions recorded. Older pending requests require reconciliation.</li>}
        </ul>
      )}
    </section>
  )
}
