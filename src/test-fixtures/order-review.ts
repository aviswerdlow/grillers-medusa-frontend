import type { CheckoutReview } from "@lib/order-review"
export const reviewAcceptance = {
  reviewId: "gpor_fixture",
  requestId: "d98224fb-c599-4a63-92ba-22189c505126",
  analyticsConsent: null,
}
export function checkoutReviewFixture(): CheckoutReview {
  const address = {
    first_name: "Fixture",
    last_name: "Customer",
    company: "",
    address_1: "1 Test Lane",
    address_2: "",
    city: "Atlanta",
    province: "GA",
    postal_code: "30340",
    country_code: "us",
  }
  return {
    id: "gpor_fixture",
    cart_id: "cart_test",
    expires_at: new Date(Date.now() + 600000).toISOString(),
    currency: "usd",
    placement_total: 72,
    item_total: 60,
    shipping_total: 12,
    tax_total: 0,
    discount_total: 0,
    shipping_address: address,
    billing_address: address,
    contact: {
      checkout_email: "login@example.invalid",
      receipt_email: "receipt@example.invalid",
      phone: "+12025550123",
    },
    lines: [
      {
        id: "line_fixture",
        title: "Fixture roast",
        quantity: 2,
        pricing_mode: "per_lb",
        estimated_unit_price: 30,
        estimated_line_total: 60,
        rate_per_lb: 10,
        estimated_weight_lb: 6,
      },
    ],
    fulfillment: {
      mode: "ups_shipping",
      arrival_date: "2026-09-24",
      window_label: "",
      timezone: "America/New_York",
      service_code: "GROUND",
      service_label: "UPS Ground",
      pickup_location: null,
    },
    shipping_policy:
      "The reviewed shipping charge is retained when the final food weight is charged.",
    terms: {
      payment_mode: "card",
      consent_version: "synthetic-consent",
      consent_text:
        "The card is saved today and charged when the order is packed.",
      invoice_terms: null,
      sale_terms_revision: "synthetic-sale-terms",
    },
  }
}
