import { convertToLocale } from "@lib/util/money"

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
})
