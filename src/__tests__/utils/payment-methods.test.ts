import {
  isStripe,
  paymentInfoMap,
  STRIPE_CARD_PROVIDER_ID,
} from "@lib/constants"

describe("payment method configuration", () => {
  it("only exposes native Stripe credit card payments", () => {
    expect(Object.keys(paymentInfoMap)).toEqual([STRIPE_CARD_PROVIDER_ID])
    expect(paymentInfoMap[STRIPE_CARD_PROVIDER_ID].title).toBe("Credit card")
  })

  it("rejects wallet, redirect, manual, and third-party provider ids", () => {
    expect(isStripe(STRIPE_CARD_PROVIDER_ID)).toBe(true)
    expect(isStripe("pp_stripe-ideal_stripe")).toBe(false)
    expect(isStripe("pp_stripe_google_pay")).toBe(false)
    expect(isStripe("pp_system_default")).toBe(false)
    expect(isStripe("pp_third_party_wallet")).toBe(false)
  })
})
