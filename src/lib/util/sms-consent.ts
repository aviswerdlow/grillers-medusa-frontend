export const SMS_MARKETING_CONSENT_VERSION = "sms-v3-2026-07-10"
export const SMS_MARKETING_PROGRAM = "grillers_pride_marketing"
export const SMS_MARKETING_PROVIDER = "twilio"

export const SMS_MARKETING_OPT_IN_LABEL =
  "Send me Griller's Pride deals and promotional updates"

export const SMS_MARKETING_DISCLOSURE =
  "By checking this box, I agree to receive recurring automated marketing and promotional text messages from Griller's Pride, including specials, holiday promotions, and product availability announcements, at the mobile number provided. Consent is not a condition of purchase. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out or HELP for help."

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1"
}

export function formWantsSmsMarketing(formData: FormData): boolean {
  return truthy(formData.get("sms_marketing_opt_in"))
}

export function buildSmsMarketingConsentMetadata(input: {
  phone: string
  source: string
  consentedAt?: string
}) {
  const consentedAt = input.consentedAt || new Date().toISOString()

  return {
    sms_marketing_opt_in: true,
    sms_consent: true,
    sms_consent_status: "subscribed",
    sms_consent_at: consentedAt,
    sms_consent_source: input.source,
    sms_consent_version: SMS_MARKETING_CONSENT_VERSION,
    sms_consent_text: SMS_MARKETING_DISCLOSURE,
    sms_consent_phone: input.phone,
    sms_consent_provider: SMS_MARKETING_PROVIDER,
    sms_program: SMS_MARKETING_PROGRAM,
    sms_consent_purpose: "marketing",
    sms_consent_method: "customer_checkbox",
  }
}
