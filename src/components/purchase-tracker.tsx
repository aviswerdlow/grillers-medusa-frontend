"use client"

import { useEffect, useRef } from "react"
import { trackPurchase } from "@lib/gtm"
import { toMoneyAmount } from "@lib/util/money"

type OrderData = {
  id: string
  total: unknown
  currency_code: string
  items: Array<{
    product_id: string
    title: string
    unit_price: unknown
    quantity: number
  }>
}

/**
 * Fires the GTM purchase event once on mount for GA4 parity.
 *
 * NOTE: The Jitsu `order_completed` event is NOT fired here — it must
 * originate server-side only (via Medusa subscriber) to prevent the
 * 6.85x duplicate problem documented in the v2 event spec.
 */
export default function PurchaseTracker({ order }: { order: OrderData }) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current || !order?.id) return
    fired.current = true

    trackPurchase({
      id: order.id,
      total: toMoneyAmount(order.total) ?? 0,
      currency_code: order.currency_code,
      items: order.items?.map((item) => ({
        product_id: item.product_id,
        title: item.title,
        unit_price: toMoneyAmount(item.unit_price) ?? 0,
        quantity: item.quantity,
      })),
    })
  }, [order])

  return null
}
