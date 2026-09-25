"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  assignLocalMilestoneDriver,
  getLocalMilestoneOrder,
  listLocalEvidence,
  listLocalMilestones,
  recordLocalMilestone,
  signLocalEvidence,
  type LocalEvidenceRecord,
  type LocalMilestone,
  type LocalMilestoneEvent,
  type LocalMilestoneState,
} from "@lib/data/staff/local-milestones"

type Detail = { state: LocalMilestoneState; events: LocalMilestoneEvent[] }
type Action = Exclude<LocalMilestone, "packed">

const names: Record<LocalMilestone, string> = {
  packed: "Packed",
  pickup_ready: "Ready for collection",
  pickup_collected: "Collected",
  local_dispatched: "Driver departed",
  local_delivered: "Delivered",
  local_failed: "Delivery failed",
  local_returned: "Returned to office",
}

function nextActions(state: LocalMilestoneState, office: boolean): Action[] {
  if (state.milestone === "packed") return state.mode === "pickup" ? (office ? ["pickup_ready"] : []) : ["local_dispatched"]
  if (state.milestone === "pickup_ready") return office ? ["pickup_collected"] : []
  if (state.milestone === "local_dispatched") return ["local_delivered", "local_failed"]
  if (state.milestone === "local_failed") return office ? ["local_returned"] : []
  return []
}

const field = "min-h-[48px] w-full rounded-xl border border-Charcoal/20 bg-white px-3 py-2 text-base text-Charcoal focus:border-Gold focus:outline-none focus:ring-2 focus:ring-Gold/40"
const button = "min-h-[48px] rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"

function orderLabel(state: LocalMilestoneState) {
  return state.summary?.display_id ? `Order #${state.summary.display_id}` : `Order ${state.order_id}`
}

function destination(state: LocalMilestoneState) {
  const summary = state.summary
  return [summary?.address_1, summary?.address_2, summary?.city, summary?.province, summary?.postal_code]
    .filter(Boolean).join(", ")
}

export default function LocalMilestonesPhone({ office }: { office: boolean }) {
  const [orders, setOrders] = useState<LocalMilestoneState[]>([])
  const [exceptions, setExceptions] = useState<LocalMilestoneState[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState<{ key: string; id: string } | null>(null)
  const [orderId, setOrderId] = useState("")
  const [fulfillmentId, setFulfillmentId] = useState("")
  const [driverId, setDriverId] = useState("")
  const [reason, setReason] = useState("")
  const [correction, setCorrection] = useState<Action | "">("")
  const [evidence, setEvidence] = useState<LocalEvidenceRecord[]>([])
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoLink, setPhotoLink] = useState<{ uploadId: string; url: string; expiresAt: string } | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)

  const refreshEvidence = useCallback(async (id: string, mode: LocalMilestoneState["mode"]) => {
    if (mode !== "local_delivery") { setEvidence([]); return }
    const result = await listLocalEvidence(id)
    if (result.ok) setEvidence(result.data)
    else setError(result.error)
  }, [])

  const refresh = useCallback(async (selectedId?: string) => {
    try {
      const [list, queue] = await Promise.all([
        listLocalMilestones(),
        office ? listLocalMilestones(true) : Promise.resolve(null),
      ])
      if (!list.ok) { setError(list.error); return }
      setOrders(list.data)
      if (queue?.ok) setExceptions(queue.data)
      else if (queue && !queue.ok) setError(queue.error)
      if (selectedId) {
        const result = await getLocalMilestoneOrder(selectedId)
        if (result.ok) { setDetail(result.data); await refreshEvidence(selectedId, result.data.state.mode) }
        else setError(result.error)
      }
    } catch {
      setError("Connection interrupted. Refresh to confirm the latest order state.")
    } finally {
      setLoading(false)
    }
  }, [office, refreshEvidence])

  useEffect(() => { void refresh() }, [refresh])

  async function openOrder(id: string) {
    setError("")
    try {
      const result = await getLocalMilestoneOrder(id)
      if (result.ok) {
        setDetail(result.data)
        setOrderId(result.data.state.order_id)
        setFulfillmentId(result.data.state.fulfillment_id || "")
        setReason("")
        setCorrection("")
        setPhoto(null)
        setPhotoLink(null)
        await refreshEvidence(id, result.data.state.mode)
      } else setError(result.error)
    } catch {
      setError("Connection interrupted. Refresh to confirm the latest order state.")
    }
  }

  async function record(milestone: Action, state?: LocalMilestoneState, correctionOfEventId?: string) {
    const targetOrder = state?.order_id || orderId.trim()
    const targetFulfillment = state?.fulfillment_id || fulfillmentId.trim()
    const version = state?.version || 0
    const key = `${targetOrder}:${targetFulfillment}:${version}:${milestone}:${correctionOfEventId || ""}:${reason.trim()}`
    const eventId = retry?.key === key ? retry.id : `evt_${crypto.randomUUID()}`
    setRetry({ key, id: eventId })
    setBusy(true); setError(""); setNotice("")
    try {
      const result = await recordLocalMilestone({
        orderId: targetOrder, fulfillmentId: targetFulfillment || null, eventId,
        expectedVersion: version, milestone, reason: reason.trim(),
        correctionOfEventId,
      })
      if (!result.ok) { setError(result.error); return }
      setRetry(null); setReason(""); setCorrection("")
      setNotice(result.data.duplicate ? "This action was already recorded." : `${names[milestone]} recorded.`)
      await refresh(targetOrder)
    } catch {
      setError("Connection interrupted. Refresh to confirm whether the action was recorded; retry keeps the same event ID.")
    } finally {
      setBusy(false)
    }
  }

  async function assign() {
    const key = `assign:${orderId.trim()}:${fulfillmentId.trim()}:${driverId.trim()}`
    const assignmentId = retry?.key === key ? retry.id : `asgn_${crypto.randomUUID()}`
    setRetry({ key, id: assignmentId })
    setBusy(true); setError(""); setNotice("")
    try {
      const result = await assignLocalMilestoneDriver({
        orderId: orderId.trim(), fulfillmentId: fulfillmentId.trim(),
        driverCustomerId: driverId.trim(), assignmentId,
      })
      if (!result.ok) { setError(result.error); return }
      setRetry(null); setDriverId("")
      setNotice(result.data.duplicate ? "Assignment already recorded." : "Driver assignment recorded.")
      await refresh(orderId.trim())
    } catch {
      setError("Connection interrupted. Refresh to confirm the assignment before retrying.")
    } finally {
      setBusy(false)
    }
  }

  async function uploadPhoto() {
    if (!detail || detail.state.mode !== "local_delivery" || !photo) return
    if (photo.size < 1 || photo.size > 4 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp", "image/heic"].includes(photo.type)) {
      setError("Choose a JPEG, PNG, WebP or HEIC photo smaller than 4 MiB.")
      return
    }
    setPhotoBusy(true); setError(""); setNotice("")
    try {
      const bytes = await photo.arrayBuffer()
      const digest = await crypto.subtle.digest("SHA-256", bytes)
      const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("")
      const key = `gp_local_evidence:${detail.state.order_id}:${photo.type}:${photo.size}:${hash}`
      const uploadId = sessionStorage.getItem(key) || `upload_${crypto.randomUUID()}`
      sessionStorage.setItem(key, uploadId)
      const response = await fetch(`/api/staff/local-milestones/orders/${detail.state.order_id}/evidence/${uploadId}`, {
        method: "PUT", body: photo,
        headers: { "Content-Type": photo.type, "x-gp-evidence-size": String(photo.size),
          "x-gp-evidence-sha256": hash },
        cache: "no-store",
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.evidence?.status !== "stored_private") {
        setError("Photo upload is incomplete. Keep the same photo selected and retry; the order was not marked delivered.")
        await refreshEvidence(detail.state.order_id, detail.state.mode)
        return
      }
      sessionStorage.removeItem(key)
      setPhoto(null)
      if (photoInput.current) photoInput.current.value = ""
      setNotice(result.duplicate ? "Photo was already stored privately." : "Photo stored privately. Recording delivery is a separate action.")
      await refreshEvidence(detail.state.order_id, detail.state.mode)
    } catch {
      setError("Connection interrupted. Keep the same photo selected and retry; the order was not marked delivered.")
    } finally {
      setPhotoBusy(false)
    }
  }

  async function retrievePhoto(uploadId: string) {
    if (!detail) return
    setPhotoLink(null); setError("")
    const result = await signLocalEvidence(detail.state.order_id, uploadId)
    if (!result.ok) { setError(result.error); return }
    setPhotoLink({ uploadId, ...result.data })
    window.setTimeout(() => setPhotoLink(current => current?.url === result.data.url ? null : current), 60_000)
  }

  const active = detail?.state
  const correctionOptions: Action[] = active?.milestone === "pickup_collected" ? ["pickup_ready"]
    : active?.milestone === "pickup_ready" ? ["pickup_collected"]
    : active?.milestone === "local_failed" ? ["local_dispatched", "local_delivered", "local_returned"]
    : active?.milestone === "local_delivered" ? ["local_dispatched", "local_failed"]
    : active?.milestone === "local_returned" ? ["local_failed", "local_delivered"]
    : active?.milestone === "local_dispatched" ? ["local_delivered", "local_failed"] : []

  return (
    <main className="min-h-screen bg-[#F7F5F0] px-4 pb-20 pt-7 text-Charcoal sm:px-6">
      <div className="mx-auto max-w-5xl space-y-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-Charcoal/60">Staff operations</p>
            <h1 className="mt-2 font-reckless text-3xl sm:text-4xl">Local milestones</h1>
            <p className="mt-2 max-w-xl text-sm text-Charcoal/70">Record a physical handoff or delivery result after final release. Each action is saved with its staff identity and time.</p>
          </div>
          <div className="flex gap-2">
            {office && <LocalizedClientLink href="/account/staff/orders" className={`${button} inline-flex items-center border border-Charcoal/20 bg-white`}>Staff console</LocalizedClientLink>}
            <button className={`${button} border border-Charcoal/20 bg-white`} disabled={busy} onClick={() => void refresh(active?.order_id)}>Refresh</button>
          </div>
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {notice && <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</div>}

        {office && (
          <section className="rounded-2xl border border-Charcoal/10 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">Open an order or assign a driver</h2>
            <p className="mt-1 text-sm text-Charcoal/60">Use the Medusa order ID from Staff Console. Pickup readiness can precede fulfillment; departure, collection, and delivery require the active fulfillment ID. Release and payment checks run on the server.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Order ID<input aria-label="Order ID" className={`${field} mt-1`} onChange={e => setOrderId(e.target.value)} value={orderId} /></label>
              <label className="text-sm font-semibold">Fulfillment ID<input aria-label="Fulfillment ID" className={`${field} mt-1`} onChange={e => setFulfillmentId(e.target.value)} value={fulfillmentId} /></label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={`${button} bg-Charcoal text-white`} disabled={busy || !orderId} onClick={() => void record("pickup_ready")}>Ready for collection</button>
              <button className={`${button} bg-Charcoal text-white`} disabled={busy || !orderId || !fulfillmentId} onClick={() => void record("local_dispatched")}>Driver departed</button>
              <button className={`${button} border border-Charcoal/20 bg-white`} disabled={busy || !orderId} onClick={() => void openOrder(orderId.trim())}>Open history</button>
            </div>
            <div className="mt-5 border-t border-Charcoal/10 pt-5">
              <label className="block text-sm font-semibold">Driver customer ID<input aria-label="Driver customer ID" className={`${field} mt-1`} onChange={e => setDriverId(e.target.value)} value={driverId} /></label>
              <button className={`${button} mt-3 border border-Charcoal/20 bg-white`} disabled={busy || !orderId || !fulfillmentId || !driverId} onClick={() => void assign()}>Assign driver</button>
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{office ? "Active handoffs" : "My assigned deliveries"}</h2>
            {loading && <p className="text-sm">Loading orders…</p>}
            {!loading && orders.length === 0 && <p className="rounded-xl bg-white p-5 text-sm text-Charcoal/60">No active orders are assigned here.</p>}
            {orders.map(state => (
              <button key={state.order_id} className="block min-h-[72px] w-full rounded-2xl border border-Charcoal/10 bg-white p-4 text-left shadow-sm transition hover:border-Gold focus:outline-none focus:ring-2 focus:ring-Gold" onClick={() => void openOrder(state.order_id)}>
                <span className="block text-sm font-semibold">{orderLabel(state)}</span>
                <span className="mt-1 block text-sm text-Charcoal/60">{names[state.milestone]} · version {state.version}</span>
                {state.summary?.recipient && <span className="mt-1 block text-sm">{state.summary.recipient}</span>}
                {state.mode === "local_delivery" && destination(state) && <span className="mt-1 block text-sm text-Charcoal/70">{destination(state)}</span>}
              </button>
            ))}
          </section>

          {office && <section className="space-y-3">
            <h2 className="text-xl font-semibold">Office exception queue</h2>
            {exceptions.length === 0 && <p className="rounded-xl bg-white p-5 text-sm text-Charcoal/60">No failed or returned deliveries in the queue.</p>}
            {exceptions.map(state => <button key={state.order_id} className="block min-h-[72px] w-full rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left focus:outline-none focus:ring-2 focus:ring-Gold" onClick={() => void openOrder(state.order_id)}>
              <span className="block text-sm font-semibold">{orderLabel(state)}</span>
              <span className="mt-1 block text-sm">{names[state.milestone]} · review the event history</span>
            </button>)}
          </section>}
        </div>

        {active && <section className="rounded-2xl border border-Charcoal/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs uppercase tracking-widest text-Charcoal/50">Selected order</p><h2 className="mt-1 text-xl font-semibold">{orderLabel(active)}</h2><p className="text-sm text-Charcoal/60">{names[active.milestone]} · {active.mode === "pickup" ? "Pickup" : "Local delivery"}</p><p className="mt-1 break-all text-xs text-Charcoal/45">{active.order_id}</p></div>
            <span className="rounded-full bg-[#F7F5F0] px-3 py-1 text-xs">Version {active.version}</span>
          </div>
          {active.mode === "local_delivery" && <div className="mt-4 rounded-xl bg-[#F7F5F0] p-4 text-sm">
            {active.summary?.recipient && <p className="font-semibold">{active.summary.recipient}</p>}
            {destination(active) && <p className="mt-1">{destination(active)}</p>}
            {active.summary?.phone && <a className="mt-2 inline-flex min-h-[44px] items-center font-semibold underline" href={`tel:${active.summary.phone.replace(/[^\d+]/g, "")}`}>Call recipient</a>}
          </div>}
          {nextActions(active, office).length > 0 && <div className="mt-5 space-y-3">
            {active.milestone === "pickup_ready" && !active.fulfillment_id && <label className="block text-sm font-semibold">Active fulfillment ID after physical handoff<input aria-label="Active fulfillment ID" className={`${field} mt-1`} onChange={e => setFulfillmentId(e.target.value)} value={fulfillmentId} /></label>}
            {nextActions(active, office).some(step => step === "local_failed" || step === "local_returned") && <label className="block text-sm font-semibold">Reason for a failed delivery or return<input aria-label="Exception reason" className={`${field} mt-1`} maxLength={500} onChange={e => setReason(e.target.value)} value={reason} /></label>}
            <div className="flex flex-wrap gap-2">{nextActions(active, office).map(step => <button key={step} className={`${button} bg-Charcoal text-white`} disabled={busy || (step === "pickup_collected" && !active.fulfillment_id && !fulfillmentId.trim()) || ((step === "local_failed" || step === "local_returned") && !reason.trim())} onClick={() => void record(step, active)}>{names[step]}</button>)}</div>
          </div>}
          {office && active.current_event_id && correctionOptions.length > 0 && <div className="mt-6 border-t border-Charcoal/10 pt-5">
            <h3 className="font-semibold">Office correction</h3>
            <p className="mt-1 text-sm text-Charcoal/60">The previous event remains in the history. Explain the corrected physical outcome.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Corrected milestone<select aria-label="Corrected milestone" className={`${field} mt-1`} onChange={e => setCorrection(e.target.value as Action | "")} value={correction}><option value="">Choose a milestone</option>{correctionOptions.map(step => <option key={step} value={step}>{names[step]}</option>)}</select></label>
              <label className="text-sm font-semibold">Correction reason<input aria-label="Correction reason" className={`${field} mt-1`} maxLength={500} onChange={e => setReason(e.target.value)} value={reason} /></label>
            </div>
            <button className={`${button} mt-3 border border-Charcoal/20 bg-white`} disabled={busy || !correction || !reason.trim()} onClick={() => correction && void record(correction, active, active.current_event_id || undefined)}>Save correction</button>
          </div>}
          {active.mode === "local_delivery" && <div className="mt-6 border-t border-Charcoal/10 pt-5">
            <h3 className="font-semibold">Delivery photo evidence</h3>
            <p className="mt-1 text-sm text-Charcoal/60">Optional while the office confirms the photo policy. A stored photo does not mark the order delivered. Only assigned drivers and office staff can retrieve it.</p>
            <label className="mt-3 block text-sm font-semibold">Take or choose a photo
              <input ref={photoInput} aria-label="Delivery photo" className={`${field} mt-1`} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" onChange={event => setPhoto(event.target.files?.[0] || null)} />
            </label>
            <p className="mt-1 text-xs text-Charcoal/60">JPEG, PNG, WebP or HEIC, up to 4 MiB on this phone page.</p>
            <button className={`${button} mt-3 border border-Charcoal/20 bg-white`} disabled={photoBusy || busy || !photo} onClick={() => void uploadPhoto()}>{photoBusy ? "Storing photo…" : "Store photo privately"}</button>
            {evidence.length > 0 && <ul className="mt-4 space-y-2" aria-label="Delivery photo evidence">{evidence.map((item, index) => <li key={item.evidenceId} className="rounded-xl bg-[#F7F5F0] p-3 text-sm">
              <span className="font-semibold">Photo {index + 1}</span>
              <span className="ml-2 text-Charcoal/60">{item.status === "stored_private" ? `Stored ${item.storedAt ? new Date(item.storedAt).toLocaleString() : "privately"}` : "Upload pending — reselect the same photo and retry"}</span>
              {item.status === "stored_private" && <button className="ml-2 min-h-[44px] font-semibold underline" onClick={() => void retrievePhoto(item.uploadId)}>Get short-lived link</button>}
              {photoLink?.uploadId === item.uploadId && <p className="mt-2"><a className="font-semibold underline" href={photoLink.url} target="_blank" rel="noopener noreferrer">Open stored photo</a><span className="ml-2 text-xs text-Charcoal/60">Expires {new Date(photoLink.expiresAt).toLocaleTimeString()}</span></p>}
            </li>)}</ul>}
          </div>}
          <div className="mt-6 border-t border-Charcoal/10 pt-5"><h3 className="font-semibold">Event history</h3>
            {detail?.events.length === 0 && <p className="mt-2 text-sm text-Charcoal/60">No milestone events yet.</p>}
            <ol className="mt-3 space-y-3">{detail?.events.map(event => <li className="rounded-xl bg-[#F7F5F0] p-3 text-sm" key={event.event_id}><span className="font-semibold">{names[event.milestone]}</span><span className="ml-2 text-Charcoal/60">{new Date(event.recorded_at).toLocaleString()}</span><p className="text-Charcoal/60">{event.kind === "correction" ? "Correction" : "Recorded"} by {event.actor_role}{event.reason ? ` · ${event.reason}` : ""}</p></li>)}</ol>
          </div>
        </section>}
      </div>
    </main>
  )
}
