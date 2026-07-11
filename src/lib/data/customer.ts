"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { isSameAddressKey } from "@lib/util/compare-addresses"
import { isValidUSPhone, stripPhone } from "@lib/util/format-phone"
import {
  repairCheckoutAddressForWrite,
  reportCheckoutAddressRepair,
} from "@lib/checkout-address-quality"
import {
  buildSmsMarketingConsentMetadata,
  formWantsSmsMarketing,
} from "@lib/util/sms-consent"
import { canUseOfficeConsole, isStaffCustomer } from "@lib/util/staff-access"
import {
  reportCartAddressPersistenceFailure,
  reportAuthenticatedCustomerLoadFailure,
  reportCustomerAddressMutationFailure,
  reportCustomerLoginFailure,
  reportCustomerPasswordUpdateFailure,
  reportCustomerProfileUpdateFailure,
  reportCustomerSignupFailure,
  reportLegacyLoginFallbackFailure,
  reportPasswordResetCompletionFailure,
  reportPasswordResetRequestFailure,
} from "@lib/account-ops-alerts"
import { emitCartTransferRecoveryFailureAlert } from "@lib/cart-transfer-ops-alerts"
import {
  clearedCheckoutFulfillmentMetadata,
  shouldResetFulfillmentForAddressChange,
} from "@lib/checkout-fulfillment-state"
import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import {
  adminFetch,
  appendStaffAuditLog,
  retrieveAdminCustomer,
  staffAuditFields,
} from "./staff/admin"
import {
  clearStaffImpersonationCookie,
  readStaffImpersonationCookie,
} from "./staff/session-cookie"
import type { StaffImpersonationSession } from "./staff/impersonation-types"
import {
  getAuthHeaders,
  getCacheTag,
  getCartId,
  getStaffImpersonationCartId,
  removeAuthToken,
  removeCartId,
  setAuthToken,
  setCartId,
} from "./cookies"

/**
 * Issue #74 — When an account is created during checkout, the cart's
 * shipping address never lands in the customer's address book. After the
 * customer is created and authenticated, copy the cart's shipping (and
 * distinct billing) address into the address book so the customer's first
 * order populates "saved addresses".
 *
 * Idempotent: skips addresses that already match (address_1 + postal_code +
 * country_code, normalized). Marks the first inserted address as default
 * shipping/billing only when the address book is currently empty.
 */
export async function saveCartAddressesToAccount(): Promise<void> {
  let stage:
    | "auth_headers"
    | "cart_lookup"
    | "customer_lookup"
    | "shipping_address_create"
    | "billing_address_create"
    | "cache_revalidate" = "cart_lookup"
  let cartId: string | null = null
  let hasShippingAddress = false
  let attemptedShippingAddress = false
  let attemptedBillingAddress = false

  try {
    cartId = (await getCartId()) || null
    if (!cartId) return

    stage = "auth_headers"
    const headers = { ...(await getAuthHeaders()) }
    if (!("authorization" in headers) || !(headers as any).authorization) return

    // Pull the cart fresh — the auth context just changed, so go direct
    // (no-cache) rather than reusing a possibly-stale cached response.
    stage = "cart_lookup"
    const { cart } = await sdk.client.fetch<HttpTypes.StoreCartResponse>(
      `/store/carts/${cartId}`,
      {
        method: "GET",
        headers,
        cache: "no-store",
      }
    )

    const shipping = cart?.shipping_address
    hasShippingAddress = Boolean(shipping?.address_1)
    if (!shipping?.address_1) return

    stage = "customer_lookup"
    const { customer } = await sdk.store.customer.retrieve({}, headers)
    const existing: any[] = customer?.addresses || []
    const isFirstAddress = existing.length === 0

    if (!existing.some((a) => isSameAddressKey(a, shipping))) {
      stage = "shipping_address_create"
      attemptedShippingAddress = true
      await sdk.store.customer.createAddress(
        {
          first_name: shipping.first_name || "",
          last_name: shipping.last_name || "",
          address_1: shipping.address_1 || "",
          address_2: shipping.address_2 || "",
          company: shipping.company || "",
          city: shipping.city || "",
          postal_code: shipping.postal_code || "",
          province: shipping.province || "",
          country_code: shipping.country_code || "",
          // Persist digits-only — the cart may carry already-formatted
          // legacy data; normalize at the boundary (#68).
          phone: shipping.phone ? stripPhone(shipping.phone) : "",
          is_default_shipping: isFirstAddress,
          is_default_billing: isFirstAddress,
        },
        {},
        headers
      )
    }

    const billing = cart?.billing_address
    if (
      billing?.address_1 &&
      !isSameAddressKey(billing, shipping) &&
      !existing.some((a) => isSameAddressKey(a, billing))
    ) {
      stage = "billing_address_create"
      attemptedBillingAddress = true
      await sdk.store.customer.createAddress(
        {
          first_name: billing.first_name || "",
          last_name: billing.last_name || "",
          address_1: billing.address_1 || "",
          address_2: billing.address_2 || "",
          company: billing.company || "",
          city: billing.city || "",
          postal_code: billing.postal_code || "",
          province: billing.province || "",
          country_code: billing.country_code || "",
          phone: billing.phone ? stripPhone(billing.phone) : "",
        },
        {},
        headers
      )
    }

    stage = "cache_revalidate"
    const customerCacheTag = await getCacheTag("customers")
    revalidateTag(customerCacheTag)
  } catch (error) {
    // Non-critical — never block account creation or order completion if
    // saving the address to the book fails.
    reportCartAddressPersistenceFailure({
      stage,
      error,
      cartId,
      hasShippingAddress,
      attemptedShippingAddress,
      attemptedBillingAddress,
    })
  }
}

export async function requestPasswordReset(email: string) {
  try {
    const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""

    const response = await fetch(`${backendUrl}/store/forgot-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": publishableKey,
      },
      body: JSON.stringify({ email }),
    })

    if (
      !response.ok &&
      (response.status >= 500 ||
        response.status === 401 ||
        response.status === 403 ||
        response.status === 404)
    ) {
      await reportPasswordResetRequestFailure({
        stage: "backend_rejected",
        responseStatus: response.status,
        responseBody:
          typeof response.text === "function"
            ? await response.text().catch(() => response.statusText)
            : response.statusText,
      })
    }
  } catch (error) {
    // Intentionally swallow — caller shows the same success state regardless,
    // to avoid leaking whether an account exists for this email or whether
    // the backend is reachable.
    await reportPasswordResetRequestFailure({
      stage: "request_failed",
      error,
    })
  }
}

export async function completePasswordReset(
  token: string,
  email: string,
  password: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    await sdk.auth.updateProvider(
      "customer",
      "emailpass",
      { email, password },
      token
    )
    return { success: true, error: null }
  } catch (error) {
    reportPasswordResetCompletionFailure({ error })
    return {
      success: false,
      error:
        "This reset link is invalid or has expired. Please request a new one.",
    }
  }
}

export async function updateCustomerPassword(
  _currentState: Record<string, unknown>,
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const currentPassword = String(formData.get("old_password") ?? "")
  const newPassword = String(formData.get("new_password") ?? "")
  const confirmPassword = String(formData.get("confirm_password") ?? "")

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, error: "All password fields are required." }
  }

  if (newPassword.length < 8) {
    return {
      success: false,
      error: "New password must be at least 8 characters.",
    }
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "New passwords do not match." }
  }

  let stage: "auth_headers" | "store_password_update" = "auth_headers"

  try {
    stage = "auth_headers"
    const headers = {
      ...(await getAuthHeaders()),
    }

    if (!("authorization" in headers)) {
      return { success: false, error: "Sign in again to update your password." }
    }

    stage = "store_password_update"
    await sdk.client.fetch<{ ok?: boolean }>(`/store/customers/me/password`, {
      method: "POST",
      headers,
      body: {
        current_password: currentPassword,
        new_password: newPassword,
      },
      cache: "no-store",
    })

    return { success: true, error: null }
  } catch (err: any) {
    reportCustomerPasswordUpdateFailure({ stage, error: err })
    return {
      success: false,
      error:
        err?.data?.message ||
        err?.message ||
        "Could not update password. Please try again.",
    }
  }
}

function normalizeLoginIdentifier(value: string) {
  const trimmed = String(value ?? "").trim()
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed
}

function isEmailLoginIdentifier(value: string) {
  return value.includes("@")
}

function legacyLoginIdentifierKind(loginId: string) {
  return isEmailLoginIdentifier(loginId) ? "email" : "legacy_identifier"
}

function shouldAlertLegacyLoginFallbackStatus(status: number) {
  return status === 404 || status === 429 || status >= 500
}

async function requestLegacyAuthToken(loginId: string, password: string) {
  const backendUrl = (
    process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
  ).replace(/\/+$/, "")
  const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
  const identifierKind = legacyLoginIdentifierKind(loginId)

  try {
    const res = await fetch(`${backendUrl}/store/legacy-auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-publishable-api-key": publishableKey,
      },
      body: JSON.stringify({ identifier: loginId, password }),
      cache: "no-store",
    })

    if (!res.ok) {
      if (shouldAlertLegacyLoginFallbackStatus(res.status)) {
        await reportLegacyLoginFallbackFailure({
          stage: "backend_rejected",
          identifierKind,
          responseStatus: res.status,
          responseBody: await res.text().catch(() => res.statusText),
        })
      }
      return null
    }

    const body = (await res.json()) as { token?: unknown }
    return typeof body.token === "string" && body.token ? body.token : null
  } catch (error) {
    await reportLegacyLoginFallbackFailure({
      stage: "request_failed",
      identifierKind,
      error,
    })
    return null
  }
}

async function getCustomerAuthToken(loginId: string, password: string) {
  if (!isEmailLoginIdentifier(loginId)) {
    const legacyToken = await requestLegacyAuthToken(loginId, password)
    if (legacyToken) {
      return legacyToken
    }

    throw new Error("Invalid login or password")
  }

  try {
    return (await sdk.auth.login("customer", "emailpass", {
      email: loginId,
      password,
    })) as string
  } catch (error) {
    reportCustomerLoginFailure({
      stage: "emailpass_login",
      identifierKind: "email",
      error,
    })

    const legacyToken = await requestLegacyAuthToken(loginId, password)
    if (legacyToken) {
      return legacyToken
    }

    throw error
  }
}

async function setCustomerSessionToken(token: string) {
  await setAuthToken(token)
  const customerCacheTag = await getCacheTag("customers")
  revalidateTag(customerCacheTag)
}

export async function loginWithCredentials(email: string, password: string) {
  const loginId = normalizeLoginIdentifier(email)

  try {
    const token = await getCustomerAuthToken(loginId, password)
    await setCustomerSessionToken(token)
    await transferCart()
    return { success: true, error: null }
  } catch (error: any) {
    return { success: false, error: "Invalid login or password" }
  }
}

export async function signupWithCredentials(data: {
  email: string
  password: string
  first_name: string
  last_name: string
  phone?: string
  sms_marketing_opt_in?: boolean
}) {
  const phone = data.phone ? stripPhone(data.phone) : ""
  let stage:
    | "auth_register"
    | "auth_token"
    | "auth_headers"
    | "customer_create"
    | "emailpass_login"
    | "cache_revalidate"
    | "cart_transfer"
    | "cart_address_persistence" = "auth_register"

  if (data.sms_marketing_opt_in && phone.length !== 10) {
    return {
      success: false,
      error: "Enter a valid 10-digit phone number to get text messages.",
    }
  }

  try {
    stage = "auth_register"
    const token = await sdk.auth.register("customer", "emailpass", {
      email: data.email,
      password: data.password,
    })
    stage = "auth_token"
    await setAuthToken(token as string)

    stage = "auth_headers"
    const headers = { ...(await getAuthHeaders()) }
    stage = "customer_create"
    await sdk.store.customer.create(
      {
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        phone,
        metadata: data.sms_marketing_opt_in
          ? buildSmsMarketingConsentMetadata({
              phone,
              source: "checkout_account_creation",
            })
          : undefined,
      },
      {},
      headers
    )

    stage = "emailpass_login"
    const loginToken = await sdk.auth.login("customer", "emailpass", {
      email: data.email,
      password: data.password,
    })
    stage = "auth_token"
    await setAuthToken(loginToken as string)

    stage = "cache_revalidate"
    const customerCacheTag = await getCacheTag("customers")
    revalidateTag(customerCacheTag)
    stage = "cart_transfer"
    await transferCart()

    // Issue #74 — Path A: copy the in-flight cart's shipping address to the
    // newly-created customer's address book so first-order checkout
    // populates "saved addresses".
    stage = "cart_address_persistence"
    await saveCartAddressesToAccount()

    return { success: true, error: null }
  } catch (error: any) {
    const msg = error?.message || error?.toString() || ""
    if (msg.includes("exists") || msg.includes("already")) {
      return {
        success: false,
        error:
          "An account with this email already exists. Try signing in instead.",
      }
    }
    reportCustomerSignupFailure({
      stage,
      error,
      hasPhone: Boolean(phone),
      smsMarketingOptIn: Boolean(data.sms_marketing_opt_in),
    })
    return {
      success: false,
      error: "Could not create account. Please try again.",
    }
  }
}

export async function checkEmailExists(email: string): Promise<boolean> {
  try {
    await sdk.auth.login("customer", "emailpass", {
      email,
      password: "__check_only__" + Math.random(),
    })
    return true
  } catch (error: any) {
    const msg = error?.message || error?.toString() || ""
    if (
      msg.includes("Invalid email or password") ||
      msg.includes("Unauthorized")
    ) {
      return true
    }
    return false
  }
}

export const retrieveAuthenticatedCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    const authHeaders = await getAuthHeaders()

    if (!("authorization" in authHeaders)) return null

    const headers = {
      ...authHeaders,
    }

    return await sdk.client
      .fetch<{ customer: HttpTypes.StoreCustomer }>(`/store/customers/me`, {
        method: "GET",
        query: {
          // Expand BOTH orders and addresses. Without `*addresses` Medusa
          // omits the customer's saved addresses, which the checkout flow
          // (and the "Add Address" CTA) depend on to detect whether a
          // logged-in customer already has a delivery address on file.
          fields: "*orders,*addresses,+metadata",
        },
        headers,
        cache: "no-store",
      })
      .then(({ customer }) => customer)
      .catch((error) => {
        reportAuthenticatedCustomerLoadFailure(error)
        return null
      })
  }

export const retrieveAuthenticatedCustomerForStaffAccess =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    const customer = await retrieveAuthenticatedCustomer()
    if (!customer) return null

    if (isStaffCustomer(customer)) {
      return customer
    }

    try {
      const adminCustomer = await retrieveAdminCustomer(customer.id)
      if (!isStaffCustomer(adminCustomer as HttpTypes.StoreCustomer | null)) {
        return customer
      }

      return {
        ...customer,
        metadata: adminCustomer?.metadata || customer.metadata,
      } as HttpTypes.StoreCustomer
    } catch {
      return customer
    }
  }

export async function getActiveStaffImpersonation(): Promise<{
  session: StaffImpersonationSession
  staff: HttpTypes.StoreCustomer
} | null> {
  const session = await readStaffImpersonationCookie()
  if (!session) return null

  const staff = await retrieveAuthenticatedCustomerForStaffAccess()
  // Reusing an impersonation session requires the same office capability used
  // to start one. This invalidates a stale cookie if the staff member was
  // downgraded (e.g. to merchandising reviewer) while a session was active.
  if (
    !staff ||
    !canUseOfficeConsole(staff) ||
    staff.id !== session.staffCustomerId
  ) {
    return null
  }

  return { session, staff }
}

export const retrieveCustomer =
  async (): Promise<HttpTypes.StoreCustomer | null> => {
    const active = await getActiveStaffImpersonation()
    if (active) {
      const target = await retrieveAdminCustomer(
        active.session.targetCustomerId
      )
      if (!target) return null
      return target as HttpTypes.StoreCustomer
    }

    return retrieveAuthenticatedCustomer()
  }

export const updateCustomer = async (body: HttpTypes.StoreUpdateCustomer) => {
  let stage:
    | "staff_context"
    | "staff_customer_load"
    | "staff_customer_update"
    | "store_auth_headers"
    | "store_customer_update"
    | "cache_revalidate" = "staff_context"
  let staffContext = false
  const fields = Object.keys(body)

  try {
    stage = "staff_context"
    const active = await getActiveStaffImpersonation()
    if (active) {
      staffContext = true
      stage = "staff_customer_load"
      const current = await retrieveAdminCustomer(active.session.targetCustomerId)
      if (!current) throw new Error("Could not load impersonated customer.")

      const metadata = appendStaffAuditLog(current.metadata, {
        type: "staff_customer_profile_update",
        staffCustomerId: active.session.staffCustomerId,
        staffEmail: active.session.staffEmail,
        targetCustomerId: active.session.targetCustomerId,
        fields,
      })

      stage = "staff_customer_update"
      const { customer } = await adminFetch<{
        customer: HttpTypes.StoreCustomer
      }>(`/admin/customers/${active.session.targetCustomerId}`, {
        method: "POST",
        body: JSON.stringify({
          ...body,
          metadata: {
            ...metadata,
            ...staffAuditFields(active.session, "customer_profile_update"),
          },
        }),
      })

      stage = "cache_revalidate"
      const cacheTag = await getCacheTag("customers")
      revalidateTag(cacheTag)
      return customer
    }

    stage = "store_auth_headers"
    const headers = {
      ...(await getAuthHeaders()),
    }

    stage = "store_customer_update"
    const updateRes = await sdk.store.customer
      .update(body, {}, headers)
      .then(({ customer }) => customer)
      .catch(medusaError)

    stage = "cache_revalidate"
    const cacheTag = await getCacheTag("customers")
    revalidateTag(cacheTag)

    return updateRes
  } catch (error) {
    reportCustomerProfileUpdateFailure({
      stage,
      error,
      staffContext,
      fields,
    })
    throw error
  }
}

export async function signup(_currentState: unknown, formData: FormData) {
  const password = formData.get("password") as string
  const rawPhone = (formData.get("phone") as string) || ""
  const smsMarketingOptIn = formWantsSmsMarketing(formData)
  const phone = rawPhone ? stripPhone(rawPhone) : ""

  if (smsMarketingOptIn && phone.length !== 10) {
    return "Enter a valid 10-digit phone number to get text messages."
  }

  const customerForm = {
    email: formData.get("email") as string,
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    // Normalize phone to digits-only so the display layer is the single
    // source of formatting (#68). Empty string is preserved when no phone
    // was provided.
    phone,
    metadata: smsMarketingOptIn
      ? buildSmsMarketingConsentMetadata({
          phone,
          source: "account_signup",
        })
      : undefined,
  }

  try {
    const token = await sdk.auth.register("customer", "emailpass", {
      email: customerForm.email,
      password: password,
    })

    await setAuthToken(token as string)

    const headers = {
      ...(await getAuthHeaders()),
    }

    const { customer: createdCustomer } = await sdk.store.customer.create(
      customerForm,
      {},
      headers
    )

    const loginToken = await sdk.auth.login("customer", "emailpass", {
      email: customerForm.email,
      password,
    })

    await setAuthToken(loginToken as string)

    const customerCacheTag = await getCacheTag("customers")
    revalidateTag(customerCacheTag)

    await transferCart()

    // Issue #74 — Path A: copy the in-flight cart's shipping address to the
    // newly-created customer's address book so first-order checkout
    // populates "saved addresses".
    await saveCartAddressesToAccount()

    return createdCustomer
  } catch (error: any) {
    return error.toString()
  }
}

export async function login(_currentState: unknown, formData: FormData) {
  const loginId = normalizeLoginIdentifier(formData.get("email") as string)
  const password = formData.get("password") as string

  try {
    const token = await getCustomerAuthToken(loginId, password)
    await setCustomerSessionToken(token)
  } catch (error: any) {
    return "Invalid login or password"
  }

  try {
    await transferCart()
  } catch (error: any) {
    return error.toString()
  }
}

export async function signout(countryCode: string, redirectTo?: string) {
  await sdk.auth.logout()

  await clearStaffImpersonationCookie()
  await removeAuthToken()

  const customerCacheTag = await getCacheTag("customers")
  revalidateTag(customerCacheTag)

  await removeCartId()

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)

  redirect(redirectTo || `/${countryCode}/account`)
}

/**
 * Sign out without removing the cart or redirecting.
 * Used during checkout so the customer can re-authenticate
 * without losing their in-progress cart.
 */
export async function signoutKeepCart() {
  await sdk.auth.logout()
  await clearStaffImpersonationCookie()
  await removeAuthToken()

  const customerCacheTag = await getCacheTag("customers")
  revalidateTag(customerCacheTag)

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)
}

export async function transferCart() {
  const cartId = await getCartId()

  if (!cartId) {
    return
  }

  const headers = await getAuthHeaders()
  const cartsCacheTag = await getCacheTag("carts")

  try {
    await sdk.store.cart.transferCart(cartId, {}, headers)
    revalidateTag(cartsCacheTag)
    return
  } catch (transferErr) {
    console.error(
      "[transferCart] failed; recovering with a fresh, customer-attached cart",
      transferErr
    )
  }

  // The guest cart can't be attached to this customer — usually because the
  // backend cart record is in a state Medusa can't update (e.g. a stuck
  // payment_collection from an earlier failed checkout). Capture the line
  // items, drop the broken cookie, then create a fresh cart for the customer
  // and re-add the items. End state: customer always has a cart whose
  // customer_id matches them. No mismatch banner needed.
  let preservedItems: Array<{ variant_id: string; quantity: number }> = []
  let regionId: string | undefined
  try {
    const { cart: brokenCart } =
      await sdk.client.fetch<HttpTypes.StoreCartResponse>(
        `/store/carts/${cartId}`,
        { method: "GET", headers }
      )
    regionId = brokenCart?.region_id ?? undefined
    preservedItems = (brokenCart?.items ?? [])
      .filter((i) => !!i.variant_id)
      .map((i) => ({
        variant_id: i.variant_id as string,
        quantity: i.quantity,
      }))
  } catch (readErr) {
    void emitCartTransferRecoveryFailureAlert({
      stage: "cart_read_failed",
      cartId,
      error: readErr,
    }).catch(() => {
      // Fail open: recovery already falls back to dropping the broken cart.
    })
    // best-effort; if the broken cart can't be read, just drop it and continue
  }

  await removeCartId()

  if (!regionId && preservedItems.length > 0) {
    void emitCartTransferRecoveryFailureAlert({
      stage: "missing_region_for_recovery",
      cartId,
      lineItemCount: preservedItems.length,
      hasRegionId: false,
    }).catch(() => {
      // Fail open: sign-in should not wait on alerting.
    })
  }

  if (regionId) {
    try {
      const { cart: fresh } = await sdk.store.cart.create(
        { region_id: regionId },
        {},
        headers
      )
      await setCartId(fresh.id)
      for (const item of preservedItems) {
        await sdk.store.cart.createLineItem(fresh.id, item, {}, headers)
      }
    } catch (recreateErr) {
      console.error("[transferCart] item preservation failed", recreateErr)
      void emitCartTransferRecoveryFailureAlert({
        stage: "item_preservation_failed",
        cartId,
        lineItemCount: preservedItems.length,
        hasRegionId: true,
        error: recreateErr,
      }).catch(() => {
        // Fail open: sign-in should not wait on alerting.
      })
    }
  }

  revalidateTag(cartsCacheTag)
}

export const addCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  // Read default flags from FormData (checkboxes) first, falling back to
  // currentState for legacy callers that pre-set them. Empty checkboxes
  // don't appear in FormData, so use a presence check.
  const formDefaultBilling = formData.has("is_default_billing")
  const formDefaultShipping = formData.has("is_default_shipping")
  const isDefaultBilling =
    formDefaultBilling || (currentState.isDefaultBilling as boolean) || false
  const isDefaultShipping =
    formDefaultShipping || (currentState.isDefaultShipping as boolean) || false

  const rawPhone = (formData.get("phone") as string) || ""
  if (!isValidUSPhone(rawPhone)) {
    return {
      success: false,
      error: "Phone number must be a 10-digit US number.",
    }
  }
  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: (formData.get("country_code") as string) || "us",
    // Persist digits-only so the display layer is the single source of
    // formatting (#68). Customers may paste "(404) 643-1567" or "404-643-1567";
    // we normalize at the boundary; validation above caught malformed input.
    phone: rawPhone ? stripPhone(rawPhone) : "",
    is_default_billing: isDefaultBilling,
    is_default_shipping: isDefaultShipping,
  }

  let stage:
    | "staff_context"
    | "staff_customer_load"
    | "staff_address_create"
    | "staff_audit_update"
    | "store_auth_headers"
    | "store_address_create"
    | "cache_revalidate" = "staff_context"
  let staffContext = false
  const fields = Object.keys(address)

  try {
    stage = "staff_context"
    const active = await getActiveStaffImpersonation()
    if (active) {
      staffContext = true
      stage = "staff_customer_load"
      const current = await retrieveAdminCustomer(active.session.targetCustomerId)
      if (!current) throw new Error("Could not load impersonated customer.")

      stage = "staff_address_create"
      await adminFetch(
        `/admin/customers/${active.session.targetCustomerId}/addresses`,
        {
          method: "POST",
          body: JSON.stringify(address),
        }
      )

      stage = "staff_audit_update"
      await adminFetch(`/admin/customers/${active.session.targetCustomerId}`, {
        method: "POST",
        body: JSON.stringify({
          metadata: {
            ...appendStaffAuditLog(current.metadata, {
              type: "staff_customer_address_create",
              staffCustomerId: active.session.staffCustomerId,
              staffEmail: active.session.staffEmail,
              targetCustomerId: active.session.targetCustomerId,
            }),
            ...staffAuditFields(active.session, "customer_address_create"),
          },
        }),
      })

      stage = "cache_revalidate"
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return { success: true, error: null }
    }

    stage = "store_auth_headers"
    const headers = {
      ...(await getAuthHeaders()),
    }

    stage = "store_address_create"
    await sdk.store.customer.createAddress(address, {}, headers)

    stage = "cache_revalidate"
    const customerCacheTag = await getCacheTag("customers")
    revalidateTag(customerCacheTag)
    return { success: true, error: null }
  } catch (err: any) {
    reportCustomerAddressMutationFailure({
      action: "create",
      stage,
      error: err,
      staffContext,
      fields,
    })
    return { success: false, error: err?.message || err.toString() }
  }
}

/**
 * Save a delivery address to BOTH the customer's address book and the
 * current cart's shipping_address. Used by the checkout flow's
 * "Add your address" CTA so logged-in customers can unlock local delivery
 * and pickup options whose eligibility depends on a postal code.
 *
 * Idempotent on the customer side: if an address with the same
 * address_1 + postal_code already exists, we skip the createAddress call.
 */
export async function saveAddressToProfileAndCart(input: {
  address_id?: string
  first_name: string
  last_name: string
  address_1: string
  city: string
  province: string
  postal_code: string
  phone: string
  country_code?: string
}): Promise<{ success: boolean; error: string | null }> {
  const country = (input.country_code || "us").toLowerCase()
  const repairResult = repairCheckoutAddressForWrite({
    first_name: input.first_name,
    last_name: input.last_name,
    address_1: input.address_1,
    city: input.city,
    province: input.province,
    postal_code: input.postal_code,
    country_code: country,
    // Single normalization point used for both address-book + cart writes
    // below — phones save as canonical digits regardless of input shape (#68).
    phone: input.phone ? stripPhone(input.phone) : "",
  })
  const addressPayload = repairResult.address
  let stage:
    | "staff_context"
    | "staff_customer_load"
    | "staff_address_create"
    | "staff_address_update"
    | "staff_audit_update"
    | "staff_cart_lookup"
    | "staff_cart_update"
    | "store_auth_headers"
    | "store_customer_load"
    | "store_address_create"
    | "store_address_update"
    | "store_cart_lookup"
    | "store_cart_update"
    | "cache_revalidate" = "store_auth_headers"
  let staffContext = false
  let cartId: string | null = null
  const fields = Object.keys(addressPayload)

  try {
    stage = "store_auth_headers"
    const headers = { ...(await getAuthHeaders()) }
    stage = "staff_context"
    const active = await getActiveStaffImpersonation()
    reportCheckoutAddressRepair({
      surface: "profile_cart",
      path: "src/lib/data/customer.ts:saveAddressToProfileAndCart",
      result: repairResult,
      addressId: input.address_id || null,
      targetCustomerId: active?.session.targetCustomerId || null,
      staffContext: Boolean(active),
    })
    if (active) {
      staffContext = true
      const staffCartHeaders = {
        ...headers,
        "x-gp-staff-target-customer-id": active.session.targetCustomerId,
        "x-gp-staff-actor-customer-id": active.session.staffCustomerId,
      }
      stage = "staff_customer_load"
      const current = await retrieveAdminCustomer(
        active.session.targetCustomerId
      )
      if (!current) throw new Error("Could not load impersonated customer.")

      const alreadyOnFile = (current.addresses || []).some(
        (a: any) =>
          (a.address_1 || "").trim().toLowerCase() ===
            addressPayload.address_1.trim().toLowerCase() &&
          (a.postal_code || "").trim() === addressPayload.postal_code.trim()
      )
      const customerHadNoAddresses = (current.addresses || []).length === 0

      if (input.address_id) {
        stage = "staff_address_update"
        await adminFetch(
          `/admin/customers/${active.session.targetCustomerId}/addresses/${input.address_id}`,
          {
            method: "POST",
            body: JSON.stringify(addressPayload),
          }
        )

        stage = "staff_audit_update"
        await adminFetch(
          `/admin/customers/${active.session.targetCustomerId}`,
          {
            method: "POST",
            body: JSON.stringify({
              metadata: {
                ...appendStaffAuditLog(current.metadata, {
                  type: "staff_checkout_address_update",
                  staffCustomerId: active.session.staffCustomerId,
                  staffEmail: active.session.staffEmail,
                  targetCustomerId: active.session.targetCustomerId,
                  addressId: input.address_id,
                }),
                ...staffAuditFields(active.session, "checkout_address_update"),
              },
            }),
          }
        )
        stage = "cache_revalidate"
        revalidateTag(await getCacheTag("customers"))
      } else if (!alreadyOnFile) {
        stage = "staff_address_create"
        await adminFetch(
          `/admin/customers/${active.session.targetCustomerId}/addresses`,
          {
            method: "POST",
            body: JSON.stringify({
              ...addressPayload,
              is_default_shipping: customerHadNoAddresses,
              is_default_billing: customerHadNoAddresses,
            }),
          }
        )

        stage = "staff_audit_update"
        await adminFetch(
          `/admin/customers/${active.session.targetCustomerId}`,
          {
            method: "POST",
            body: JSON.stringify({
              metadata: {
                ...appendStaffAuditLog(current.metadata, {
                  type: "staff_checkout_address_create",
                  staffCustomerId: active.session.staffCustomerId,
                  staffEmail: active.session.staffEmail,
                  targetCustomerId: active.session.targetCustomerId,
                }),
                ...staffAuditFields(active.session, "checkout_address_create"),
              },
            }),
          }
        )
        stage = "cache_revalidate"
        revalidateTag(await getCacheTag("customers"))
      }

      stage = "staff_cart_lookup"
      cartId = (await getStaffImpersonationCartId(active.session)) || null
      if (cartId) {
        const { cart } = await sdk.client.fetch<HttpTypes.StoreCartResponse>(
          `/store/carts/${cartId}`,
          {
            method: "GET",
            headers: staffCartHeaders,
            cache: "no-store",
          }
        )
        const fulfillmentResetMetadata = shouldResetFulfillmentForAddressChange(
          cart,
          addressPayload
        )
          ? clearedCheckoutFulfillmentMetadata()
          : {}

        stage = "staff_cart_update"
        await sdk.store.cart.update(
          cartId,
          {
            shipping_address: addressPayload,
            billing_address: addressPayload,
            metadata: {
              ...fulfillmentResetMetadata,
              ...staffAuditFields(active.session, "checkout_address_saved"),
            },
          },
          {},
          staffCartHeaders
        )
        stage = "cache_revalidate"
        revalidateTag(await getCacheTag("carts"))
        revalidateTag(await getCacheTag("fulfillment"))
      }

      return { success: true, error: null }
    }

    stage = "store_customer_load"
    const me = await retrieveCustomer()
    const alreadyOnFile = (me?.addresses || []).some(
      (a) =>
        (a.address_1 || "").trim().toLowerCase() ===
          addressPayload.address_1.trim().toLowerCase() &&
        (a.postal_code || "").trim() === addressPayload.postal_code.trim()
    )
    const customerHadNoAddresses = (me?.addresses || []).length === 0

    if (input.address_id) {
      stage = "store_address_update"
      await sdk.store.customer.updateAddress(
        input.address_id,
        addressPayload,
        {},
        headers
      )
      stage = "cache_revalidate"
      revalidateTag(await getCacheTag("customers"))
    } else if (!alreadyOnFile) {
      stage = "store_address_create"
      await sdk.store.customer.createAddress(
        {
          ...addressPayload,
          // First saved address becomes the default for shipping + billing.
          is_default_shipping: customerHadNoAddresses,
          is_default_billing: customerHadNoAddresses,
        },
        {},
        headers
      )
      stage = "cache_revalidate"
      revalidateTag(await getCacheTag("customers"))
    }

    stage = "store_cart_lookup"
    cartId = (await getCartId()) || null
    if (cartId) {
      const { cart } = await sdk.client.fetch<HttpTypes.StoreCartResponse>(
        `/store/carts/${cartId}`,
        {
          method: "GET",
          headers,
          cache: "no-store",
        }
      )
      const fulfillmentResetMetadata = shouldResetFulfillmentForAddressChange(
        cart,
        addressPayload
      )
        ? clearedCheckoutFulfillmentMetadata()
        : null

      stage = "store_cart_update"
      await sdk.store.cart.update(
        cartId,
        {
          shipping_address: addressPayload,
          billing_address: addressPayload,
          ...(fulfillmentResetMetadata
            ? { metadata: fulfillmentResetMetadata }
            : {}),
        },
        {},
        headers
      )
      stage = "cache_revalidate"
      revalidateTag(await getCacheTag("carts"))
      revalidateTag(await getCacheTag("fulfillment"))
    }

    return { success: true, error: null }
  } catch (err: any) {
    reportCustomerAddressMutationFailure({
      action: "checkout_save",
      stage,
      error: err,
      staffContext,
      hasAddressId: Boolean(input.address_id),
      hasCartId: Boolean(cartId),
      fields,
    })
    return {
      success: false,
      error: err?.message || "Could not save your address. Please try again.",
    }
  }
}

export const deleteCustomerAddress = async (
  addressId: string
): Promise<{ success: boolean; error: string | null }> => {
  let stage:
    | "staff_context"
    | "staff_customer_load"
    | "staff_address_delete"
    | "staff_audit_update"
    | "store_auth_headers"
    | "store_address_delete"
    | "cache_revalidate" = "staff_context"
  let staffContext = false

  try {
    stage = "staff_context"
    const active = await getActiveStaffImpersonation()
    if (active) {
      staffContext = true
      stage = "staff_customer_load"
      const current = await retrieveAdminCustomer(
        active.session.targetCustomerId
      )

      stage = "staff_address_delete"
      await adminFetch(
        `/admin/customers/${active.session.targetCustomerId}/addresses/${addressId}`,
        { method: "DELETE" }
      )

      stage = "staff_audit_update"
      await adminFetch(`/admin/customers/${active.session.targetCustomerId}`, {
        method: "POST",
        body: JSON.stringify({
          metadata: {
            ...appendStaffAuditLog(current?.metadata, {
              type: "staff_customer_address_delete",
              staffCustomerId: active.session.staffCustomerId,
              staffEmail: active.session.staffEmail,
              targetCustomerId: active.session.targetCustomerId,
              addressId,
            }),
            ...staffAuditFields(active.session, "customer_address_delete"),
          },
        }),
      })

      stage = "cache_revalidate"
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return { success: true, error: null }
    }

    stage = "store_auth_headers"
    const headers = {
      ...(await getAuthHeaders()),
    }

    stage = "store_address_delete"
    await sdk.store.customer.deleteAddress(addressId, headers)

    stage = "cache_revalidate"
    const customerCacheTag = await getCacheTag("customers")
    revalidateTag(customerCacheTag)
    return { success: true, error: null }
  } catch (err: any) {
    reportCustomerAddressMutationFailure({
      action: "delete",
      stage,
      error: err,
      staffContext,
      hasAddressId: Boolean(addressId),
    })
    return { success: false, error: err?.message || err.toString() }
  }
}

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  const addressId =
    (currentState.addressId as string) || (formData.get("addressId") as string)

  if (!addressId) {
    return { success: false, error: "Address ID is required" }
  }

  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: (formData.get("country_code") as string) || "us",
  } as HttpTypes.StoreUpdateCustomerAddress

  // Persist digits-only on update for the same reason as add-address (#68).
  const phone = formData.get("phone") as string
  if (!isValidUSPhone(phone)) {
    return {
      success: false,
      error: "Phone number must be a 10-digit US number.",
    }
  }
  if (phone) {
    address.phone = stripPhone(phone)
  }

  // Default-flag checkboxes (#49) — only sent when checked.
  if (formData.has("is_default_shipping")) {
    address.is_default_shipping = true
  }
  if (formData.has("is_default_billing")) {
    address.is_default_billing = true
  }

  let stage:
    | "staff_context"
    | "staff_customer_load"
    | "staff_address_update"
    | "staff_audit_update"
    | "store_auth_headers"
    | "store_address_update"
    | "cache_revalidate" = "staff_context"
  let staffContext = false
  const fields = Object.keys(address)

  try {
    stage = "staff_context"
    const active = await getActiveStaffImpersonation()
    if (active) {
      staffContext = true
      stage = "staff_customer_load"
      const current = await retrieveAdminCustomer(
        active.session.targetCustomerId
      )
      if (!current) throw new Error("Could not load impersonated customer.")

      stage = "staff_address_update"
      await adminFetch(
        `/admin/customers/${active.session.targetCustomerId}/addresses/${addressId}`,
        {
          method: "POST",
          body: JSON.stringify(address),
        }
      )

      stage = "staff_audit_update"
      await adminFetch(`/admin/customers/${active.session.targetCustomerId}`, {
        method: "POST",
        body: JSON.stringify({
          metadata: {
            ...appendStaffAuditLog(current.metadata, {
              type: "staff_customer_address_update",
              staffCustomerId: active.session.staffCustomerId,
              staffEmail: active.session.staffEmail,
              targetCustomerId: active.session.targetCustomerId,
              addressId,
            }),
            ...staffAuditFields(active.session, "customer_address_update"),
          },
        }),
      })

      stage = "cache_revalidate"
      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return { success: true, error: null }
    }

    stage = "store_auth_headers"
    const headers = {
      ...(await getAuthHeaders()),
    }

    stage = "store_address_update"
    await sdk.store.customer.updateAddress(addressId, address, {}, headers)

    stage = "cache_revalidate"
    const customerCacheTag = await getCacheTag("customers")
    revalidateTag(customerCacheTag)
    return { success: true, error: null }
  } catch (err: any) {
    reportCustomerAddressMutationFailure({
      action: "update",
      stage,
      error: err,
      staffContext,
      hasAddressId: Boolean(addressId),
      fields,
    })
    return { success: false, error: err?.message || err.toString() }
  }
}
