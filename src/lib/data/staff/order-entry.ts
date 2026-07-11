"use server"

import "server-only"

import { sdk } from "@lib/config"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { getRegion } from "@lib/data/regions"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { sendEmail } from "@lib/postmark"
import { staffDisplayName, canUseOfficeConsole } from "@lib/util/staff-access"
import { stripPhone } from "@lib/util/format-phone"
import medusaError from "@lib/util/medusa-error"
import {
  checkStaffInventoryAvailability,
  inventoryLineMessage,
  type InventoryAvailabilityLine,
} from "@lib/data/inventory-allocation"
import {
  resolvePricingMode,
  type PriceDisplayMode,
} from "@lib/util/price-display"
import type { HttpTypes } from "@medusajs/types"
import { randomBytes } from "crypto"
import { revalidateTag } from "next/cache"
import { getCacheTag } from "../cookies"
import {
  parseStaffCustomerAccountCredits,
  parseStaffCustomerAccountNotes,
  staffCustomerAccountCreditBalance,
  staffCustomerAccountCreditBalanceMinor,
  type StaffCustomerAccountCredit,
  type StaffCustomerAccountNote,
  type StaffCustomerAccountReasonCode,
} from "./customer-account-ledger"
import { signStaffCartHandoff } from "./order-token"

type AnyRecord = Record<string, any>

const STRIPE_CARD_PROVIDER_ID = "pp_stripe_stripe"

export type StaffCustomerSummary = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string
  company: string
  qbdCustomerType: string
  alternateContactName: string
  alternateContactPhone: string
  alternateContactPhoneType: "" | "mobile" | "landline"
  defaultAddress?: StaffAddressInput
  accountClaimStatus?: string
  accountClaimMessage?: string
  source: "customer" | "order" | "legacy_order"
  matchedLegacyOrderId?: string
  matchedLegacyOrderDisplayId?: string
}

export type StaffRecentOrder = {
  id: string
  displayId: string
  createdAt: string
  status: string
  total: number
  currencyCode: string
  items: StaffRecentOrderItem[]
  shippingAddress?: StaffAddressInput
}

export type StaffRecentOrderItem = {
  title: string
  quantity: number
  variantId?: string
  sku?: string
}

export type StaffLegacyOrderItem = {
  id: string
  title: string
  description?: string
  quantity: number
  unitPrice: number
  lineTotal: number
  sku?: string
  mappingStatus?: string
  lineKind?: string
  variantId?: string
  purchaseHistoryKey?: string
  legacyOrderId?: string
}

export type StaffLegacyOrder = {
  id: string
  displayId: string
  placedAt: string
  status: string
  total: number
  currencyCode: string
  lineCount: number
  customerName: string
  email: string
  items: StaffLegacyOrderItem[]
}

export type StaffCustomerContext = StaffCustomerSummary & {
  recentOrders: StaffRecentOrder[]
  legacyOrders: StaffLegacyOrder[]
  accountCredits: StaffCustomerAccountCredit[]
  accountNotes: StaffCustomerAccountNote[]
  accountCreditBalance: number
  accountCreditBalanceMinor: number
}

export type StaffProductSearchResult = {
  productId: string
  title: string
  handle: string
  thumbnail?: string
  variantId: string
  variantTitle: string
  sku: string
  qbdListId?: string
  inventoryQuantity?: number
  manageInventory?: boolean
  allowBackorder?: boolean
  calculatedAmount?: number
  currencyCode?: string
  pricingMode?: PriceDisplayMode
  availability?: InventoryAvailabilityLine
}

export type StaffAddressInput = {
  id?: string
  firstName: string
  lastName: string
  company?: string
  address1: string
  address2?: string
  city: string
  province: string
  postalCode: string
  countryCode: string
  phone?: string
}

export type StaffOrderLineInput = {
  variantId: string
  quantity: number
  title: string
  sku?: string
  availability?: InventoryAvailabilityLine
  overrideReason?: string
  overrideNote?: string
  substitutionPreference?: string
  source?: "product_search" | "legacy_order_history"
  legacyPurchaseHistoryKey?: string
  legacyOrderId?: string
  legacyOrderLineId?: string
}

export type StaffPaymentMode = "send_checkout_link" | "collect_card_now"

export type StaffPrepareOrderInput = {
  countryCode: string
  customer: {
    id?: string
    email: string
    firstName?: string
    lastName?: string
    phone?: string
    company?: string
  }
  shippingAddress: StaffAddressInput
  billingAddress?: StaffAddressInput
  sameAsShipping: boolean
  lines: StaffOrderLineInput[]
  fulfillmentType:
    | "plant_pickup"
    | "atlanta_delivery"
    | "ups_shipping"
    | "southeast_pickup"
  scheduledDate?: string
  scheduledTimeWindow?: string
  pickupLocationId?: string
  customerVerified: boolean
  paymentMode: StaffPaymentMode
  paymentConsent: boolean
  sendConfirmation: boolean
  orderNotes?: string
  substitutionPreference?: string
  deliveryInstructions?: string
  giftNotes?: string
}

export type StaffPrepareOrderResult = {
  ok: boolean
  cartId?: string
  checkoutUrl?: string
  cart?: HttpTypes.StoreCart
  paymentProviderId?: string
  paymentClientSecret?: string
  confirmationSent?: boolean
  confirmationMessage?: string
  error?: string
}

export type StaffCompleteOrderResult = {
  ok: boolean
  orderId?: string
  displayId?: string
  confirmationSent?: boolean
  confirmationMessage?: string
  error?: string
}

const MEDUSA_BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/+$/, "")

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

function adminToken(): string {
  const token =
    process.env.MEDUSA_ADMIN_API_TOKEN || process.env.MEDUSA_API_TOKEN || ""

  if (!token) {
    throw new Error(
      "MEDUSA_ADMIN_API_TOKEN missing. Staff order entry cannot access customer or inventory data."
    )
  }

  return token
}

function storeHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-publishable-api-key": PUBLISHABLE_KEY,
  }
}

function adminHeaders(): HeadersInit {
  const token = adminToken()
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
  }
}

function queryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(`${key}[]`, String(item)))
      return
    }
    search.set(key, String(value))
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

async function adminFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, unknown> } = {}
): Promise<T> {
  const res = await fetch(
    `${MEDUSA_BACKEND_URL}${path}${queryString(init.query || {})}`,
    {
      ...init,
      headers: {
        ...adminHeaders(),
        ...(init.headers || {}),
      },
      cache: "no-store",
    }
  )

  const json = (await res.json().catch(() => ({}))) as AnyRecord
  if (!res.ok) {
    throw new Error(json.message || json.error || res.statusText)
  }
  return json as T
}

async function storeFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, unknown> } = {}
): Promise<T> {
  const res = await fetch(
    `${MEDUSA_BACKEND_URL}${path}${queryString(init.query || {})}`,
    {
      ...init,
      headers: {
        ...storeHeaders(),
        ...(init.headers || {}),
      },
      cache: "no-store",
    }
  )

  const json = (await res.json().catch(() => ({}))) as AnyRecord
  if (!res.ok) {
    throw new Error(json.message || json.error || res.statusText)
  }
  return json as T
}

async function requireStaff() {
  const customer = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!customer) {
    throw new Error("Sign in with a staff account to use phone order entry.")
  }
  // Phone order entry, customer search/creation, and account actions are
  // office-console capabilities — excludes picker/packer/merchandising roles.
  if (!canUseOfficeConsole(customer)) {
    throw new Error("Office console access required.")
  }
  return customer
}

function toStaffAddress(
  address: AnyRecord | null | undefined
): StaffAddressInput | undefined {
  if (!address) return undefined
  return {
    id: address.id,
    firstName: address.first_name || "",
    lastName: address.last_name || "",
    company: address.company || "",
    address1: address.address_1 || "",
    address2: address.address_2 || "",
    city: address.city || "",
    province: address.province || "",
    postalCode: address.postal_code || "",
    countryCode: (address.country_code || "us").toLowerCase(),
    phone: address.phone || "",
  }
}

function appendAuditLog(
  metadata: AnyRecord | null | undefined,
  entry: AnyRecord
): AnyRecord {
  const existing = { ...(metadata || {}) }
  let audit: AnyRecord[] = []
  if (typeof existing.staff_audit_log === "string") {
    try {
      const parsed = JSON.parse(existing.staff_audit_log)
      if (Array.isArray(parsed)) audit = parsed
    } catch {
      audit = []
    }
  }

  audit.push({ at: new Date().toISOString(), ...entry })
  return {
    ...existing,
    staff_audit_log: JSON.stringify(audit.slice(-50)),
  }
}

function metadataObject(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {}
}

function cleanQbdCustomerType(value?: string): string {
  return metadataText(value)?.slice(0, 100) || ""
}

function qbdCustomerTypeFromMetadata(metadata: AnyRecord): string {
  const explicit =
    metadata.gp_qbd_customer_type ||
    metadata.qbd_customer_type ||
    metadata.qb_customer_type ||
    metadata.quickbooks_customer_type

  return cleanQbdCustomerType(String(explicit || ""))
}

function splitAlternateContactName(value?: string) {
  const name = metadataText(value) || ""
  if (!name) return { firstName: "", lastName: "" }

  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  }
}

function alternateContactNameFromMetadata(metadata: AnyRecord): string {
  const alt = metadataObject(metadata.gp_alt_contact)
  return [alt.first_name, alt.last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ")
}

function alternateContactPhoneTypeFromMetadata(
  metadata: AnyRecord
): "" | "mobile" | "landline" {
  const alt = metadataObject(metadata.gp_alt_contact)
  if (alt.is_mobile === true) return "mobile"
  if (alt.is_mobile === false) return "landline"

  const lineType = String(alt.phone_line_type || alt.line_type || "")
    .trim()
    .toLowerCase()
  if (lineType === "mobile" || lineType === "landline") return lineType

  return ""
}

function customerProfileExtraMetadata(input: {
  qbdCustomerType?: string
  alternateContactName?: string
  alternateContactPhone?: string
  alternateContactPhoneType?: "" | "mobile" | "landline"
}): AnyRecord {
  const qbdCustomerType = cleanQbdCustomerType(input.qbdCustomerType)
  const altName = metadataText(input.alternateContactName) || ""
  const altPhone = input.alternateContactPhone
    ? stripPhone(input.alternateContactPhone)
    : ""
  const altPhoneType = input.alternateContactPhoneType || ""

  if (altPhone && altPhone.length !== 10) {
    throw new Error(
      "Enter a complete, valid 10-digit alternate contact phone number."
    )
  }
  if (altPhone && altPhoneType !== "mobile" && altPhoneType !== "landline") {
    throw new Error(
      "Choose whether the alternate contact number is mobile or landline."
    )
  }

  const altNameParts = splitAlternateContactName(altName)

  return {
    gp_qbd_customer_type: qbdCustomerType,
    qbd_customer_type: qbdCustomerType,
    gp_alt_contact:
      altName || altPhone
        ? {
            first_name: altNameParts.firstName || null,
            last_name: altNameParts.lastName || null,
            email: null,
            phone: altPhone || null,
            is_mobile:
              altPhoneType === "mobile"
                ? true
                : altPhoneType === "landline"
                ? false
                : null,
          }
        : null,
  }
}

function toStoreAddress(address: StaffAddressInput): AnyRecord {
  return {
    first_name: address.firstName,
    last_name: address.lastName,
    company: address.company || "",
    address_1: address.address1,
    address_2: address.address2 || "",
    city: address.city,
    province: address.province,
    postal_code: address.postalCode,
    country_code: (address.countryCode || "us").toLowerCase(),
    phone: address.phone ? stripPhone(address.phone) : "",
  }
}

function customerSummary(
  customer: AnyRecord,
  source: StaffCustomerSummary["source"]
): StaffCustomerSummary {
  const defaultAddress =
    customer.addresses?.find((addr: AnyRecord) => addr.is_default_shipping) ||
    customer.addresses?.[0] ||
    customer.shipping_address
  const metadata = metadataObject(customer.metadata)
  const altContact = metadataObject(metadata.gp_alt_contact)

  return {
    id: customer.id,
    email: customer.email || "",
    firstName: customer.first_name || "",
    lastName: customer.last_name || "",
    phone: customer.phone || defaultAddress?.phone || "",
    company: customer.company_name || defaultAddress?.company || "",
    qbdCustomerType: qbdCustomerTypeFromMetadata(metadata),
    alternateContactName: alternateContactNameFromMetadata(metadata),
    alternateContactPhone: String(altContact.phone || ""),
    alternateContactPhoneType: alternateContactPhoneTypeFromMetadata(metadata),
    defaultAddress: toStaffAddress(defaultAddress),
    accountClaimStatus: customer.metadata?.account_claim_status || "",
    accountClaimMessage:
      customer.metadata?.account_claim_error ||
      customer.metadata?.account_claim_path ||
      "",
    source,
  }
}

function splitLegacyCustomerName(name: string | null | undefined) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) {
    return { firstName: "", lastName: "" }
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" }
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  }
}

function legacyOrderCustomerSummary(
  order: AnyRecord
): StaffCustomerSummary | null {
  const medusaCustomerId = String(order.medusa_customer_id || "").trim()
  const fallbackEmail = String(order.email_lower || "").trim()
  const fallbackName = splitLegacyCustomerName(order.customer_name)

  if (!medusaCustomerId && !fallbackEmail && !order.customer_name) {
    return null
  }

  return {
    id: medusaCustomerId || `legacy-order:${order.id}`,
    email: fallbackEmail,
    firstName: fallbackName.firstName,
    lastName: fallbackName.lastName,
    phone: "",
    company: "",
    qbdCustomerType: "",
    alternateContactName: "",
    alternateContactPhone: "",
    alternateContactPhoneType: "",
    source: "legacy_order",
    matchedLegacyOrderId: order.id,
    matchedLegacyOrderDisplayId:
      order.ref_number || order.qbd_txn_id || order.legacy_order_id || order.id,
  }
}

function lineKind(
  metadata: AnyRecord | null | undefined,
  mappingStatus?: string
) {
  return (
    metadata?.line_kind ||
    (mappingStatus === "non_product" ? "non_product" : "product")
  )
}

function legacyOrderSummary(order: AnyRecord): StaffLegacyOrder {
  return {
    id: order.id,
    displayId:
      order.ref_number || order.qbd_txn_id || order.legacy_order_id || order.id,
    placedAt: order.placed_at || "",
    status: order.status || "imported",
    total: currencyAmount(order.total),
    currencyCode: order.currency_code || "usd",
    lineCount: Number(order.line_count || order.lines?.length || 0),
    customerName: order.customer_name || "",
    email: order.email_lower || "",
    items: (order.lines || []).map((line: AnyRecord) => ({
      id: line.id,
      title:
        line.medusa_variant_title ||
        line.medusa_product_title ||
        line.title ||
        line.description ||
        "Legacy item",
      description:
        line.description && line.description !== line.title
          ? line.description
          : undefined,
      quantity: Number(line.quantity || 0),
      unitPrice: currencyAmount(line.unit_price),
      lineTotal: currencyAmount(line.line_total),
      sku: line.sku || undefined,
      mappingStatus: line.mapping_status || undefined,
      lineKind: lineKind(line.metadata, line.mapping_status),
      variantId: line.medusa_variant_id || undefined,
      purchaseHistoryKey: line.purchase_history_key || undefined,
      legacyOrderId: line.legacy_order_id || order.id,
    })),
  }
}

function currencyAmount(amount: number | null | undefined): number {
  if (!Number.isFinite(Number(amount))) return 0
  return Number(amount)
}

function shortName(address: StaffAddressInput): string {
  return [address.firstName, address.lastName].filter(Boolean).join(" ").trim()
}

function validateEmail(email: string): string {
  const trimmed = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error("Enter a valid customer email before preparing the order.")
  }
  return trimmed
}

function validateAddress(address: StaffAddressInput, label: string) {
  if (!address.firstName.trim() || !address.lastName.trim()) {
    throw new Error(`${label} needs a first and last name.`)
  }
  if (!address.address1.trim()) {
    throw new Error(`${label} needs a street address.`)
  }
  if (
    !address.city.trim() ||
    !address.province.trim() ||
    !address.postalCode.trim()
  ) {
    throw new Error(`${label} needs city, state, and ZIP.`)
  }
}

function metadataText(value?: string): string | undefined {
  const trimmed = (value || "").trim()
  return trimmed ? trimmed : undefined
}

function temporaryAccountPassword(): string {
  return `${randomBytes(24).toString("base64url")}A1!`
}

async function createClaimableStoreCustomer(input: {
  email: string
  firstName: string
  lastName: string
  phone?: string
}): Promise<AnyRecord> {
  const token = await sdk.auth.register("customer", "emailpass", {
    email: input.email,
    password: temporaryAccountPassword(),
  })

  const { customer } = await sdk.store.customer.create(
    {
      email: input.email,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: input.phone ? stripPhone(input.phone) : undefined,
    } as any,
    {},
    { authorization: `Bearer ${token}` }
  )

  return customer as AnyRecord
}

async function sendAccountClaimReset(email: string): Promise<{
  ok: boolean
  message?: string
}> {
  try {
    await sdk.auth.resetPassword("customer", "emailpass", {
      identifier: email,
    })
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

function duplicateText(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function duplicateNameKey(input: {
  firstName?: string | null
  lastName?: string | null
}): string {
  return [duplicateText(input.firstName), duplicateText(input.lastName)]
    .filter(Boolean)
    .join("|")
}

function duplicatePostal(value?: string | null): string {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase()
}

function duplicateAddressKey(address?: StaffAddressInput | AnyRecord | null) {
  if (!address) return ""
  const record = address as AnyRecord
  const line1 = duplicateText(record.address1 ?? record.address_1)
  const postal = duplicatePostal(record.postalCode ?? record.postal_code)
  if (!line1 || !postal) return ""
  return [
    line1,
    duplicateText(record.city),
    duplicateText(record.province),
    postal,
  ].join("|")
}

function customerAddresses(customer: AnyRecord): AnyRecord[] {
  return [
    ...(Array.isArray(customer.addresses) ? customer.addresses : []),
    customer.shipping_address,
    customer.billing_address,
  ].filter(Boolean)
}

function staffOrderEntryErrorMessage(error: unknown) {
  const message = (() => {
    if (error instanceof Error) return error.message
    if (typeof error === "string") return error
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  })()

  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(?:legacy-order|order):[A-Za-z0-9_-]+\b/g, "[redacted-id]")
    .replace(
      /\b(?:auth|cus|customer|cart|order|ord|pay|pm|pi|provider|seti|legacy|addr)_[A-Za-z0-9_:-]+/g,
      "[redacted-id]"
    )
}

function shouldAlertStaffCustomerContextFailure(error: unknown) {
  const message = staffOrderEntryErrorMessage(error)
  return ![
    /^Sign in with a staff account/i,
    /^Office console access required/i,
    /^Missing customer ID\./i,
    /^Enter a valid customer email/i,
    /^Customer address needs /i,
    /^Staff note is required\./i,
    /^Credit amount must be greater than zero\./i,
  ].some((pattern) => pattern.test(message))
}

async function emitStaffCustomerContextMutationFailureAlert(input: {
  action:
    | "profile_update"
    | "address_create"
    | "address_update"
    | "customer_note"
    | "customer_credit"
  customerId?: string
  addressId?: string
  hasAmount?: boolean
  hasRelatedOrder?: boolean
  error: unknown
}) {
  if (!shouldAlertStaffCustomerContextFailure(input.error)) return

  const isCredit = input.action === "customer_credit"

  await emitStorefrontOpsAlert({
    alertKind: "staff_customer_context_mutation_failed",
    severity: isCredit ? "page" : "warn",
    title: `Staff customer ${input.action.replace(/_/g, " ")} failed`,
    path: "src/lib/data/staff/order-entry.ts",
    source: "medusa-server",
    fingerprint: `staff_customer_context:${input.action}:failed`,
    meta: {
      staff_module: "phone_order",
      action: input.action,
      has_customer_id: Boolean(input.customerId),
      has_address_id: Boolean(input.addressId),
      has_amount: Boolean(input.hasAmount),
      has_related_order: Boolean(input.hasRelatedOrder),
      qbd_posting_required: isCredit,
      error_message: staffOrderEntryErrorMessage(input.error).slice(0, 300),
    },
  })
}

async function emitDuplicateGuardFailureAlert(input: {
  attemptCount: number
  error: unknown
}) {
  await emitStorefrontOpsAlert({
    alertKind: "staff_customer_duplicate_check_failed",
    severity: "warn",
    title: "Staff customer duplicate check failed",
    path: "src/lib/data/staff/order-entry.ts",
    source: "medusa-server",
    fingerprint: "staff_customer_create:duplicate_check_failed",
    meta: {
      staff_module: "phone_order",
      action: "create_customer",
      attempt_count: input.attemptCount,
      error_message: staffOrderEntryErrorMessage(input.error).slice(0, 300),
    },
  })
}

async function emitProductSearchAvailabilityFailureAlert(input: {
  resultCount: number
  fulfillmentType?: StaffPrepareOrderInput["fulfillmentType"]
  scheduledDate?: string
  error: unknown
}) {
  await emitStorefrontOpsAlert({
    alertKind: "staff_product_search_availability_failed",
    severity: "warn",
    title: "Staff product search availability check failed",
    path: "src/lib/data/staff/order-entry.ts",
    source: "medusa-server",
    fingerprint: "staff_phone_order:product_search_availability_failed",
    meta: {
      staff_module: "phone_order",
      action: "product_search",
      result_count: input.resultCount,
      fulfillment_type: input.fulfillmentType || "plant_pickup",
      scheduled_date_provided: Boolean(input.scheduledDate),
      error_message: staffOrderEntryErrorMessage(input.error).slice(0, 300),
    },
  })
}

function staffSearchQueryKind(query?: string) {
  const value = String(query || "").trim()
  if (!value) return "empty"
  if (value.includes("@")) return "email"
  if (stripPhone(value).length >= 7) return "phone"
  return "text"
}

async function emitStaffCustomerContextDataDegradedAlert(input: {
  stage:
    | "search_recent_orders"
    | "search_legacy_orders"
    | "context_recent_orders"
    | "context_legacy_order_list"
    | "context_legacy_order_detail"
  surface: "search" | "context"
  error: unknown
  query?: string
  customerId?: string
  resultCount?: number
  failureCount?: number
  includeLegacyOrderRequested?: boolean
}) {
  await emitStorefrontOpsAlert({
    alertKind: "staff_customer_context_data_degraded",
    severity: "warn",
    title: `Staff customer context data degraded: ${input.stage}`,
    path: "src/lib/data/staff/order-entry.ts",
    source: "medusa-server",
    fingerprint: `staff_customer_context:${input.stage}:degraded`,
    meta: {
      staff_module: "phone_order",
      surface: input.surface,
      stage: input.stage,
      query_kind:
        input.surface === "search" ? staffSearchQueryKind(input.query) : null,
      has_customer_id: Boolean(input.customerId),
      result_count: input.resultCount ?? null,
      failure_count: input.failureCount ?? null,
      include_legacy_order_requested: Boolean(input.includeLegacyOrderRequested),
      error_message: staffOrderEntryErrorMessage(input.error).slice(0, 300),
    },
  })
}

async function emitStaffOrderAvailabilityFailureAlert(input: {
  action: "prepare_order" | "complete_order"
  lineCount: number
  fulfillmentType?: string
  scheduledDate?: string
  cartId?: string
  error: unknown
}) {
  await emitStorefrontOpsAlert({
    alertKind: "staff_order_availability_check_failed",
    severity: "page",
    title: "Staff order availability check failed",
    path: "src/lib/data/staff/order-entry.ts",
    source: "medusa-server",
    fingerprint: `staff_phone_order:${input.action}:availability_check_failed`,
    meta: {
      staff_module: "phone_order",
      action: input.action,
      line_count: input.lineCount,
      fulfillment_type: input.fulfillmentType || "",
      scheduled_date_provided: Boolean(input.scheduledDate),
      cart_id: input.cartId || "",
      error_message: staffOrderEntryErrorMessage(input.error).slice(0, 300),
    },
  })
}

function duplicateReasonsForCustomer({
  customer,
  email,
  phone,
  nameKey,
  addressKey,
}: {
  customer: AnyRecord
  email: string
  phone: string
  nameKey: string
  addressKey: string
}): string[] {
  const reasons: string[] = []
  if (duplicateText(customer.email) === email) reasons.push("email")

  const customerPhone = stripPhone(customer.phone || "")
  const addressPhones = customerAddresses(customer).map((address) =>
    stripPhone(address.phone || "")
  )
  if (
    phone &&
    (customerPhone === phone ||
      addressPhones.some((candidate) => candidate === phone))
  ) {
    reasons.push("phone")
  }

  const customerNameKey = duplicateNameKey({
    firstName: customer.first_name,
    lastName: customer.last_name,
  })
  if (
    nameKey &&
    addressKey &&
    customerNameKey === nameKey &&
    customerAddresses(customer).some(
      (address) => duplicateAddressKey(address) === addressKey
    )
  ) {
    reasons.push("name/address")
  }

  return reasons
}

async function findDuplicateCustomersForCreate(input: {
  email: string
  firstName: string
  lastName: string
  phone?: string
  defaultAddress?: StaffAddressInput
}): Promise<Array<{ customer: AnyRecord; reasons: string[] }>> {
  const email = duplicateText(input.email)
  const phone = stripPhone(input.phone || input.defaultAddress?.phone || "")
  const nameKey = duplicateNameKey(input)
  const addressKey = duplicateAddressKey(input.defaultAddress)
  const attempts: Array<Record<string, string | number>> = [
    { email, limit: 8 },
    { q: email, limit: 8 },
  ]

  if (phone.length >= 7) {
    attempts.push({ phone, limit: 8 })
    attempts.push({ q: phone, limit: 8 })
  }
  if (input.firstName.trim() && input.lastName.trim()) {
    attempts.push({
      q: `${input.firstName.trim()} ${input.lastName.trim()}`,
      limit: 12,
    })
  }

  const seen = new Map<string, AnyRecord>()
  let successfulAttempts = 0
  let lastError: unknown = null

  for (const attempt of attempts) {
    try {
      const { customers } = await adminFetch<{ customers: AnyRecord[] }>(
        "/admin/customers",
        {
          query: {
            ...attempt,
            fields:
              "id,email,first_name,last_name,phone,company_name,metadata,*addresses",
          },
        }
      )
      successfulAttempts += 1
      customers?.forEach((customer) => {
        if (customer?.id) seen.set(customer.id, customer)
      })
    } catch (error) {
      lastError = error
    }
  }

  if (successfulAttempts === 0 && lastError) {
    await emitDuplicateGuardFailureAlert({
      attemptCount: attempts.length,
      error: lastError,
    })
    throw new Error(
      "Could not verify duplicate customers. Try again before creating this customer."
    )
  }

  return Array.from(seen.values())
    .map((customer) => ({
      customer,
      reasons: duplicateReasonsForCustomer({
        customer,
        email,
        phone,
        nameKey,
        addressKey,
      }),
    }))
    .filter((candidate) => candidate.reasons.length > 0)
}

function duplicateCustomerMessage(
  duplicates: Array<{ customer: AnyRecord; reasons: string[] }>
) {
  const preview = duplicates
    .slice(0, 3)
    .map(({ customer, reasons }) => {
      const name =
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        customer.email ||
        customer.id
      return `${name} (${reasons.join(", ")})`
    })
    .join("; ")

  return `Potential duplicate customer found: ${preview}. Select the existing customer instead of creating a new profile.`
}

function serviceCodesForFulfillment(
  type: StaffPrepareOrderInput["fulfillmentType"]
) {
  switch (type) {
    case "plant_pickup":
      return ["PICKUP"]
    case "atlanta_delivery":
      return ["ATLANTA_DELIVERY", "LOCAL_DELIVERY"]
    case "southeast_pickup":
      return ["SCHEDULED_DELIVERY", "SOUTHEAST_PICKUP"]
    case "ups_shipping":
      return [
        "GROUND",
        "UPS_GROUND",
        "3_DAY_SELECT",
        "2ND_DAY_AIR",
        "OVERNIGHT",
      ]
  }
}

async function findStaffShippingOption(
  cartId: string,
  type: StaffPrepareOrderInput["fulfillmentType"]
): Promise<AnyRecord> {
  const { shipping_options } = await storeFetch<{
    shipping_options: AnyRecord[]
  }>("/store/shipping-options", {
    query: {
      cart_id: cartId,
      fields:
        "*service_zone.fulfillment_set.*,*service_zone.fulfillment_set.location.*,*shipping_profile.*",
    },
  })

  const serviceCodes = serviceCodesForFulfillment(type)
  const byServiceCode = shipping_options.find((option) => {
    const serviceCode = option.data?.service_code || option.service_code
    return serviceCode && serviceCodes.includes(serviceCode)
  })
  if (byServiceCode) return byServiceCode

  const byName = shipping_options.find((option) => {
    const name = String(option.name || "").toLowerCase()
    if (type === "plant_pickup")
      return name.includes("pickup") || name.includes("plant")
    if (type === "atlanta_delivery")
      return name.includes("atlanta") || name.includes("local")
    if (type === "southeast_pickup")
      return name.includes("southeast") || name.includes("scheduled")
    return (
      name.includes("ground") || name.includes("ups") || name.includes("ship")
    )
  })
  if (byName) return byName

  if (type === "ups_shipping") {
    const nonPickup = shipping_options.find(
      (option) => option.service_zone?.fulfillment_set?.type !== "pickup"
    )
    if (nonPickup) return nonPickup
  }

  throw new Error(
    `No Medusa shipping option is available for ${type.replace(/_/g, " ")}.`
  )
}

async function retrieveStaffCart(cartId: string): Promise<HttpTypes.StoreCart> {
  const { cart } = await storeFetch<{ cart: HttpTypes.StoreCart }>(
    `/store/carts/${cartId}`,
    {
      query: {
        fields:
          "*items,*items.product,*items.variant,*items.metadata,*region,*shipping_address,*billing_address,*shipping_methods,+subtotal,+total,+shipping_total,+tax_total,+discount_total,*payment_collection,*payment_collection.payment_sessions,+metadata",
      },
    }
  )
  return cart
}

async function listPaymentProviders(regionId: string): Promise<AnyRecord[]> {
  const { payment_providers } = await storeFetch<{
    payment_providers: AnyRecord[]
  }>("/store/payment-providers", { query: { region_id: regionId } })
  return payment_providers || []
}

function isStripeCardProvider(provider: AnyRecord | null | undefined) {
  return String(provider?.id || "") === STRIPE_CARD_PROVIDER_ID
}

function buildCheckoutUrl(countryCode: string, token: string): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    "https://grillers-medusa-frontend.vercel.app"
  const origin = base.startsWith("http") ? base : `https://${base}`
  return `${origin}/api/staff/phone-order/handoff?token=${encodeURIComponent(
    token
  )}`
}

function linesSummary(lines: StaffOrderLineInput[]) {
  return lines
    .map(
      (line) =>
        `${line.quantity} x ${line.title}${line.sku ? ` (${line.sku})` : ""}`
    )
    .join("\n")
}

async function sendReviewLinkEmail({
  to,
  checkoutUrl,
  staffName,
  lines,
  metadata,
}: {
  to: string
  checkoutUrl: string
  staffName: string
  lines: StaffOrderLineInput[]
  metadata: Record<string, string>
}) {
  return sendEmail({
    to,
    subject: "Review your Grillers Pride phone order",
    tag: "staff-phone-order",
    metadata,
    htmlBody: `
      <p>Grillers Pride entered this order on your behalf while speaking with you.</p>
      <p><strong>Staff representative:</strong> ${staffName}</p>
      <pre style="font-family:inherit;white-space:pre-wrap">${linesSummary(
        lines
      )}</pre>
      <p>Please review the items, quantities, fulfillment details, and estimated total before payment.</p>
      <p>Your card is saved at checkout. We charge the final weighed total when the order is packed and ready to leave.</p>
      <p><a href="${checkoutUrl}">Review and pay for your order</a></p>
      <p>If anything is wrong, call Grillers Pride before completing checkout.</p>
    `,
    textBody: [
      "Grillers Pride entered this order on your behalf while speaking with you.",
      `Staff representative: ${staffName}`,
      "",
      linesSummary(lines),
      "",
      "Please review the items, quantities, fulfillment details, and estimated total before payment.",
      "Your card is saved at checkout. We charge the final weighed total when the order is packed and ready to leave.",
      "",
      checkoutUrl,
      "",
      "If anything is wrong, call Grillers Pride before completing checkout.",
    ].join("\n"),
  })
}

async function sendStaffPaidConfirmation({
  order,
  staffName,
}: {
  order: AnyRecord
  staffName: string
}) {
  const orderId = order.display_id ? `#${order.display_id}` : order.id
  const lines = (order.items || [])
    .map((item: AnyRecord) => `${item.quantity} x ${item.title}`)
    .join("\n")

  return sendEmail({
    to: order.email,
    subject: `Your Grillers Pride order ${orderId}`,
    tag: "staff-phone-order-paid",
    metadata: {
      order_id: order.id,
      display_id: String(order.display_id || ""),
      staff_actor_customer_id: String(
        order.metadata?.staff_actor_customer_id || ""
      ),
      source: "staff_phone_order",
    },
    htmlBody: `
      <p>Grillers Pride processed this phone order on your behalf.</p>
      <p><strong>Staff representative:</strong> ${staffName}</p>
      <p><strong>Order:</strong> ${orderId}</p>
      <pre style="font-family:inherit;white-space:pre-wrap">${lines}</pre>
      <p>Your card is saved for the final weighed charge when the order is packed and ready to leave.</p>
      <p>Call Grillers Pride if anything looks wrong.</p>
    `,
    textBody: [
      "Grillers Pride processed this phone order on your behalf.",
      `Staff representative: ${staffName}`,
      `Order: ${orderId}`,
      "",
      lines,
      "",
      "Your card is saved for the final weighed charge when the order is packed and ready to leave.",
      "Call Grillers Pride if anything looks wrong.",
    ].join("\n"),
  })
}

export async function searchStaffCustomers(
  query: string
): Promise<StaffCustomerSummary[]> {
  await requireStaff()

  const q = query.trim()
  if (q.length < 2) return []

  const seen = new Set<string>()
  const results: StaffCustomerSummary[] = []

  const addSummary = (summary: StaffCustomerSummary) => {
    if (!summary.id || seen.has(summary.id)) return
    seen.add(summary.id)
    results.push(summary)
  }

  const add = (customer: AnyRecord, source: StaffCustomerSummary["source"]) => {
    if (!customer?.id || seen.has(customer.id)) return
    addSummary(customerSummary(customer, source))
  }

  const customerAttempts: Array<Record<string, string | number>> = [
    { q, limit: 12 },
  ]
  if (q.includes("@")) customerAttempts.push({ email: q, limit: 12 })
  if (q.includes("+")) customerAttempts.push({ q: q.split("+")[0], limit: 12 })

  const digitsOnly = stripPhone(q)
  if (digitsOnly.length >= 7) {
    customerAttempts.push({ q: digitsOnly, limit: 12 })
    customerAttempts.push({ phone: digitsOnly, limit: 12 })
  }

  let customerSearchWorked = false
  let lastCustomerError: unknown = null

  for (const attempt of customerAttempts) {
    try {
      const customerResp = await adminFetch<{ customers: AnyRecord[] }>(
        "/admin/customers",
        {
          query: {
            ...attempt,
            fields:
              "id,email,first_name,last_name,phone,company_name,metadata,*addresses",
          },
        }
      )
      customerSearchWorked = true
      customerResp.customers?.forEach((customer) => add(customer, "customer"))
    } catch (err) {
      lastCustomerError = err
    }
  }

  let orderResp: { orders: AnyRecord[] } = { orders: [] }
  try {
    orderResp = await adminFetch<{ orders: AnyRecord[] }>("/admin/orders", {
      query: {
        q,
        limit: 8,
        fields:
          "id,display_id,email,customer_id,*customer,*shipping_address,*billing_address",
      },
    })
  } catch (err) {
    await emitStaffCustomerContextDataDegradedAlert({
      stage: "search_recent_orders",
      surface: "search",
      query: q,
      resultCount: results.length,
      error: err,
    })
  }

  orderResp.orders?.forEach((order) => {
    if (order.customer) add(order.customer, "order")
    else if (order.customer_id || order.email) {
      add(
        {
          id: order.customer_id || `order:${order.id}`,
          email: order.email,
          shipping_address: order.shipping_address,
        },
        "order"
      )
    }
  })

  let legacyOrderResp: { orders: AnyRecord[] } = { orders: [] }
  try {
    legacyOrderResp = await adminFetch<{ orders: AnyRecord[] }>(
      "/admin/legacy-orders",
      {
        query: {
          q,
          limit: 8,
        },
      }
    )
  } catch (err) {
    await emitStaffCustomerContextDataDegradedAlert({
      stage: "search_legacy_orders",
      surface: "search",
      query: q,
      resultCount: results.length,
      error: err,
    })
  }

  legacyOrderResp.orders?.forEach((order) => {
    const summary = legacyOrderCustomerSummary(order)
    if (summary) addSummary(summary)
  })

  if (!results.length && !customerSearchWorked && lastCustomerError) {
    console.error(
      "[staff-phone-order] customer search failed",
      lastCustomerError
    )
    throw new Error(
      "Customer lookup failed. Try searching by name, email, or phone, then try again."
    )
  }

  return results.slice(0, 15)
}

export async function createStaffCustomer(input: {
  email: string
  firstName: string
  lastName: string
  phone?: string
  company?: string
  qbdCustomerType?: string
  alternateContactName?: string
  alternateContactPhone?: string
  alternateContactPhoneType?: "" | "mobile" | "landline"
  defaultAddress?: StaffAddressInput
  sendAccountInvite?: boolean
}): Promise<StaffCustomerSummary> {
  const staff = await requireStaff()
  const email = validateEmail(input.email)
  const defaultAddress = input.defaultAddress
  const customerPhone = stripPhone(input.phone || defaultAddress?.phone || "")
  if (!input.firstName.trim() || !input.lastName.trim()) {
    throw new Error("Enter the customer's first and last name before creating.")
  }
  if (!customerPhone) {
    throw new Error("Enter the customer's phone number before creating.")
  }
  const profileMetadata = customerProfileExtraMetadata(input)
  if (defaultAddress) {
    validateAddress(defaultAddress, "New customer address")
  }

  const duplicates = await findDuplicateCustomersForCreate({
    ...input,
    email,
    defaultAddress,
  })
  if (duplicates.length) {
    throw new Error(duplicateCustomerMessage(duplicates))
  }

  let customer: AnyRecord
  try {
    customer = await createClaimableStoreCustomer({
      email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || defaultAddress?.phone,
    })
  } catch (err) {
    throw new Error(
      `Could not create a claimable storefront account for this customer: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }

  if (defaultAddress) {
    await adminFetch(`/admin/customers/${customer.id}/addresses`, {
      method: "POST",
      body: JSON.stringify({
        ...toStoreAddress(defaultAddress),
        is_default_shipping: true,
        is_default_billing: true,
      }),
    })
  }

  const createdAt = new Date().toISOString()
  const inviteResult =
    input.sendAccountInvite === false
      ? { ok: false, message: "not_requested" }
      : await sendAccountClaimReset(email)
  let metadata: AnyRecord = {
    ...(customer.metadata || {}),
    ...profileMetadata,
    source: "staff_phone_order",
    created_by_staff_customer_id: staff.id,
    created_by_staff_email: staff.email,
    created_by_staff_name: staffDisplayName(staff),
    account_claim_path: "email_password_reset",
    account_claim_status:
      input.sendAccountInvite === false
        ? "not_requested"
        : inviteResult.ok
        ? "reset_sent"
        : "reset_send_failed",
    account_claim_sent_at:
      input.sendAccountInvite !== false && inviteResult.ok ? createdAt : "",
    account_claim_error:
      input.sendAccountInvite !== false && !inviteResult.ok
        ? inviteResult.message || "unknown"
        : "",
    staff_created_auth_identity: true,
    created_at: createdAt,
  }
  metadata = appendAuditLog(metadata, {
    type: "staff_customer_create",
    staffCustomerId: staff.id,
    staffEmail: staff.email,
    staffName: staffDisplayName(staff),
    targetCustomerId: customer.id,
    targetCustomerEmail: email,
    accountClaimStatus: metadata.account_claim_status,
    qbdCustomerType: profileMetadata.gp_qbd_customer_type,
    hasAlternateContact: Boolean(profileMetadata.gp_alt_contact),
    source: "staff_phone_order_create",
  })
  if (defaultAddress) {
    metadata = appendAuditLog(metadata, {
      type: "staff_customer_address_create",
      staffCustomerId: staff.id,
      staffEmail: staff.email,
      staffName: staffDisplayName(staff),
      targetCustomerId: customer.id,
      source: "staff_phone_order_create",
    })
  }

  await adminFetch(`/admin/customers/${customer.id}`, {
    method: "POST",
    body: JSON.stringify({
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: customerPhone,
      company_name: metadataText(input.company) || "",
      metadata,
    }),
  })

  const { customer: createdCustomer } = await adminFetch<{
    customer: AnyRecord
  }>(`/admin/customers/${customer.id}`, {
    query: {
      fields:
        "id,email,first_name,last_name,phone,company_name,metadata,*addresses",
    },
  })

  return customerSummary(createdCustomer, "customer")
}

export async function getStaffCustomerContext(
  customerId: string,
  options: { includeLegacyOrderId?: string } = {}
): Promise<StaffCustomerContext> {
  await requireStaff()

  const { customer } = await adminFetch<{ customer: AnyRecord }>(
    `/admin/customers/${customerId}`,
    {
      query: {
        fields:
          "id,email,first_name,last_name,phone,company_name,metadata,*addresses",
      },
    }
  )

  let orders: AnyRecord[] = []
  try {
    ;({ orders } = await adminFetch<{ orders: AnyRecord[] }>(
      "/admin/orders",
      {
        query: {
          customer_id: customerId,
          limit: 5,
          order: "-created_at",
          fields:
            "id,display_id,email,total,currency_code,created_at,status,*shipping_address,*items,*items.variant",
        },
      }
    ))
  } catch (err) {
    await emitStaffCustomerContextDataDegradedAlert({
      stage: "context_recent_orders",
      surface: "context",
      customerId,
      error: err,
    })
  }

  let legacyOrderList: { orders: AnyRecord[] } = { orders: [] }
  try {
    legacyOrderList = await adminFetch<{ orders: AnyRecord[] }>(
      "/admin/legacy-orders",
      {
        query: {
          customer_id: customerId,
          limit: 5,
          offset: 0,
        },
      }
    )
  } catch (err) {
    await emitStaffCustomerContextDataDegradedAlert({
      stage: "context_legacy_order_list",
      surface: "context",
      customerId,
      includeLegacyOrderRequested: Boolean(options.includeLegacyOrderId?.trim()),
      error: err,
    })
  }

  const legacyOrderStubs = [...(legacyOrderList.orders || []).slice(0, 5)]
  const includeLegacyOrderId = options.includeLegacyOrderId?.trim()
  if (
    includeLegacyOrderId &&
    !legacyOrderStubs.some((order) => order.id === includeLegacyOrderId)
  ) {
    legacyOrderStubs.unshift({ id: includeLegacyOrderId })
  }

  let legacyDetailFailures = 0
  let firstLegacyDetailError: unknown = null
  const legacyOrders = await Promise.all(
    legacyOrderStubs.slice(0, 6).map(async (order) => {
      const id = String(order.id || "")
      if (!id) return order

      return adminFetch<{ order: AnyRecord }>(`/admin/legacy-orders/${id}`)
        .then((response) => response.order || order)
        .catch((err) => {
          legacyDetailFailures += 1
          if (!firstLegacyDetailError) firstLegacyDetailError = err
          return order
        })
    })
  )
  if (legacyDetailFailures > 0 && firstLegacyDetailError) {
    await emitStaffCustomerContextDataDegradedAlert({
      stage: "context_legacy_order_detail",
      surface: "context",
      customerId,
      failureCount: legacyDetailFailures,
      includeLegacyOrderRequested: Boolean(includeLegacyOrderId),
      error: firstLegacyDetailError,
    })
  }

  const metadata = customer.metadata || {}

  return {
    ...customerSummary(customer, "customer"),
    recentOrders: (orders || []).map((order) => ({
      id: order.id,
      displayId: order.display_id ? `#${order.display_id}` : order.id,
      createdAt: order.created_at,
      status: order.status || "",
      total: currencyAmount(order.total),
      currencyCode: order.currency_code || "usd",
      shippingAddress: toStaffAddress(order.shipping_address),
      items: (order.items || []).map((item: AnyRecord) => ({
        title: item.title || item.product_title || "Item",
        quantity: Number(item.quantity || 1),
        variantId: item.variant_id || item.variant?.id,
        sku: item.variant?.sku || item.variant_sku,
      })),
    })),
    legacyOrders: legacyOrders.map(legacyOrderSummary),
    accountCredits: parseStaffCustomerAccountCredits(metadata),
    accountNotes: parseStaffCustomerAccountNotes(metadata),
    accountCreditBalance: staffCustomerAccountCreditBalance(metadata),
    accountCreditBalanceMinor: staffCustomerAccountCreditBalanceMinor(metadata),
  }
}

export async function getStaffLegacyOrderContext(
  legacyOrderId: string
): Promise<StaffCustomerContext> {
  await requireStaff()

  const id = legacyOrderId.trim()
  if (!id) {
    throw new Error("Missing legacy order ID.")
  }

  const { order } = await adminFetch<{ order: AnyRecord }>(
    `/admin/legacy-orders/${id}`
  )
  const summary = legacyOrderCustomerSummary(order)
  if (!summary) {
    throw new Error("Legacy order has no customer context.")
  }

  return {
    ...summary,
    recentOrders: [],
    legacyOrders: [legacyOrderSummary(order)],
    accountCredits: [],
    accountNotes: [],
    accountCreditBalance: 0,
    accountCreditBalanceMinor: 0,
  }
}

export async function updateStaffCustomerProfile(input: {
  customerId: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  company?: string
  qbdCustomerType?: string
  alternateContactName?: string
  alternateContactPhone?: string
  alternateContactPhoneType?: "" | "mobile" | "landline"
}): Promise<{ ok: boolean; customer?: StaffCustomerContext; error?: string }> {
  try {
    const staff = await requireStaff()
    if (!input.customerId) throw new Error("Missing customer ID.")
    const email = validateEmail(input.email)
    const profileMetadata = customerProfileExtraMetadata(input)

    const current = await adminFetch<{ customer: AnyRecord }>(
      `/admin/customers/${input.customerId}`,
      { query: { fields: "id,email,metadata" } }
    )

    await adminFetch(`/admin/customers/${input.customerId}`, {
      method: "POST",
      body: JSON.stringify({
        email,
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        phone: input.phone ? stripPhone(input.phone) : "",
        company_name: metadataText(input.company) || "",
        metadata: appendAuditLog(
          {
            ...(current.customer?.metadata || {}),
            ...profileMetadata,
          },
          {
            type: "staff_customer_profile_update",
            staffCustomerId: staff.id,
            staffEmail: staff.email,
            targetCustomerId: input.customerId,
            qbdCustomerType: profileMetadata.gp_qbd_customer_type,
            hasAlternateContact: Boolean(profileMetadata.gp_alt_contact),
          }
        ),
      }),
    })

    return {
      ok: true,
      customer: await getStaffCustomerContext(input.customerId),
    }
  } catch (err: any) {
    await emitStaffCustomerContextMutationFailureAlert({
      action: "profile_update",
      customerId: input.customerId,
      error: err,
    })
    return {
      ok: false,
      error: err?.message || "Could not update customer profile.",
    }
  }
}

export async function saveStaffCustomerAddress(input: {
  customerId: string
  address: StaffAddressInput
}): Promise<{ ok: boolean; customer?: StaffCustomerContext; error?: string }> {
  try {
    const staff = await requireStaff()
    if (!input.customerId) throw new Error("Missing customer ID.")
    validateAddress(input.address, "Customer address")

    const current = await adminFetch<{ customer: AnyRecord }>(
      `/admin/customers/${input.customerId}`,
      { query: { fields: "id,email,metadata,*addresses" } }
    )

    const body = {
      ...toStoreAddress(input.address),
      is_default_shipping: true,
      is_default_billing: true,
    }

    const path = input.address.id
      ? `/admin/customers/${input.customerId}/addresses/${input.address.id}`
      : `/admin/customers/${input.customerId}/addresses`

    await adminFetch(path, {
      method: "POST",
      body: JSON.stringify(body),
    })

    await adminFetch(`/admin/customers/${input.customerId}`, {
      method: "POST",
      body: JSON.stringify({
        metadata: appendAuditLog(current.customer?.metadata, {
          type: input.address.id
            ? "staff_customer_address_update"
            : "staff_customer_address_create",
          staffCustomerId: staff.id,
          staffEmail: staff.email,
          targetCustomerId: input.customerId,
          addressId: input.address.id || null,
        }),
      }),
    })

    return {
      ok: true,
      customer: await getStaffCustomerContext(input.customerId),
    }
  } catch (err: any) {
    await emitStaffCustomerContextMutationFailureAlert({
      action: input.address.id ? "address_update" : "address_create",
      customerId: input.customerId,
      addressId: input.address.id,
      error: err,
    })
    return {
      ok: false,
      error: err?.message || "Could not save customer address.",
    }
  }
}

export async function applyStaffCustomerAccountAction(input: {
  customerId: string
  action: "customer_note" | "customer_credit"
  amount?: number
  reasonCode?: StaffCustomerAccountReasonCode
  staffNote: string
  customerVisibleNote?: string
  relatedOrderId?: string
  relatedOrderDisplayId?: string
}): Promise<{ ok: boolean; customer?: StaffCustomerContext; error?: string }> {
  try {
    const staff = await requireStaff()
    const customerId = String(input.customerId || "").trim()
    if (!customerId) throw new Error("Missing customer ID.")

    const staffNote = metadataText(input.staffNote)
    if (!staffNote) throw new Error("Staff note is required.")

    const reasonCode = input.reasonCode || "other"
    const now = new Date().toISOString()
    const staffName = staffDisplayName(staff)

    const current = await adminFetch<{ customer: AnyRecord }>(
      `/admin/customers/${customerId}`,
      { query: { fields: "id,email,first_name,last_name,metadata" } }
    )

    const metadata = current.customer?.metadata || {}
    const relatedOrderId = metadataText(input.relatedOrderId)
    const relatedOrderDisplayId = metadataText(input.relatedOrderDisplayId)
    let nextMetadata: AnyRecord

    if (input.action === "customer_credit") {
      const amount = Number(input.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Credit amount must be greater than zero.")
      }

      const amountMinor = Math.round(amount * 100)
      const creditId = `custcred_${Date.now()}_${randomBytes(4).toString(
        "hex"
      )}`
      const requestKey = `customer-credit:${customerId}:${creditId}`
      const existingCredits = parseStaffCustomerAccountCredits(metadata)
      const credit: StaffCustomerAccountCredit = {
        id: creditId,
        amount: Math.round(amountMinor) / 100,
        amountMinor,
        currencyCode: "usd",
        reasonCode,
        staffNote,
        customerVisibleNote: metadataText(input.customerVisibleNote),
        relatedOrderId,
        relatedOrderDisplayId,
        status: "pending_qbd",
        qbdPostingStatus: "pending_manual",
        qbdPostingAction: "customer_account_credit_memo",
        qbdPostingRequestKey: requestKey,
        createdAt: now,
        createdByStaffCustomerId: staff.id,
        createdByStaffEmail: staff.email,
        createdByStaffName: staffName,
      }
      const accountCredits = [...existingCredits, credit].slice(-50)
      const balanceMinor = accountCredits.reduce((sum, entry) => {
        if (entry.status === "void") return sum
        return sum + entry.amountMinor
      }, 0)

      nextMetadata = appendAuditLog(
        {
          ...metadata,
          customer_account_credits: JSON.stringify(accountCredits),
          customer_account_credit_balance_minor: balanceMinor,
          customer_account_credit_latest_at: now,
          qbd_customer_posting_required: true,
          qbd_customer_posting_status: "pending_manual",
          qbd_customer_posting_action: "customer_account_credit_memo",
          qbd_customer_posting_request_key: requestKey,
          qbd_customer_posting_amount_minor: amountMinor,
          qbd_customer_posting_requested_at: now,
        },
        {
          type: "staff_customer_account_credit_create",
          staffCustomerId: staff.id,
          staffEmail: staff.email,
          targetCustomerId: customerId,
          customerEmail: current.customer?.email || "",
          amountMinor,
          reasonCode,
          relatedOrderId: relatedOrderId || null,
          relatedOrderDisplayId: relatedOrderDisplayId || null,
          qbdPostingRequestKey: requestKey,
        }
      )
    } else {
      const noteId = `custnote_${Date.now()}_${randomBytes(4).toString("hex")}`
      const existingNotes = parseStaffCustomerAccountNotes(metadata)
      const note: StaffCustomerAccountNote = {
        id: noteId,
        note: staffNote,
        reasonCode,
        relatedOrderId,
        relatedOrderDisplayId,
        createdAt: now,
        createdByStaffCustomerId: staff.id,
        createdByStaffEmail: staff.email,
        createdByStaffName: staffName,
      }
      const accountNotes = [...existingNotes, note].slice(-50)

      nextMetadata = appendAuditLog(
        {
          ...metadata,
          customer_account_notes: JSON.stringify(accountNotes),
          customer_account_note_latest_at: now,
        },
        {
          type: "staff_customer_note_create",
          staffCustomerId: staff.id,
          staffEmail: staff.email,
          targetCustomerId: customerId,
          customerEmail: current.customer?.email || "",
          reasonCode,
          relatedOrderId: relatedOrderId || null,
          relatedOrderDisplayId: relatedOrderDisplayId || null,
        }
      )
    }

    await adminFetch(`/admin/customers/${customerId}`, {
      method: "POST",
      body: JSON.stringify({
        metadata: nextMetadata,
      }),
    })

    return {
      ok: true,
      customer: await getStaffCustomerContext(customerId),
    }
  } catch (err: any) {
    await emitStaffCustomerContextMutationFailureAlert({
      action: input.action,
      customerId: input.customerId,
      hasAmount: input.amount !== undefined,
      hasRelatedOrder: Boolean(input.relatedOrderId),
      error: err,
    })
    return {
      ok: false,
      error: err?.message || "Could not record customer account action.",
    }
  }
}

export async function searchStaffProducts(
  query: string,
  countryCode: string,
  availabilityContext: {
    fulfillmentType?: StaffPrepareOrderInput["fulfillmentType"]
    scheduledDate?: string
  } = {}
): Promise<StaffProductSearchResult[]> {
  await requireStaff()
  const q = query.trim()
  if (q.length < 2) return []

  const region = await getRegion(countryCode || "us")
  if (!region) return []

  const { products } = await storeFetch<{ products: AnyRecord[] }>(
    "/store/products",
    {
      query: {
        q,
        region_id: region.id,
        limit: 16,
        fields:
          "*variants.calculated_price,+variants.inventory_quantity,+variants.metadata,+metadata,+tags,thumbnail,handle,title",
      },
    }
  )

  const results = (products || []).flatMap((product) =>
    (product.variants || []).map((variant: AnyRecord) => {
      const productMetadata = product.metadata || {}
      const variantMetadata = variant.metadata || {}
      const qbdListId =
        variantMetadata.qbd_list_id ||
        variantMetadata.quickbooks_list_id ||
        productMetadata.qbd_list_id ||
        productMetadata.quickbooks_list_id ||
        undefined

      return {
        productId: product.id,
        title: product.title || "",
        handle: product.handle || "",
        thumbnail: product.thumbnail || undefined,
        variantId: variant.id,
        variantTitle: variant.title || "Default",
        sku: variant.sku || "",
        qbdListId: qbdListId ? String(qbdListId) : undefined,
        inventoryQuantity:
          typeof variant.inventory_quantity === "number"
            ? variant.inventory_quantity
            : undefined,
        manageInventory: Boolean(variant.manage_inventory),
        allowBackorder: Boolean(variant.allow_backorder),
        calculatedAmount:
          typeof variant.calculated_price?.calculated_amount === "number"
            ? variant.calculated_price.calculated_amount
            : undefined,
        currencyCode:
          variant.calculated_price?.currency_code ||
          region.currency_code ||
          "usd",
        pricingMode: resolvePricingMode(
          {
            ...productMetadata,
            ...variantMetadata,
          },
          variant.sku || "",
          null,
          (variantMetadata.PricingMode ||
            productMetadata.PricingMode ||
            variantMetadata.pricing_mode ||
            productMetadata.pricing_mode) as PriceDisplayMode | null
        ),
      }
    })
  )

  const availability = await checkStaffInventoryAvailability({
    fulfillment_type: availabilityContext.fulfillmentType || "plant_pickup",
    requested_fulfillment_date: availabilityContext.scheduledDate,
    source: "staff_phone_order",
    lines: results.map((result) => ({
      product_id: result.productId,
      variant_id: result.variantId,
      quantity: 1,
      sku: result.sku,
      title:
        result.variantTitle && result.variantTitle !== "Default"
          ? `${result.title} - ${result.variantTitle}`
          : result.title,
    })),
  }).catch((err) => {
    console.error(
      "[staff-phone-order] inventory search availability failed",
      err
    )
    void emitProductSearchAvailabilityFailureAlert({
      resultCount: results.length,
      fulfillmentType: availabilityContext.fulfillmentType,
      scheduledDate: availabilityContext.scheduledDate,
      error: err,
    })
    return null
  })
  const byVariant = new Map(
    (availability?.lines || []).map((line) => [line.variant_id, line])
  )

  return results.map((result) => ({
    ...result,
    availability: byVariant.get(result.variantId),
  }))
}

export async function prepareStaffPhoneOrder(
  input: StaffPrepareOrderInput
): Promise<StaffPrepareOrderResult> {
  try {
    const staff = await requireStaff()
    const email = validateEmail(input.customer.email)
    const countryCode = (input.countryCode || "us").toLowerCase()
    const region = await getRegion(countryCode)
    if (!region) throw new Error(`No Medusa region found for ${countryCode}.`)

    if (!input.customerVerified) {
      throw new Error(
        "Mark the customer as verified before preparing a staff order."
      )
    }
    if (input.paymentMode === "collect_card_now" && !input.paymentConsent) {
      throw new Error("Card collection requires explicit customer consent.")
    }
    if (!input.lines.length) {
      throw new Error("Add at least one product before preparing the order.")
    }
    input.lines.forEach((line) => {
      if (!line.variantId || line.quantity < 1) {
        throw new Error("Every order line needs a variant and quantity.")
      }
    })

    const availabilityLines = input.lines.map((line) => ({
      variant_id: line.variantId,
      quantity: line.quantity,
      sku: line.sku,
      title: line.title,
    }))
    let availability
    try {
      availability = await checkStaffInventoryAvailability({
        fulfillment_type: input.fulfillmentType,
        requested_fulfillment_date: input.scheduledDate,
        customer_id: input.customer.id,
        source: "staff_phone_order",
        lines: availabilityLines,
      })
    } catch (err) {
      void emitStaffOrderAvailabilityFailureAlert({
        action: "prepare_order",
        lineCount: availabilityLines.length,
        fulfillmentType: input.fulfillmentType,
        scheduledDate: input.scheduledDate,
        error: err,
      })
      throw err
    }
    const availabilityByVariant = new Map(
      availability.lines.map((line) => [line.variant_id, line])
    )
    const blockedLines = availability.lines.filter((line) =>
      ["partial", "blocked", "inactive"].includes(line.decision)
    )
    const inactiveLine = blockedLines.find(
      (line) => line.decision === "inactive"
    )
    if (inactiveLine) {
      throw new Error(
        `${
          inactiveLine.title || inactiveLine.sku || inactiveLine.variant_id
        } is not currently sellable. Choose a different item.`
      )
    }
    const missingOverride = blockedLines.find((line) => {
      const inputLine = input.lines.find(
        (candidate) => candidate.variantId === line.variant_id
      )
      return (
        !inputLine?.overrideReason?.trim() || !inputLine?.overrideNote?.trim()
      )
    })
    if (missingOverride) {
      throw new Error(
        `${inventoryLineMessage(
          missingOverride
        )} Staff override requires a reason and note before payment can be prepared.`
      )
    }

    validateAddress(input.shippingAddress, "Shipping address")
    const billingAddress =
      input.sameAsShipping || !input.billingAddress
        ? input.shippingAddress
        : input.billingAddress
    validateAddress(billingAddress, "Billing address")

    const staffName = staffDisplayName(staff)
    const createdAt = new Date().toISOString()
    const metadata: AnyRecord = {
      source: "staff_phone_order",
      staff_phone_order: true,
      staff_actor_customer_id: staff.id,
      staff_actor_email: staff.email,
      staff_actor_name: staffName,
      staff_selected_customer_id: input.customer.id || "",
      staff_selected_customer_email: email,
      staff_customer_verified: true,
      staff_customer_verified_at: createdAt,
      staff_payment_mode: input.paymentMode,
      staff_payment_consent: input.paymentMode === "collect_card_now",
      staff_payment_policy:
        input.paymentMode === "collect_card_now"
          ? "staff_collect_card_by_phone"
          : "customer_checkout_link",
      staff_confirmation_status:
        input.paymentMode === "collect_card_now"
          ? "pending_order_complete"
          : "pending_review",
      staff_audit_log: JSON.stringify([
        {
          at: createdAt,
          action: "staff_cart_prepared",
          status: "prepared",
          staff_actor_customer_id: staff.id,
          staff_actor_email: staff.email,
          staff_actor_name: staffName,
          staff_target_customer_id: input.customer.id || null,
          staff_target_email: email,
          payment_mode: input.paymentMode,
          inventory_blocked_line_count: blockedLines.length,
        },
      ]),
      inventoryAllocationCheckedAt: createdAt,
      inventoryAllocationBlockedLineCount: String(blockedLines.length),
      inventoryAllocationFutureLineCount: String(
        availability.lines.filter((line) => line.decision === "future_allowed")
          .length
      ),
      fulfillmentType: input.fulfillmentType,
      fulfillmentZip: input.shippingAddress.postalCode,
      scheduledDate: metadataText(input.scheduledDate) || "",
      scheduledTimeWindow: metadataText(input.scheduledTimeWindow) || "",
      pickupLocationId: metadataText(input.pickupLocationId) || "",
      orderNotes: metadataText(input.orderNotes),
      substitutionPreference: metadataText(input.substitutionPreference),
      deliveryInstructions: metadataText(input.deliveryInstructions),
      giftNotes: metadataText(input.giftNotes),
    }

    const { cart } = await sdk.store.cart.create(
      {
        region_id: region.id,
        email,
        customer_id: input.customer.id || undefined,
        shipping_address: toStoreAddress(input.shippingAddress),
        billing_address: toStoreAddress(billingAddress),
        metadata,
      } as any,
      {},
      {}
    )

    for (const line of input.lines) {
      const lineAvailability = availabilityByVariant.get(line.variantId)
      await sdk.store.cart.createLineItem(
        cart.id,
        {
          variant_id: line.variantId,
          quantity: line.quantity,
          metadata: {
            source: "staff_phone_order",
            staff_actor_customer_id: staff.id,
            staff_selected_customer_id: input.customer.id || "",
            staff_line_title: line.title,
            staff_line_sku: line.sku || "",
            staff_line_source: line.source || "product_search",
            inventory_decision: lineAvailability?.decision || "",
            inventory_reason: lineAvailability?.reason || "",
            inventory_available_to_promise_quantity:
              lineAvailability?.available_to_promise_quantity ?? "",
            inventory_requested_fulfillment_date:
              metadataText(input.scheduledDate) || "",
            inventory_override_reason: line.overrideReason || "",
            inventory_override_note: line.overrideNote || "",
            line_substitution_preference: line.substitutionPreference || "",
            legacy_purchase_history_key: line.legacyPurchaseHistoryKey || "",
            legacy_order_id: line.legacyOrderId || "",
            legacy_order_line_id: line.legacyOrderLineId || "",
          },
        },
        {},
        {}
      )
    }

    const shippingOption = await findStaffShippingOption(
      cart.id,
      input.fulfillmentType
    )
    await sdk.store.cart.addShippingMethod(
      cart.id,
      { option_id: shippingOption.id },
      {},
      {}
    )

    let preparedCart = await retrieveStaffCart(cart.id)
    let paymentClientSecret: string | undefined
    let paymentProviderId: string | undefined

    if (input.paymentMode === "collect_card_now") {
      const providers = await listPaymentProviders(region.id)
      const provider = providers.find(isStripeCardProvider)

      if (!provider?.id) {
        throw new Error(
          "No Stripe credit-card payment provider is configured for this region."
        )
      }

      paymentProviderId = provider.id
      await sdk.store.payment.initiatePaymentSession(
        preparedCart,
        {
          provider_id: provider.id,
          data: {
            setup_future_usage: "off_session",
            staff_phone_order: true,
          },
        },
        {},
        {}
      )
      preparedCart = await retrieveStaffCart(cart.id)
      const session = preparedCart.payment_collection?.payment_sessions?.find(
        (s: any) => s.status === "pending" && s.provider_id === provider.id
      )
      paymentClientSecret = session?.data?.client_secret as string | undefined
      if (!paymentClientSecret) {
        throw new Error("Stripe did not return a payment client secret.")
      }
    }

    let checkoutUrl: string | undefined
    let confirmationSent = false
    let confirmationMessage: string | undefined

    if (input.paymentMode === "send_checkout_link") {
      const token = signStaffCartHandoff({
        cartId: cart.id,
        countryCode,
        staffCustomerId: staff.id,
        targetCustomerId: input.customer.id,
        targetCustomerEmail: email,
        expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
      })
      checkoutUrl = buildCheckoutUrl(countryCode, token)

      if (input.sendConfirmation) {
        const result = await sendReviewLinkEmail({
          to: email,
          checkoutUrl,
          staffName,
          lines: input.lines,
          metadata: {
            cart_id: cart.id,
            source: "staff_phone_order",
            staff_actor_customer_id: staff.id,
            target_customer_id: input.customer.id || "",
          },
        })
        confirmationSent = result.ok
        confirmationMessage = result.message || result.messageId
        await sdk.store.cart.update(
          cart.id,
          {
            metadata: {
              staff_confirmation_status: result.ok ? "sent" : "send_failed",
              staff_confirmation_channel: "email",
              staff_confirmation_sent_at: result.ok
                ? new Date().toISOString()
                : "",
              staff_confirmation_message_id: result.messageId || "",
              staff_confirmation_error: result.ok
                ? ""
                : result.message || "unknown",
            },
          } as any,
          {},
          {}
        )
        preparedCart = await retrieveStaffCart(cart.id)
      }
    }

    return {
      ok: true,
      cartId: cart.id,
      checkoutUrl,
      cart: preparedCart,
      paymentProviderId,
      paymentClientSecret,
      confirmationSent,
      confirmationMessage,
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Could not prepare staff order.",
    }
  }
}

export async function completeStaffPhoneOrder(
  cartId: string
): Promise<StaffCompleteOrderResult> {
  try {
    const staff = await requireStaff()
    const cart = await retrieveStaffCart(cartId)
    const metadata = (cart.metadata || {}) as AnyRecord

    if (metadata.source !== "staff_phone_order") {
      throw new Error("This cart is not a staff phone order.")
    }
    if (metadata.staff_actor_customer_id !== staff.id) {
      throw new Error(
        "Only the staff member who prepared this cart can complete it."
      )
    }

    const finalAvailabilityLines = (cart.items || [])
      .map((item: AnyRecord) => {
        const variantId = item.variant_id || item.variant?.id
        if (!variantId) return null
        return {
          variant_id: variantId,
          quantity: Number(item.quantity || 1),
          sku: item.variant?.sku || item.metadata?.staff_line_sku,
          title:
            item.metadata?.staff_line_title ||
            item.product_title ||
            item.title,
        }
      })
      .filter(Boolean) as any
    const finalFulfillmentType = metadataText(metadata.fulfillmentType)
    const finalScheduledDate = metadataText(metadata.scheduledDate)
    let finalAvailability
    try {
      finalAvailability = await checkStaffInventoryAvailability({
        cart_id: cart.id,
        fulfillment_type: finalFulfillmentType,
        requested_fulfillment_date: finalScheduledDate,
        customer_id: metadataText(metadata.staff_selected_customer_id),
        source: "staff_phone_order",
        lines: finalAvailabilityLines,
      })
    } catch (err) {
      void emitStaffOrderAvailabilityFailureAlert({
        action: "complete_order",
        lineCount: finalAvailabilityLines.length,
        fulfillmentType: finalFulfillmentType,
        scheduledDate: finalScheduledDate,
        cartId: cart.id,
        error: err,
      })
      throw err
    }
    const finalByVariant = new Map(
      finalAvailability.lines.map((line) => [line.variant_id, line])
    )
    for (const item of cart.items || []) {
      const itemRecord = item as AnyRecord
      const variantId = itemRecord.variant_id || itemRecord.variant?.id
      const availability = finalByVariant.get(variantId)
      if (!availability) continue
      if (availability.decision === "inactive") {
        throw new Error(
          `${
            availability.title || availability.sku || availability.variant_id
          } is not currently sellable. Choose a different item.`
        )
      }
      if (
        availability.decision === "partial" ||
        availability.decision === "blocked"
      ) {
        const lineMetadata = (itemRecord.metadata || {}) as AnyRecord
        if (
          !metadataText(lineMetadata.inventory_override_reason) ||
          !metadataText(lineMetadata.inventory_override_note)
        ) {
          throw new Error(
            `${inventoryLineMessage(
              availability
            )} Staff override requires a reason and note before payment can be completed.`
          )
        }
      }
    }

    await sdk.store.cart.update(
      cartId,
      {
        metadata: {
          staff_payment_completed_by_customer_id: staff.id,
          staff_payment_completed_at: new Date().toISOString(),
          staff_confirmation_status: "pending_email",
        },
      } as any,
      {},
      {}
    )

    const completeResult = await sdk.store.cart
      .complete(cartId, {}, {})
      .catch((err) => {
        throw medusaError(err)
      })

    if (completeResult?.type !== "order") {
      throw new Error("Medusa did not complete the cart into an order.")
    }

    const order = completeResult.order as AnyRecord
    const emailResult = await sendStaffPaidConfirmation({
      order,
      staffName: staffDisplayName(staff),
    })

    const orderTag = await getCacheTag("orders")
    if (orderTag) revalidateTag(orderTag)

    return {
      ok: true,
      orderId: order.id,
      displayId: order.display_id ? `#${order.display_id}` : undefined,
      confirmationSent: emailResult.ok,
      confirmationMessage: emailResult.message || emailResult.messageId,
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Could not complete staff order.",
    }
  }
}
