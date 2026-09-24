export type ReviewPaymentMode = "card" | "card_at_placement" | "invoice"
export const FINAL_CHARGE_CONSENT_VERSION =
  "catch-weight-final-charge-2026-09-21"
export const FINAL_CHARGE_CONSENT_TEXT =
  "For items sold by the pound, checkout prices are estimates; the final food total reflects the actual packed weight. I agree that Griller's Pride will save my card today and charge the final order total when my order is packed and ready to leave."
export type OrderAcceptance =
  | {
      legacy?: false
      reviewId: string
      requestId: string
      analyticsConsent: boolean | null
    }
  | {
      legacy: true
      reviewId?: never
      requestId?: never
      analyticsConsent: boolean | null
    }
export type ReviewedAddress = {
  first_name: string
  last_name: string
  company: string
  address_1: string
  address_2: string
  city: string
  province: string
  postal_code: string
  country_code: string
}
export type CheckoutReview = {
  id: string
  expires_at: string
  cart_id: string
  currency: string
  placement_total: number
  item_total: number
  shipping_total: number
  tax_total: number
  discount_total: number
  shipping_address: ReviewedAddress
  billing_address: ReviewedAddress
  contact: { checkout_email: string; receipt_email: string; phone: string }
  lines: Array<{
    id: string
    title: string
    quantity: number
    pricing_mode: "fixed_price" | "per_lb"
    estimated_unit_price: number
    estimated_line_total: number
    rate_per_lb: number | null
    estimated_weight_lb: number | null
  }>
  fulfillment: {
    mode: string
    arrival_date: string
    window_label: string
    timezone: string
    service_code: string
    service_label: string
    pickup_location: string | null
  }
  shipping_policy: string | null
  terms: {
    payment_mode: ReviewPaymentMode
    consent_version: string | null
    consent_text: string | null
    invoice_terms: string | null
    sale_terms_revision: string
  }
}
