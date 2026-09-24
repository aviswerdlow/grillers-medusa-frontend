"use client"

import { useEffect, useState } from "react"
import {
  getStaffInstitutionalTerms,
  type StaffInstitutionalTerms,
} from "@lib/data/staff/institutional-terms"

const money = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
}).format(cents / 100)

export default function InstitutionalTermsStatus({ customerId }: { customerId: string }) {
  const [status, setStatus] = useState<StaffInstitutionalTerms | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    setStatus(null)
    setError(false)
    getStaffInstitutionalTerms(customerId)
      .then((result) => { if (active) setStatus(result) })
      .catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [customerId])

  if (status?.status === "disabled") return null

  return (
    <div className="mb-5 rounded-lg border border-gray-200 bg-SilverPlate/25 p-4 text-sm font-maison-neue text-Charcoal">
      <p className="font-rexton font-bold uppercase tracking-normal">Institutional invoice terms</p>
      {error ? (
        <p className="mt-2 text-red-700" role="alert">Account status could not be verified. Keep this order on card payment.</p>
      ) : !status ? (
        <p className="mt-2 text-Charcoal/60" role="status">Checking QuickBooks account source…</p>
      ) : (
        <div className="mt-2 space-y-1">
          <p>
            {status.status === "approved" ? "Approved in current QuickBooks read" :
              status.status === "held" ? "On review hold" : "Not approved for invoice terms"}
          </p>
          {status.reason && <p className="text-Charcoal/60">Reason: {status.reason.replaceAll("_", " ")}</p>}
          {status.account && (
            <>
              <p>QuickBooks customer ListID: {status.account.customerListId}</p>
              <p>{status.account.approvalField}: {status.account.approvalValue ?? "unverified"}</p>
              <p>Terms: {status.account.termsName ?? "unverified"}</p>
              <p>Credit limit: {status.account.creditLimitCents === null ? "unverified" : money(status.account.creditLimitCents)}</p>
              <p>QuickBooks open invoices: {money(status.account.openInvoiceCents)}</p>
            </>
          )}
          {status.source && (
            <p className="text-Charcoal/60">
              Last successful read: {status.source.lastSuccess}. Revision: {status.source.revision}.
            </p>
          )}
          <p className="text-Charcoal/60">
            Open invoices exclude unposted order commitments. Confirm the server credit check before release.
          </p>
        </div>
      )}
    </div>
  )
}
