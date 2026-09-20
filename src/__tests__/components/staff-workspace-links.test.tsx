jest.mock("@lib/data/cart", () => ({ getCheckoutCalendar: jest.fn(), saveCheckoutCalendar: jest.fn() }))

import { render, screen } from "@testing-library/react"

import PhoneOrderCopilot from "@modules/staff/components/phone-order-copilot"

const routerReplace = jest.fn()
const routerRefresh = jest.fn()

jest.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "us" }),
  usePathname: () => "/us/account/staff/orders",
  useRouter: () => ({
    replace: routerReplace,
    refresh: routerRefresh,
  }),
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock("@stripe/react-stripe-js", () => ({
  CardElement: () => null,
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useElements: () => null,
  useStripe: () => null,
}))

jest.mock("@stripe/stripe-js", () => ({
  loadStripe: jest.fn(() => Promise.resolve({})),
}))

jest.mock("@lib/util/stripe-key", () => ({
  getStripePublishableKey: () => "",
}))

jest.mock("@lib/data/staff/order-entry", () => ({
  applyStaffCustomerAccountAction: jest.fn(),
  completeStaffPhoneOrder: jest.fn(),
  createStaffCustomer: jest.fn(),
  getStaffCustomerContext: jest.fn(),
  getStaffLegacyOrderContext: jest.fn(),
  prepareStaffPhoneOrder: jest.fn(),
  saveStaffCustomerAddress: jest.fn(),
  searchStaffCustomers: jest.fn(),
  searchStaffProducts: jest.fn(),
  updateStaffCustomerProfile: jest.fn(),
}))

jest.mock("@lib/data/staff/impersonation", () => ({
  startStaffImpersonation: jest.fn(),
  stopStaffImpersonation: jest.fn(),
}))

jest.mock("@lib/util/storefront-session-events", () => ({
  dispatchStorefrontSessionUpdated: jest.fn(),
}))

jest.mock("@modules/staff/components/order-exception-console", () => ({
  __esModule: true,
  default: () => <div>Order support panel</div>,
}))

jest.mock("@modules/staff/components/team-access-console", () => ({
  __esModule: true,
  default: () => <div>Team access panel</div>,
}))

jest.mock(
  "@modules/staff/components/catch-weight-finalization-console",
  () => ({
    __esModule: true,
    default: () => <div>Pick and pack panel</div>,
  })
)

jest.mock("@modules/staff/components/quickbooks-sync-status-console", () => ({
  __esModule: true,
  default: () => <div>Synchronization status panel</div>,
}))

jest.mock("@modules/staff/components/merchandising-workspace", () => ({
  __esModule: true,
  default: () => <div>Merchandising panel</div>,
}))

describe("staff workspace navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("renders staff workspace cards as real links", () => {
    render(
      <PhoneOrderCopilot
        countryCode="us"
        initialImpersonation={null}
        initialWorkspace="exceptions"
        staffCustomer={
          {
            id: "cus_peter",
            email: "peterswerdlow@gmail.com",
            first_name: "Peter",
            last_name: "Swerdlow",
            metadata: { gp_staff_role: "super_admin" },
          } as any
        }
      />
    )

    const cardLink = (label: string) =>
      screen
        .getAllByText(label)
        .find((element) => element.closest("a"))
        ?.closest("a")

    expect(cardLink("Order support")).toHaveAttribute(
      "href",
      "/us/account/staff/orders?workspace=exceptions"
    )
    expect(cardLink("Synchronization status")).toHaveAttribute(
      "href",
      "/us/account/staff/orders?workspace=quickbooks_sync"
    )
    expect(cardLink("Pick, pack & finalize")).toHaveAttribute(
      "href",
      "/us/account/staff/orders?workspace=finalization"
    )
    expect(cardLink("Team access")).toHaveAttribute(
      "href",
      "/us/account/staff/orders?workspace=team_access"
    )
    expect(cardLink("Merchandising")).toHaveAttribute(
      "href",
      "/us/account/staff/orders?workspace=merchandising"
    )
  })
})
