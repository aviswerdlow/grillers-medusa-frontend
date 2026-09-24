import { clx } from "@medusajs/ui"
import FormattedPrice from "@modules/common/components/formatted-price"
import { formatCardPriceDisplay } from "@lib/util/card-price-display"
import { VariantPrice } from "types/global"
import type { Metadata } from "types/strapi"

/**
 * Preview-card price (used by Bestsellers / Specialty / related rows
 * when the product comes through the Medusa-only path). Renders the
 * same per-lb vs fixed-price decision used by the PDP / PLP, driven
 * by an optional Strapi `Metadata` blob + the variant SKU.
 *
 * Callers without metadata fall through to the SKU map + weight
 * heuristic in `formatCardPriceDisplay`.
 */
export default async function PreviewPrice({
  price,
  metadata,
  sku,
}: {
  price: VariantPrice
  metadata?: Metadata | null
  sku?: string | null
}) {
  if (!price) {
    return null
  }

  const display = formatCardPriceDisplay(
    price.calculated_price_number ?? 0,
    metadata,
    sku
  )

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        {price.price_type === "sale" && (
          <FormattedPrice
            value={price.original_price}
            className="line-through text-gray-500 text-p-sm font-maison-neue"
          />
        )}
        <span
          className={clx("text-h4 font-gyst text-Charcoal", {
            "text-VibrantRed": price.price_type === "sale",
          })}
        >
          {display.primary}
        </span>
        {display.primaryLabel && (
          <span className="text-p-sm-mono font-maison-neue-mono uppercase text-gray-600">
            {display.primaryLabel}
          </span>
        )}
      </div>
      {display.secondary && (
        <span className="text-xs text-Charcoal/60 font-maison-neue">
          {display.secondary}
        </span>
      )}
    </div>
  )
}
