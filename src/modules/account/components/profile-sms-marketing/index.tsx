"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

import {
  submitSmsMarketingOptIn,
  type SmsMarketingStatusResponse,
} from "@lib/data/sms-marketing"
import { contactRevision } from "@lib/util/customer-contact-state"
import { formatPhone } from "@lib/util/format-phone"
import {
  normalizeSmsMarketingPhone,
  SMS_MARKETING_DISCLOSURE,
  SMS_MARKETING_OPT_IN_LABEL,
} from "@lib/util/sms-consent"
import Input from "@modules/common/components/input"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"

type Props = {
  customer: HttpTypes.StoreCustomer
  marketingStatus: SmsMarketingStatusResponse | null
}

const ProfileSmsMarketing = ({ customer, marketingStatus }: Props) => {
  const router = useRouter()
  const [requestId, setRequestId] = useState("")
  useEffect(() => { setRequestId(crypto.randomUUID()) }, [])
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useActionState(submitSmsMarketingOptIn, null)
  const normalizedPhone = normalizeSmsMarketingPhone(customer.phone)
  const statusPhone = normalizeSmsMarketingPhone(marketingStatus?.phone)
  const statusLabel = !marketingStatus
    ? "Status unavailable"
    : marketingStatus.status === "subscribed"
      ? "Subscribed"
      : marketingStatus.status === "unsubscribed"
        ? "Unsubscribed"
        : "Not subscribed"
  const statusClass =
    marketingStatus?.status === "subscribed"
      ? "bg-green-50 text-green-800"
      : marketingStatus?.status === "unsubscribed"
        ? "bg-red-50 text-red-800"
        : "bg-ui-bg-subtle text-ui-fg-subtle"

  useEffect(() => {
    if (!state?.success) return

    // Consent must require a fresh affirmative action every time this form is
    // used. Reset immediately so React never leaves the checkbox selected
    // after a successful submission, then refresh the server-owned status.
    formRef.current?.reset()
    setRequestId(crypto.randomUUID())
    router.refresh()
  }, [router, state?.receipt])

  return (
    <form
      ref={formRef}
      action={formAction}
      className="w-full"
      data-testid="sms-marketing-profile-form"
    >
      <input type="hidden" name="contact_revision" value={contactRevision(customer.metadata)} />
      <input type="hidden" name="contact_request_id" value={requestId} />
      <div className="flex flex-col gap-y-4">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold uppercase text-ui-fg-base">
              Marketing texts
            </h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}
              data-testid="sms-marketing-status"
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-1 text-small-regular text-ui-fg-subtle">
            Get seasonal specials, product announcements, promotional offers,
            and holiday sales deadlines by text.
          </p>
          {marketingStatus?.status === "subscribed" && statusPhone ? (
            <p className="mt-1 text-xs text-ui-fg-subtle">
              Current subscription is for {formatPhone(statusPhone)}.
            </p>
          ) : marketingStatus?.status === "unsubscribed" && statusPhone ? (
            <p className="mt-1 text-xs text-ui-fg-subtle">
              Marketing texts are stopped for {formatPhone(statusPhone)}.
            </p>
          ) : null}
        </div>

        <Input
          label="Mobile number"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          required
          defaultValue={normalizedPhone ? formatPhone(normalizedPhone) : ""}
          data-testid="sms-marketing-phone-input"
        />

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-3">
          <input
            className="mt-1 h-4 w-4 shrink-0 accent-Gold"
            name="sms_marketing_opt_in"
            type="checkbox"
            value="on"
            required
            data-testid="sms-marketing-profile-opt-in"
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

        {/* Links stay outside the label so opening a legal page cannot toggle
            or otherwise manufacture consent. */}
        <span className="-mt-2 block text-xs text-ui-fg-subtle">
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

        <p className="text-xs text-ui-fg-subtle">
          Previously replied STOP? Text START to (844) 748-5332 first. This form
          cannot override your carrier-level opt-out.
        </p>

        {state?.success ? (
          <p
            className="rounded-md bg-green-50 px-3 py-2 text-small-regular text-green-800"
            role="status"
          >
            Your Griller&apos;s Pride marketing text consent was saved.
          </p>
        ) : null}
        <ErrorMessage
          error={state?.error || null}
          data-testid="sms-marketing-profile-error"
        />

        <SubmitButton
          className="w-full small:max-w-[220px]"
          data-testid="sms-marketing-profile-submit"
        >
          Save and opt in
        </SubmitButton>
      </div>
    </form>
  )
}

export default ProfileSmsMarketing
