"use client"

import { useEffect, useRef } from "react"
import { jitsuTrack } from "@lib/jitsu"
import { toMoneyAmount } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type Props = {
  cart: HttpTypes.StoreCart
}

/**
 * Fires `cart_viewed` once per full /cart page load.
 * Mirrors the payload emitted by the side-cart's isOpen useEffect so
 * downstream analytics see a consistent shape regardless of entry point.
 */
export default function CartViewedTracker({ cart }: Props) {
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current || !cart?.items?.length) return
    fired.current = true
    jitsuTrack("cart_viewed", {
      cart_id: cart.id,
      value: toMoneyAmount(cart.subtotal) ?? 0,
      currency: cart.currency_code?.toUpperCase() || "USD",
      item_count: cart.items.reduce((acc, item) => acc + item.quantity, 0),
      items: cart.items.map((item) => ({
        item_id: item.product_id || item.id,
        item_name: item.product_title || item.title,
        price: toMoneyAmount(item.unit_price) ?? 0,
        quantity: item.quantity,
      })),
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
