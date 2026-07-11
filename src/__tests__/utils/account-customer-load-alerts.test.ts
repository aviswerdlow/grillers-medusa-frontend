jest.mock("server-only", () => ({}))

import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheTag, getCartId } from "@lib/data/cookies"
import {
  addCustomerAddress,
  completePasswordReset,
  deleteCustomerAddress,
  loginWithCredentials,
  requestPasswordReset,
  retrieveAuthenticatedCustomer,
  saveCartAddressesToAccount,
  signupWithCredentials,
  updateCustomer,
  updateCustomerAddress,
  updateCustomerPassword,
} from "@lib/data/customer"
import { readStaffImpersonationCookie } from "@lib/data/staff/session-cookie"
import { adminFetch, retrieveAdminCustomer } from "@lib/data/staff/admin"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { revalidateTag } from "next/cache"

jest.mock("@lib/config", () => ({
  sdk: {
    auth: {
      login: jest.fn(),
      register: jest.fn(),
      updateProvider: jest.fn(),
    },
    client: {
      fetch: jest.fn(),
    },
    store: {
      customer: {
        create: jest.fn(),
        createAddress: jest.fn(),
        deleteAddress: jest.fn(),
        retrieve: jest.fn(),
        update: jest.fn(),
        updateAddress: jest.fn(),
      },
    },
  },
}))

jest.mock("@lib/data/cookies", () => ({
  getAuthHeaders: jest.fn(),
  getCacheTag: jest.fn(),
  getCartId: jest.fn(),
  getStaffImpersonationCartId: jest.fn(),
  removeAuthToken: jest.fn(),
  removeCartId: jest.fn(),
  setAuthToken: jest.fn(),
  setCartId: jest.fn(),
}))

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: jest.fn(async () => ({ ok: true, skipped: false })),
}))

jest.mock("@lib/data/staff/session-cookie", () => ({
  clearStaffImpersonationCookie: jest.fn(),
  readStaffImpersonationCookie: jest.fn(),
}))

jest.mock("@lib/data/staff/admin", () => ({
  adminFetch: jest.fn(),
  appendStaffAuditLog: jest.fn((metadata = {}, entry) => ({
    ...(metadata || {}),
    staff_audit_log: JSON.stringify([entry]),
  })),
  retrieveAdminCustomer: jest.fn(),
  staffAuditFields: jest.fn((_session, action, extra = {}) => ({
    staff_action: action,
    ...extra,
  })),
}))

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}))

jest.mock("next/navigation", () => ({
  redirect: jest.fn(),
}))

const mockGetAuthHeaders = getAuthHeaders as jest.MockedFunction<
  typeof getAuthHeaders
>
const mockGetCacheTag = getCacheTag as jest.MockedFunction<typeof getCacheTag>
const mockGetCartId = getCartId as jest.MockedFunction<typeof getCartId>
const mockSdkFetch = sdk.client.fetch as jest.MockedFunction<
  typeof sdk.client.fetch
>
const mockAuthLogin = sdk.auth.login as jest.MockedFunction<
  typeof sdk.auth.login
>
const mockAuthRegister = sdk.auth.register as jest.MockedFunction<
  typeof sdk.auth.register
>
const mockAuthUpdateProvider = sdk.auth.updateProvider as jest.MockedFunction<
  typeof sdk.auth.updateProvider
>
const mockCreateCustomer = sdk.store.customer.create as jest.MockedFunction<
  typeof sdk.store.customer.create
>
const mockCreateAddress = sdk.store.customer.createAddress as jest.MockedFunction<
  typeof sdk.store.customer.createAddress
>
const mockDeleteAddress = sdk.store.customer.deleteAddress as jest.MockedFunction<
  typeof sdk.store.customer.deleteAddress
>
const mockRetrieveCustomer = sdk.store.customer.retrieve as jest.MockedFunction<
  typeof sdk.store.customer.retrieve
>
const mockUpdateCustomer = sdk.store.customer.update as jest.MockedFunction<
  typeof sdk.store.customer.update
>
const mockUpdateAddress = sdk.store.customer.updateAddress as jest.MockedFunction<
  typeof sdk.store.customer.updateAddress
>
const mockReadStaffImpersonationCookie =
  readStaffImpersonationCookie as jest.MockedFunction<
    typeof readStaffImpersonationCookie
  >
const mockAdminFetch = adminFetch as jest.MockedFunction<typeof adminFetch>
const mockRetrieveAdminCustomer =
  retrieveAdminCustomer as jest.MockedFunction<typeof retrieveAdminCustomer>
const mockEmitStorefrontOpsAlert =
  emitStorefrontOpsAlert as jest.MockedFunction<typeof emitStorefrontOpsAlert>
const mockRevalidateTag = revalidateTag as jest.MockedFunction<
  typeof revalidateTag
>

describe("authenticated customer load alerts", () => {
  const originalFetch = global.fetch
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      MEDUSA_BACKEND_URL: "https://backend.example.test",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_test_unit",
    }
    global.fetch = originalFetch
  })

  afterAll(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it("does not alert when no auth token is present", async () => {
    mockGetAuthHeaders.mockResolvedValue({} as any)

    await expect(retrieveAuthenticatedCustomer()).resolves.toBeNull()

    expect(mockSdkFetch).not.toHaveBeenCalled()
    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })

  it("alerts when an authenticated customer read fails with a server error", async () => {
    mockGetAuthHeaders.mockResolvedValue({ authorization: "Bearer test" } as any)
    mockSdkFetch.mockRejectedValueOnce({
      status: 503,
      message: "Medusa customer read failed for shopper@example.com pi_123",
    })

    await expect(retrieveAuthenticatedCustomer()).resolves.toBeNull()

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "account_customer_load_failed",
        severity: "page",
        title: "Authenticated customer context failed to load",
        path: "src/lib/data/customer.ts:retrieveAuthenticatedCustomer",
        source: "storefront-server",
        fingerprint: "account_customer_load_failed:503",
        meta: expect.objectContaining({
          account_surface: "authenticated_customer",
          route_dependency: "/store/customers/me",
          response_status: 503,
          error_message:
            "Medusa customer read failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("does not alert for ordinary auth denials", async () => {
    mockGetAuthHeaders.mockResolvedValue({ authorization: "Bearer expired" } as any)
    mockSdkFetch.mockRejectedValueOnce({
      status: 401,
      message: "Unauthorized",
    })

    await expect(retrieveAuthenticatedCustomer()).resolves.toBeNull()

    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })
})

describe("password reset request alerts", () => {
  const originalFetch = global.fetch
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      MEDUSA_BACKEND_URL: "https://backend.example.test",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_test_unit",
    }
  })

  afterAll(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it("does not alert when the backend accepts the neutral password reset request", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      statusText: "Created",
    })) as unknown as typeof fetch

    await requestPasswordReset("shopper@example.com")

    expect(global.fetch).toHaveBeenCalledWith(
      "https://backend.example.test/store/forgot-password",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-publishable-api-key": "pk_test_unit",
        }),
      })
    )
    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })

  it("alerts when the backend rejects a password reset request after submission", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Postmark rejected reset for shopper@example.com",
    })) as unknown as typeof fetch

    await requestPasswordReset("shopper@example.com")

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "password_reset_request_failed",
        severity: "warn",
        title: "Password reset request failed behind neutral response",
        path: "src/lib/data/customer.ts:requestPasswordReset",
        source: "storefront-server",
        fingerprint: "password_reset_request_failed:backend_rejected:500",
        meta: expect.objectContaining({
          account_surface: "password_reset_request",
          route_dependency: "/store/forgot-password",
          failure_stage: "backend_rejected",
          response_status: 500,
          response_body: "Postmark rejected reset for [redacted-email]",
          error_message: null,
        }),
      })
    )
  })

  it("alerts when the password reset request cannot reach the backend", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network timeout for shopper@example.com"))

    await requestPasswordReset("shopper@example.com")

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "password_reset_request_failed",
        fingerprint: "password_reset_request_failed:request_failed:transport",
        meta: expect.objectContaining({
          failure_stage: "request_failed",
          response_status: null,
          response_body: null,
          error_message: "network timeout for [redacted-email]",
        }),
      })
    )
  })

  it("does not alert on backend validation denials that do not indicate an outage", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "email is required",
    })) as unknown as typeof fetch

    await requestPasswordReset("not-an-email")

    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })
})

describe("password lifecycle alerts", () => {
  const passwordForm = () => {
    const formData = new FormData()
    formData.set("old_password", "old-password")
    formData.set("new_password", "new-password")
    formData.set("confirm_password", "new-password")
    return formData
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAuthHeaders.mockResolvedValue({ authorization: "Bearer test" } as any)
  })

  it("alerts when reset completion fails with an outage-style error", async () => {
    mockAuthUpdateProvider.mockRejectedValueOnce({
      status: 503,
      message: "reset provider down for shopper@example.com auth_123",
    })

    await expect(
      completePasswordReset("reset-token", "shopper@example.com", "new-password")
    ).resolves.toEqual({
      success: false,
      error:
        "This reset link is invalid or has expired. Please request a new one.",
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "password_reset_completion_failed",
        severity: "warn",
        title: "Password reset completion failed behind invalid-link response",
        path: "src/lib/data/customer.ts:completePasswordReset",
        source: "storefront-server",
        fingerprint: "password_reset_completion_failed:503",
        meta: expect.objectContaining({
          account_surface: "password_reset_completion",
          route_dependency: "sdk.auth.updateProvider(customer,emailpass)",
          response_status: 503,
          error_message:
            "reset provider down for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("does not alert when reset completion reports an invalid token", async () => {
    mockAuthUpdateProvider.mockRejectedValueOnce({
      status: 401,
      message: "reset token expired",
    })

    await completePasswordReset("expired-token", "shopper@example.com", "new-password")

    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })

  it("alerts when signed-in password update fails with an outage-style error", async () => {
    mockSdkFetch.mockRejectedValueOnce({
      status: 503,
      message: "password backend down for shopper@example.com auth_123",
    })

    await expect(
      updateCustomerPassword({}, passwordForm())
    ).resolves.toEqual({
      success: false,
      error: "password backend down for shopper@example.com auth_123",
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "customer_password_update_failed",
        severity: "warn",
        title: "Customer password update failed",
        path: "src/lib/data/customer.ts:updateCustomerPassword",
        source: "storefront-server",
        fingerprint:
          "customer_password_update_failed:store_password_update:503",
        meta: expect.objectContaining({
          account_surface: "customer_password_update",
          route_dependency: "/store/customers/me/password",
          failure_stage: "store_password_update",
          response_status: 503,
          error_message:
            "password backend down for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("does not alert on ordinary current-password validation failures", async () => {
    mockSdkFetch.mockRejectedValueOnce({
      status: 401,
      message: "Current password is incorrect",
    })

    await updateCustomerPassword({}, passwordForm())

    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })
})

describe("customer login alerts", () => {
  const originalFetch = global.fetch
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      MEDUSA_BACKEND_URL: "https://backend.example.test",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_test_unit",
    }
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid login or password",
    })) as unknown as typeof fetch
  })

  afterAll(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it("alerts when primary email login fails with an outage-style error", async () => {
    mockAuthLogin.mockRejectedValueOnce({
      status: 503,
      message: "Auth service failed for shopper@example.com auth_123",
    })

    await expect(
      loginWithCredentials("shopper@example.com", "password")
    ).resolves.toEqual({
      success: false,
      error: "Invalid login or password",
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "customer_login_failed",
        severity: "page",
        title: "Customer login failed behind invalid-login response",
        path: "src/lib/data/customer.ts:getCustomerAuthToken",
        source: "storefront-server",
        fingerprint: "customer_login_failed:emailpass_login:503",
        meta: expect.objectContaining({
          account_surface: "customer_login",
          route_dependency: "sdk.auth.login(customer,emailpass)",
          identifier_kind: "email",
          failure_stage: "emailpass_login",
          response_status: 503,
          error_message:
            "Auth service failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("does not alert for ordinary bad email login credentials", async () => {
    mockAuthLogin.mockRejectedValueOnce({
      status: 401,
      message: "Invalid email or password",
    })

    await loginWithCredentials("shopper@example.com", "wrong-password")

    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })
})

describe("customer signup alerts", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAuthHeaders.mockResolvedValue({ authorization: "Bearer test" } as any)
    mockGetCacheTag.mockResolvedValue("customers")
    mockGetCartId.mockResolvedValue(undefined)
    mockAuthLogin.mockResolvedValue("login_token" as any)
    mockAuthRegister.mockResolvedValue("register_token" as any)
    mockCreateCustomer.mockResolvedValue({ customer: { id: "cus_123" } } as any)
  })

  it("creates a checkout account without requiring SMS marketing consent", async () => {
    await expect(
      signupWithCredentials({
        email: "shopper@example.com",
        password: "password123",
        first_name: "Shopper",
        last_name: "Example",
      })
    ).resolves.toEqual({ success: true, error: null })

    expect(mockCreateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "",
        metadata: undefined,
      }),
      {},
      expect.any(Object)
    )
  })

  it("stores current marketing-only provenance for checkout opt-in", async () => {
    await signupWithCredentials({
      email: "shopper@example.com",
      password: "password123",
      first_name: "Shopper",
      last_name: "Example",
      phone: "(404) 555-1212",
      sms_marketing_opt_in: true,
    })

    expect(mockCreateCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          sms_consent_source: "checkout_account_creation",
          sms_consent_version: "sms-v3-2026-07-10",
          sms_program: "grillers_pride_marketing",
          sms_consent_purpose: "marketing",
          sms_consent_method: "customer_checkbox",
        }),
      }),
      {},
      expect.any(Object)
    )
  })

  it("alerts when account registration fails before customer creation", async () => {
    mockAuthRegister.mockRejectedValueOnce(
      new Error("Auth register timeout for shopper@example.com auth_123")
    )

    await expect(
      signupWithCredentials({
        email: "shopper@example.com",
        password: "password123",
        first_name: "Shopper",
        last_name: "Example",
      })
    ).resolves.toEqual({
      success: false,
      error: "Could not create account. Please try again.",
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "customer_signup_failed",
        severity: "page",
        title: "Customer signup failed",
        path: "src/lib/data/customer.ts:signupWithCredentials",
        source: "storefront-server",
        fingerprint: "customer_signup_failed:auth_register",
        meta: expect.objectContaining({
          account_surface: "customer_signup",
          failure_stage: "auth_register",
          has_phone: false,
          sms_marketing_opt_in: false,
          error_message:
            "Auth register timeout for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("alerts with stage context when customer creation fails", async () => {
    mockCreateCustomer.mockRejectedValueOnce(
      new Error("Customer create failed for shopper@example.com cus_123")
    )

    await signupWithCredentials({
      email: "shopper@example.com",
      password: "password123",
      first_name: "Shopper",
      last_name: "Example",
      phone: "(404) 555-1212",
      sms_marketing_opt_in: true,
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "customer_signup_failed",
        fingerprint: "customer_signup_failed:customer_create",
        meta: expect.objectContaining({
          failure_stage: "customer_create",
          has_phone: true,
          sms_marketing_opt_in: true,
          error_message: "Customer create failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("does not alert when signup reports a duplicate email", async () => {
    mockAuthRegister.mockRejectedValueOnce(
      new Error("Customer already exists for shopper@example.com")
    )

    await expect(
      signupWithCredentials({
        email: "shopper@example.com",
        password: "password123",
        first_name: "Shopper",
        last_name: "Example",
      })
    ).resolves.toEqual({
      success: false,
      error: "An account with this email already exists. Try signing in instead.",
    })

    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })
})

describe("customer profile update alerts", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReadStaffImpersonationCookie.mockResolvedValue(null)
    mockGetAuthHeaders.mockResolvedValue({ authorization: "Bearer test" } as any)
    mockGetCacheTag.mockResolvedValue("customers")
    mockUpdateCustomer.mockResolvedValue({
      customer: { id: "cus_123", phone: "4045551212" },
    } as any)
  })

  it("alerts and rethrows when a customer profile update fails", async () => {
    mockUpdateCustomer.mockRejectedValueOnce(
      new Error("profile update failed for shopper@example.com cus_123")
    )

    await expect(updateCustomer({ phone: "4045551212" })).rejects.toThrow(
      "profile update failed"
    )

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "customer_profile_update_failed",
        severity: "warn",
        title: "Customer profile update failed",
        path: "src/lib/data/customer.ts:updateCustomer",
        source: "storefront-server",
        fingerprint: "customer_profile_update_failed:store_customer_update",
        meta: expect.objectContaining({
          account_surface: "customer_profile_update",
          failure_stage: "store_customer_update",
          staff_context: false,
          fields: ["phone"],
          error_message: "profile update failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("alerts with staff context when an impersonated profile update fails", async () => {
    mockReadStaffImpersonationCookie.mockResolvedValue({
      staffCustomerId: "cus_staff",
      staffEmail: "staff@example.com",
      staffName: "Staff",
      targetCustomerId: "cus_target",
      targetEmail: "target@example.com",
      targetName: "Target Customer",
      startedAt: "2026-06-29T20:00:00.000Z",
      expiresAt: Date.parse("2026-06-29T21:00:00.000Z"),
    })
    mockSdkFetch.mockResolvedValueOnce({
      customer: {
        id: "cus_staff",
        email: "staff@example.com",
        metadata: { gp_staff_role: "office" },
      },
    } as any)
    mockRetrieveAdminCustomer.mockResolvedValueOnce({
      id: "cus_target",
      metadata: {},
    } as any)
    mockAdminFetch.mockRejectedValueOnce(
      new Error("admin profile write failed for target@example.com cus_target")
    )

    await expect(updateCustomer({ first_name: "Target" })).rejects.toThrow(
      "admin profile write failed"
    )

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "customer_profile_update_failed",
        fingerprint: "customer_profile_update_failed:staff_customer_update",
        meta: expect.objectContaining({
          failure_stage: "staff_customer_update",
          staff_context: true,
          fields: ["first_name"],
          error_message:
            "admin profile write failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })
})

describe("customer address mutation alerts", () => {
  const addressForm = () => {
    const formData = new FormData()
    formData.set("first_name", "Shopper")
    formData.set("last_name", "Example")
    formData.set("company", "")
    formData.set("address_1", "1 Main St")
    formData.set("address_2", "")
    formData.set("city", "Atlanta")
    formData.set("postal_code", "30328")
    formData.set("province", "GA")
    formData.set("country_code", "us")
    formData.set("phone", "(404) 555-1212")
    return formData
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockReadStaffImpersonationCookie.mockResolvedValue(null)
    mockGetAuthHeaders.mockResolvedValue({ authorization: "Bearer test" } as any)
    mockGetCacheTag.mockResolvedValue("customers")
    mockCreateAddress.mockResolvedValue({ customer: { id: "cus_123" } } as any)
    mockDeleteAddress.mockResolvedValue({} as any)
    mockUpdateAddress.mockResolvedValue({ customer: { id: "cus_123" } } as any)
  })

  it("alerts and returns a form error when adding an address fails", async () => {
    mockCreateAddress.mockRejectedValueOnce(
      new Error("address create failed for shopper@example.com cus_123")
    )

    await expect(addCustomerAddress({}, addressForm())).resolves.toEqual({
      success: false,
      error: "address create failed for shopper@example.com cus_123",
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "customer_address_mutation_failed",
        severity: "warn",
        title: "Customer address mutation failed",
        path: "src/lib/data/customer.ts:customer-address-actions",
        source: "storefront-server",
        fingerprint:
          "customer_address_mutation_failed:create:store_address_create",
        meta: expect.objectContaining({
          account_surface: "customer_address_mutation",
          action: "create",
          failure_stage: "store_address_create",
          staff_context: false,
          has_address_id: false,
          fields: expect.arrayContaining(["address_1", "phone"]),
          error_message:
            "address create failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("alerts with staff context when updating an impersonated address fails", async () => {
    mockReadStaffImpersonationCookie.mockResolvedValue({
      staffCustomerId: "cus_staff",
      staffEmail: "staff@example.com",
      staffName: "Staff",
      targetCustomerId: "cus_target",
      targetEmail: "target@example.com",
      targetName: "Target Customer",
      startedAt: "2026-06-29T20:00:00.000Z",
      expiresAt: Date.parse("2026-06-29T21:00:00.000Z"),
    })
    mockSdkFetch.mockResolvedValueOnce({
      customer: {
        id: "cus_staff",
        email: "staff@example.com",
        metadata: { gp_staff_role: "office" },
      },
    } as any)
    mockRetrieveAdminCustomer.mockResolvedValueOnce({
      id: "cus_target",
      metadata: {},
    } as any)
    mockAdminFetch.mockRejectedValueOnce(
      new Error("admin address write failed for target@example.com cus_target")
    )

    await expect(
      updateCustomerAddress({ addressId: "addr_123" }, addressForm())
    ).resolves.toEqual({
      success: false,
      error: "admin address write failed for target@example.com cus_target",
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "customer_address_mutation_failed",
        fingerprint:
          "customer_address_mutation_failed:update:staff_address_update",
        meta: expect.objectContaining({
          action: "update",
          failure_stage: "staff_address_update",
          staff_context: true,
          has_address_id: true,
          fields: expect.arrayContaining(["address_1", "phone"]),
          error_message:
            "admin address write failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })

  it("alerts and returns failure when deleting an address fails", async () => {
    mockDeleteAddress.mockRejectedValueOnce(
      new Error("address delete failed for shopper@example.com cus_123")
    )

    await expect(deleteCustomerAddress("addr_123")).resolves.toEqual({
      success: false,
      error: "address delete failed for shopper@example.com cus_123",
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "customer_address_mutation_failed",
        fingerprint:
          "customer_address_mutation_failed:delete:store_address_delete",
        meta: expect.objectContaining({
          action: "delete",
          failure_stage: "store_address_delete",
          staff_context: false,
          has_address_id: true,
          error_message:
            "address delete failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })
})

describe("legacy login fallback alerts", () => {
  const originalFetch = global.fetch
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      MEDUSA_BACKEND_URL: "https://backend.example.test",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY: "pk_test_unit",
    }
    global.fetch = originalFetch
  })

  afterAll(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it("alerts when legacy login fallback gets a backend outage response", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Legacy DB failed for shopper@example.com auth_123",
    })) as unknown as typeof fetch

    await expect(
      loginWithCredentials("legacy-shopper", "correct horse battery staple")
    ).resolves.toEqual({
      success: false,
      error: "Invalid login or password",
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "legacy_login_fallback_failed",
        severity: "page",
        title: "Legacy login fallback failed behind invalid-login response",
        path: "src/lib/data/customer.ts:requestLegacyAuthToken",
        source: "storefront-server",
        fingerprint: "legacy_login_fallback_failed:backend_rejected:500",
        meta: expect.objectContaining({
          account_surface: "legacy_login_fallback",
          route_dependency: "/store/legacy-auth/login",
          identifier_kind: "legacy_identifier",
          failure_stage: "backend_rejected",
          response_status: 500,
          response_body: "Legacy DB failed for [redacted-email] [redacted-id]",
          error_message: null,
        }),
      })
    )
  })

  it("alerts when legacy login fallback cannot reach the backend", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("legacy auth timeout for auth_123"))

    await expect(
      loginWithCredentials("legacy-shopper", "password")
    ).resolves.toEqual({
      success: false,
      error: "Invalid login or password",
    })

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "legacy_login_fallback_failed",
        fingerprint: "legacy_login_fallback_failed:request_failed:transport",
        meta: expect.objectContaining({
          identifier_kind: "legacy_identifier",
          failure_stage: "request_failed",
          response_status: null,
          response_body: null,
          error_message: "legacy auth timeout for [redacted-id]",
        }),
      })
    )
  })

  it("does not alert when legacy login rejects invalid credentials", async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid login or password",
    })) as unknown as typeof fetch

    await loginWithCredentials("legacy-shopper", "wrong-password")

    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })
})

describe("cart address persistence alerts", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAuthHeaders.mockResolvedValue({ authorization: "Bearer test" } as any)
    mockGetCacheTag.mockResolvedValue("customers")
    mockGetCartId.mockResolvedValue("cart_123")
    mockSdkFetch.mockResolvedValue({
      cart: {
        shipping_address: {
          first_name: "Shopper",
          last_name: "Example",
          address_1: "1 Main St",
          city: "Atlanta",
          province: "GA",
          postal_code: "30328",
          country_code: "us",
          phone: "(404) 555-1212",
        },
        billing_address: null,
      },
    } as any)
    mockRetrieveCustomer.mockResolvedValue({
      customer: { addresses: [] },
    } as any)
    mockCreateAddress.mockResolvedValue({} as any)
  })

  it("does not alert when there is no cart address to persist", async () => {
    mockGetCartId.mockResolvedValueOnce(undefined)

    await saveCartAddressesToAccount()

    expect(mockSdkFetch).not.toHaveBeenCalled()
    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })

  it("saves the shipping address without alerting when dependencies succeed", async () => {
    await saveCartAddressesToAccount()

    expect(mockCreateAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        address_1: "1 Main St",
        phone: "4045551212",
        is_default_shipping: true,
        is_default_billing: true,
      }),
      {},
      expect.objectContaining({ authorization: "Bearer test" })
    )
    expect(mockRevalidateTag).toHaveBeenCalledWith("customers")
    expect(mockEmitStorefrontOpsAlert).not.toHaveBeenCalled()
  })

  it("alerts and redacts when saving the cart address fails", async () => {
    mockCreateAddress.mockRejectedValueOnce(
      new Error("Medusa failed for shopper@example.com cus_123")
    )

    await saveCartAddressesToAccount()

    expect(mockEmitStorefrontOpsAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "account_cart_address_persist_failed",
        severity: "warn",
        title: "Cart address was not saved to customer account",
        path: "src/lib/data/customer.ts:saveCartAddressesToAccount",
        source: "storefront-server",
        fingerprint:
          "account_cart_address_persist_failed:shipping_address_create",
        meta: expect.objectContaining({
          account_surface: "signup_cart_address_persistence",
          stage: "shipping_address_create",
          cart_id: "cart_123",
          has_shipping_address: true,
          attempted_shipping_address: true,
          attempted_billing_address: false,
          error_message: "Medusa failed for [redacted-email] [redacted-id]",
        }),
      })
    )
  })
})
