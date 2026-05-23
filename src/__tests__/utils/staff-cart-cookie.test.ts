import { staffImpersonationCartCookieName } from "@lib/util/staff-cart-cookie"

describe("staff impersonation cart cookies", () => {
  it("scopes the cart cookie by both staff user and target customer", () => {
    const staffCartForCustomerA = staffImpersonationCartCookieName({
      staffCustomerId: "cus_staff",
      targetCustomerId: "cus_customer_a",
    })
    const staffCartForCustomerB = staffImpersonationCartCookieName({
      staffCustomerId: "cus_staff",
      targetCustomerId: "cus_customer_b",
    })
    const otherStaffCartForCustomerA = staffImpersonationCartCookieName({
      staffCustomerId: "cus_other_staff",
      targetCustomerId: "cus_customer_a",
    })

    expect(staffCartForCustomerA).toBe(
      "_gp_staff_cart_cus_staff_cus_customer_a"
    )
    expect(staffCartForCustomerA).not.toBe(staffCartForCustomerB)
    expect(staffCartForCustomerA).not.toBe(otherStaffCartForCustomerA)
  })

  it("sanitizes ids before using them in cookie names", () => {
    expect(
      staffImpersonationCartCookieName({
        staffCustomerId: "staff@example.com",
        targetCustomerId: "customer/a b",
      })
    ).toBe("_gp_staff_cart_staff_example_com_customer_a_b")
  })
})
