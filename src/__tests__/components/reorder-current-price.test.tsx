import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { addToCart } from "@lib/data/cart"
import ReorderBrowser from "@modules/account/components/reorder-browser"

jest.mock("@lib/data/cart", () => ({ addToCart: jest.fn() }))
jest.mock("@lib/data/orders", () => ({
  requestLegacyReorderAssistance: jest.fn(),
}))
jest.mock("@lib/experiments/client-context", () => ({
  experimentCartMetadata: () => ({}),
}))
jest.mock("@lib/client-ops-alert", () => ({ reportClientOpsAlert: jest.fn() }))
jest.mock("@lib/util/cart-events", () => ({ dispatchCartUpdated: jest.fn() }))
jest.mock("@lib/util/free-delivery-eligibility", () => ({
  getProductFreeDeliveryEligibility: () => null,
  freeDeliveryEligibilityMetadata: () => ({}),
}))
jest.mock("@medusajs/ui", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ fill, ...props }: any) => <img {...props} />,
}))
jest.mock("@modules/common/components/localized-client-link", () => ({
  __esModule: true,
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

const mockAddToCart = addToCart as jest.MockedFunction<typeof addToCart>

describe("reorder current-price policy", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAddToCart.mockResolvedValue(undefined)
  })

  it.each([
    {
      mode: "fixed_price",
      expectedLabel: "$48.00",
      sku: "CURRENT-FIXED",
    },
    {
      mode: "per_lb",
      expectedLabel: "$24.00 / LB",
      sku: "CURRENT-CATCH-WEIGHT",
    },
  ])(
    "uses the current variant $mode price instead of the old order price",
    async ({ mode, expectedLabel, sku }) => {
      const history = {
        source: "legacy",
        key: "legacy:old-line",
        variantId: "variant-current",
        productId: "product-current",
        sku,
        title: "Historic order title",
        productTitle: "Historic order title",
        thumbnail: null,
        lastOrderedAt: "2026-08-01T00:00:00.000Z",
        timesOrdered: 1,
        totalQuantity: 1,
        unitPrice: 10,
        currencyCode: "usd",
        reorderable: true,
        mappingStatus: "mapped",
      } as any
      const currentProduct = {
        documentId: "current-document",
        Title: "Current product title",
        Metadata: { AvgPackWeight: "2 lb", PricingMode: mode },
        MedusaProduct: {
          ProductId: "product-current",
          Handle: "current-product",
          PricingMode: mode,
          Variants: [
            {
              VariantId: "variant-current",
              Sku: sku,
              Price: { CalculatedPriceNumber: 48 },
              manage_inventory: false,
            },
          ],
        },
      } as any

      render(
        <ReorderBrowser
          history={[history]}
          strapiMap={{ "product-current": currentProduct }}
          countryCode="us"
        />
      )

      expect(screen.getByText(expectedLabel)).toBeInTheDocument()
      expect(screen.queryByText("$10.00")).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole("button", { name: /^select$/i }))
      expect(screen.getAllByText("$48.00").length).toBeGreaterThan(0)
      fireEvent.click(
        screen.getByRole("button", { name: /add selected to cart/i })
      )

      await waitFor(() => expect(mockAddToCart).toHaveBeenCalledTimes(1))
      const payload = mockAddToCart.mock.calls[0][0]
      expect(payload).toEqual({
        variantId: "variant-current",
        quantity: 1,
        countryCode: "us",
        metadata: expect.objectContaining({ source: "account_restock_hub" }),
      })
      expect(payload).not.toHaveProperty("unitPrice")
      expect(payload.metadata).not.toHaveProperty("unit_price")
      expect(payload.metadata).not.toHaveProperty("price")
    }
  )

  it("does not reuse a historical price when the live price is unavailable", () => {
    const history = {
      source: "legacy",
      key: "legacy:old-line",
      variantId: "variant-current",
      productId: "product-current",
      title: "Historic order title",
      productTitle: "Historic order title",
      thumbnail: null,
      lastOrderedAt: "2026-08-01T00:00:00.000Z",
      timesOrdered: 1,
      totalQuantity: 1,
      unitPrice: 10,
      currencyCode: "usd",
      reorderable: true,
      mappingStatus: "mapped",
    } as any
    const productWithoutLivePrice = {
      documentId: "current-document",
      Title: "Current product title",
      MedusaProduct: {
        ProductId: "product-current",
        Handle: "current-product",
        Variants: [{ VariantId: "variant-current", manage_inventory: false }],
      },
    } as any

    render(
      <ReorderBrowser
        history={[history]}
        strapiMap={{ "product-current": productWithoutLivePrice }}
        countryCode="us"
      />
    )

    expect(screen.getByText("Current price shown in cart")).toBeInTheDocument()
    expect(screen.queryByText("$10.00")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /^select$/i }))
    expect(screen.getByText("See cart for price")).toBeInTheDocument()
    expect(screen.queryByText("$10.00")).not.toBeInTheDocument()
  })

  it("does not reorder a retired variant as the first current variant", () => {
    const history = {
      source: "legacy",
      key: "legacy:retired-line",
      variantId: "variant-retired",
      productId: "product-current",
      title: "Historic order title",
      productTitle: "Historic order title",
      thumbnail: null,
      lastOrderedAt: "2026-08-01T00:00:00.000Z",
      timesOrdered: 1,
      totalQuantity: 1,
      unitPrice: 10,
      currencyCode: "usd",
      reorderable: true,
      mappingStatus: "mapped",
    } as any
    const currentProduct = {
      documentId: "current-document",
      Title: "Current product title",
      MedusaProduct: {
        ProductId: "product-current",
        Handle: "current-product",
        Variants: [
          {
            VariantId: "variant-current",
            Price: { CalculatedPriceNumber: 48 },
            manage_inventory: false,
          },
        ],
      },
    } as any

    render(
      <ReorderBrowser
        history={[history]}
        strapiMap={{ "product-current": currentProduct }}
        countryCode="us"
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "All purchased" }))
    expect(screen.getByText("Current price shown in cart")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Ask staff" })
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^select$/i })).toBeNull()
  })
})
