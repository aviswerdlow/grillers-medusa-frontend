import {
  loadCheckoutReview,
  acceptCheckoutReview,
  recoverReviewedCheckout,
} from "@lib/data/order-review"
import { sdk } from "@lib/config"
import {
  reviewAcceptance,
  checkoutReviewFixture,
} from "../../test-fixtures/order-review"
jest.mock("@lib/config", () => ({ sdk: { client: { fetch: jest.fn() } } }))
jest.mock("@lib/data/payment", () => ({
  getPaymentContextHeaders: async () => ({ authorization: "Bearer fixture" }),
}))
jest.mock("@lib/data/staff/cart-authority", () => ({
  staffCartHeaders: async () => ({
    "x-gp-staff-authorization": "Bearer staff-fixture",
  }),
}))
jest.mock("@lib/data/customer", () => ({
  getActiveStaffImpersonation: async () => null,
}))
jest.mock("@lib/data/cookies", () => ({
  removeCartId: jest.fn(),
  removeStaffImpersonationCartId: jest.fn(),
  getCacheTag: async (t: string) => t,
}))
jest.mock("next/cache", () => ({ revalidateTag: jest.fn() }))
const fetchMock = sdk.client.fetch as jest.Mock
const input = {
  cartId: "cart_fixture",
  paymentMode: "card" as const,
  requestId: reviewAcceptance.requestId,
  analyticsConsent: null,
}
let cart: any, postStatus: number, capStatus: number, capability: any
beforeEach(() => {
  jest.clearAllMocks()
  cart = { id: input.cartId, customer_id: "customer_fixture", metadata: {} }
  postStatus = 404
  capStatus = 404
  capability = null
  fetchMock.mockImplementation(async (path, options) => {
    if (!path.endsWith("/order-review")) return { cart }
    if (options.method === "GET") {
      if (capStatus) throw { response: { status: capStatus } }
      return capability
    }
    if (postStatus) throw { status: postStatus }
    return { review: checkoutReviewFixture(), accepted: true }
  })
})
test.each([false, true])(
  "old backend and default-off backend allow checkout; staff=%s",
  async (staffPhone) => {
    for (const mode of ["old", "off"]) {
      if (mode === "off") {
        capStatus = 0
        capability = { enforcement: "off" }
      }
      expect(await loadCheckoutReview({ ...input, staffPhone })).toEqual({
        review: null,
        error: null,
        legacy: true,
      })
      expect(
        await acceptCheckoutReview({
          ...input,
          staffPhone,
          acceptance: { legacy: true, analyticsConsent: null },
        })
      ).toEqual({ error: null })
    }
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.cache).toBe("no-store")
      expect(options.headers).toEqual(
        staffPhone
          ? { "x-gp-staff-authorization": "Bearer staff-fixture" }
          : { authorization: "Bearer fixture" }
      )
    }
  }
)
test.each([401, 403, 409, 500, 503, 0])(
  "POST failure %s never permits fallback",
  async (status) => {
    postStatus = status
    if (!status) fetchMock.mockRejectedValueOnce(new Error("network failure"))
    expect(await loadCheckoutReview(input)).not.toHaveProperty("legacy")
  }
)
test.each(["required", "malformed", "unavailable"])(
  "a %s capability blocks the compatibility lane",
  async (mode) => {
    capStatus = mode === "unavailable" ? 503 : 0
    capability = mode === "required" ? { enforcement: "required" } : {}
    expect(await loadCheckoutReview(input)).not.toHaveProperty("legacy")
    expect(
      (
        await acceptCheckoutReview({
          ...input,
          acceptance: { legacy: true, analyticsConsent: null },
        })
      ).error
    ).toBeTruthy()
  }
)
test.each([
  "accepted",
  "malformed promise",
  "completed",
  "different cart",
  "no customer",
  "missing",
])("fresh %s cart blocks downgrade", async (kind) => {
  if (kind === "accepted")
    cart.metadata.gp_order_promise_snapshot_id = "accepted_fixture"
  if (kind === "malformed promise")
    cart.metadata.gp_order_promise_snapshot_id = ""
  if (kind === "completed") cart.completed_at = "2026-09-21"
  if (kind === "different cart") cart.id = "cart_other"
  if (kind === "no customer") cart.customer_id = null
  if (kind === "missing") cart = null
  expect(await loadCheckoutReview(input)).not.toHaveProperty("legacy")
  expect(
    (
      await acceptCheckoutReview({
        ...input,
        acceptance: { legacy: true, analyticsConsent: null },
      })
    ).error
  ).toBeTruthy()
})
test("activation between display and payment blocks the stale fallback", async () => {
  expect(await loadCheckoutReview(input)).toHaveProperty("legacy", true)
  capStatus = 0
  capability = { enforcement: "required" }
  expect(
    (
      await acceptCheckoutReview({
        ...input,
        acceptance: { legacy: true, analyticsConsent: null },
      })
    ).error
  ).toBeTruthy()
})
test("an explicit review never falls back on 404", async () => {
  expect(
    (await acceptCheckoutReview({ ...input, acceptance: reviewAcceptance }))
      .error
  ).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][1].body).toMatchObject({
    review_id: reviewAcceptance.reviewId,
  })
})
test("legacy status recovery never invents a receipt or initiates completion", async () => {
  expect(
    (
      await recoverReviewedCheckout({
        ...input,
        acceptance: { legacy: true, analyticsConsent: null },
      })
    ).error
  ).toBeTruthy()
  expect(fetchMock).not.toHaveBeenCalled()
})
