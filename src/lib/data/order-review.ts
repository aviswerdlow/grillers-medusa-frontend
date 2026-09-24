"use server"
import { sdk } from "@lib/config"
import { getPaymentContextHeaders } from "./payment"
import { staffCartHeaders } from "./staff/cart-authority"
import type {
  CheckoutReview,
  OrderAcceptance,
  ReviewPaymentMode,
} from "@lib/order-review"
import { getActiveStaffImpersonation } from "./customer"
import {
  removeCartId,
  removeStaffImpersonationCartId,
  getCacheTag,
} from "./cookies"
import { revalidateTag } from "next/cache"
import { calendarHttpStatus } from "@lib/fulfillment-calendar-rollout"

const reviewPath = (id: string) =>
  `/store/carts/${encodeURIComponent(id)}/order-review`

// No client flag authorizes a downgrade. Re-read before payment, retain any
// accepted promise, and distinguish a missing endpoint from an actual outage.
async function legacyCheckoutAvailable(
  cartId: string,
  headers: Record<string, string>
): Promise<boolean> {
  if (!headers.authorization && !headers["x-gp-staff-authorization"])
    return false
  try {
    const { cart } = await sdk.client.fetch<{ cart: any }>(
      `/store/carts/${encodeURIComponent(cartId)}`,
      {
        method: "GET",
        cache: "no-store",
        headers,
        query: { fields: "id,customer_id,metadata,completed_at" },
      }
    )
    if (
      !cart ||
      cart.id !== cartId ||
      !cart.customer_id ||
      cart.completed_at ||
      cart.metadata?.gp_order_promise_snapshot_id != null
    )
      return false
    try {
      const capability = await sdk.client.fetch<{ enforcement?: unknown }>(
        reviewPath(cartId),
        {
          method: "GET",
          cache: "no-store",
          headers,
        }
      )
      return capability?.enforcement === "off"
    } catch (error) {
      return calendarHttpStatus(error) === 404
    }
  } catch {
    return false
  }
}

export async function loadCheckoutReview(input: {
  cartId: string
  paymentMode: ReviewPaymentMode
  requestId: string
  analyticsConsent: boolean | null
  staffPhone?: boolean
}): Promise<{
  review: CheckoutReview | null
  error: string | null
  legacy?: true
}> {
  let headers: Record<string, string> = {}
  try {
    headers = input.staffPhone
      ? await staffCartHeaders()
      : await getPaymentContextHeaders()
    const result = await sdk.client.fetch<{ review: CheckoutReview }>(
      `/store/carts/${encodeURIComponent(input.cartId)}/order-review`,
      {
        method: "POST",
        headers,
        cache: "no-store",
        body: {
          action: "review",
          payment_mode: input.paymentMode,
          request_id: input.requestId,
          analytics_consent: input.analyticsConsent,
        },
      }
    )
    if (!result?.review)
      throw new Error(
        "We could not review this order. Try again before placing it."
      )
    return { review: result.review, error: null }
  } catch (error: any) {
    if (
      calendarHttpStatus(error) === 404 &&
      (await legacyCheckoutAvailable(input.cartId, headers))
    )
      return { review: null, error: null, legacy: true }
    return {
      review: null,
      error:
        error?.message ||
        "We could not review this order. Try again before placing it.",
    }
  }
}

export async function acceptCheckoutReview(input: {
  cartId: string
  paymentMode: ReviewPaymentMode
  acceptance: OrderAcceptance
  staffPhone?: boolean
}) {
  try {
    const headers = input.staffPhone
      ? await staffCartHeaders()
      : await getPaymentContextHeaders()
    if (input.acceptance.legacy) {
      if (!(await legacyCheckoutAvailable(input.cartId, headers)))
        throw new Error("Review the current order before placing it.")
      return { error: null }
    }
    await sdk.client.fetch(
      `/store/carts/${encodeURIComponent(input.cartId)}/order-review`,
      {
        method: "POST",
        headers,
        cache: "no-store",
        body: {
          action: "accept",
          payment_mode: input.paymentMode,
          review_id: input.acceptance.reviewId,
          request_id: input.acceptance.requestId,
          analytics_consent: input.acceptance.analyticsConsent,
        },
      }
    )
    return { error: null }
  } catch (error: any) {
    return {
      error:
        error?.message ||
        "The order details changed. Review the current order before placing it.",
    }
  }
}

/** Recovery may only replay an already completed cart. It cannot start a new
 * invoice/card order or initiate another provider payment. */
export async function recoverReviewedCheckout(input: {
  cartId: string
  paymentMode: ReviewPaymentMode
  acceptance: OrderAcceptance
}) {
  try {
    if (input.acceptance.legacy)
      throw new Error(
        "Contact the office to confirm the status of this order before taking another payment."
      )
    const result = await sdk.client.fetch<{ order_id: string }>(
      `/store/carts/${encodeURIComponent(input.cartId)}/order-review`,
      {
        method: "POST",
        headers: await getPaymentContextHeaders(),
        cache: "no-store",
        body: {
          action: "recover",
          payment_mode: input.paymentMode,
          review_id: input.acceptance.reviewId,
          request_id: input.acceptance.requestId,
          analytics_consent: input.acceptance.analyticsConsent,
        },
      }
    )
    const active = await getActiveStaffImpersonation()
    if (active) await removeStaffImpersonationCartId(active.session)
    else await removeCartId()
    revalidateTag(await getCacheTag("carts"))
    revalidateTag(await getCacheTag("orders"))
    return { orderId: result.order_id, error: null }
  } catch (error: any) {
    return {
      orderId: null,
      error:
        error?.message ||
        "Order status is still uncertain. Contact the office before taking another payment.",
    }
  }
}
