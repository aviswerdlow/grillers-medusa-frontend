import {
  trackAddPaymentInfo,
  trackAddShippingInfo,
  trackAddToCart,
  trackBeginCheckout,
  trackPurchase,
  trackRemoveFromCart,
  trackSelectItem,
  trackViewItem,
  trackViewItemList,
} from "@lib/gtm"

const serializedPrice = {
  numeric_: 6.15,
  raw_: { value: "6.1500000000000000000", precision: 20 },
} as unknown as number
const serializedTotal = { numeric_: 12.3, value: "12.30" } as unknown as number

const lastEcommerce = () => window.dataLayer[window.dataLayer.length - 1].ecommerce

beforeEach(() => {
  window.dataLayer = []
})

it("sends numeric purchase and checkout values from serialized Medusa amounts", () => {
  trackPurchase({
    id: "order_test",
    total: serializedTotal,
    currency_code: "usd",
    items: [{ product_id: "prod_test", title: "Test item", unit_price: serializedPrice, quantity: 2 }],
  })
  expect(lastEcommerce()).toEqual(expect.objectContaining({
    value: 12.3,
    items: [expect.objectContaining({ price: 6.15 })],
  }))

  const cart = {
    id: "cart_test",
    total: serializedTotal,
    items: [{ id: "line_test", title: "Test item", price: serializedPrice, quantity: 2 }],
  }
  for (const track of [trackBeginCheckout, trackAddShippingInfo, trackAddPaymentInfo]) {
    track(cart)
    expect(lastEcommerce()).toEqual(expect.objectContaining({
      value: 12.3,
      items: [expect.objectContaining({ price: 6.15 })],
    }))
  }
})

it("sends numeric product and item-list prices from serialized amounts", () => {
  trackAddToCart({ id: "prod_test", title: "Test item", price: serializedPrice }, 1)
  expect(lastEcommerce().items[0].price).toBe(6.15)

  trackViewItem({ id: "prod_test", title: "Test item", price: serializedPrice })
  expect(lastEcommerce().value).toBe(6.15)
  expect(lastEcommerce().items[0].price).toBe(6.15)

  trackRemoveFromCart({ id: "prod_test", title: "Test item", price: serializedPrice, quantity: 2 })
  expect(lastEcommerce().value).toBe(12.3)
  expect(lastEcommerce().items[0].price).toBe(6.15)

  trackViewItemList({ listId: "list_test", listName: "Test", items: [{ id: "prod_test", title: "Test item", price: serializedPrice }] })
  expect(lastEcommerce().items[0].price).toBe(6.15)

  trackSelectItem({ listId: "list_test", listName: "Test", product: { id: "prod_test", title: "Test item", price: serializedPrice } })
  expect(lastEcommerce().items[0].price).toBe(6.15)
})
