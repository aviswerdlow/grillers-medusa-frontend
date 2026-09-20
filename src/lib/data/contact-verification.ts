"use server"

import { revalidateTag } from "next/cache"
import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheTag } from "@lib/data/cookies"
import { retrieveCustomer, addCustomerAddress } from "@lib/data/customer"
import { getStaffImpersonationSession } from "@lib/data/staff/impersonation"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { isValidUSPhone, stripPhone } from "@lib/util/format-phone"
import {
  normalizeSmsMarketingPhone,
} from "@lib/util/sms-consent"
import {
  CONTACT_VERIFICATION_VERSION,
  collectPhoneCandidates,
  isMigratedCustomer,
} from "@lib/util/contact-verification"

const ALERT_PATH = "src/lib/data/contact-verification.ts"

export type ContactVerificationState = {
  success: boolean
  error: string | null
  smsOptedIn?: boolean
} | null

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}

/**
 * One submit confirms all three: primary mobile (+ optional SMS marketing
 * consent — TCPA express written consent, never required to complete the
 * flow), primary email, and default shipping address. Writes are ordered
 * so a partial failure never records a false "verified" state: the
 * verification stamp is part of the same customer update as the phone +
 * consent, and the address default is set first.
 */
export async function submitContactVerification(
  _currentState: ContactVerificationState,
  formData: FormData
): Promise<ContactVerificationState> {
  // Staff impersonation must never produce a customer-consent record —
  // staff have their own assisted flow with its own consent language.
  // Fail CLOSED: if the impersonation check itself errors, refuse rather
  // than risk writing consent from an unknown session state.
  let impersonation
  try {
    impersonation = await getStaffImpersonationSession()
  } catch {
    return { success: false, error: "Please try again in a moment." }
  }
  if (impersonation) {
    return {
      success: false,
      error:
        "Contact verification can only be completed by the customer. Exit the staff session first.",
    }
  }

  const customer = await retrieveCustomer().catch(() => null)
  if (!customer) {
    return { success: false, error: "Please sign in again to continue." }
  }

  // Scope: migrated (pre-launch) customers only — post-launch signups
  // already provided and consented to everything at registration.
  if (!isMigratedCustomer(customer)) {
    return {
      success: false,
      error: "Your account is already up to date — nothing to confirm here.",
    }
  }

  // ── Primary mobile ────────────────────────────────────────────────
  const smsOptIn = formData.get("sms_marketing_opt_in") === "on"
  const phoneChoice = (formData.get("primary_phone") as string) || ""
  const otherPhoneRaw = (formData.get("primary_phone_other") as string) || ""
  const candidates = collectPhoneCandidates(customer)
  let primaryPhone = ""

  if (phoneChoice === "other") {
    const consentPhone = smsOptIn
      ? normalizeSmsMarketingPhone(otherPhoneRaw)
      : null
    if (
      smsOptIn
        ? !consentPhone
        : !isValidUSPhone(otherPhoneRaw) || !otherPhoneRaw
    ) {
      return {
        success: false,
        error: "Enter a valid 10-digit US mobile number.",
      }
    }
    primaryPhone = consentPhone || stripPhone(otherPhoneRaw)
  } else {
    const consentPhone = smsOptIn
      ? normalizeSmsMarketingPhone(phoneChoice)
      : null
    primaryPhone = consentPhone || (smsOptIn ? "" : stripPhone(phoneChoice))
    const known = candidates.some((c) => c.value === primaryPhone)
    if (!known || primaryPhone.length !== 10) {
      return {
        success: false,
        error: "Choose which number is your mobile, or enter a new one.",
      }
    }
  }

  // ── Email ─────────────────────────────────────────────────────────
  const emailChoice = (formData.get("email_choice") as string) || "current"
  const preferredEmailRaw = (
    (formData.get("preferred_email") as string) || ""
  ).trim()
  let preferredEmail: string | null = null
  if (emailChoice === "different") {
    if (!isPlausibleEmail(preferredEmailRaw)) {
      return {
        success: false,
        error: "Enter a valid email address, or confirm the one on file.",
      }
    }
    if (preferredEmailRaw.toLowerCase() === (customer.email || "").toLowerCase()) {
      preferredEmail = null // "different" that matches = confirming current
    } else {
      preferredEmail = preferredEmailRaw
    }
  }

  // ── Shipping address ──────────────────────────────────────────────
  const addresses = customer.addresses || []
  const addressChoice = (formData.get("primary_address_id") as string) || ""
  const wantsNewAddress = addressChoice === "new"
  if (!wantsNewAddress && addresses.length > 0) {
    const knownAddress = addresses.some((a) => a.id === addressChoice)
    if (!knownAddress) {
      return {
        success: false,
        error: "Choose your primary shipping address, or add a new one.",
      }
    }
  }
  if (!wantsNewAddress && addresses.length === 0) {
    return { success: false, error: "Add a shipping address to continue." }
  }

  let savedAddressId = wantsNewAddress ? "" : addressChoice

  let stage:
    | "address_default"
    | "address_create"
    | "customer_update"
    | "cache_revalidate" = wantsNewAddress ? "address_create" : "address_default"

  try {
    const headers = { ...(await getAuthHeaders()) }

    // 1) Address first — if this fails, nothing has been stamped yet.
    if (wantsNewAddress) {
      stage = "address_create"
      const newAddress1 = ((formData.get("new_address_1") as string) || "").trim()
      const newCity = ((formData.get("new_city") as string) || "").trim()
      const newProvince = ((formData.get("new_province") as string) || "").trim()
      const newPostal = ((formData.get("new_postal_code") as string) || "").trim()
      if (!newAddress1 || !newCity || !newProvince || !newPostal) {
        return {
          success: false,
          error: "New address needs street, city, state, and ZIP.",
        }
      }

      // Idempotency on retry/double-submit: if an identical address is
      // already on file (e.g. a previous attempt created it but the
      // customer update failed), flip it to default instead of creating
      // a duplicate. Mirrors saveAddressToProfileAndCart's dedupe key.
      const existing = addresses.find(
        (a) =>
          (a.address_1 || "").trim().toLowerCase() ===
            newAddress1.toLowerCase() &&
          (a.postal_code || "").trim() === newPostal
      )
      if (existing) {
        stage = "address_default"
        savedAddressId = existing.id
        await sdk.client.fetch(
          `/store/customers/me/addresses/${existing.id}`,
          {
            method: "POST",
            body: { is_default_shipping: true },
            headers,
          }
        )
      } else {
        const addressForm = new FormData()
        addressForm.set(
          "first_name",
          ((formData.get("new_first_name") as string) || "").trim() ||
            customer.first_name ||
            ""
        )
        addressForm.set(
          "last_name",
          ((formData.get("new_last_name") as string) || "").trim() ||
            customer.last_name ||
            ""
        )
        addressForm.set("company", (formData.get("new_company") as string) || "")
        addressForm.set("address_1", newAddress1)
        addressForm.set(
          "address_2",
          (formData.get("new_address_2") as string) || ""
        )
        addressForm.set("city", newCity)
        addressForm.set("province", newProvince)
        addressForm.set("postal_code", newPostal)
        addressForm.set("country_code", "us")
        addressForm.set("phone", primaryPhone)
        addressForm.set("is_default_shipping", "on")
        const result = await addCustomerAddress(
          { isDefaultShipping: true },
          addressForm
        )
        if (!result?.success) {
          return {
            success: false,
            error: result?.error || "Could not save the new address.",
          }
        }
        const refreshed = await retrieveCustomer()
        savedAddressId = refreshed?.addresses?.find((a) =>
          (a.address_1 || "").trim().toLowerCase() === newAddress1.toLowerCase() &&
          (a.postal_code || "").trim() === newPostal)?.id || ""
        if (!savedAddressId) throw new Error("Saved address could not be confirmed")
      }
    } else {
      // Minimal, field-preserving default-shipping flip (the full
      // updateCustomerAddress action expects a complete address form).
      stage = "address_default"
      await sdk.client.fetch(
        `/store/customers/me/addresses/${addressChoice}`,
        {
          method: "POST",
          body: { is_default_shipping: true },
          headers,
        }
      )
    }

    // The backend locks the authenticated customer and changes the primary
    // destination, communications consent and attestation in one transaction.
    stage = "customer_update"
    await sdk.client.fetch(`/store/customers/me/contact`, {
      method: "POST",
      body: {
        phone: primaryPhone,
        expected_revision: Number(formData.get("contact_revision")),
        request_id: formData.get("contact_request_id"),
        sms_marketing_opt_in: smsOptIn,
        confirmation: { version: CONTACT_VERIFICATION_VERSION,
          address_id: savedAddressId, preferred_email: preferredEmail },
      },
      headers,
    })

    stage = "cache_revalidate"
    const cacheTag = await getCacheTag("customers")
    revalidateTag(cacheTag)

    return { success: true, error: null, smsOptedIn: smsOptIn }
  } catch (error: any) {
    await emitStorefrontOpsAlert({
      alertKind: "contact_verification_failed",
      severity: "warn",
      title: "First-login contact verification failed to persist",
      path: ALERT_PATH,
      fingerprint: `contact_verification:${stage}`,
      meta: {
        stage,
        has_customer: true,
        wanted_new_address: wantsNewAddress,
        sms_opt_in: smsOptIn,
        error_code: "contact_persistence_failed",
      },
    }).catch(() => {})
    return {
      success: false,
      error:
        "We couldn't save your confirmation. Refresh this page and try again; your saved address is kept.",
    }
  }
}

/** The required legacy confirmation has no skip control. */
export async function skipContactVerification(): Promise<{ ok: boolean }> {
  return { ok: false }
}
