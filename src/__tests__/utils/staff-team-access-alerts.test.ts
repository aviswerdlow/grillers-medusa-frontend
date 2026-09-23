const mockRetrieveAuthenticatedCustomerForStaffAccess = jest.fn()
const mockAdminFetch = jest.fn()
const mockAppendStaffAuditLog = jest.fn()
const mockGetCacheTag = jest.fn()
const mockRevalidateTag = jest.fn()
const mockEmitStorefrontOpsAlert = jest.fn()

jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomerForStaffAccess:
    mockRetrieveAuthenticatedCustomerForStaffAccess,
}))

jest.mock("@lib/data/staff/admin", () => ({
  adminFetch: mockAdminFetch,
  appendStaffAuditLog: mockAppendStaffAuditLog,
}))

jest.mock("@lib/data/cookies", () => ({
  getCacheTag: mockGetCacheTag,
}))

jest.mock("next/cache", () => ({
  revalidateTag: mockRevalidateTag,
}))

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: mockEmitStorefrontOpsAlert,
}))

describe("staff team access ops alerts", () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    mockRetrieveAuthenticatedCustomerForStaffAccess.mockResolvedValue({
      id: "cus_actor",
      email: "avi@example.com",
      first_name: "Avi",
      last_name: "Admin",
      metadata: { gp_staff_role: "super_admin" },
    })
    mockAppendStaffAuditLog.mockImplementation((metadata) => metadata)
    mockGetCacheTag.mockResolvedValue("customers")
    mockEmitStorefrontOpsAlert.mockResolvedValue({ ok: true, skipped: false })
  })

  it("emits a warn alert when team access customer search fails", async () => {
    mockAdminFetch.mockRejectedValue(new Error("admin customers unavailable"))

    const { searchStaffTeamUsers } = await import("@lib/data/staff/team-access")
    const result = await searchStaffTeamUsers("ops@example.com")

    expect(result.ok).toBe(false)
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_team_access_search_failed",
        severity: "warn",
        fingerprint: "staff_team_access:search_failed",
        meta: expect.objectContaining({
          staff_module: "team_access",
          query_length: "ops@example.com".length,
          query_has_at: true,
          query_has_plus: false,
          error_message: "admin customers unavailable",
        }),
      })
    )
  })

  it("does not alert for local confirmation validation errors", async () => {
    const { updateStaffTeamRole } = await import("@lib/data/staff/team-access")
    const result = await updateStaffTeamRole({
      customerId: "cus_target",
      role: "manager",
      finalChargeEnabled: true,
      reason: "Avi approved manager access",
      confirmation: "WRONG",
    })

    expect(result.ok).toBe(false)
    expect(mockAdminFetch).not.toHaveBeenCalled()
    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })

  it("revokes an initial administrator through the versioned backend action, without sending role metadata or actor claims", async () => {
    mockAdminFetch.mockResolvedValueOnce({ customer: { id: "cus_target", email: "peter@grillerspride.com",
      metadata: { gp_staff_role: "super_admin", staff_access_version: 3 },
      staff_access: { role: "super_admin", bootstrap: true, session_current: true, final_charge_enabled: true } } })
      .mockResolvedValueOnce({ customer: { id: "cus_target", email: "peter@grillerspride.com",
        metadata: { gp_staff_role: "customer", staff_access_version: 4 },
        staff_access: { role: "customer", bootstrap: true, session_current: true, final_charge_enabled: false } } })
    const { updateStaffTeamRole } = await import("@lib/data/staff/team-access")
    const result = await updateStaffTeamRole({ customerId: "cus_target", role: "customer", reason: "Authorized fixture revocation", confirmation: "REMOVE STAFF" })
    expect(result).toMatchObject({ ok: true, user: { role: "customer", finalChargeEnabled: false, isBootstrapSuperAdmin: true } })
    expect(mockAdminFetch).toHaveBeenCalledTimes(2)
    const [endpoint, request] = mockAdminFetch.mock.calls[1]
    expect(endpoint).toBe("/admin/grillers/staff-access/customers/cus_target")
    expect(JSON.parse(request.body)).toEqual({ role: "customer", final_charge_enabled: false,
      reason: "Authorized fixture revocation", confirmation: "REMOVE STAFF", expected_version: 3 })
  })

  it("emits a page alert when persisting a valid role update fails", async () => {
    mockAdminFetch
      .mockResolvedValueOnce({
        customer: {
          id: "cus_target",
          email: "target@example.com",
          first_name: "Target",
          last_name: "User",
          metadata: { gp_staff_role: "office" },
        },
      })
      .mockRejectedValueOnce(new Error("metadata write failed"))

    const { updateStaffTeamRole } = await import("@lib/data/staff/team-access")
    const result = await updateStaffTeamRole({
      customerId: "cus_target",
      role: "manager",
      finalChargeEnabled: true,
      reason: "Avi approved manager access",
      confirmation: "MANAGER",
    })

    expect(result.ok).toBe(false)
    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "staff_team_access_update_failed",
        severity: "page",
        fingerprint: "staff_team_access:update_failed",
        meta: expect.objectContaining({
          staff_module: "team_access",
          staff_actor_customer_id: "cus_actor",
          target_customer_id: "cus_target",
          previous_role: "office",
          requested_role: "manager",
          final_charge_enabled: true,
          error_message: "metadata write failed",
        }),
      })
    )
  })
})

export {}
