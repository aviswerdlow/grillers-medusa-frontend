import {
  canChargeFinalOrders,
  canManageOrderSupport,
  canPackCatchWeightOrders,
  canPickCatchWeightOrders,
  canRoleReceiveFinalChargeAccess,
  canReviewMerchandising,
  canUseOfficeConsole,
  isStaffCustomer,
  isStaffMetadata,
  isSuperAdminCustomer,
  staffAccessRole,
  staffDisplayName,
  staffMetadataRole,
} from "@lib/util/staff-access"

describe("staff access helpers", () => {
  it("accepts explicit staff flags", () => {
    expect(isStaffMetadata({ is_staff: true })).toBe(true)
    expect(isStaffMetadata({ gp_staff: "true" })).toBe(true)
    expect(isStaffMetadata({ phone_order_staff: "1" })).toBe(true)
  })

  it("accepts staff roles", () => {
    expect(isStaffMetadata({ staff_role: "customer_service" })).toBe(true)
    expect(isStaffMetadata({ role: "ops" })).toBe(true)
    expect(staffMetadataRole({ gp_staff_role: "picker" })).toBe("picker")
    expect(staffMetadataRole({ gp_staff_role: "packer" })).toBe("packer")
    expect(staffMetadataRole({ gp_staff_role: "office" })).toBe("office")
    expect(staffMetadataRole({ gp_staff_role: "manager" })).toBe("manager")
    expect(staffMetadataRole({ gp_staff_role: "merchandising_reviewer" })).toBe(
      "merchandising_reviewer"
    )
    expect(staffMetadataRole({ gp_staff_role: "merchandising-reviewer" })).toBe(
      "merchandising_reviewer"
    )
    expect(staffMetadataRole({ gp_staff_role: "super_admin" })).toBe(
      "super_admin"
    )
  })

  it("allows operational staff and scoped reviewers into merchandising", () => {
    const reviewer = {
      metadata: { gp_staff_role: "merchandising_reviewer" },
    } as any
    const staff = { metadata: { gp_staff_role: "staff" } } as any
    const office = { metadata: { gp_staff_role: "office" } } as any
    const manager = { metadata: { gp_staff_role: "manager" } } as any
    const picker = { metadata: { gp_staff_role: "picker" } } as any
    const packer = { metadata: { gp_staff_role: "packer" } } as any
    const avi = { email: "aviswerdlow@gmail.com", staff_access: { role: "super_admin", session_current: true, final_charge_enabled: true } } as any

    // A merchandising reviewer is staff and can review, but has no other access.
    expect(isStaffCustomer(reviewer)).toBe(true)
    expect(canReviewMerchandising(reviewer)).toBe(true)
    expect(canUseOfficeConsole(reviewer)).toBe(false)
    expect(canManageOrderSupport(reviewer)).toBe(false)
    expect(canPickCatchWeightOrders(reviewer)).toBe(false)
    expect(canPackCatchWeightOrders(reviewer)).toBe(false)

    // Super admins (Avi/Peter) always retain merchandising access.
    expect(canReviewMerchandising(avi)).toBe(true)

    // Staff privileges include merchandising review; pick/pack roles stay scoped.
    expect(canReviewMerchandising(staff)).toBe(true)
    expect(canReviewMerchandising(office)).toBe(true)
    expect(canReviewMerchandising(manager)).toBe(true)
    expect(canReviewMerchandising(picker)).toBe(false)
    expect(canReviewMerchandising(packer)).toBe(false)
    expect(canReviewMerchandising({ metadata: { role: "customer" } } as any)).toBe(
      false
    )
  })

  it("maps staff roles to workflow capabilities", () => {
    const picker = { metadata: { gp_staff_role: "picker" } } as any
    const packer = { metadata: { gp_staff_role: "packer" } } as any
    const office = { metadata: { gp_staff_role: "office" } } as any
    const manager = { metadata: { gp_staff_role: "manager" } } as any

    expect(canPickCatchWeightOrders(picker)).toBe(true)
    expect(canPackCatchWeightOrders(picker)).toBe(false)
    expect(canPickCatchWeightOrders(packer)).toBe(true)
    expect(canPackCatchWeightOrders(packer)).toBe(true)
    expect(canUseOfficeConsole(office)).toBe(true)
    expect(canPackCatchWeightOrders(office)).toBe(false)
    expect(canManageOrderSupport(manager)).toBe(true)
    expect(canPackCatchWeightOrders(manager)).toBe(true)
  })

  it("requires an operational role for final charge, not just a flag", () => {
    const flag = { final_charge_enabled: true }
    const packerCanCharge = {
      metadata: { gp_staff_role: "packer", ...flag },
    } as any
    const officeWithFlag = {
      metadata: { gp_staff_role: "office", ...flag },
    } as any
    const reviewerWithFlag = {
      metadata: { gp_staff_role: "merchandising_reviewer", ...flag },
    } as any
    const avi = { email: "aviswerdlow@gmail.com", staff_access: { role: "super_admin", session_current: true, final_charge_enabled: true } } as any

    // Operational roles with the flag can charge; super admins always can.
    expect(canChargeFinalOrders(packerCanCharge)).toBe(true)
    expect(canChargeFinalOrders(avi)).toBe(true)

    // A stray flag must NOT grant money access to non-operational roles.
    expect(canChargeFinalOrders(officeWithFlag)).toBe(false)
    expect(canChargeFinalOrders(reviewerWithFlag)).toBe(false)
  })

  it("limits final-charge assignment to operational roles", () => {
    expect(canRoleReceiveFinalChargeAccess("staff")).toBe(true)
    expect(canRoleReceiveFinalChargeAccess("picker")).toBe(true)
    expect(canRoleReceiveFinalChargeAccess("packer")).toBe(true)
    expect(canRoleReceiveFinalChargeAccess("manager")).toBe(true)
    expect(canRoleReceiveFinalChargeAccess("super_admin")).toBe(true)

    expect(canRoleReceiveFinalChargeAccess("customer")).toBe(false)
    expect(canRoleReceiveFinalChargeAccess("office")).toBe(false)
    expect(canRoleReceiveFinalChargeAccess("merchandising_reviewer")).toBe(
      false
    )
  })

  it("rejects normal customer metadata", () => {
    expect(isStaffMetadata(null)).toBe(false)
    expect(isStaffMetadata({ vip: true })).toBe(false)
    expect(isStaffCustomer({ metadata: { role: "customer" } } as any)).toBe(false)
    expect(
      isStaffCustomer({
        metadata: { staff_role: "staff", staff_access_revoked: true },
      } as any)
    ).toBe(false)
  })

  it.each(["aviswerdlow@gmail.com", "Peter@grillerspride.com", "PeterSwerdlow@gmail.com"])("keeps the bootstrap fallback only until current server authority is served: %s", email => {
    expect(staffAccessRole({ email, metadata: {} } as any)).toBe("super_admin")
    expect(staffAccessRole({ email, metadata: {}, staff_access: { role: "customer", session_current: true } } as any)).toBe("customer")
    expect(staffAccessRole({ email, metadata: { staff_access_revoked: true } } as any)).toBe("customer")
    expect(staffAccessRole({ email, metadata: { role: "office", staff_bootstrap_override: true } } as any)).toBe("office")
  })

  it("honors the server's revoked session state over old owner metadata", () => {
    const customer = { email: "peter@grillerspride.com", metadata: { gp_staff_role: "super_admin", final_charge_enabled: true },
      staff_access: { role: "customer", bootstrap: true, session_current: false, final_charge_enabled: false } } as any
    expect(isStaffCustomer(customer)).toBe(false)
    expect(isSuperAdminCustomer(customer)).toBe(false)
    expect(canChargeFinalOrders(customer)).toBe(false)
  })

  it("uses the current server role after bootstrap demotion or regrant", () => {
    const customer = { metadata: { gp_staff_role: "super_admin" }, staff_access: { role: "office", bootstrap: true, session_current: true, final_charge_enabled: false } } as any
    expect(staffAccessRole(customer)).toBe("office")
    expect(isSuperAdminCustomer(customer)).toBe(false)
    expect(canChargeFinalOrders(customer)).toBe(false)
  })

  it("does not let stale broad flags override an explicit customer or unknown role", () => {
    expect(staffMetadataRole({ gp_staff_role: "customer", is_staff: true })).toBe("customer")
    expect(staffMetadataRole({ gp_staff_role: "unknown", is_staff: true })).toBe("customer")
  })

  it("formats a staff display name safely", () => {
    expect(
      staffDisplayName({
        first_name: "Avi",
        last_name: "Swerdlow",
        email: "avi@example.com",
      } as any)
    ).toBe("Avi Swerdlow")
    expect(staffDisplayName({ email: "staff@example.com" } as any)).toBe(
      "staff@example.com"
    )
  })
})
