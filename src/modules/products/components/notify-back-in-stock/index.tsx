"use client"

import { useState } from "react"
import { requestBackInStockNotification } from "@lib/data/back-in-stock"

/**
 * PDP capture form shown when the selected variant is out of stock
 * (#102). Customer drops their email, we persist to Strapi + send a
 * Postmark confirmation, and the form resets to a success state.
 *
 * The form is intentionally compact — fits the right column of the
 * PDP without dominating the layout. Success state replaces the
 * input with a confirmation block so the visual feedback is
 * unmissable; the customer doesn't have to wonder whether their
 * email made it.
 */
export default function NotifyBackInStockForm({
  medusaProductId,
  medusaVariantId,
  productHandle,
  productTitle,
  sku,
  quickBooksListId,
  requestedFulfillmentDate,
  waitlistReason = "out_of_stock",
}: {
  medusaProductId: string
  medusaVariantId?: string
  productHandle: string
  productTitle: string
  sku?: string
  quickBooksListId?: string
  requestedFulfillmentDate?: string
  waitlistReason?: "out_of_stock" | "allocated_out" | "future_unavailable"
}) {
  const [email, setEmail] = useState("")
  // Honeypot field — invisible, never tabbable; bots fill it, humans
  // never do. Server-side `requestBackInStockNotification` silently
  // 200s any submission with this non-empty.
  const [honeypot, setHoneypot] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle"
  )
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setStatus("submitting")
    const result = await requestBackInStockNotification({
      email,
      medusaProductId,
      medusaVariantId,
      productHandle,
      productTitle,
      sku,
      quickBooksListId,
      requestedFulfillmentDate,
      waitlistReason,
      source: "pdp",
      honeypot,
    })
    if (result.ok) {
      setStatus("ok")
      setEmail("")
    } else {
      setStatus("error")
      setError(result.error || "Something went wrong. Please try again.")
    }
  }

  if (status === "ok") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm font-maison-neue text-emerald-900"
      >
        <p className="font-semibold mb-1">You&apos;re on the list.</p>
        <p>
          We&apos;ll email you when{" "}
          <span className="font-semibold">{productTitle}</span> is back.
          {sku ? <span> SKU {sku}.</span> : null}
          You can unsubscribe anytime from that email.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-md border border-Charcoal/15 bg-Scroll/40 p-4"
      aria-labelledby="notify-back-in-stock-heading"
    >
      <h3
        id="notify-back-in-stock-heading"
        className="text-p-sm-mono font-maison-neue font-bold uppercase text-Charcoal mb-2"
      >
        Out of stock. Get notified.
      </h3>
      <p className="text-p-sm font-maison-neue text-Charcoal/70 mb-3">
        Drop your email and we&apos;ll let you know when this exact item is
        available again. No marketing list. One email per restock, then we stop.
        {sku ? <span className="block mt-1 text-Charcoal/55">SKU {sku}</span> : null}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="back-in-stock-email" className="sr-only">
          Your email address
        </label>
        <input
          id="back-in-stock-email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-h-[44px] px-3 rounded-md border border-Charcoal/20 bg-white text-Charcoal text-p-sm font-maison-neue placeholder:text-Charcoal/40 focus:outline-none focus:ring-2 focus:ring-Gold"
          disabled={status === "submitting"}
        />
        {/* Honeypot — hidden from sighted users + keyboard tabbing.
            Bots that grab form schemas and fill every field will set
            it; the server silently drops those submissions. */}
        <input
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          aria-hidden="true"
          className="absolute left-[-9999px] w-px h-px opacity-0 pointer-events-none"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="min-h-[44px] px-5 rounded-md bg-Charcoal text-white font-rexton text-xs font-bold uppercase tracking-wide hover:opacity-90 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-Gold"
        >
          {status === "submitting" ? "Sending…" : "Notify Me"}
        </button>
      </div>
      {status === "error" && error && (
        <p
          role="alert"
          className="mt-2 text-xs font-maison-neue text-rose-700"
        >
          {error}
        </p>
      )}
    </form>
  )
}
