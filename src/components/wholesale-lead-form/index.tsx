"use client"

import { FormEvent, useId, useState } from "react"
import { toast } from "@medusajs/ui"
import { jitsuTrack } from "@lib/jitsu"

const OPERATION_TYPES = [
  "Caterer",
  "Restaurant",
  "Synagogue or congregation",
  "School or camp",
  "Hotel or one-off event",
  "Other",
] as const

const MONTHLY_VOLUME = [
  "Not sure yet",
  "Under $500",
  "$500 – $2,000",
  "$2,000 – $5,000",
  "$5,000 – $15,000",
  "$15,000+",
] as const

export default function WholesaleLeadForm() {
  const formId = useId()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [organization, setOrganization] = useState("")
  const [operationType, setOperationType] = useState<string>("")
  const [monthlyVolume, setMonthlyVolume] = useState<string>("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (isSubmitting || submitted) return
    setIsSubmitting(true)

    try {
      const res = await fetch("/api/wholesale-inquiry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          organization,
          operationType,
          monthlyVolume,
          message,
          sourceUrl:
            typeof window !== "undefined" ? window.location.href : undefined,
        }),
      })

      if (res.ok) {
        jitsuTrack("wholesale_inquiry_submitted", {
          operationType,
          organization,
        })
        toast.success("Thanks. We'll be in touch within 1 business day.", {
          description: "Peter will reply directly from peter@grillerspride.com.",
        })
        setSubmitted(true)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(
          data?.error ||
            "We couldn't send your inquiry just now. Please email peter@grillerspride.com directly."
        )
      }
    } catch {
      toast.error(
        "We couldn't send your inquiry just now. Please email peter@grillerspride.com directly."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div
        id="wholesale-form"
        className="bg-Scroll border border-Charcoal/10 rounded-md px-6 py-10 md:px-10 md:py-14 text-center"
        aria-live="polite"
      >
        <h3 className="font-gyst text-h3 text-Charcoal mb-4">
          Thanks. Your inquiry is in.
        </h3>
        <p className="text-p-md font-maison-neue text-Charcoal/80 max-w-prose mx-auto">
          Peter will reply within one business day from{" "}
          <a
            href="mailto:peter@grillerspride.com"
            className="text-Gold font-semibold underline-offset-4 hover:underline"
          >
            peter@grillerspride.com
          </a>
          . If your timeline is faster than that, give us a call:{" "}
          <a
            href="tel:+17704548108"
            className="text-Gold font-semibold underline-offset-4 hover:underline whitespace-nowrap"
          >
            (770) 454-8108
          </a>
          .
        </p>
      </div>
    )
  }

  const labelClass =
    "block text-p-sm-mono font-maison-neue-mono uppercase tracking-widest text-Charcoal/70 mb-2"
  const inputClass =
    "w-full bg-white border border-Charcoal/20 rounded-md px-4 py-3 text-p-md font-maison-neue text-Charcoal placeholder:text-Pewter focus:outline-none focus:border-Gold focus:ring-2 focus:ring-Gold/40 transition-colors"

  return (
    <form
      id="wholesale-form"
      onSubmit={handleSubmit}
      className="bg-Scroll border border-Charcoal/10 rounded-md px-6 py-10 md:px-10 md:py-14"
      aria-labelledby={`${formId}-heading`}
    >
      <div className="max-w-2xl mx-auto">
        <h3
          id={`${formId}-heading`}
          className="font-gyst text-h3 text-Charcoal mb-3"
        >
          Request wholesale pricing
        </h3>
        <p className="text-p-md font-maison-neue text-Charcoal/70 mb-8">
          Tell us a little about your operation. Peter will reply within one
          business day with a tailored proposal, or just call{" "}
          <a
            href="tel:+17704548108"
            className="text-Gold font-semibold underline-offset-4 hover:underline whitespace-nowrap"
          >
            (770) 454-8108
          </a>{" "}
          if that&apos;s easier.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label htmlFor={`${formId}-name`} className={labelClass}>
              Your name <span className="text-Gold">*</span>
            </label>
            <input
              id={`${formId}-name`}
              type="text"
              required
              autoComplete="name"
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor={`${formId}-email`} className={labelClass}>
              Email <span className="text-Gold">*</span>
            </label>
            <input
              id={`${formId}-email`}
              type="email"
              required
              autoComplete="email"
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor={`${formId}-phone`} className={labelClass}>
              Phone
            </label>
            <input
              id={`${formId}-phone`}
              type="tel"
              autoComplete="tel"
              maxLength={64}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor={`${formId}-org`} className={labelClass}>
              Organization name <span className="text-Gold">*</span>
            </label>
            <input
              id={`${formId}-org`}
              type="text"
              required
              autoComplete="organization"
              maxLength={200}
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor={`${formId}-op`} className={labelClass}>
              Operation type <span className="text-Gold">*</span>
            </label>
            <select
              id={`${formId}-op`}
              required
              value={operationType}
              onChange={(e) => setOperationType(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Choose one…
              </option>
              {OPERATION_TYPES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${formId}-vol`} className={labelClass}>
              Monthly volume
            </label>
            <select
              id={`${formId}-vol`}
              value={monthlyVolume}
              onChange={(e) => setMonthlyVolume(e.target.value)}
              className={inputClass}
            >
              <option value="">Not sure yet</option>
              {MONTHLY_VOLUME.filter((v) => v !== "Not sure yet").map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor={`${formId}-msg`} className={labelClass}>
              What are you looking for?
            </label>
            <textarea
              id={`${formId}-msg`}
              rows={5}
              maxLength={4000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What you cook, who you serve, what you order today, anything specific we should know."
              className={`${inputClass} resize-y min-h-[120px]`}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-8 inline-flex items-center gap-3 px-8 py-4 bg-Gold text-Charcoal font-rexton text-h6 font-bold uppercase tracking-wide hover:bg-Gold/90 transition-colors rounded-[5px] disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-Charcoal focus-visible:ring-offset-2"
        >
          {isSubmitting ? "Sending…" : "Send inquiry"}
        </button>

        <p className="text-p-sm font-maison-neue text-Charcoal/60 mt-6">
          We&apos;ll only use what you share to follow up about wholesale. Your
          details never feed marketing email or third-party tools.
        </p>
      </div>
    </form>
  )
}
