"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { reportInvoiceApplicationFailure } from "@lib/account-ops-alerts"

/**
 * #279 / #291 — self-serve B2B "pay by invoice" application.
 *
 * Submits the logged-in customer's application to the backend intake route, which stores it as
 * pending and notifies the approvers (Peter / Avi / Julie). Mirrors the updateCustomerPassword
 * action shape: build the payload from FormData, attach the customer JWT via getAuthHeaders(),
 * and return { success, error } for useActionState.
 */
export async function submitInvoiceApplication(
  _currentState: { success: boolean; error: string | null },
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  if (process.env.GP_INSTITUTIONAL_TERMS_ENABLED !== "true") {
    return { success: false, error: "Invoice terms are unavailable." }
  }
  const business_name = String(formData.get("business_name") ?? "").trim()
  const contact_name = String(formData.get("contact_name") ?? "").trim()
  const contact_email = String(formData.get("contact_email") ?? "").trim()
  const contact_phone = String(formData.get("contact_phone") ?? "").trim()
  const tax_id = String(formData.get("tax_id") ?? "").trim()
  const requested_credit_limit = String(
    formData.get("requested_credit_limit") ?? ""
  ).trim()
  const notes = String(formData.get("notes") ?? "").trim()
  const methods = formData.getAll("methods").map((m) => String(m))

  if (!business_name || !contact_name || !contact_email) {
    return {
      success: false,
      error: "Business name, contact name, and contact email are required.",
    }
  }

  let hasAuth = false
  let stage: "auth_headers" | "application_submit" = "auth_headers"

  try {
    stage = "auth_headers"
    const headers = { ...(await getAuthHeaders()) }
    hasAuth = Boolean(headers.authorization)
    if (!("authorization" in headers)) {
      return {
        success: false,
        error: "Please sign in to apply for invoice terms.",
      }
    }

    stage = "application_submit"
    await sdk.client.fetch<{ status?: string }>(
      `/store/grillers/invoice-applications`,
      {
        method: "POST",
        headers,
        body: {
          business_name,
          tax_id,
          contact_name,
          contact_email,
          contact_phone,
          requested_credit_limit,
          methods,
          notes,
        },
        cache: "no-store",
      }
    )

    return { success: true, error: null }
  } catch (err: any) {
    reportInvoiceApplicationFailure({
      stage,
      error: err,
      hasAuth,
      hasTaxId: Boolean(tax_id),
      hasRequestedCreditLimit: Boolean(requested_credit_limit),
      hasNotes: Boolean(notes),
      methodCount: methods.length,
    })

    return {
      success: false,
      error:
        err?.data?.message ||
        err?.message ||
        "Could not submit your application. Please try again.",
    }
  }
}
