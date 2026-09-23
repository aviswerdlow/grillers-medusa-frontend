"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import { getActiveStaffImpersonation } from "./customer"
import { HttpTypes } from "@medusajs/types"
import { reportServerSoftFailure } from "@lib/server-soft-failure"
import {
  emitCheckoutPaymentMethodsUnavailableAlert,
  emitCheckoutPaymentSetupFailureAlert,
  emitSavedPaymentMethodFailureAlert,
} from "@lib/checkout-payment-ops-alerts"

const STRIPE_CARD_PROVIDER_ID = "pp_stripe_stripe"

export type SavedPaymentMethod = {
  id: string
  provider_id: string
  is_default?: boolean
  data: {
    card?: {
      brand: string
      last4: string
      exp_month: number
      exp_year: number
    }
  }
}

export async function getPaymentContextHeaders() {
  const headers = { ...(await getAuthHeaders()) } as Record<string, string>
  const active = await getActiveStaffImpersonation().catch(() => null)

  if (active) {
    if (!headers.authorization) throw new Error("Sign in again to use staff payment tools.")
    headers["x-gp-staff-authorization"] = headers.authorization
    headers["x-gp-staff-target-customer-id"] = active.session.targetCustomerId
    headers["x-gp-staff-actor-customer-id"] = active.session.staffCustomerId
  }

  return headers
}

export async function getSavedPaymentMethods(): Promise<SavedPaymentMethod[]> {
  let hasAuth = false
  let staffImpersonation = false
  let stage: "payment_context_headers" | "payment_methods_list" =
    "payment_context_headers"

  try {
    stage = "payment_context_headers"
    const headers = await getPaymentContextHeaders()
    hasAuth = Boolean(headers.authorization)
    staffImpersonation = Boolean(headers["x-gp-staff-target-customer-id"])
    if (!headers.authorization) return []

    stage = "payment_methods_list"
    const { payment_methods } = await sdk.client.fetch<{
      payment_methods: SavedPaymentMethod[]
    }>("/store/payment-methods", {
      method: "GET",
      headers,
    })

    return payment_methods || []
  } catch (error) {
    console.error("Error fetching saved payment methods:", error)
    await emitSavedPaymentMethodFailureAlert({
      operation: "list",
      stage,
      error,
      hasAuth,
      staffImpersonation,
    }).catch(() => {
      // Fail-open: account page should keep rendering its empty-state fallback.
    })
    return []
  }
}

/**
 * Request a Stripe SetupIntent client_secret so the storefront can collect a
 * card via Elements and attach it to the customer's stripe account holder.
 * Backend route required: POST /store/payment-methods/setup-intent
 *   body: {} → { client_secret: string, account_holder_id: string }
 */
export async function createPaymentMethodSetupIntent(): Promise<
  | {
      client_secret: string
      account_holder_id: string
    }
  | { error: string }
> {
  let hasAuth = false
  let staffImpersonation = false
  try {
    const headers = await getPaymentContextHeaders()
    hasAuth = Boolean(headers.authorization)
    staffImpersonation = Boolean(headers["x-gp-staff-target-customer-id"])
    if (!headers.authorization) {
      return { error: "You must be signed in to add a card." }
    }

    const result = await sdk.client.fetch<{
      client_secret: string
      account_holder_id: string
    }>("/store/payment-methods/setup-intent", {
      method: "POST",
      headers,
      body: {},
    })

    if (!result?.client_secret) {
      await emitCheckoutPaymentSetupFailureAlert({
        stage: "setup_intent_response",
        reason: "missing_client_secret",
        hasAuth,
        staffImpersonation,
        error: result,
      })
      return { error: "Could not start a card setup. Please try again." }
    }
    return result
  } catch (error: any) {
    console.error("Error creating SetupIntent:", error)
    if (hasAuth) {
      await emitCheckoutPaymentSetupFailureAlert({
        stage: "setup_intent_request",
        reason: "request_failed",
        hasAuth,
        staffImpersonation,
        error,
      })
    }
    return {
      error:
        error?.data?.message ||
        error?.message ||
        "Could not start a card setup. Please try again.",
    }
  }
}

/**
 * Mark a saved payment method as the customer's default.
 * Backend route required: POST /store/payment-methods/:id/default
 */
export async function setDefaultPaymentMethod(
  paymentMethodId: string
): Promise<{ success: boolean; error?: string }> {
  let hasAuth = false
  let staffImpersonation = false
  let stage: "payment_context_headers" | "payment_method_default" =
    "payment_context_headers"

  try {
    stage = "payment_context_headers"
    const headers = await getPaymentContextHeaders()
    hasAuth = Boolean(headers.authorization)
    staffImpersonation = Boolean(headers["x-gp-staff-target-customer-id"])
    if (!headers.authorization)
      return { success: false, error: "Not signed in" }

    stage = "payment_method_default"
    await sdk.client.fetch(
      `/store/payment-methods/${paymentMethodId}/default`,
      {
        method: "POST",
        headers,
        body: {},
      }
    )
    return { success: true }
  } catch (error: any) {
    console.error("Error setting default payment method:", error)
    await emitSavedPaymentMethodFailureAlert({
      operation: "set_default",
      stage,
      error,
      hasAuth,
      staffImpersonation,
      paymentMethodId,
    }).catch(() => {
      // Fail-open: preserve the existing form error path.
    })
    return {
      success: false,
      error: error?.data?.message || error?.message || "Could not set default.",
    }
  }
}

/**
 * Delete a saved payment method.
 */
export async function deleteSavedPaymentMethod(
  paymentMethodId: string
): Promise<{ success: boolean; error?: string }> {
  let hasAuth = false
  let staffImpersonation = false
  let stage: "payment_context_headers" | "payment_method_delete" =
    "payment_context_headers"

  try {
    stage = "payment_context_headers"
    const headers = await getPaymentContextHeaders()
    hasAuth = Boolean(headers.authorization)
    staffImpersonation = Boolean(headers["x-gp-staff-target-customer-id"])
    if (!headers.authorization) return { success: false, error: "Not signed in" }

    stage = "payment_method_delete"
    await sdk.client.fetch(`/store/payment-methods/${paymentMethodId}`, {
      method: "DELETE",
      headers,
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error deleting payment method:", error)
    await emitSavedPaymentMethodFailureAlert({
      operation: "delete",
      stage,
      error,
      hasAuth,
      staffImpersonation,
      paymentMethodId,
    }).catch(() => {
      // Fail-open: preserve the existing form error path.
    })
    return {
      success: false,
      error:
        error?.data?.message ||
        error?.message ||
        "Could not remove payment method.",
    }
  }
}

export const listCartPaymentMethods = async (regionId: string) => {
  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("payment_providers")),
  }

  return sdk.client
    .fetch<HttpTypes.StorePaymentProviderListResponse>(
      `/store/payment-providers`,
      {
        method: "GET",
        query: { region_id: regionId },
        headers,
        next,
        cache: "force-cache",
      }
    )
    .then(async ({ payment_providers }) => {
      const providers = (payment_providers || []).sort((a, b) => {
        return a.id > b.id ? 1 : -1
      })
      const providerIds = providers.map((provider) => provider.id || "")
      const hasStripeCardProvider = providerIds.includes(STRIPE_CARD_PROVIDER_ID)

      if (!hasStripeCardProvider) {
        await emitCheckoutPaymentMethodsUnavailableAlert({
          regionId,
          providerIds,
          reason: providers.length
            ? "stripe_card_provider_missing"
            : "no_payment_providers",
        })
      }

      return providers
    })
    .catch((e) => {
      // Checkout path: no payment providers → checkout cannot proceed.
      reportServerSoftFailure(
        "src/lib/data/payment.ts:listCartPaymentMethods",
        e,
        { region_id: regionId }
      )
      return null
    })
}
