import { convertToLocale } from "@lib/util/money"
import { clx } from "@medusajs/ui"

type NetWeightPricingProps = {
  unitPrice: number // Price per unit (pack)
  currencyCode: string
  avgWeight?: string | null // e.g., "1.1 lb"
  isNetWeight?: boolean
  variant?: "default" | "compact"
}

// Helper to parse weight string like "1.1 lb" to number
function parseWeight(weightStr?: string | null): number | null {
  if (!weightStr) return null
  const match = weightStr.match(/(\d+\.?\d*)\s*(lb|lbs|pound|pounds)/i)
  if (match) {
    return parseFloat(match[1])
  }
  return null
}

export default function NetWeightPricing({
  unitPrice,
  currencyCode,
  avgWeight,
  isNetWeight = false,
  variant = "default",
}: NetWeightPricingProps) {
  const weight = parseWeight(avgWeight)

  // If not a net-weight product or no weight info, don't show special pricing
  if (!isNetWeight || !weight || weight <= 0) {
    return null
  }

  // Calculate price per lb
  const pricePerLb = unitPrice / weight

  return (
    <div
      className={clx("flex flex-col", {
        "gap-0.5": variant === "compact",
        "gap-1": variant === "default",
      })}
    >
      {/* Price per lb */}
      <div className="flex items-center gap-1">
        <span
          className={clx("font-maison-neue-mono text-Charcoal/70", {
            "text-xs": variant === "compact",
            "text-sm": variant === "default",
          })}
        >
          {convertToLocale({
            amount: pricePerLb,
            currency_code: currencyCode,
          })}
          <span className="text-Charcoal/60">/lb</span>
        </span>
      </div>

      {/* Estimated weight */}
      <div className="flex items-center gap-1">
        <span
          className={clx("text-Charcoal/60", {
            "text-xs": variant === "compact",
            "text-[10px]": variant === "default",
          })}
        >
          Est. {avgWeight}
        </span>
        <span
          className="inline-block"
          title="Final price based on actual weight at fulfillment"
        >
          <svg
            className="w-3 h-3 text-Charcoal/40"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>
    </div>
  )
}

// Badge component to indicate net-weight pricing
export function NetWeightBadge({ className }: { className?: string }) {
  return (
    <span
      className={clx(
        "inline-flex items-center gap-1 px-2 py-0.5 bg-Gold/20 text-Charcoal text-[10px] font-maison-neue-mono uppercase rounded",
        className
      )}
      title="This product is priced by weight. Final price may vary slightly."
    >
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
      </svg>
      Priced by weight
    </span>
  )
}

