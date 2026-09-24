"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheTag } from "./cookies"
import { retrieveCustomer, updateCustomer } from "./customer"
import { calendarHttpStatus } from "@lib/fulfillment-calendar-rollout"
import { buildSmsMarketingConsentMetadata } from "@lib/util/sms-consent"
import { getStaffImpersonationSession } from "./staff/impersonation"
import { normalizePrimaryPhone } from "@lib/util/customer-contact-state"
import { revalidateTag } from "next/cache"

export async function updatePrimaryContact(
  _state: unknown,
  formData: FormData
): Promise<{ success: boolean; error: string | null; notice?: string | null }> {
  try {
    if (await getStaffImpersonationSession())
      return {
        success: false,
        error:
          "Exit staff context. Only the customer can confirm this number and text choices.",
      }
    const phone = normalizePrimaryPhone(formData.get("phone"))
    if (!phone)
      return {
        success: false,
        error: "Enter a valid 10-digit US mobile number.",
      }
    let compatibility = false
    const optedIn = formData.get("sms_marketing_choice_unavailable") === "true"
      ? undefined : formData.get("sms_marketing_opt_in") === "on"
    try {
      await sdk.client.fetch("/store/customers/me/contact", {
        method: "POST",
        headers: { ...(await getAuthHeaders()) },
        body: {
          phone,
          expected_revision: Number(formData.get("contact_revision")),
          request_id: formData.get("contact_request_id"),
          sms_marketing_opt_in: optedIn,
        },
      })
    } catch (error) {
      if (calendarHttpStatus(error) !== 404) throw error
      const current = await retrieveCustomer()
      if (
        !current ||
        current.metadata?.primary_contact_v1 != null ||
        current.metadata?.contact_confirmation_v2 != null
      )
        throw new Error(
          "An accepted primary contact cannot use the older edit path."
        )
      if (await getStaffImpersonationSession())
        throw new Error("Customer context changed")
      // Current backend main supports ordinary profile edits. Record only the
      // checkbox actually shown/chosen; no attestation/provenance is invented.
      const metadata = optedIn === undefined ? {} : optedIn
        ? buildSmsMarketingConsentMetadata({ phone, source: "account_profile" })
        : {
            sms_marketing_opt_in: false,
            sms_consent: false,
            sms_consent_status: "unsubscribed",
            sms_consent_at: null,
            sms_consent_phone: phone,
            sms_opt_out_at: new Date().toISOString(),
            sms_opt_out_phone: phone,
          }
      await updateCustomer({ phone, metadata })
      compatibility = true
    }
    revalidateTag(await getCacheTag("customers"))
    return {
      success: true,
      error: null,
      notice: compatibility
        ? "Phone saved. Your contact details still need confirmation; existing orders keep their recorded details."
        : null,
    }
  } catch {
    return {
      success: false,
      error: "We could not save this change. Refresh the page and try again.",
    }
  }
}
