"use client"

import { useEffect, useId, useState, useTransition } from "react"
import { usePathname } from "next/navigation"
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react"
import { subscribeToNewsletter } from "@lib/data/newsletter"

const STORAGE_KEY = "gp-newsletter-popup"
const INTEREST_DELAY_MS = 60_000
const SNOOZE_DAYS = 30
let dismissedThisSession = false

function suppressed() {
  if (dismissedThisSession) return true
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
    return Boolean(state.subscribed || Date.now() < state.snoozedUntil)
  } catch {
    return false
  }
}

function remember(state: { subscribed?: boolean; snoozedUntil?: number }) {
  dismissedThisSession = true
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* Session suppression still applies. */
  }
}

/** A reading-intent shortcut; the signup dialog opens only on an explicit click. */
export default function NewsletterPopup() {
  const pathname = usePathname()
  const allowedRoute = /^\/[^/]+\/(recipes|learn)(\/|$)/.test(pathname || "")
  const emailId = useId()
  const [eligible, setEligible] = useState(false)
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setEligible(false)
    setOpen(false)
    if (!allowedRoute || suppressed()) return
    let elapsed = false
    const checkInterest = () => {
      const distance =
        document.documentElement.scrollHeight - window.innerHeight
      if (
        elapsed &&
        distance > 0 &&
        window.scrollY >= distance / 2 &&
        !suppressed()
      )
        setEligible(true)
    }
    const timer = window.setTimeout(() => {
      elapsed = true
      checkInterest()
    }, INTEREST_DELAY_MS)
    window.addEventListener("scroll", checkInterest, { passive: true })
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("scroll", checkInterest)
    }
  }, [pathname, allowedRoute])

  const dismiss = () => {
    setOpen(false)
    remember(
      done
        ? { subscribed: true }
        : { snoozedUntil: Date.now() + SNOOZE_DAYS * 86400000 }
    )
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isPending) return
    setError(null)
    startTransition(async () => {
      try {
        const result = await subscribeToNewsletter(
          email.trim(),
          "storefront_popup"
        )
        if (result.success) {
          setDone(true)
          remember({ subscribed: true })
        } else
          setError(result.error || "Could not sign you up. Please try again.")
      } catch {
        setError("Could not sign you up. Please try again.")
      }
    })
  }

  if (!allowedRoute || !eligible) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-30 min-h-[44px] rounded-full border border-Charcoal/20 bg-Scroll px-4 py-2 font-maison-neue text-sm text-Charcoal shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-Gold"
      >
        Email updates
      </button>
      <Dialog open={open} onClose={dismiss} className="fixed inset-0 z-50">
        <div className="fixed inset-0 bg-black/35" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <DialogPanel
            className="relative w-full max-w-md rounded-lg bg-white p-6 text-Charcoal shadow-xl"
            data-testid="newsletter-popup"
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close newsletter signup"
              className="absolute right-2 top-2 flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-Gold"
            >
              ×
            </button>
            <DialogTitle className="pr-10 font-gyst text-xl font-bold">
              First crack at holiday cuts
            </DialogTitle>
            {done ? (
              <p role="status" className="mt-3 text-sm">
                You&apos;re on the list. You can unsubscribe from any email.
              </p>
            ) : (
              <>
                <p className="mt-3 text-sm leading-relaxed">
                  Order deadlines, new cuts, and butcher tips — a couple of
                  emails a month, never on Shabbos.
                </p>
                <form onSubmit={submit} className="mt-4">
                  <label
                    htmlFor={emailId}
                    className="block text-sm font-semibold"
                  >
                    Email address
                  </label>
                  <input
                    id={emailId}
                    data-autofocus
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-describedby={error ? `${emailId}-error` : undefined}
                    className="mt-1 min-h-[44px] w-full rounded border border-Charcoal/25 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-Gold"
                    data-testid="newsletter-popup-email"
                  />
                  <p className="mt-2 text-xs leading-relaxed text-Charcoal/70">
                    By signing up, you agree to receive these emails.
                    Unsubscribe anytime.
                  </p>
                  {error && (
                    <p
                      id={`${emailId}-error`}
                      role="alert"
                      className="mt-2 text-sm text-red-700"
                    >
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={isPending}
                    className="mt-4 min-h-[44px] w-full rounded bg-Charcoal px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {isPending ? "Signing up…" : "Sign up"}
                  </button>
                </form>
              </>
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </>
  )
}
