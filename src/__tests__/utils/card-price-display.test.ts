import { formatCardPriceDisplay } from "@lib/util/card-price-display"

it("keeps a fixed-price pack total even when the pack weighs several pounds", () => {
  expect(
    formatCardPriceDisplay(25, {
      AvgPackWeight: "5 lb",
      PricingMode: "fixed_price",
    })
  ).toMatchObject({
    primary: "$25.00",
    primaryLabel: "per pack",
    secondary: "Fixed price",
    estimatedPackPrice: 25,
  })
})
it("makes the commerce estimate primary and derives a secondary rate from the stated pack weight", () => {
  expect(
    formatCardPriceDisplay(48, { AvgPackWeight: "3-5 lb" }, null, "per_lb")
  ).toMatchObject({
    primary: "Est. $48.00",
    primaryLabel: "per pack",
    secondary: "$12.00 / lb · final total by packed weight",
    estimatedPackPrice: 48,
  })
})
it("does not relabel a pack estimate as a per-pound rate when weight is missing", () => {
  expect(formatCardPriceDisplay(48, null, null, "per_lb")).toMatchObject({
    primary: "Est. $48.00",
    secondary: "Final total by packed weight",
  })
})
it("keeps a zero-price item visible", () => {
  expect(
    formatCardPriceDisplay(0, { PricingMode: "fixed_price" }).primary
  ).toBe("$0.00")
})
