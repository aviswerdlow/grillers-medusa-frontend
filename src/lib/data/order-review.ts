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

export async function loadCheckoutReview(input: {
  cartId: string
  paymentMode: ReviewPaymentMode
  requestId: string
  analyticsConsent: boolean | null
  staffPhone?: boolean
}): Promise<{ review: CheckoutReview | null; error: string | null }> {
  try {
    const result = await sdk.client.fetch<{ review: CheckoutReview }>(
      `/store/carts/${encodeURIComponent(input.cartId)}/order-review`,
      {
        method: "POST",
        headers: input.staffPhone
          ? await staffCartHeaders()
          : await getPaymentContextHeaders(),
        cache: "no-store",
        body: {
          action: "review",
          payment_mode: input.paymentMode,
          request_id: input.requestId,
          analytics_consent: input.analyticsConsent,
        },
      }
    )
    return { review: result.review, error: null }
  } catch (error: any) {
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
    await sdk.client.fetch(
      `/store/carts/${encodeURIComponent(input.cartId)}/order-review`,
      {
        method: "POST",
        headers: input.staffPhone
          ? await staffCartHeaders()
          : await getPaymentContextHeaders(),
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
