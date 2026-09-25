"use client"

import { useEffect, useState } from "react"
import {
  getStaffInstitutionalCollection,
  type StaffInstitutionalCollection,
} from "@lib/data/staff/institutional-collection"

const money = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(cents / 100)

const labels: Record<StaffInstitutionalCollection["status"], string> = {
  disabled: "Unavailable",
  accepted_on_terms: "Accepted on terms; invoice not yet posted",
  invoice_outstanding: "Invoice outstanding",
  collection_pending: "Collection pending QuickBooks confirmation",
  collection_confirmed: "Collection confirmed; invoice balance pending readback",
  reconciled: "Reconciled with QuickBooks invoice",
  cancelled: "Unposted commitment cancelled",
  quarantined: "On reconciliation hold",
}

export default function InstitutionalCollectionStatus({ orderId }: { orderId: string }) {
  const [result, setResult] = useState<StaffInstitutionalCollection | null>(null)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setResult(null)
    setError(false)
    getStaffInstitutionalCollection(orderId)
      .then((value) => { if (active) setResult(value) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [orderId, refresh])

  if (result?.status === "disabled") return null

  return (
    <section className="rounded-md border border-gray-200 bg-SilverPlate/25 p-4 text-sm font-maison-neue text-Charcoal">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-rexton font-bold uppercase tracking-normal">Invoice collection</h3>
        <button type="button" onClick={() => setRefresh((value) => value + 1)}
          className="underline underline-offset-2 hover:text-Charcoal/70">
          Refresh collection status
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-red-700" role="alert">
          Collection source is unavailable. Keep the invoice on reconciliation hold.
        </p>
      ) : !result ? (
        <p className="mt-2 text-Charcoal/60" role="status">Checking exact QuickBooks invoice…</p>
      ) : (
        <div className="mt-2 space-y-1">
          <p className={result.status === "quarantined" ? "font-semibold text-red-700" : "font-semibold"}>
            {labels[result.status]}
          </p>
          {result.invoiceTxnId && <p>QuickBooks invoice TxnID: {result.invoiceTxnId}</p>}
          {result.collection && (
            <>
              <p>Confirmed collection: {money(result.collection.confirmedCollectedCents)}</p>
              <p>Confirmed credit: {money(result.collection.confirmedCreditCents)}</p>
              <p>Verified remaining A/R: {result.collection.verifiedRemainingCents === null
                ? "Pending exact QuickBooks readback"
                : money(result.collection.verifiedRemainingCents)}</p>
              <p>Confirmed receipt count: {result.collection.appliedReceiptCount}</p>
            </>
          )}
          {result.source && (
            <p className="text-Charcoal/60">
              Source read: {result.source.lastSuccess}. Revision: {result.source.revision}.
            </p>
          )}
          {(result.reason || result.collection?.quarantineReasons.length) ? (
            <p className="text-red-700" role="alert">
              Reconciliation needs review. Do not treat a pending payment or credit as collected.
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
