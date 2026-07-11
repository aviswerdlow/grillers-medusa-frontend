import type { HttpTypes } from "@medusajs/types"

type CheckoutFulfillmentCart = Pick<
  HttpTypes.StoreCart,
  "metadata" | "shipping_methods"
>

export function isFulfillmentSelectionSettled(
  cart: CheckoutFulfillmentCart | null | undefined
) {
  const status = cart?.metadata?.fulfillmentSelectionStatus
  if (status === "settled") return true
  if (status === "pending" || status === "") return false

  // Backward compatibility for carts created before the explicit state marker
  // shipped. A legacy attached method is settled; explicit pending/cleared
  // values above always win so new transitions still fail closed.
  return Boolean(status == null && (cart?.shipping_methods?.length || 0) > 0)
}

/**
 * Every checkout fulfillment mode attaches a Medusa shipping method. Payment
 * can advance only after that attachment succeeded and the two-step selection
 * state was marked settled.
 */
export function isCheckoutFulfillmentReadyForPayment(
  cart: CheckoutFulfillmentCart | null | undefined
) {
  const hasFulfillmentType = Boolean(
    String(cart?.metadata?.fulfillmentType || "").trim()
  )

  return Boolean(
    hasFulfillmentType &&
      isFulfillmentSelectionSettled(cart) &&
      (cart?.shipping_methods?.length || 0) > 0
  )
}
