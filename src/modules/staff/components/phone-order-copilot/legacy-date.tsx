"use client"

import { useEffect, useRef, useState } from "react"
import { saveLegacyStaffPhoneOrderDate } from "@lib/data/staff/order-entry"

export default function LegacyStaffOrderDate({ cartId, inventoryOverrideReview, onSaved }: {
  cartId: string
  inventoryOverrideReview: boolean
  onSaved: () => void | Promise<void>
}) {
  const [date, setDate] = useState("")
  const [window, setWindow] = useState("")
  const [reviewed, setReviewed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [cartId])
  return <div className="space-y-4">
    <p className="text-sm">Enter the date agreed with the customer using the current operating schedule.</p>
    <label className="block text-sm">Scheduled date
      <input className="mt-1 block min-h-[44px] rounded-md border p-2" type="date" value={date}
        disabled={saving} onChange={event => { setDate(event.target.value); setReviewed(false) }} />
    </label>
    <label className="block text-sm">Time window
      <input className="mt-1 block min-h-[44px] rounded-md border p-2" value={window}
        disabled={saving} onChange={event => setWindow(event.target.value)} />
    </label>
    {inventoryOverrideReview && <label className="flex min-h-[44px] items-center gap-2 text-sm">
      <input type="checkbox" checked={reviewed} disabled={saving} onChange={event => setReviewed(event.target.checked)} />
      I reviewed the inventory exceptions for this date.
    </label>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button type="button" className="min-h-[44px] rounded-md bg-Gold p-3 disabled:opacity-50"
      disabled={saving || !date || (inventoryOverrideReview && !reviewed)} onClick={async () => {
        setSaving(true)
        setError(null)
        try {
          const result = await saveLegacyStaffPhoneOrderDate({ cartId, date, timeWindow: window, staffOverrideConfirmed: reviewed })
          if (!active.current) return
          if (result.ok) await onSaved()
          else setError(result.error)
        } catch { setError("Could not save the order date. Please try again.") }
        finally { setSaving(false) }
      }}>
      {saving ? "Checking…" : "Save date and continue"}
    </button>
  </div>
}
