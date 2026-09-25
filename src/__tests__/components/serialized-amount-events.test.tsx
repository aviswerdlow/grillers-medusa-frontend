import { render } from "@testing-library/react"
import type { HttpTypes } from "@medusajs/types"
import CartViewedTracker from "@modules/cart/components/cart-viewed-tracker"
import PurchaseTracker from "@components/purchase-tracker"
import ProductConversionPanel from "@modules/products/components/product-conversion-panel"
import type { CartConversionState } from "@lib/data/conversion"
import { jitsuTrack } from "@lib/jitsu"
import { trackPurchase } from "@lib/gtm"

const mockFulfillmentProgress = jest.fn()

jest.mock("@lib/jitsu", () => ({ jitsuTrack: jest.fn() }))
jest.mock("@lib/gtm", () => ({ trackPurchase: jest.fn() }))
jest.mock("@modules/common/components/fulfillment-progress", () => {
  return function MockFulfillmentProgress(props: unknown) {
    mockFulfillmentProgress(props)
    return null
  }
})

const amount = (numeric: number) => ({
  numeric_: numeric,
  raw_: { value: numeric.toFixed(2), precision: 20 },
})

beforeEach(() => {
  jest.clearAllMocks()
})

it("tracks a cached cart view with numeric value and item price", () => {
  render(<CartViewedTracker cart={{
    id: "cart_test",
    currency_code: "usd",
    subtotal: amount(6.15),
    items: [{ id: "line_test", product_id: "prod_test", product_title: "Test item", unit_price: amount(6.15), quantity: 1 }],
  } as unknown as HttpTypes.StoreCart} />)

  expect(jitsuTrack).toHaveBeenCalledWith("cart_viewed", expect.objectContaining({
    value: 6.15,
    items: [expect.objectContaining({ price: 6.15 })],
  }))
})

it("passes numeric amounts from the purchase tracker to GTM", () => {
  render(<PurchaseTracker order={{
    id: "order_test",
    currency_code: "usd",
    total: amount(6.38),
    items: [{ product_id: "prod_test", title: "Test item", unit_price: amount(6.15), quantity: 1 }],
  }} />)

  expect(trackPurchase).toHaveBeenCalledWith(expect.objectContaining({
    total: 6.38,
    items: [expect.objectContaining({ unit_price: 6.15 })],
  }))
})

it("passes numeric subtotal values into product free-delivery progress", () => {
  render(<ProductConversionPanel cartState={{
    subtotal: amount(6.15),
    cartSubtotal: amount(6.38),
  } as unknown as CartConversionState} />)

  expect(mockFulfillmentProgress).toHaveBeenCalledWith(expect.objectContaining({
    subtotal: 6.15,
    cartSubtotal: 6.38,
  }))
})
