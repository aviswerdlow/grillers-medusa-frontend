jest.mock("server-only", () => ({}))

const cookieJar = new Map<string, { value: string }>()
const setCookie = jest.fn(
  (name: string, value: string, options?: { maxAge?: number }) => {
    if (options?.maxAge != null && options.maxAge < 0) {
      cookieJar.delete(name)
      return
    }

    cookieJar.set(name, { value })
  }
)

jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({
    get: (name: string) => cookieJar.get(name),
    set: setCookie,
  })),
}))

import {
  getCartId,
  getStaffImpersonationCartId,
  removeStaffImpersonationCartId,
  setCartId,
  setStaffImpersonationCartId,
} from "@lib/data/cookies"

const session = {
  staffCustomerId: "cus_staff",
  targetCustomerId: "cus_customer",
}

describe("cart cookies", () => {
  beforeEach(() => {
    cookieJar.clear()
    setCookie.mockClear()
  })

  it("keeps the staff cart cookie independent from the impersonated customer cart", async () => {
    await setCartId("cart_staff")
    await setStaffImpersonationCartId(session, "cart_customer")

    expect(await getCartId()).toBe("cart_staff")
    expect(await getStaffImpersonationCartId(session)).toBe("cart_customer")
  })

  it("removes only the scoped impersonation cart cookie", async () => {
    await setCartId("cart_staff")
    await setStaffImpersonationCartId(session, "cart_customer")
    await removeStaffImpersonationCartId(session)

    expect(await getCartId()).toBe("cart_staff")
    expect(await getStaffImpersonationCartId(session)).toBeUndefined()
  })
})
