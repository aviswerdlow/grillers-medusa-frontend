import { HttpTypes } from "@medusajs/types"
import { normalizeSmsMarketingPhone } from "@lib/util/sms-consent"

import { CONTACT_CONFIRMATION_VERSION, hasContactConfirmation, hasMigrationProvenance } from "./customer-contact-state"

/** Explicit legacy provenance determines eligibility, never creation dates. */
export const CONTACT_VERIFICATION_VERSION = CONTACT_CONFIRMATION_VERSION

export const CONTACT_VERIFIED_AT_KEY = "contact_verified_at"
export const CONTACT_VERIFIED_VERSION_KEY = "contact_verified_version"
export const CONTACT_VERIFY_SKIPPED_AT_KEY = "contact_verify_skipped_at"
export const PREFERRED_EMAIL_KEY = "preferred_contact_email"
export const EMAIL_CONFIRMED_AT_KEY = "email_confirmed_at"

type CustomerLike = Pick<
  HttpTypes.StoreCustomer,
  "created_at" | "metadata" | "phone" | "addresses" | "email"
>

export function hasCompletedContactVerification(
  customer: CustomerLike | null | undefined
): boolean {
  return hasContactConfirmation(customer?.metadata)
}

export function hasSkippedContactVerification(
  customer: CustomerLike | null | undefined
): boolean {
  return Boolean(customer?.metadata?.[CONTACT_VERIFY_SKIPPED_AT_KEY])
}

/** Existing source identity is preserved through repeated migration deltas. */
export function isMigratedCustomer(customer: CustomerLike | null | undefined): boolean {
  return Boolean(customer && hasMigrationProvenance(customer.metadata))
}

/**
 * Migrated customer who hasn't completed the flow. Earlier skips no longer
 * count: the "Remind me later" escape hatch was removed (2026-07-07) —
 * previously-skipped customers are re-prompted and must confirm.
 */
export function needsContactVerification(
  customer: CustomerLike | null | undefined
): boolean {
  if (!customer) return false
  if (hasCompletedContactVerification(customer)) return false
  return isMigratedCustomer(customer)
}

/** Skipped earlier but still unverified — surface a gentle reminder. */
export function shouldShowVerificationReminder(
  customer: CustomerLike | null | undefined
): boolean {
  if (!customer) return false
  if (hasCompletedContactVerification(customer)) return false
  if (!hasSkippedContactVerification(customer)) return false
  return isMigratedCustomer(customer)
}

export type PhoneCandidate = {
  /** digits-only, 10-digit US number */
  value: string
  /** where we saw it — helps the customer recognize it */
  sources: string[]
}

/**
 * Every distinct 10-digit US number we hold for this customer: the profile
 * phone (synced from QuickBooks) plus each saved-address phone (populated
 * from order history). Deduped digits-only; label by source.
 */
export function collectPhoneCandidates(
  customer: CustomerLike | null | undefined
): PhoneCandidate[] {
  if (!customer) return []
  const seen = new Map<string, Set<string>>()

  const add = (raw: string | null | undefined, source: string) => {
    const digits = normalizeSmsMarketingPhone(raw)
    if (!digits) return
    if (!seen.has(digits)) seen.set(digits, new Set())
    seen.get(digits)!.add(source)
  }

  add(customer.phone, "your account profile")
  for (const address of customer.addresses || []) {
    const label = [address.address_1, address.city]
      .filter(Boolean)
      .join(", ")
    add(address.phone, label ? `saved address (${label})` : "a saved address")
  }

  return Array.from(seen.entries()).map(([value, sources]) => ({
    value,
    sources: Array.from(sources),
  }))
}

/** (404) 643-1567 display formatting for a digits-only 10-digit number. */
export function formatPhoneForDisplay(digits: string): string {
  if (digits.length !== 10) return digits
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
