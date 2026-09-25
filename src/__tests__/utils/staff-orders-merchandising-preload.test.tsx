import type { ReactElement } from "react"

import StaffPhoneOrdersPage from "../../app/[countryCode]/(main)/account/staff/orders/page"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { getStaffImpersonationSession } from "@lib/data/staff/impersonation"

jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("notFound")
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
}))

jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomerForStaffAccess: jest.fn(),
}))

jest.mock("@lib/data/staff/impersonation", () => ({
  getStaffImpersonationSession: jest.fn(),
}))

jest.mock("@lib/util/seo", () => ({
  DEFAULT_SEO_DESCRIPTION: "Default description",
  DEFAULT_SEO_TITLE: "Default title",
  DEFAULT_SOCIAL_IMAGE: { url: "https://example.com/social.jpg" },
  SITE_NAME: "Griller's Pride",
}))

jest.mock("@lib/util/staff-access", () => ({
  canChargeFinalOrders: jest.fn(() => true),
  canManageOrderSupport: jest.fn(() => true),
  canPackCatchWeightOrders: jest.fn(() => true),
  canPickCatchWeightOrders: jest.fn(() => true),
  canReviewMerchandising: jest.fn(() => true),
  canUseOfficeConsole: jest.fn(() => true),
  isStaffCustomer: jest.fn(() => true),
  isSuperAdminCustomer: jest.fn(() => true),
  staffAccessRole: jest.fn((customer) => customer?.metadata?.gp_staff_role || "customer"),
}))

jest.mock("@modules/staff/components/phone-order-copilot", () => ({
  __esModule: true,
  default: () => null,
}))

const mockRetrieveAuthenticatedCustomer =
  retrieveAuthenticatedCustomerForStaffAccess as jest.MockedFunction<
    typeof retrieveAuthenticatedCustomerForStaffAccess
  >
const mockGetStaffImpersonationSession =
  getStaffImpersonationSession as jest.MockedFunction<
    typeof getStaffImpersonationSession
  >

const staffCustomer = {
  id: "cus_staff",
  email: "staff@example.com",
  metadata: { gp_staff_role: "super_admin" },
}

function pagePropsFor(element: ReactElement) {
  return element.props as Record<string, unknown>
}

describe("staff orders merchandising preload", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRetrieveAuthenticatedCustomer.mockResolvedValue(staffCustomer as any)
    mockGetStaffImpersonationSession.mockResolvedValue(null)
  })

  it("renders direct merchandising workspace requests without blocking on a server preload", async () => {
    const element = (await StaffPhoneOrdersPage({
      params: Promise.resolve({ countryCode: "us" }),
      searchParams: Promise.resolve({ workspace: "merchandising" }),
    })) as ReactElement
    const props = pagePropsFor(element)

    expect(props.initialWorkspace).toBe("merchandising")
    expect(props.initialMerchandisingTags).toBeUndefined()
    expect(props.initialMerchandisingError).toBeUndefined()
  })

  it("does not load merchandising data for other workspaces", async () => {
    const element = (await StaffPhoneOrdersPage({
      params: Promise.resolve({ countryCode: "us" }),
      searchParams: Promise.resolve({ workspace: "exceptions" }),
    })) as ReactElement
    const props = pagePropsFor(element)

    expect(props.initialWorkspace).toBe("exceptions")
    expect(props.initialMerchandisingTags).toBeUndefined()
    expect(props.initialMerchandisingError).toBeUndefined()
  })

  it("routes a driver to the phone page only while local milestones are enabled", async () => {
    const prior = process.env.GP_LOCAL_MILESTONES_ENABLED
    mockRetrieveAuthenticatedCustomer.mockResolvedValue({
      ...staffCustomer, metadata: { gp_staff_role: "driver" },
    } as any)
    try {
      process.env.GP_LOCAL_MILESTONES_ENABLED = "true"
      await expect(StaffPhoneOrdersPage({ params: Promise.resolve({ countryCode: "us" }) }))
        .rejects.toThrow("redirect:/us/account/staff/local-milestones")
      process.env.GP_LOCAL_MILESTONES_ENABLED = "false"
      await expect(StaffPhoneOrdersPage({ params: Promise.resolve({ countryCode: "us" }) }))
        .rejects.toThrow("notFound")
    } finally {
      if (prior === undefined) delete process.env.GP_LOCAL_MILESTONES_ENABLED
      else process.env.GP_LOCAL_MILESTONES_ENABLED = prior
    }
  })
})
