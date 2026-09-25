import {
  getCheckoutAnalyticsItems,
  getCheckoutAnalyticsValue,
} from "@modules/checkout/utils/analytics"

describe("checkout analytics value mapping", () => {
  it("passes Medusa v2 dollar amounts through for totals and item prices", () => {
    const cart = {
      total: 156.78,
      items: [
        {
          id: "line_1",
          product_id: "prod_1",
          product_title: "Ribeye",
          unit_price: 42.5,
          quantity: 2,
        },
      ],
    }

    expect(getCheckoutAnalyticsValue(cart)).toBe(156.78)
    expect(getCheckoutAnalyticsItems(cart)).toEqual([
      {
        id: "prod_1",
        title: "Ribeye",
        price: 42.5,
        quantity: 2,
      },
    ])
  })

  it("normalizes serialized totals before sending checkout analytics", () => {
    const cart = {
      total: { numeric_: 26.99, value: "26.99" },
      items: [{ id: "line_test", unit_price: { value: "19.99" }, quantity: 1 }],
    } as any

    expect(getCheckoutAnalyticsValue(cart)).toBe(26.99)
    expect(getCheckoutAnalyticsItems(cart)[0].price).toBe(19.99)
  })
})
