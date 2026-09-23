import { getCheckoutCalendar, setFulfillmentDetails, verifyCartCalendarForCheckout } from "@lib/data/cart"
import { sdk } from "@lib/config"

jest.mock("next/cache", () => ({ revalidateTag: jest.fn(), unstable_cache: (fn: unknown) => fn }))
jest.mock("next/navigation", () => ({ redirect: jest.fn() }))
jest.mock("@lib/config", () => ({ sdk: { client: { fetch: jest.fn() }, store: { cart: { update: jest.fn() } } } }))
jest.mock("@lib/data/customer", () => ({ getActiveStaffImpersonation: jest.fn(async () => null) }))
jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(async () => ({ authorization: "Bearer fixture" })),
  getCacheTag: jest.fn(async (tag: string) => tag),
}))
jest.mock("@lib/data/free-shipping-promo", () => ({ syncFreeShippingPromotionByCartId: jest.fn() }))
jest.mock("@lib/server-soft-failure", () => ({ reportServerSoftFailure: jest.fn() }))

const fetchMock = sdk.client.fetch as jest.Mock
let cart: any, postStatus: number, capability: unknown, capabilityStatus: number | null, validation: unknown
const input = { cartId: "cart_fixture", fulfillmentType: "plant_pickup" as const, shippingOptionId: "so_fixture" }
const dateInput = { cartId: input.cartId, fulfillmentType: input.fulfillmentType, fulfillmentZip: "30329", scheduledDate: "10/08/2026" }

beforeEach(() => {
  jest.clearAllMocks()
  cart = { id: input.cartId, metadata: {}, items: [], shipping_methods: [] }
  ;(sdk.store.cart.update as jest.Mock).mockResolvedValue({ cart })
  postStatus = 404
  capabilityStatus = 404
  capability = null
  validation = null
  fetchMock.mockImplementation(async (path, options) => {
    if (path.startsWith("/store/carts/")) return { cart }
    if (options.method === "GET") {
      if (capabilityStatus) throw { response: { status: capabilityStatus } }
      return capability
    }
    if (options.body.action === "validate" && validation) return validation
    throw { status: postStatus }
  })
})

test.each(["old backend", "off backend"])("%s keeps scheduling and pre-payment validation usable", async (mode) => {
  if (mode === "off backend") {
    postStatus = 503
    capabilityStatus = null
    capability = { enforcement: "off" }
    validation = { state: "legacy", summary: null }
  }
  await expect(getCheckoutCalendar(input)).resolves.toMatchObject({ ok: false, legacy: true })
  await expect(setFulfillmentDetails(dateInput)).resolves.toBeUndefined()
  await expect(verifyCartCalendarForCheckout(input.cartId)).resolves.toBeUndefined()
  expect(sdk.store.cart.update).toHaveBeenCalledWith(input.cartId,
    expect.objectContaining({ metadata: expect.objectContaining({ scheduledDate: dateInput.scheduledDate }) }),
    {}, { authorization: "Bearer fixture" })
  const metadata = (sdk.store.cart.update as jest.Mock).mock.calls[0][1].metadata
  expect(metadata).not.toHaveProperty("fulfillment_calendar_selection_v1")
  expect(metadata).not.toHaveProperty("fulfillment_calendar_accepted_v1")
  for (const [, options] of fetchMock.mock.calls) expect(options.cache).toBe("no-store")
})

test.each([
  [503, 404, null],
  [503, null, { enforcement: "required" }],
  [404, null, { enforcement: "required" }],
  [404, null, {}],
  [404, 503, null],
  [403, null, { enforcement: "off" }],
  [500, null, { enforcement: "off" }],
  [0, null, { enforcement: "off" }],
])("does not downgrade POST %s / capability %s %j", async (status, capStatus, cap) => {
  postStatus = status as number
  capabilityStatus = capStatus as number | null
  capability = cap
  expect(await getCheckoutCalendar(input)).not.toHaveProperty("legacy")
  await expect(setFulfillmentDetails(dateInput)).rejects.toThrow()
  await expect(verifyCartCalendarForCheckout(input.cartId)).rejects.toThrow()
  expect(sdk.store.cart.update).not.toHaveBeenCalled()
})

test.each(["fulfillment_calendar_selection_v1", "fulfillment_calendar_accepted_v1", "fulfillmentCalendarQuoteId"])(
  "fresh %s forbids fallback even when the server is off", async (field) => {
    postStatus = 503
    capabilityStatus = null
    capability = { enforcement: "off" }
    validation = { state: "legacy" }
    cart.metadata[field] = field.includes("accepted") ? { arrivalDate: "2026-10-08" } : "signed_fixture"
    expect(await getCheckoutCalendar(input)).not.toHaveProperty("legacy")
    await expect(setFulfillmentDetails(dateInput)).rejects.toThrow()
    await expect(verifyCartCalendarForCheckout(input.cartId)).rejects.toThrow()
    expect(sdk.store.cart.update).not.toHaveBeenCalled()
  }
)

test.each(["activated", "signed", "cart unavailable", "completed"])("an open legacy form cannot bypass %s", async (change) => {
  expect(await getCheckoutCalendar(input)).toHaveProperty("legacy", true)
  if (change === "activated") { capabilityStatus = null; capability = { enforcement: "required" } }
  if (change === "signed") cart.metadata.fulfillment_calendar_selection_v1 = "new_promise"
  if (change === "cart unavailable") cart = null
  if (change === "completed") cart.completed_at = "2026-10-08T12:00:00Z"
  await expect(setFulfillmentDetails(dateInput)).rejects.toThrow()
  await expect(verifyCartCalendarForCheckout(input.cartId)).rejects.toThrow()
  expect(sdk.store.cart.update).not.toHaveBeenCalled()
})

test("valid signed validation allows payment but cannot authorize a legacy date overwrite", async () => {
  validation = { state: "valid", summary: { arrivalDate: "2026-10-08" } }
  await expect(verifyCartCalendarForCheckout(input.cartId)).resolves.toBeUndefined()
  await expect(setFulfillmentDetails(dateInput)).rejects.toThrow()
  expect(sdk.store.cart.update).not.toHaveBeenCalled()
})
