import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: unknown
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

/** Medusa may serialize a BigNumber as an object rather than a JSON number. */
export function toMoneyAmount(amount: unknown): number | null {
  if (typeof amount === "number") {
    return Number.isFinite(amount) ? amount : null
  }

  if (typeof amount === "string") {
    const text = amount.trim()
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
      return null
    }
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (amount && typeof amount === "object" && !Array.isArray(amount)) {
    const value = amount as Record<string, unknown>
    if ("numeric_" in value) {
      const numeric = toMoneyAmount(value.numeric_)
      if (numeric !== null) return numeric
    }
    if ("value" in value) return toMoneyAmount(value.value)
  }

  return null
}

export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "en-US",
}: ConvertToLocaleParams) => {
  const numericAmount = toMoneyAmount(amount)
  if (numericAmount === null) return "—"

  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits,
        maximumFractionDigits,
      }).format(numericAmount)
    : numericAmount.toString()
}
