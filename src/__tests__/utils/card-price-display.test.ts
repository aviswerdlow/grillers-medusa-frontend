import { formatCardPriceDisplay } from "@lib/util/card-price-display"
import { createElement } from "react"
import { render, screen } from "@testing-library/react"
import { ProductCard as CollectionProductCard } from "@modules/collections/components/strapi-product-grid"
import SearchProductCard from "@modules/algolia/components/product-card"

jest.mock("@lib/data/cart", () => ({ addToCart: jest.fn() }))
jest.mock("@lib/experiments/client-context", () => ({ experimentCartMetadata: jest.fn() }))
jest.mock("@lib/client-ops-alert", () => ({ reportClientOpsAlert: jest.fn() }))
jest.mock("@lib/gtm", () => ({ trackAddToCart: jest.fn() }))
jest.mock("@lib/jitsu", () => ({ jitsuTrack: jest.fn() }))
jest.mock("next/image", () => ({
  __esModule: true,
  default: function MockImage({ fill, priority, ...props }: any) {
    return require("react").createElement("img", props)
  },
}))

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
describe.each([
  ["collection", (product: any) => createElement(CollectionProductCard, { product, countryCode: "us" })],
  ["search", (hit: any) => createElement(SearchProductCard, { hit })],
] as const)("%s card", (_name, card) => {
  const product = (price: number) => ({
    Title: "Test product",
    Metadata: { PricingMode: "fixed_price" },
    MedusaProduct: {
      Handle: "test-product",
      Variants: [{ Price: { CalculatedPriceNumber: price } }],
    },
  })

  it("hides the price for a zero-price item", () => {
    render(card(product(0)))
    expect(screen.getByRole("heading", { name: "Test product" })).toBeVisible()
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument()
    expect(screen.queryByText("per pack")).not.toBeInTheDocument()
    expect(screen.queryByText("Fixed price")).not.toBeInTheDocument()
  })

  it("shows a positive pack price", () => {
    render(card(product(25)))
    expect(screen.getByText("$25.00")).toBeVisible()
    expect(screen.getByText("per pack")).toBeVisible()
  })
})
