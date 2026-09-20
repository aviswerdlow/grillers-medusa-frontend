jest.mock("@lib/data/cart", () => ({ getCheckoutCalendar: jest.fn(), saveCheckoutCalendar: jest.fn() }))

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import PhoneOrderCopilot from "@modules/staff/components/phone-order-copilot"
import StaffTeamAccessConsole from "@modules/staff/components/team-access-console"
import {
  createStaffCustomer,
  searchStaffCustomers,
  updateStaffCustomerProfile,
} from "@lib/data/staff/order-entry"
import {
  searchStaffTeamUsers,
  updateStaffTeamRole,
} from "@lib/data/staff/team-access"
import { startStaffImpersonation } from "@lib/data/staff/impersonation"

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

jest.mock("@lib/data/staff/team-access", () => ({
  searchStaffTeamUsers: jest.fn(),
  updateStaffTeamRole: jest.fn(),
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

const mockedSearchStaffCustomers = searchStaffCustomers as jest.MockedFunction<
  typeof searchStaffCustomers
>
const mockedCreateStaffCustomer = createStaffCustomer as jest.MockedFunction<
  typeof createStaffCustomer
>
const mockedUpdateStaffCustomerProfile =
  updateStaffCustomerProfile as jest.MockedFunction<
    typeof updateStaffCustomerProfile
  >
const mockedSearchStaffTeamUsers = searchStaffTeamUsers as jest.MockedFunction<
  typeof searchStaffTeamUsers
>
const mockedUpdateStaffTeamRole = updateStaffTeamRole as jest.MockedFunction<
  typeof updateStaffTeamRole
>
const mockedStartStaffImpersonation =
  startStaffImpersonation as jest.MockedFunction<typeof startStaffImpersonation>

const superAdminCustomer = {
  id: "cus_avi",
  email: "aviswerdlow@gmail.com",
  first_name: "Avi",
  last_name: "Swerdlow",
  metadata: { gp_staff_role: "super_admin" },
} as any

const greenbergCustomer = {
  id: "cus_greenberg",
  email: "m.m.greenberg@gmail.com",
  firstName: "Meyer",
  lastName: "Greenberg",
  phone: "",
  company: "",
  qbdCustomerType: "",
  alternateContactName: "",
  alternateContactPhone: "",
  alternateContactPhoneType: "" as const,
  source: "customer" as const,
  recentOrders: [],
  legacyOrders: [],
  accountCredits: [],
  accountNotes: [],
  accountCreditBalance: 0,
  accountCreditBalanceMinor: 0,
}

const peterTeamUser = {
  id: "cus_peter",
  email: "peterswerdlow@gmail.com",
  firstName: "Peter",
  lastName: "Swerdlow",
  phone: "7703294820111",
  company: "",
  role: "super_admin" as const,
  finalChargeEnabled: true,
  isBootstrapSuperAdmin: true,
  recentStaffAccessEvents: [],
}

describe("staff loading states", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  function visibleCustomerSearch() {
    return screen
      .getAllByLabelText("Customer search")
      .find((element) => element.closest('[aria-hidden="true"]') === null)!
  }

  function visibleControl(label: string) {
    return screen
      .getAllByLabelText(label)
      .find((element) => element.closest('[aria-hidden="true"]') === null)!
  }

  function visibleButton(name: string | RegExp) {
    return screen
      .getAllByRole("button", { name })
      .find((element) => element.closest('[aria-hidden="true"]') === null)!
  }

  function visibleTextCount(text: string) {
    return screen
      .queryAllByText(text)
      .filter((element) => element.closest('[aria-hidden="true"]') === null)
      .length
  }

  function visibleTextElement(text: string) {
    return screen
      .getAllByText(text)
      .find((element) => element.closest('[aria-hidden="true"]') === null)!
  }

  it("clears the customer account search spinner after results render", async () => {
    const user = userEvent.setup()
    mockedSearchStaffCustomers.mockResolvedValue([greenbergCustomer])

    render(
      <PhoneOrderCopilot
        countryCode="us"
        initialImpersonation={null}
        initialWorkspace="customer_account"
        staffCustomer={superAdminCustomer}
      />
    )

    await user.type(visibleCustomerSearch(), "greenberg")
    await user.click(screen.getByRole("button", { name: "Search" }))

    expect(await screen.findByText("Meyer Greenberg")).toBeInTheDocument()

    const searchButton = screen.getByRole("button", { name: "Search" })
    expect(searchButton).toHaveTextContent("Search")
    expect(searchButton).not.toBeDisabled()
    expect(searchButton).toHaveAttribute("aria-busy", "false")
  })

  it("shows customer account search no-match feedback in the lookup panel", async () => {
    const user = userEvent.setup()
    mockedSearchStaffCustomers.mockResolvedValue([])

    render(
      <PhoneOrderCopilot
        countryCode="us"
        initialImpersonation={null}
        initialWorkspace="customer_account"
        staffCustomer={superAdminCustomer}
      />
    )

    await user.type(visibleCustomerSearch(), "missing@example.com")
    await user.click(screen.getByRole("button", { name: "Search" }))

    expect(mockedSearchStaffCustomers).toHaveBeenCalledWith(
      "missing@example.com"
    )
    expect(
      await screen.findByText(
        'No customers found for "missing@example.com". Try an email, phone number, or order number.'
      )
    ).toBeInTheDocument()

    const searchButton = screen.getByRole("button", { name: "Search" })
    expect(searchButton).not.toBeDisabled()
    expect(searchButton).toHaveAttribute("aria-busy", "false")
  })

  it("keeps short customer account searches local instead of submitting a blank lookup", async () => {
    const user = userEvent.setup()

    render(
      <PhoneOrderCopilot
        countryCode="us"
        initialImpersonation={null}
        initialWorkspace="customer_account"
        staffCustomer={superAdminCustomer}
      />
    )

    await user.type(visibleCustomerSearch(), "p")
    await user.click(screen.getByRole("button", { name: "Search" }))

    expect(mockedSearchStaffCustomers).not.toHaveBeenCalled()
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter at least 2 characters to search customers."
    )

    const searchButton = screen.getByRole("button", { name: "Search" })
    expect(searchButton).not.toBeDisabled()
    expect(searchButton).toHaveAttribute("aria-busy", "false")
  })

  it("starts account actions with a clean customer lookup", async () => {
    const user = userEvent.setup()
    mockedSearchStaffCustomers.mockResolvedValue([greenbergCustomer])

    render(
      <PhoneOrderCopilot
        countryCode="us"
        initialImpersonation={null}
        initialWorkspace="phone_order"
        staffCustomer={superAdminCustomer}
      />
    )

    await user.type(visibleCustomerSearch(), "greenberg")
    await user.click(screen.getByRole("button", { name: "Search" }))
    await waitFor(() => {
      expect(visibleTextCount("Meyer Greenberg")).toBeGreaterThan(0)
    })

    const accountActionsLink = screen.getByRole("link", {
      name: /Account actions/i,
    })
    accountActionsLink.addEventListener("click", (event) =>
      event.preventDefault()
    )
    await user.click(accountActionsLink)

    const accountSearch = visibleCustomerSearch()
    expect(accountSearch).toHaveValue("")
    expect(visibleTextCount("Meyer Greenberg")).toBe(0)
    expect(screen.getByRole("button", { name: "Search" })).not.toBeDisabled()
  })

  it("passes QuickBooks customer fields through new customer creation", async () => {
    const user = userEvent.setup()
    const createdCustomer = {
      ...greenbergCustomer,
      id: "cus_new",
      email: "new.customer@example.com",
      firstName: "New",
      lastName: "Customer",
      phone: "4045550101",
      qbdCustomerType: "Shipping",
      alternateContactName: "Backup Contact",
      alternateContactPhone: "4045550199",
      alternateContactPhoneType: "mobile" as const,
    }
    mockedCreateStaffCustomer.mockResolvedValue(createdCustomer)
    mockedStartStaffImpersonation.mockResolvedValue({
      ok: true,
      session: {
        targetCustomerId: "cus_new",
        targetEmail: "new.customer@example.com",
        targetName: "New Customer",
      } as any,
    })

    render(
      <PhoneOrderCopilot
        countryCode="us"
        initialImpersonation={null}
        initialWorkspace="new_customer"
        staffCustomer={superAdminCustomer}
      />
    )

    await user.type(visibleControl("Email"), "new.customer@example.com")
    await user.type(visibleControl("Phone"), "4045550101")
    await user.type(visibleControl("First name"), "New")
    await user.type(visibleControl("Last name"), "Customer")
    await user.selectOptions(visibleControl("QB customer type"), "Shipping")
    await user.type(visibleControl("Alternate contact name"), "Backup Contact")
    await user.type(visibleControl("Alternate contact number"), "4045550199")
    await user.selectOptions(visibleControl("Alternate number type"), "mobile")

    await user.click(visibleButton("Create Customer"))

    await waitFor(() => {
      expect(mockedCreateStaffCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new.customer@example.com",
          firstName: "New",
          lastName: "Customer",
          phone: "4045550101",
          qbdCustomerType: "Shipping",
          alternateContactName: "Backup Contact",
          alternateContactPhone: "4045550199",
          alternateContactPhoneType: "mobile",
        })
      )
    })
  })

  it("passes QuickBooks customer fields through existing customer updates", async () => {
    const user = userEvent.setup()
    mockedSearchStaffCustomers.mockResolvedValue([
      {
        ...greenbergCustomer,
        qbdCustomerType: "Local",
        alternateContactName: "Old Contact",
        alternateContactPhone: "4045550000",
        alternateContactPhoneType: "landline",
      },
    ])
    mockedUpdateStaffCustomerProfile.mockResolvedValue({
      ok: true,
      customer: {
        ...greenbergCustomer,
        qbdCustomerType: "RouteMemphis",
        alternateContactName: "Ruth Greenberg",
        alternateContactPhone: "4045552222",
        alternateContactPhoneType: "mobile",
      },
    })

    render(
      <PhoneOrderCopilot
        countryCode="us"
        initialImpersonation={null}
        initialWorkspace="new_customer"
        staffCustomer={superAdminCustomer}
      />
    )

    await user.type(visibleCustomerSearch(), "greenberg")
    await user.click(visibleButton("Search"))
    await waitFor(() => {
      expect(visibleTextCount("Meyer Greenberg")).toBeGreaterThan(0)
    })
    await user.click(visibleTextElement("Meyer Greenberg"))

    await user.selectOptions(visibleControl("QB customer type"), "RouteMemphis")
    await user.clear(visibleControl("Alternate contact name"))
    await user.type(visibleControl("Alternate contact name"), "Ruth Greenberg")
    await user.clear(visibleControl("Alternate contact number"))
    await user.type(visibleControl("Alternate contact number"), "4045552222")
    await user.selectOptions(visibleControl("Alternate number type"), "mobile")
    await user.click(visibleButton("Save Customer"))

    await waitFor(() => {
      expect(mockedUpdateStaffCustomerProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: "cus_greenberg",
          qbdCustomerType: "RouteMemphis",
          alternateContactName: "Ruth Greenberg",
          alternateContactPhone: "4045552222",
          alternateContactPhoneType: "mobile",
        })
      )
    })
  })

  it("clears the team access search spinner after results render", async () => {
    const user = userEvent.setup()
    mockedSearchStaffTeamUsers.mockResolvedValue({
      ok: true,
      users: [peterTeamUser],
    })

    render(<StaffTeamAccessConsole />)

    await user.type(screen.getByLabelText("Customer lookup"), "peter")
    await user.click(screen.getByRole("button", { name: /search/i }))

    expect(await screen.findByText("Peter Swerdlow")).toBeInTheDocument()

    const searchButton = screen.getByRole("button", { name: /search/i })
    expect(searchButton).toHaveTextContent("Search")
    expect(searchButton).not.toBeDisabled()
    expect(searchButton).toHaveAttribute("aria-busy", "false")
  })

  it("clears the team access save spinner after updating a role", async () => {
    const user = userEvent.setup()
    const officeUser = {
      ...peterTeamUser,
      id: "cus_office",
      email: "office@example.com",
      firstName: "Office",
      lastName: "User",
      role: "office" as const,
      finalChargeEnabled: false,
      isBootstrapSuperAdmin: false,
    }
    mockedSearchStaffTeamUsers.mockResolvedValue({
      ok: true,
      users: [officeUser],
    })
    mockedUpdateStaffTeamRole.mockResolvedValue({
      ok: true,
      user: { ...officeUser, role: "manager", finalChargeEnabled: true },
    })

    render(<StaffTeamAccessConsole />)

    await user.type(screen.getByLabelText("Customer lookup"), "office")
    await user.click(screen.getByRole("button", { name: /search/i }))
    await user.click(await screen.findByText("Office User"))
    await user.click(screen.getByRole("radio", { name: /^Manager/i }))
    await user.click(screen.getByLabelText(/Can charge final orders/i))
    await user.type(
      screen.getByLabelText(/Reason required/i),
      "Peter approved manager access"
    )
    await user.type(
      screen.getByLabelText(/Type MANAGER to confirm/i),
      "MANAGER"
    )

    await user.click(
      screen.getByRole("button", { name: "Update Staff Access" })
    )

    await waitFor(() => {
      expect(
        screen.getByText("Office User is now Manager.")
      ).toBeInTheDocument()
    })

    const saveButton = screen.getByRole("button", {
      name: "Update Staff Access",
    })
    expect(saveButton).toHaveTextContent("Update Staff Access")
    expect(saveButton).toHaveAttribute("aria-busy", "false")
  })

  it("clears final charge and explains required audit input for merchandising reviewers", async () => {
    const user = userEvent.setup()
    const generalStaffUser = {
      ...peterTeamUser,
      id: "cus_efraim",
      email: "efraimd7@gmail.com",
      firstName: "Efraim",
      lastName: "Davidson",
      role: "staff" as const,
      finalChargeEnabled: true,
      isBootstrapSuperAdmin: false,
    }
    mockedSearchStaffTeamUsers.mockResolvedValue({
      ok: true,
      users: [generalStaffUser],
    })
    mockedUpdateStaffTeamRole.mockResolvedValue({
      ok: true,
      user: {
        ...generalStaffUser,
        role: "merchandising_reviewer",
        finalChargeEnabled: false,
      },
    })

    render(<StaffTeamAccessConsole />)

    await user.type(screen.getByLabelText("Customer lookup"), "efraim")
    await user.click(screen.getByRole("button", { name: /search/i }))
    await user.click(await screen.findByText("Efraim Davidson"))
    await user.click(
      screen.getByRole("radio", { name: /^Merchandising reviewer/i })
    )

    const finalChargeCheckbox = screen.getByLabelText(
      /Can charge final orders/i
    ) as HTMLInputElement
    expect(finalChargeCheckbox).not.toBeChecked()
    expect(finalChargeCheckbox).toBeDisabled()

    const saveButton = screen.getByRole("button", {
      name: "Update Staff Access",
    })
    expect(saveButton).toBeDisabled()
    expect(
      screen.getByText(/Add a short audit reason/i)
    ).toBeInTheDocument()

    await user.type(
      screen.getByLabelText(/Reason required/i),
      "Avi approved merchandising reviewer access"
    )
    await user.type(
      screen.getByLabelText(/Type MERCHANDISING to confirm/i),
      "MERCHANDISING"
    )

    expect(saveButton).not.toBeDisabled()
    await user.click(saveButton)

    await waitFor(() => {
      expect(mockedUpdateStaffTeamRole).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: "cus_efraim",
          role: "merchandising_reviewer",
          finalChargeEnabled: false,
          confirmation: "MERCHANDISING",
        })
      )
    })
  })
})
