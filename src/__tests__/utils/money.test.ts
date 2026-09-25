import { convertToLocale, toMoneyAmount } from "@lib/util/money"
import { getItemsSubtotal } from "@lib/util/cart-totals"

describe("Money Utilities", () => {
  describe("convertToLocale", () => {
    it("should format USD major-unit amounts correctly", () => {
      const result = convertToLocale({
        amount: 19.99,
        currency_code: "usd",
      })
      expect(result).toMatch(/\$19\.99/)
    })

    it("should format EUR major-unit amounts correctly", () => {
      const result = convertToLocale({
        amount: 25,
        currency_code: "eur",
      })
      expect(result).toMatch(/25/)
    })

    it("should handle zero amounts", () => {
      const result = convertToLocale({
        amount: 0,
        currency_code: "usd",
      })
      expect(result).toMatch(/\$0\.00/)
    })

    it("should handle large amounts", () => {
      const result = convertToLocale({
        amount: 1000,
        currency_code: "usd",
      })
      expect(result).toMatch(/1,000/)
    })

    it("should return the plain amount when currency is empty", () => {
      const result = convertToLocale({
        amount: 12.5,
        currency_code: "",
      })
      expect(result).toBe("12.5")
    })
  })

  it.each([
    [19.99, 19.99],
    ["19.99", 19.99],
    [{ value: "19.99" }, 19.99],
    [{ numeric_: "19.99" }, 19.99],
    [{ numeric_: 19.99, value: "19.9900000000000000000" }, 19.99],
    [{ numeric_: "invalid", value: "19.99" }, 19.99],
    [{ value: { numeric_: "19.99" } }, 19.99],
    [0, 0],
    ["0", 0],
  ])("normalizes a Medusa amount %#", (input, expected) => {
    expect(toMoneyAmount(input)).toBe(expected)
    expect(convertToLocale({ amount: input, currency_code: "usd" })).toBe(
      expected === 0 ? "$0.00" : "$19.99"
    )
  })

  it.each([null, undefined, "", "19.99x", "Infinity", NaN, {}, { value: "bad" }])(
    "never formats an invalid amount as NaN: %#",
    (input) => {
      expect(toMoneyAmount(input)).toBeNull()
      expect(convertToLocale({ amount: input, currency_code: "usd" })).toBe("—")
    }
  )

  it("uses the first valid items subtotal from a serialized cart", () => {
    expect(getItemsSubtotal({ item_subtotal: { numeric_: "24.50" } })).toBe(24.5)
    expect(
      getItemsSubtotal({ item_subtotal: { value: "bad" }, item_total: "18" })
    ).toBe(18)
  })
})
