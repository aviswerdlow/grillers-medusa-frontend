"use client"

import { useEffect } from "react"
import { useCart } from "@modules/layout/components/side-cart/cart-context"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/**
 * Cart page content that auto-opens the side cart.
 * Shows minimal content since the side cart displays the actual cart.
 */
export default function CartPageContent() {
  const { openCart } = useCart()

  // Auto-open side cart when this page loads
  useEffect(() => {
    openCart()
  }, [openCart])

  return (
    <div className="py-12">
      <div className="content-container">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <svg
            className="w-16 h-16 text-gray-300 mb-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
            />
          </svg>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Your Shopping Cart
          </h1>
          <p className="text-gray-500 mb-6">
            Your cart is displayed in the side panel.
          </p>
          <LocalizedClientLink
            href="/store"
            className="text-RichGold hover:text-RichGold/80 font-medium"
          >
            Continue Shopping →
          </LocalizedClientLink>
        </div>
      </div>
    </div>
  )
}
