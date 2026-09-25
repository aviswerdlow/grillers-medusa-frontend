type CheckoutAnalyticsCart = {
  total?: number | null
  items?: CheckoutAnalyticsCartItem[] | null
}

type CheckoutAnalyticsCartItem = {
  id: string
  product_id?: string | null
  product_title?: string | null
  unit_price?: number | null
  quantity?: number | null
}

export type CheckoutAnalyticsItem = {
  id: string
  title: string
  price: number
  quantity: number
}

export function getCheckoutAnalyticsValue(
  cart: CheckoutAnalyticsCart | null | undefined
) {
  return toMoneyAmount(cart?.total) ?? 0
}

export function getCheckoutAnalyticsItems(
  cart: CheckoutAnalyticsCart | null | undefined
): CheckoutAnalyticsItem[] {
  return (
    cart?.items?.map((item) => ({
      id: item.product_id || item.id,
      title: item.product_title || "",
      price: toMoneyAmount(item.unit_price) ?? 0,
      quantity: item.quantity ?? 0,
    })) || []
  )
}
import { toMoneyAmount } from "@lib/util/money"
