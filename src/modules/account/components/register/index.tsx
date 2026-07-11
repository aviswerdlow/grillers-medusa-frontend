"use client"

import { useActionState, useEffect, useRef } from "react"
import Input from "@modules/common/components/input"
import { LOGIN_VIEW } from "@modules/account/templates/login-template"
import { jitsuTrack, jitsuIdentify } from "@lib/jitsu"
import ErrorMessage from "@modules/checkout/components/error-message"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { signup } from "@lib/data/customer"
import {
  SMS_MARKETING_DISCLOSURE,
  SMS_MARKETING_OPT_IN_LABEL,
} from "@lib/util/sms-consent"

type Props = {
  setCurrentView: (view: LOGIN_VIEW) => void
}

const Register = ({ setCurrentView }: Props) => {
  const [message, formAction] = useActionState(signup, null)
  const hasSubmitted = useRef(false)

  // Track successful registration: signup returns a customer object on success, a string on error
  useEffect(() => {
    if (hasSubmitted.current && message && typeof message !== "string") {
      const customer = message as any
      jitsuTrack("account_created", {
        method: "email",
        customer_id: customer.id,
      })
      jitsuIdentify(customer.id, {
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        phone: customer.phone,
        sms_consent: customer.metadata?.sms_consent === true,
        sms_consent_at: customer.metadata?.sms_consent_at,
        sms_consent_source: customer.metadata?.sms_consent_source,
        sms_consent_version: customer.metadata?.sms_consent_version,
        sms_consent_text: customer.metadata?.sms_consent_text,
        sms_consent_phone: customer.metadata?.sms_consent_phone,
        sms_consent_provider: customer.metadata?.sms_consent_provider,
        sms_program: customer.metadata?.sms_program,
        sms_consent_purpose: customer.metadata?.sms_consent_purpose,
        sms_consent_method: customer.metadata?.sms_consent_method,
      })
    }
  }, [message])

  return (
    <div
      className="max-w-sm flex flex-col items-center"
      data-testid="register-page"
    >
      <h1 className="text-large-semi uppercase mb-6">
        Become a Griller&apos;s Pride member
      </h1>
      <p className="text-center text-base-regular text-ui-fg-base mb-4">
        Create your account to get faster checkout, saved addresses, easy
        reorders, and member-only updates on holiday cuts and new products.
      </p>
      <form className="w-full flex flex-col" action={(formData) => { hasSubmitted.current = true; formAction(formData) }}>
        <div className="flex flex-col w-full gap-y-2">
          <Input
            label="First name"
            name="first_name"
            required
            autoComplete="given-name"
            data-testid="first-name-input"
          />
          <Input
            label="Last name"
            name="last_name"
            required
            autoComplete="family-name"
            data-testid="last-name-input"
          />
          <Input
            label="Email"
            name="email"
            required
            type="email"
            autoComplete="email"
            data-testid="email-input"
          />
          <Input
            label="Phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            data-testid="phone-input"
          />
          <label className="mt-1 flex items-start gap-3 rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-3">
            <input
              className="mt-1 h-4 w-4 shrink-0 accent-Gold"
              name="sms_marketing_opt_in"
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
          {/* Links live outside the <label> so tapping them can't toggle consent */}
          <span className="-mt-1 block text-xs text-ui-fg-subtle">
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
          <Input
            label="Password"
            name="password"
            required
            type="password"
            autoComplete="new-password"
            data-testid="password-input"
          />
        </div>
        <ErrorMessage error={message} data-testid="register-error" />
        <span className="text-center text-ui-fg-base text-small-regular mt-6">
          By creating an account, you agree to Griller&apos;s Pride&apos;s{" "}
          <LocalizedClientLink
            href="/page/privacy-policy"
            className="underline"
          >
            Privacy Policy
          </LocalizedClientLink>{" "}
          and{" "}
          <LocalizedClientLink
            href="/page/terms-of-use"
            className="underline"
          >
            Terms of Use
          </LocalizedClientLink>
          .
        </span>
        <SubmitButton className="w-full mt-6" data-testid="register-button">
          Join
        </SubmitButton>
      </form>
      <span className="text-center text-ui-fg-base text-small-regular mt-6">
        Already a member?{" "}
        <button
          onClick={() => setCurrentView(LOGIN_VIEW.SIGN_IN)}
          className="underline"
        >
          Sign in
        </button>
        .
      </span>
    </div>
  )
}

export default Register
