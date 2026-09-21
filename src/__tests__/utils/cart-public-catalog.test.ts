import { addToCart } from "@lib/data/cart"
import { sdk } from "@lib/config"
jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}))
jest.mock("next/navigation", () => ({ redirect: jest.fn() }))
jest.mock("@lib/config", () => ({
  sdk: {
    client: { fetch: jest.fn() },
    store: { cart: { create: jest.fn(), createLineItem: jest.fn() } },
  },
}))
jest.mock("@lib/data/customer", () => ({
  getActiveStaffImpersonation: jest.fn(async () => null),
}))
jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(async () => ({})),
}))
const catalog = sdk.client.fetch as jest.Mock
beforeEach(() => jest.resetAllMocks())
it.each([
  { products: [] },
  {},
  { products: [{ variants: [{ id: "different", sku: "retail" }] }] },
  { products: [{ variants: [{ id: "variant_1", sku: " rm-input " }] }] },
  {
    products: [
      {
        metadata: { AvailabilityLifecycle: "internal_only" },
        variants: [{ id: "variant_1", sku: "renamed" }],
      },
    ],
  },
])("does not create a cart or add an unverified product", async (response) => {
  // resetAllMocks clears this async mock; provide the real expected null result.
  const { getActiveStaffImpersonation } = require("@lib/data/customer")
  getActiveStaffImpersonation.mockResolvedValue(null)
  const { getAuthHeaders } = require("@lib/data/cookies")
  getAuthHeaders.mockResolvedValue({})
  catalog.mockResolvedValue(response)
  await expect(
    addToCart({ variantId: "variant_1", quantity: 1, countryCode: "us" })
  ).rejects.toThrow("not available for online ordering")
  expect(sdk.store.cart.create).not.toHaveBeenCalled()
  expect(sdk.store.cart.createLineItem).not.toHaveBeenCalled()
})
