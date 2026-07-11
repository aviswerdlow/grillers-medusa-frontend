import {
  SMS_MARKETING_CONSENT_VERSION,
  SMS_MARKETING_DISCLOSURE,
  SMS_MARKETING_OPT_IN_LABEL,
  SMS_MARKETING_PROGRAM,
  SMS_MARKETING_PROVIDER,
  buildSmsMarketingConsentMetadata,
  formWantsSmsMarketing,
} from "@lib/util/sms-consent"

describe("sms consent helpers", () => {
  it("defines one explicit marketing-only v3 program", () => {
    expect(SMS_MARKETING_CONSENT_VERSION).toBe("sms-v3-2026-07-10")
    expect(SMS_MARKETING_PROGRAM).toBe("grillers_pride_marketing")
    expect(SMS_MARKETING_OPT_IN_LABEL).toMatch(/deals and promotional updates/i)
    expect(SMS_MARKETING_DISCLOSURE).toBe(
      "By checking this box, I agree to receive recurring automated marketing and promotional text messages from Griller's Pride, including seasonal specials, product announcements, promotional offers, and holiday sales deadlines, at the mobile number provided. Consent is not a condition of purchase. Message frequency varies, up to 6 messages per month. Msg & data rates may apply. Reply STOP to opt out or HELP for help."
    )
    expect(SMS_MARKETING_DISCLOSURE).not.toMatch(/order|delivery|pickup/i)
  })

  it("requires an affirmative checkbox value", () => {
    const optedIn = new FormData()
    optedIn.set("sms_marketing_opt_in", "on")
    expect(formWantsSmsMarketing(optedIn)).toBe(true)

    const notOptedIn = new FormData()
    expect(formWantsSmsMarketing(notOptedIn)).toBe(false)
  })

  it("builds auditable Twilio-ready consent metadata", () => {
    const metadata = buildSmsMarketingConsentMetadata({
      phone: "4045550100",
      source: "account_signup",
      consentedAt: "2026-06-02T12:00:00.000Z",
    })

    expect(metadata).toMatchObject({
      sms_marketing_opt_in: true,
      sms_consent: true,
      sms_consent_status: "subscribed",
      sms_consent_at: "2026-06-02T12:00:00.000Z",
      sms_consent_source: "account_signup",
      sms_consent_version: SMS_MARKETING_CONSENT_VERSION,
      sms_consent_text: SMS_MARKETING_DISCLOSURE,
      sms_consent_phone: "4045550100",
      sms_consent_provider: SMS_MARKETING_PROVIDER,
      sms_program: SMS_MARKETING_PROGRAM,
      sms_consent_purpose: "marketing",
      sms_consent_method: "customer_checkbox",
    })
  })
})
