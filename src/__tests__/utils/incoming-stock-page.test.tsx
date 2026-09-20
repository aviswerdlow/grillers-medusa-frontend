jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomerForStaffAccess: jest.fn(),
}))
jest.mock("@lib/data/staff/incoming-stock", () => ({
  getIncomingExceptions: jest.fn(),
}))
jest.mock("@modules/staff/components/incoming-stock-console", () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock("@modules/common/components/localized-client-link", () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("redirect")
  }),
  notFound: jest.fn(() => {
    throw new Error("notFound")
  }),
}))
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { getIncomingExceptions } from "@lib/data/staff/incoming-stock"
import Page from "../../app/[countryCode]/(main)/account/staff/incoming-stock/page"
beforeEach(() => {
  jest.clearAllMocks()
  ;(getIncomingExceptions as jest.Mock).mockResolvedValue({
    ok: true,
    data: { demands: [], next_cursor: null, can_manage: false },
  })
})
it("denies unauthenticated and merchandising callers before reading receiving data", async () => {
  ;(retrieveAuthenticatedCustomerForStaffAccess as jest.Mock).mockResolvedValue(
    null
  )
  await expect(
    Page({ params: Promise.resolve({ countryCode: "us" }) })
  ).rejects.toThrow("redirect")
  ;(retrieveAuthenticatedCustomerForStaffAccess as jest.Mock).mockResolvedValue(
    { id: "reviewer", metadata: { gp_staff_role: "merchandising_reviewer" } }
  )
  await expect(
    Page({ params: Promise.resolve({ countryCode: "us" }) })
  ).rejects.toThrow("notFound")
  expect(getIncomingExceptions).not.toHaveBeenCalled()
})
it("loads the queue for an authenticated inventory reader", async () => {
  ;(retrieveAuthenticatedCustomerForStaffAccess as jest.Mock).mockResolvedValue(
    { id: "picker", metadata: { gp_staff_role: "picker" } }
  )
  const page = await Page({ params: Promise.resolve({ countryCode: "us" }) })
  expect(page.type).toBe("main")
  expect(getIncomingExceptions).toHaveBeenCalledTimes(1)
})
