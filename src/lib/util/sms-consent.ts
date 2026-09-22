export const SMS_MARKETING_CONSENT_VERSION = "sms-v3-2026-07-10"
export const SMS_MARKETING_PROGRAM = "grillers_pride_marketing"
export const SMS_MARKETING_PROVIDER = "twilio"
export const SMS_MARKETING_CONSENT_PURPOSE = "marketing"
export const SMS_MARKETING_CONSENT_METHOD = "customer_checkbox"

export const SMS_MARKETING_CUSTOMER_SOURCES = [
  "account_signup",
  "checkout_account_creation",
  "first_login_verification",
  "account_profile",
] as const

export type SmsMarketingCustomerSource =
  (typeof SMS_MARKETING_CUSTOMER_SOURCES)[number]

export const SMS_MARKETING_OPT_IN_LABEL =
  "Send me Griller's Pride deals and promotional updates"

export const SMS_MARKETING_DISCLOSURE =
  "By checking this box, I agree to receive recurring automated marketing and promotional text messages from Griller's Pride, including seasonal specials, product announcements, promotional offers, and holiday sales deadlines, at the mobile number provided. Consent is not a condition of purchase. Message frequency varies, up to 6 messages per month. Msg & data rates may apply. Reply STOP to opt out or HELP for help."

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1"
}

/**
 * Normalize a US phone without silently truncating extra digits. Consent must
 * be tied to the exact number the customer submitted, so malformed values fail
 * closed instead of being coerced into a different destination.
 */
export function normalizeSmsMarketingPhone(value: unknown): string | null {
  const digits = String(value || "").replace(/\D/g, "")
  const ten =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? ten : null
}

export function formWantsSmsMarketing(formData: FormData): boolean {
  return truthy(formData.get("sms_marketing_opt_in"))
}

export function buildSmsMarketingConsentMetadata(input: {
  phone: string
  source: SmsMarketingCustomerSource
  consentedAt?: string
}) {
  const phone = normalizeSmsMarketingPhone(input.phone)
  if (!phone) {
    throw new Error("SMS marketing consent requires a valid US mobile number")
  }
  const consentedAt = input.consentedAt || new Date().toISOString()

  return {
    sms_marketing_opt_in: true,
    sms_consent: true,
    sms_consent_status: "subscribed",
    sms_consent_at: consentedAt,
    sms_consent_source: input.source,
    sms_consent_version: SMS_MARKETING_CONSENT_VERSION,
    sms_consent_text: SMS_MARKETING_DISCLOSURE,
    sms_consent_phone: phone,
    sms_consent_provider: SMS_MARKETING_PROVIDER,
    sms_program: SMS_MARKETING_PROGRAM,
    sms_consent_purpose: SMS_MARKETING_CONSENT_PURPOSE,
    sms_consent_method: SMS_MARKETING_CONSENT_METHOD,
  }
}


/** Existing subscription applies only to the exact current destination. */
export function hasCurrentSmsSubscription(status: { status: string; phone: string | null } | null | undefined, phone: unknown): boolean {
  const currentPhone = normalizeSmsMarketingPhone(phone)
  return Boolean(currentPhone && status?.status === "subscribed" &&
    normalizeSmsMarketingPhone(status.phone) === currentPhone)
}
