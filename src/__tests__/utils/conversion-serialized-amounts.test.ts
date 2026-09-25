import { getCartConversionState } from "@lib/data/conversion"
import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { getDeliveryZipCookie } from "@lib/data/delivery-zip"
import { getAtlantaDeliveryZipConfig } from "@lib/data/strapi/fulfillment"
import { getFreeShippingThresholds } from "@lib/data/strapi/checkout"

jest.mock("@lib/data/cart", () => ({ retrieveCart: jest.fn() }))
jest.mock("@lib/data/customer", () => ({ retrieveCustomer: jest.fn() }))
jest.mock("@lib/data/delivery-zip", () => ({ getDeliveryZipCookie: jest.fn() }))
jest.mock("@lib/data/strapi/fulfillment", () => ({ getAtlantaDeliveryZipConfig: jest.fn() }))
jest.mock("@lib/data/strapi/checkout", () => ({ getFreeShippingThresholds: jest.fn() }))
jest.mock("@lib/util/delivery-zip", () => ({ getAddressBookDeliveryZip: jest.fn() }))
jest.mock("@lib/util/free-delivery-eligibility", () => ({
  getFreeDeliveryEligibleSubtotal: () => 6.15,
  getExcludedFreeDeliverySubtotal: () => 0,
}))

it("normalizes a cached cart subtotal before free-delivery progress math", async () => {
  ;(retrieveCart as jest.Mock).mockResolvedValue({
    subtotal: { numeric_: 6.38, raw_: { value: "6.38", precision: 20 } },
    items: [{ id: "line_test", quantity: 1 }],
    currency_code: "usd",
    metadata: {},
  })
  ;(retrieveCustomer as jest.Mock).mockResolvedValue(null)
  ;(getDeliveryZipCookie as jest.Mock).mockResolvedValue(null)
  ;(getAtlantaDeliveryZipConfig as jest.Mock).mockResolvedValue(undefined)
  ;(getFreeShippingThresholds as jest.Mock).mockResolvedValue({ inRegionThreshold: null, nationalThreshold: null })

  const state = await getCartConversionState()
  expect(state.subtotal).toBe(6.15)
  expect(state.cartSubtotal).toBe(6.38)
  expect(Number.isFinite(Math.max(0, state.cartSubtotal))).toBe(true)
})
