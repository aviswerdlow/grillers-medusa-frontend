import { AGENTIC_COMMERCE_FEED_VERSION } from "@lib/agentic-commerce/feed"
import { getBaseURL } from "@lib/util/env"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const baseUrl = getBaseURL()

  return NextResponse.json(
    {
      schema_version: "grillers-pride.agentic-commerce-manifest.v1",
      generated_at: new Date().toISOString(),
      merchant: {
        id: "grillers-pride",
        name: "Grillers Pride",
        canonical_url: baseUrl,
        default_country_code: "us",
      },
      product_discovery: {
        feed_schema_version: AGENTIC_COMMERCE_FEED_VERSION,
        feed_url: `${baseUrl}/agentic-commerce/products.json?countryCode=us`,
        product_url_template: `${baseUrl}/us/products/{product-handle}`,
      },
      checkout: {
        mode: "merchant_redirect",
        universal_cart_cookie: "_medusa_cart_id",
        cart_url: `${baseUrl}/us/cart`,
        checkout_url: `${baseUrl}/us/checkout`,
        authoritative_checkout_state:
          "Prices, taxes, discounts, fulfillment options, shipping charges, minimums, and payment readiness are authoritative only after the storefront cart is created or refreshed.",
      },
      signed_handoff: {
        endpoint: `${baseUrl}/api/staff/phone-order/handoff`,
        use: "Customer-specific staff phone order review links only.",
        requires_signed_token: true,
        writes_universal_cart_cookie: true,
      },
      agent_guidance: [
        "Use the product feed for product titles, descriptions, prices, images, availability, categories, and canonical product URLs.",
        "Send shoppers to canonical product pages or the merchant checkout flow for cart mutation, fulfillment selection, account creation, and payment.",
        "Do not fabricate cart totals; always treat the live storefront cart and checkout as the source of truth.",
        "Do not crawl or call private account, order, checkout, cart, or API paths except when following a customer-specific signed handoff URL.",
      ],
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    }
  )
}
