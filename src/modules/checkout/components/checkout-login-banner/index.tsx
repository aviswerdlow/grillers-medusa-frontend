"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import {
  loginWithCredentials,
  signupWithCredentials,
  signoutKeepCart,
  requestPasswordReset,
} from "@lib/data/customer"
import { formatPhone } from "@lib/util/format-phone"
import {
  SMS_MARKETING_DISCLOSURE,
  SMS_MARKETING_OPT_IN_LABEL,
} from "@lib/util/sms-consent"
import { HttpTypes } from "@medusajs/types"
import { useStorefrontSession } from "@modules/layout/components/storefront-session"
import { useExitStaffContext } from "@modules/staff/hooks/use-exit-staff-context"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const SmallSpinner = () => (
  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

type Props = {
  customer: HttpTypes.StoreCustomer | null
}

const WhyAccountInline: React.FC<{ open: boolean }> = ({ open }) => {
  if (!open) return null
  return (
    <div
      id="why-account-explanation"
      className="ml-11 mt-3 mb-4 p-4 bg-Scroll/40 border-l-4 border-Gold rounded-r-md text-sm text-Charcoal/85 leading-relaxed"
      role="region"
      aria-label="Why an account is required"
    >
      <p>
        We hand-cut your meat to order, then weigh and charge for the actual
        weight. That requires a payment method we can adjust the charge against
        — and that needs an account.
      </p>
    </div>
  )
}

const CheckoutLoginBanner: React.FC<Props> = ({ customer }) => {
  const router = useRouter()
  const { staffImpersonation } = useStorefrontSession()
  const { exitContext, isExiting } = useExitStaffContext()
  const [mode, setMode] = useState<"prompt" | "signin" | "signup" | "forgot">(
    "prompt"
  )
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [smsMarketingOptIn, setSmsMarketingOptIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (staffImpersonation) {
      exitContext()
      return
    }

    setLoggingOut(true)
    try {
      await signoutKeepCart()
      router.refresh()
    } catch {
      // no-op
    } finally {
      setLoggingOut(false)
    }
  }

  if (customer) {
    const isBusy = loggingOut || isExiting
    const accountLabel = staffImpersonation ? "Acting as" : "Signed in as"

    return (
      <div className="flex items-center justify-between p-4 bg-Scroll/30 border border-Gold/20 rounded-lg">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-Gold shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm text-Charcoal">
            {accountLabel}{" "}
            <span className="font-semibold">
              {customer.first_name} {customer.last_name}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isBusy}
          className="text-xs text-Charcoal/50 hover:text-Charcoal/80 font-medium transition-colors disabled:opacity-50"
        >
          {isBusy ? (
            <span className="flex items-center gap-1.5">
              <SmallSpinner />{" "}
              {staffImpersonation ? "Exiting..." : "Logging out..."}
            </span>
          ) : staffImpersonation ? (
            "Exit context"
          ) : (
            "Log out"
          )}
        </button>
      </div>
    )
  }

  const resetForm = () => {
    setError(null)
    setPassword("")
    setFirstName("")
    setLastName("")
    setPhone("")
    setSmsMarketingOptIn(false)
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await loginWithCredentials(email, password)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error || "Invalid email or password")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setIsSubmitting(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setForgotSent(true)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !firstName || !lastName) return
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await signupWithCredentials({
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        phone,
        sms_marketing_opt_in: smsMarketingOptIn,
      })
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error || "Could not create account")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Initial prompt — sign in or create account
  if (mode === "prompt") {
    return (
      <>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-Gold/10">
                <svg
                  className="w-4 h-4 text-Gold"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-Charcoal">
                Sign in or create an account to continue
              </h3>
            </div>

            <p
              className={`text-sm text-Charcoal/60 ml-11 ${
                showWhy ? "mb-1" : "mb-5"
              }`}
            >
              An account is required to complete your order.{" "}
              <button
                type="button"
                onClick={() => setShowWhy((v) => !v)}
                aria-expanded={showWhy}
                aria-controls="why-account-explanation"
                className="inline-flex items-center gap-1 text-Gold hover:text-Gold/80 font-medium transition-colors"
              >
                {showWhy ? "Why? ▴" : "Why? ▾"}
              </button>
            </p>

            <WhyAccountInline open={showWhy} />

            <div className="flex flex-col sm:flex-row gap-3 ml-11">
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setMode("signin")
                }}
                className="flex-1 h-11 text-sm font-semibold text-white bg-Gold rounded-lg hover:bg-Gold/90 transition-colors"
              >
                I already have an account
              </button>
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setMode("signup")
                }}
                className="flex-1 h-11 text-sm font-semibold text-Charcoal bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Create an account
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Sign-in form
  if (mode === "signin") {
    return (
      <>
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-Charcoal">
                Sign in to your account
              </h3>
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setMode("signup")
                }}
                className="text-xs text-Gold hover:text-Gold/80 font-medium"
              >
                Create account instead
              </button>
            </div>

            <form onSubmit={handleSignIn} className="space-y-3">
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email or username"
                required
                autoComplete="username"
                autoFocus
                className="w-full h-10 px-3 text-sm bg-ui-bg-field border border-ui-border-base rounded-md focus:outline-none focus:ring-1 focus:ring-Gold focus:border-Gold"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full h-10 px-3 text-sm bg-ui-bg-field border border-ui-border-base rounded-md focus:outline-none focus:ring-1 focus:ring-Gold focus:border-Gold"
              />
              <button
                type="submit"
                disabled={isSubmitting || !email || !password}
                className="w-full h-11 text-sm font-semibold text-white bg-Gold rounded-lg hover:bg-Gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <SmallSpinner /> Signing in...
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>
            </form>

            {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}

            <div className="mt-3 text-right">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setPassword("")
                  setForgotSent(false)
                  setMode("forgot")
                }}
                className="text-xs text-Gold hover:text-Gold/80 font-medium transition-colors"
              >
                Forgot password?
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 text-center">
              <button
                type="button"
                onClick={() => {
                  resetForm()
                  setMode("prompt")
                }}
                className="text-xs text-Charcoal/50 hover:text-Charcoal/80 transition-colors"
              >
                Back to options
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Forgot-password form — same flow as the main account login's
  // forgot-password view: POSTs the email to requestPasswordReset and
  // shows a "check your email" confirmation regardless of whether the
  // address exists (avoids user-enumeration).
  if (mode === "forgot") {
    if (forgotSent) {
      return (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="p-5 sm:p-6 text-center">
            <h3 className="text-base font-semibold text-Charcoal mb-2">
              Check your email
            </h3>
            <p className="text-sm text-Charcoal/70 mb-5">
              If an account exists for{" "}
              <span className="font-semibold">{email}</span>, we've sent a link
              to reset your password.
            </p>
            <button
              type="button"
              onClick={() => {
                setForgotSent(false)
                setMode("signin")
              }}
              className="text-xs text-Gold hover:text-Gold/80 font-medium transition-colors"
            >
              Back to sign in
            </button>
          </div>
        </div>
      )
    }
    return (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-Charcoal">
              Reset your password
            </h3>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setMode("signin")
              }}
              className="text-xs text-Gold hover:text-Gold/80 font-medium"
            >
              Back to sign in
            </button>
          </div>

          <p className="text-sm text-Charcoal/60 mb-4">
            Enter your email and we'll send you a link to reset your password.
          </p>

          <form onSubmit={handleForgotPassword} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              autoFocus
              className="w-full h-10 px-3 text-sm bg-ui-bg-field border border-ui-border-base rounded-md focus:outline-none focus:ring-1 focus:ring-Gold focus:border-Gold"
            />
            <button
              type="submit"
              disabled={isSubmitting || !email}
              className="w-full h-11 text-sm font-semibold text-white bg-Gold rounded-lg hover:bg-Gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <SmallSpinner /> Sending...
                </span>
              ) : (
                "Send reset link"
              )}
            </button>
          </form>

          {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}
        </div>
      </div>
    )
  }

  // Sign-up form
  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-Charcoal">
              Create your account
            </h3>
            <button
              type="button"
              onClick={() => {
                resetForm()
                setMode("signin")
              }}
              className="text-xs text-Gold hover:text-Gold/80 font-medium"
            >
              Sign in instead
            </button>
          </div>

          <form onSubmit={handleSignUp} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                required
                autoFocus
                className="w-full h-10 px-3 text-sm bg-ui-bg-field border border-ui-border-base rounded-md focus:outline-none focus:ring-1 focus:ring-Gold focus:border-Gold"
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                required
                className="w-full h-10 px-3 text-sm bg-ui-bg-field border border-ui-border-base rounded-md focus:outline-none focus:ring-1 focus:ring-Gold focus:border-Gold"
              />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="w-full h-10 px-3 text-sm bg-ui-bg-field border border-ui-border-base rounded-md focus:outline-none focus:ring-1 focus:ring-Gold focus:border-Gold"
            />
            <input
              type="tel"
              value={formatPhone(phone)}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              autoComplete="tel"
              className="w-full h-10 px-3 text-sm bg-ui-bg-field border border-ui-border-base rounded-md focus:outline-none focus:ring-1 focus:ring-Gold focus:border-Gold"
            />
            <label className="flex items-start gap-3 rounded-md border border-gray-200 bg-Scroll/30 px-3 py-3">
              <input
                checked={smsMarketingOptIn}
                className="mt-1 h-4 w-4 shrink-0 accent-Gold"
                onChange={(e) => setSmsMarketingOptIn(e.target.checked)}
                type="checkbox"
              />
              <span className="text-left">
                <span className="block text-sm font-semibold text-Charcoal">
                  {SMS_MARKETING_OPT_IN_LABEL}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-Charcoal/55">
                  {SMS_MARKETING_DISCLOSURE}
                </span>
              </span>
            </label>
            {/* Legal links sit outside the checkbox label so following one
                never changes the customer's consent choice. */}
            <p className="-mt-1 text-xs text-Charcoal/55">
              <LocalizedClientLink href="/page/sms-terms" className="underline">
                SMS Terms
              </LocalizedClientLink>{" "}
              ·{" "}
              <LocalizedClientLink
                href="/page/privacy-policy"
                className="underline"
              >
                Privacy Policy
              </LocalizedClientLink>
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              minLength={8}
              className="w-full h-10 px-3 text-sm bg-ui-bg-field border border-ui-border-base rounded-md focus:outline-none focus:ring-1 focus:ring-Gold focus:border-Gold"
            />
            <button
              type="submit"
              disabled={
                isSubmitting || !email || !password || !firstName || !lastName
              }
              className="w-full h-11 text-sm font-semibold text-white bg-Gold rounded-lg hover:bg-Gold/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <SmallSpinner /> Creating account...
                </span>
              ) : (
                "Create Account & Continue"
              )}
            </button>
          </form>

          {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}

          <p className="mt-4 text-xs text-center text-Charcoal/40">
            By creating an account you agree to our terms of service.{" "}
            <button
              type="button"
              onClick={() => setShowWhy((v) => !v)}
              aria-expanded={showWhy}
              aria-controls="why-account-explanation"
              className="inline-flex items-center gap-0.5 text-Gold/70 hover:text-Gold font-medium transition-colors"
            >
              Why do I need an account?
            </button>
          </p>
          <WhyAccountInline open={showWhy} />

          <div className="mt-3 pt-3 border-t border-gray-100 text-center">
            <button
              type="button"
              onClick={() => {
                resetForm()
                setMode("prompt")
              }}
              className="text-xs text-Charcoal/50 hover:text-Charcoal/80 transition-colors"
            >
              Back to options
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default CheckoutLoginBanner
