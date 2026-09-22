import { formatProductPriceDisplay, parseAvgPackWeight } from "./price-display"

/** Cards emphasize the existing commerce pack amount. No cart or payment math changes. */
export function formatCardPriceDisplay(
  ...args: Parameters<typeof formatProductPriceDisplay>
) {
  const display = formatProductPriceDisplay(...args)
  if (display.mode === "fixed_price")
    return { ...display, primaryLabel: "per pack", secondary: "Fixed price" }
  const hasWeight = Boolean(parseAvgPackWeight(args[1]?.AvgPackWeight))
  return {
    ...display,
    primary: `Est. $${display.estimatedPackPrice.toFixed(2)}`,
    primaryLabel: "per pack",
    secondary: hasWeight
      ? `${display.primary} / lb · final total by packed weight`
      : "Final total by packed weight",
  }
}
