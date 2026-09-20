import { sdk } from "@lib/config"
import { updateCart } from "@lib/data/cart"
import {
  getAuthHeaders,
  getCacheTag,
  getStaffImpersonationCartId,
} from "@lib/data/cookies"
import { getActiveStaffImpersonation } from "@lib/data/customer"
import { revalidateTag } from "next/cache"

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}))

jest.mock("@lib/config", () => ({
  sdk: {
    store: {
      cart: {
        update: jest.fn(),
      },
    },
  },
}))

jest.mock("@lib/data/customer", () => ({
  getActiveStaffImpersonation: jest.fn(),
}))

jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(),
  getCacheTag: jest.fn(),
  getCartId: jest.fn(),
  getStaffImpersonationCartId: jest.fn(),
  removeCartId: jest.fn(),
  removeStaffImpersonationCartId: jest.fn(),
  setCartId: jest.fn(),
  setStaffImpersonationCartId: jest.fn(),
}))

jest.mock("@lib/data/staff/admin", () => ({
  staffAuditFields: (session: any, action: string, extra = {}) => ({
    staff_action: action,
    staff_target_customer_id: session.targetCustomerId,
    source: "staff_impersonation",
    ...extra,
  }),
}))

const mockedCartUpdate = sdk.store.cart.update as jest.Mock
const mockedGetActiveStaffImpersonation =
  getActiveStaffImpersonation as jest.MockedFunction<
    typeof getActiveStaffImpersonation
  >
const mockedGetAuthHeaders = getAuthHeaders as jest.MockedFunction<
  typeof getAuthHeaders
>
const mockedGetCacheTag = getCacheTag as jest.MockedFunction<typeof getCacheTag>
const mockedGetStaffImpersonationCartId =
  getStaffImpersonationCartId as jest.MockedFunction<
    typeof getStaffImpersonationCartId
  >
const mockedRevalidateTag = revalidateTag as jest.MockedFunction<
  typeof revalidateTag
>

describe("staff context cart headers", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedGetAuthHeaders.mockResolvedValue({ authorization: "Bearer staff" })
    mockedGetCacheTag.mockImplementation(async (tag) => tag)
    mockedGetStaffImpersonationCartId.mockResolvedValue("cart_staff")
    mockedGetActiveStaffImpersonation.mockResolvedValue({
      staff: {
        id: "cus_staff",
        email: "staff@example.com",
      } as any,
      session: {
        staffCustomerId: "cus_staff",
        staffEmail: "staff@example.com",
        staffName: "Staff",
        targetCustomerId: "cus_target",
        targetEmail: "meyer@example.com",
        targetName: "Meyer Greenberg",
        startedAt: "2026-06-04T20:00:00.000Z",
        expiresAt: Date.parse("2026-06-04T21:00:00.000Z"),
      },
    })
    mockedCartUpdate.mockResolvedValue({ cart: { id: "cart_staff" } })
  })

  it("writes carts as staff while explicitly targeting the impersonated customer", async () => {
    await updateCart({ email: "meyer@example.com" })

    expect(mockedCartUpdate).toHaveBeenCalledWith(
      "cart_staff",
      expect.objectContaining({
        email: "meyer@example.com",
        metadata: expect.objectContaining({
          staff_action: "cart_update",
          staff_target_customer_id: "cus_target",
          source: "staff_impersonation",
        }),
      }),
      {},
      expect.objectContaining({
        "x-gp-staff-authorization": "Bearer staff",
        "x-gp-staff-actor-customer-id": "cus_staff",
        "x-gp-staff-target-customer-id": "cus_target",
      })
    )
    expect(mockedRevalidateTag).toHaveBeenCalledWith("carts")
    expect(mockedRevalidateTag).toHaveBeenCalledWith("fulfillment")
    expect(mockedCartUpdate.mock.calls[0][3]).not.toHaveProperty("authorization")
  })
})
