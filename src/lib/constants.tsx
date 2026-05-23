import React from "react"
import { CreditCard } from "@medusajs/icons"

export const STRIPE_CARD_PROVIDER_ID = "pp_stripe_stripe"

/* Map of payment provider_id to its customer-facing title and icon. */
export const paymentInfoMap: Record<
  string,
  { title: string; icon: React.JSX.Element }
> = {
  [STRIPE_CARD_PROVIDER_ID]: {
    title: "Credit card",
    icon: <CreditCard />,
  },
}

// Native Stripe card payments only. This intentionally excludes Stripe wallet,
// redirect, and manual providers because checkout only supports credit cards.
export const isStripe = (providerId?: string) => {
  return providerId === STRIPE_CARD_PROVIDER_ID
}

// Add currencies that don't need to be divided by 100
export const noDivisionCurrencies = [
  "krw",
  "jpy",
  "vnd",
  "clp",
  "pyg",
  "xaf",
  "xof",
  "bif",
  "djf",
  "gnf",
  "kmf",
  "mga",
  "rwf",
  "xpf",
  "htg",
  "vuv",
  "xag",
  "xdr",
  "xau",
]
