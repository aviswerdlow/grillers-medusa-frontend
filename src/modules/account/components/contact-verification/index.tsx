"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import Input from "@modules/common/components/input"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { jitsuTrack } from "@lib/jitsu"
import { submitContactVerification, skipContactVerification } from "@lib/data/contact-verification"
import {
  SMS_MARKETING_DISCLOSURE,
  SMS_MARKETING_OPT_IN_LABEL,
} from "@lib/util/sms-consent"
import {
  PhoneCandidate,
  formatPhoneForDisplay,
} from "@lib/util/contact-verification"

import { contactRevision } from "@lib/util/customer-contact-state"

type Props = {
  customer: HttpTypes.StoreCustomer
  phoneCandidates: PhoneCandidate[]
  countryCode: string
}

const sectionNumber = (n: number) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ui-bg-base border border-ui-border-base text-small-regular font-semibold text-ui-fg-base">
    {n}
  </span>
)

/**
 * First-login verification for migrated customers: primary mobile + SMS
 * opt-in (optional — TCPA consent is never a condition of purchase),
 * primary email, and default shipping address. A session-scoped deferral keeps
 * the account reachable without claiming confirmation or consent.
 */
const ContactVerification = ({
  customer,
  phoneCandidates,
  countryCode,
}: Props) => {
  const router = useRouter()
  const [requestId, setRequestId] = useState("")
  useEffect(() => { setRequestId(crypto.randomUUID()) }, [])
  const [state, formAction, confirming] = useActionState(submitContactVerification, null)
  const [skipping, setSkipping] = useState(false)
  const [skipError, setSkipError] = useState<string | null>(null)

  const hasCandidates = phoneCandidates.length > 0
  const [phoneChoice, setPhoneChoice] = useState(
    hasCandidates ? phoneCandidates[0].value : "other"
  )
  const [emailChoice, setEmailChoice] = useState<"current" | "different">(
    "current"
  )
  const addresses = customer.addresses || []
  const defaultAddressId =
    addresses.find((a) => a.is_default_shipping)?.id || addresses[0]?.id || "new"
  const [addressChoice, setAddressChoice] = useState(defaultAddressId)

  const tracked = useRef(false)
  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    jitsuTrack("contact_verification_viewed", {
      customer_id: customer.id,
      phone_candidates: phoneCandidates.length,
      address_count: addresses.length,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (state?.success) {
      jitsuTrack("contact_verification_completed", {
        customer_id: customer.id,
        sms_opt_in: Boolean(state.smsOptedIn),
      })
      router.push(state.receiptEmailPending ? `/${countryCode}/account/profile` : `/${countryCode}/account?verified=1`)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.success])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 small:py-14">
      <h1 className="text-2xl-semi text-ui-fg-base">
        Welcome back{customer.first_name ? `, ${customer.first_name}` : ""} —
        let&apos;s confirm your details
      </h1>
      <p className="mt-2 text-base-regular text-ui-fg-subtle">
        Please confirm your primary mobile and shipping address for the new site.
        Text updates are optional.
      </p>

      <form action={formAction} className="mt-8 flex flex-col gap-y-8">
        <input type="hidden" name="contact_revision" value={contactRevision(customer.metadata)} />
        <input type="hidden" name="contact_request_id" value={requestId} />
        {/* ── 1 · Mobile number + texts ─────────────────────────── */}
        <section className="rounded-lg border border-ui-border-base bg-ui-bg-base p-5">
          <div className="flex items-center gap-x-3">
            {sectionNumber(1)}
            <h2 className="text-large-semi text-ui-fg-base">
              Your mobile number
            </h2>
          </div>
          <p className="mt-2 text-small-regular text-ui-fg-subtle">
            Choose one primary mobile number for your account. Saved addresses and past orders keep their original contact details.
          </p>

          <div className="mt-4 flex flex-col gap-y-2" data-testid="phone-candidates">
            {phoneCandidates.map((candidate) => (
              <label
                key={candidate.value}
                className="flex cursor-pointer items-start gap-x-3 rounded-md border border-ui-border-base p-3 has-[:checked]:border-ui-fg-base"
              >
                <input
                  type="radio"
                  name="primary_phone"
                  value={candidate.value}
                  checked={phoneChoice === candidate.value}
                  onChange={() => setPhoneChoice(candidate.value)}
                  className="mt-1 h-4 w-4 accent-Gold"
                />
                <span>
                  <span className="block text-base-semi text-ui-fg-base">
                    {formatPhoneForDisplay(candidate.value)}
                  </span>
                </span>
              </label>
            ))}

            <label className="flex cursor-pointer items-start gap-x-3 rounded-md border border-ui-border-base p-3 has-[:checked]:border-ui-fg-base">
              <input
                type="radio"
                name="primary_phone"
                value="other"
                checked={phoneChoice === "other"}
                onChange={() => setPhoneChoice("other")}
                className="mt-1 h-4 w-4 accent-Gold"
                data-testid="phone-other-radio"
              />
              <span className="block text-base-regular text-ui-fg-base">
                {hasCandidates
                  ? "A different number"
                  : "Enter your mobile number"}
              </span>
            </label>

            {phoneChoice === "other" ? (
              <div className="pl-7">
                <Input
                  label="Mobile number"
                  name="primary_phone_other"
                  id="primary_phone_other"
                  type="tel"
                  autoComplete="mobile tel"
                  required
                  data-testid="phone-other-input"
                />
              </div>
            ) : null}
          </div>

          <p className="mt-3 text-small-regular text-ui-fg-subtle">
            Saving confirms this is your number. It does not verify ownership by text.
            Order texts are a separate, optional choice at checkout.
          </p>
          {/* Must stay unchecked-by-default: TCPA "express written consent"
              requires the subscriber's own affirmative action, and Twilio
              toll-free verification rejected the number (code 30446) over
              exactly this. Pre-checking also contradicts the consent
              declaration in our carrier filing. */}
          <label className="mt-4 flex cursor-pointer items-start gap-x-3 rounded-md bg-ui-bg-subtle p-3">
            <input
              className="mt-1 h-4 w-4 shrink-0 accent-Gold"
              name="sms_marketing_opt_in"
              id="sms_marketing_opt_in"
              type="checkbox"
              value="on"
              data-testid="sms-marketing-opt-in"
            />
            <span className="text-left">
              <span className="block text-small-regular font-semibold text-ui-fg-base">
                {SMS_MARKETING_OPT_IN_LABEL}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-ui-fg-subtle">
                {SMS_MARKETING_DISCLOSURE}
              </span>
            </span>
          </label>
          <span className="mt-1 block text-xs text-ui-fg-subtle">
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
          </span>
        </section>

        {/* ── 2 · Email ─────────────────────────────────────────── */}
        <section className="rounded-lg border border-ui-border-base bg-ui-bg-base p-5">
          <div className="flex items-center gap-x-3">
            {sectionNumber(2)}
            <h2 className="text-large-semi text-ui-fg-base">Your email</h2>
          </div>
          <p className="mt-2 text-small-regular text-ui-fg-subtle">
            Your sign-in email currently receives order confirmations and receipts.
          </p>

          <div className="mt-4 flex flex-col gap-y-2">
            <label className="flex cursor-pointer items-start gap-x-3 rounded-md border border-ui-border-base p-3 has-[:checked]:border-ui-fg-base">
              <input
                type="radio"
                name="email_choice"
                value="current"
                checked={emailChoice === "current"}
                onChange={() => setEmailChoice("current")}
                className="mt-1 h-4 w-4 accent-Gold"
              />
              <span>
                <span className="block text-base-semi text-ui-fg-base">
                  {customer.email}
                </span>
                <span className="block text-xs text-ui-fg-subtle">
                  Yes — this is my primary email
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-x-3 rounded-md border border-ui-border-base p-3 has-[:checked]:border-ui-fg-base">
              <input
                type="radio"
                name="email_choice"
                value="different"
                checked={emailChoice === "different"}
                onChange={() => setEmailChoice("different")}
                className="mt-1 h-4 w-4 accent-Gold"
                data-testid="email-different-radio"
              />
              <span className="block text-base-regular text-ui-fg-base">
                I mostly use a different email
              </span>
            </label>

            {emailChoice === "different" ? (
              <div className="pl-7">
                <Input
                  label="Preferred email"
                  name="preferred_email"
                  id="preferred_email"
                  type="email"
                  autoComplete="email"
                  required
                  data-testid="preferred-email-input"
                />
                <p className="mt-1 text-xs text-ui-fg-subtle">
                  You&apos;ll still sign in with {customer.email}, and
                  receipts stay there until you enter the verification code
                  we send to this address. You can finish this in your profile.
                </p>
              </div>
            ) : null}
          </div>
        </section>

        {/* ── 3 · Shipping address ──────────────────────────────── */}
        <section className="rounded-lg border border-ui-border-base bg-ui-bg-base p-5">
          <div className="flex items-center gap-x-3">
            {sectionNumber(3)}
            <h2 className="text-large-semi text-ui-fg-base">
              Your primary shipping address
            </h2>
          </div>
          <p className="mt-2 text-small-regular text-ui-fg-subtle">
            We&apos;ll pre-fill checkout with this address.
          </p>

          <div className="mt-4 flex flex-col gap-y-2" data-testid="address-candidates">
            {addresses.map((address) => (
              <label
                key={address.id}
                className="flex cursor-pointer items-start gap-x-3 rounded-md border border-ui-border-base p-3 has-[:checked]:border-ui-fg-base"
              >
                <input
                  type="radio"
                  name="primary_address_id"
                  value={address.id}
                  checked={addressChoice === address.id}
                  onChange={() => setAddressChoice(address.id)}
                  className="mt-1 h-4 w-4 accent-Gold"
                />
                <span>
                  <span className="block text-base-semi text-ui-fg-base">
                    {[address.address_1, address.address_2]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                  <span className="block text-xs text-ui-fg-subtle">
                    {[address.city, address.province, address.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                    {address.is_default_shipping ? " · current default" : ""}
                  </span>
                </span>
              </label>
            ))}

            <label className="flex cursor-pointer items-start gap-x-3 rounded-md border border-ui-border-base p-3 has-[:checked]:border-ui-fg-base">
              <input
                type="radio"
                name="primary_address_id"
                value="new"
                checked={addressChoice === "new"}
                onChange={() => setAddressChoice("new")}
                className="mt-1 h-4 w-4 accent-Gold"
                data-testid="address-new-radio"
              />
              <span className="block text-base-regular text-ui-fg-base">
                {addresses.length > 0
                  ? "Ship somewhere else"
                  : "Add your shipping address"}
              </span>
            </label>

            {addressChoice === "new" ? (
              <div className="grid grid-cols-1 gap-3 pl-7 small:grid-cols-2">
                <Input
                  label="First name"
                  name="new_first_name" id="new_first_name"
                  autoComplete="given-name"
                  defaultValue={customer.first_name || ""}
                />
                <Input
                  label="Last name"
                  name="new_last_name" id="new_last_name"
                  autoComplete="family-name"
                  defaultValue={customer.last_name || ""}
                />
                <div className="small:col-span-2">
                  <Input
                    label="Street address"
                    name="new_address_1" id="new_address_1"
                    autoComplete="address-line1"
                    required
                  />
                </div>
                <div className="small:col-span-2">
                  <Input
                    label="Apt, suite, etc. (optional)"
                    name="new_address_2" id="new_address_2"
                    autoComplete="address-line2"
                  />
                </div>
                <Input
                  label="City"
                  name="new_city" id="new_city"
                  autoComplete="address-level2"
                  required
                />
                <Input
                  label="State"
                  name="new_province" id="new_province"
                  autoComplete="address-level1"
                  required
                />
                <Input
                  label="ZIP code"
                  name="new_postal_code" id="new_postal_code"
                  autoComplete="postal-code"
                  required
                />
                <input type="hidden" name="new_company" value="" />
              </div>
            ) : null}
          </div>
        </section>

        <div role="alert" aria-live="polite">
          <ErrorMessage error={skipError || state?.error || null} data-testid="contact-verification-error" />
        </div>

        <div className="flex flex-col gap-y-3">
          <SubmitButton
            className="w-full"
            data-testid="contact-verification-submit"
            disabled={!requestId || skipping}
          >
            Confirm my details
          </SubmitButton>
        </div>
      </form>
      <button type="button" className="mt-4 min-h-[44px] w-full text-sm underline disabled:opacity-50"
        disabled={skipping || confirming} onClick={async () => {
          setSkipping(true); setSkipError(null)
          try {
            const result = await skipContactVerification()
            if (!result.ok) { setSkipError("We could not continue. Please sign in again or try once more."); return }
            router.push(`/${countryCode}/account`); router.refresh()
          } catch { setSkipError("We could not continue. Please try again.") }
          finally { setSkipping(false) }
        }}>Do this later</button>
    </div>
  )
}

export default ContactVerification
