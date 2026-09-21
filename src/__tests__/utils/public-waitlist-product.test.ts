import { sdk } from "@lib/config"
import { resolvePublicWaitlistProduct } from "@lib/data/public-waitlist-product"
jest.mock("@lib/config", () => ({ sdk: { client: { fetch: jest.fn() } } }))
const fetchProduct = sdk.client.fetch as jest.Mock
const retail = () => ({
  id: "prod_1",
  title: "Ground Beef",
  handle: "ground-beef",
  metadata: {},
  variants: [
    {
      id: "variant_1",
      sku: "01-1",
      inventory_quantity: 0,
      metadata: { qbd_list_id: "stable" },
    },
  ],
})

beforeEach(() => fetchProduct.mockReset())
it("permits active retail at zero stock and returns only canonical facts", async () => {
  fetchProduct.mockResolvedValue({ product: retail() })
  await expect(
    resolvePublicWaitlistProduct("prod_1", "variant_1")
  ).resolves.toEqual({
    medusaProductId: "prod_1",
    medusaVariantId: "variant_1",
    productTitle: "Ground Beef",
    productHandle: "ground-beef",
    sku: "01-1",
    quickBooksListId: "stable",
  })
  expect(fetchProduct).toHaveBeenCalledWith(
    "/store/products/prod_1",
    expect.objectContaining({ cache: "no-store" })
  )
})
it.each([
  { variants: [{ id: "variant_1", sku: " \trM-raw\n" }] },
  {
    metadata: {
      availability_lifecycle: "internal_only",
      waitlist_enabled: true,
    },
  },
  {
    variants: [
      {
        id: "variant_1",
        sku: "renamed",
        metadata: {
          AvailabilityLifecycle: "internal_only",
          waitlist_enabled: true,
        },
      },
    ],
  },
  {
    variants: [
      { id: "variant_1", sku: "retail" },
      { id: "variant_2", sku: "RM-mixed" },
    ],
  },
  { metadata: { availability_lifecycle: "seasonal_inactive" } },
  { metadata: { waitlist_enabled: false } },
  { variants: [] },
  { id: "wrong_product" },
])(
  "rejects an ineligible canonical product before any subscription",
  async (patch) => {
    fetchProduct.mockResolvedValue({ product: { ...retail(), ...patch } })
    await expect(
      resolvePublicWaitlistProduct("prod_1", "variant_1")
    ).rejects.toThrow()
  }
)
it("rejects missing or mismatched variants and unavailable catalog reads", async () => {
  fetchProduct.mockResolvedValue({ product: retail() })
  await expect(
    resolvePublicWaitlistProduct("prod_1", "foreign_variant")
  ).rejects.toThrow()
  fetchProduct.mockResolvedValue({})
  await expect(resolvePublicWaitlistProduct("prod_1")).rejects.toThrow()
  fetchProduct.mockRejectedValue(new Error("catalog offline"))
  await expect(resolvePublicWaitlistProduct("prod_1")).rejects.toThrow()
})
