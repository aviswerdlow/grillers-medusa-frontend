"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheTag } from "./cookies"
import { getStaffImpersonationSession } from "./staff/impersonation"
import { normalizePrimaryPhone } from "@lib/util/customer-contact-state"
import { revalidateTag } from "next/cache"

export async function updatePrimaryContact(_state: unknown, formData: FormData) {
  try {
    if (await getStaffImpersonationSession()) return { success: false, error: "Exit staff context. Only the customer can confirm this number and text choices." }
    const phone = normalizePrimaryPhone(formData.get("phone"))
    if (!phone) return { success: false, error: "Enter a valid 10-digit US mobile number." }
    await sdk.client.fetch("/store/customers/me/contact", { method: "POST",
      headers: { ...await getAuthHeaders() }, body: { phone,
        expected_revision: Number(formData.get("contact_revision")),
        request_id: formData.get("contact_request_id"),
        sms_marketing_opt_in: formData.get("sms_marketing_opt_in") === "on" } })
    revalidateTag(await getCacheTag("customers"))
    return { success: true, error: null }
  } catch {
    return { success: false, error: "We could not save this change. Refresh the page and try again." }
  }
}
