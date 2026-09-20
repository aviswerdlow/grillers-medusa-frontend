import { render, screen } from "@testing-library/react"

import ProfilePage from "../../app/[countryCode]/(main)/account/profile/page"
import { retrieveCustomer } from "@lib/data/customer"
import { getStaffImpersonationSession } from "@lib/data/staff/impersonation"
import { readStaffImpersonationCookie } from "@lib/data/staff/session-cookie"
import { retrieveSmsMarketingStatus } from "@lib/data/sms-marketing"
import { retrieveReceiptEmail } from "@lib/data/receipt-email"
import { listRegions } from "@lib/data/regions"

jest.mock("next/navigation", () => ({ notFound: jest.fn() }))

jest.mock("@lib/data/customer", () => ({
  retrieveCustomer: jest.fn(),
}))
jest.mock("@lib/data/staff/impersonation", () => ({
  getStaffImpersonationSession: jest.fn(),
}))
jest.mock("@lib/data/staff/session-cookie", () => ({
  readStaffImpersonationCookie: jest.fn(),
}))
jest.mock("@lib/data/sms-marketing", () => ({
  retrieveSmsMarketingStatus: jest.fn(),
}))
jest.mock("@lib/data/receipt-email", () => ({
  retrieveReceiptEmail: jest.fn(),
}))
jest.mock("@lib/data/regions", () => ({ listRegions: jest.fn() }))

jest.mock("@modules/account/components/profile-name", () => () => (
  <div data-testid="profile-name" />
))
jest.mock("@modules/account/components/profile-email", () => () => (
  <div data-testid="profile-email" />
))
jest.mock("@modules/account/components/profile-phone", () => () => (
  <div data-testid="profile-phone" />
))
jest.mock("@modules/account/components/profile-password", () => () => (
  <div data-testid="profile-password" />
))
jest.mock("@modules/account/components/profile-billing-address", () => () => (
  <div data-testid="profile-billing-address" />
))
jest.mock(
  "@modules/account/components/profile-sms-marketing",
  () =>
    ({ marketingStatus }: { marketingStatus: { status: string } | null }) => (
      <div data-testid="profile-sms-marketing">
        {marketingStatus?.status || "unavailable"}
      </div>
    )
)

const mockedRetrieveCustomer = retrieveCustomer as jest.MockedFunction<
  typeof retrieveCustomer
>
const mockedGetStaffImpersonationSession =
  getStaffImpersonationSession as jest.MockedFunction<
    typeof getStaffImpersonationSession
  >
const mockedReadStaffImpersonationCookie =
  readStaffImpersonationCookie as jest.MockedFunction<
    typeof readStaffImpersonationCookie
  >
const mockedRetrieveSmsMarketingStatus =
  retrieveSmsMarketingStatus as jest.MockedFunction<
    typeof retrieveSmsMarketingStatus
  >
const mockedListRegions = listRegions as jest.MockedFunction<
  typeof listRegions
>
const mockedRetrieveReceiptEmail = retrieveReceiptEmail as jest.MockedFunction<
  typeof retrieveReceiptEmail
>

describe("profile SMS marketing impersonation gate", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedRetrieveCustomer.mockResolvedValue({
      id: "cus_customer",
      email: "customer@example.com",
      metadata: {},
    } as any)
    mockedListRegions.mockResolvedValue([{ id: "reg_us" }] as any)
    mockedReadStaffImpersonationCookie.mockResolvedValue(null)
    mockedGetStaffImpersonationSession.mockResolvedValue(null)
    mockedRetrieveReceiptEmail.mockResolvedValue(null)
    mockedRetrieveSmsMarketingStatus.mockResolvedValue({
      status: "not_subscribed",
      phone: null,
      consented_at: null,
      opted_out_at: null,
    })
  })

  it("shows the customer-only form after both impersonation checks pass", async () => {
    render(await ProfilePage())

    expect(screen.getByTestId("profile-sms-marketing")).toHaveTextContent(
      "not_subscribed"
    )
    expect(mockedRetrieveSmsMarketingStatus).toHaveBeenCalledTimes(1)
    expect(mockedRetrieveReceiptEmail).toHaveBeenCalledTimes(1)
  })

  it("hides the form when a raw signed session exists but verification resolves null", async () => {
    mockedReadStaffImpersonationCookie.mockResolvedValue({
      staffCustomerId: "cus_staff",
      targetCustomerId: "cus_target",
    } as any)
    // This is the ambiguous null returned when the helper's internal staff
    // lookup fails; the raw cookie must keep the consent surface closed.
    mockedGetStaffImpersonationSession.mockResolvedValue(null)

    render(await ProfilePage())

    expect(screen.queryByTestId("profile-sms-marketing")).not.toBeInTheDocument()
    expect(mockedRetrieveSmsMarketingStatus).not.toHaveBeenCalled()
    expect(mockedRetrieveReceiptEmail).not.toHaveBeenCalled()
  })

  it("hides the form when the signed-cookie check itself fails", async () => {
    mockedReadStaffImpersonationCookie.mockRejectedValue(
      new Error("cookie verification unavailable")
    )

    render(await ProfilePage())

    expect(screen.queryByTestId("profile-sms-marketing")).not.toBeInTheDocument()
    expect(mockedRetrieveSmsMarketingStatus).not.toHaveBeenCalled()
    expect(mockedRetrieveReceiptEmail).not.toHaveBeenCalled()
  })
})
