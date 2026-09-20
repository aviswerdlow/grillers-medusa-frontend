import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ProfileEmail from "@modules/account/components/profile-email"
jest.mock("@lib/data/receipt-email", () => ({ updateReceiptEmail: jest.fn() }))
const customer = { id: "cus_test", email: "login@example.invalid" } as any
const receipt = {
  revision: 1,
  login_email: customer.email,
  active_email: customer.email,
  active_source: "sign_in_email",
  active_status: "active",
  verified_at: null,
  suggested_email: null,
  pending: null,
}
beforeEach(() => {
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    configurable: true,
    value: () => "synthetic-request-0001",
  })
})
it("shows a real receipt action while login and marketing stay distinct", async () => {
  const user = userEvent.setup()
  render(<ProfileEmail customer={customer} receipt={receipt} />)
  expect(screen.getByText(/Sign-in and password reset/)).toBeInTheDocument()
  const input = screen.getByLabelText("Receipt email")
  await user.click(input)
  await user.tab()
  expect(
    screen.getByRole("button", { name: "Send verification code" })
  ).toHaveFocus()
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  expect(screen.queryByText(/updated successfully/)).not.toBeInTheDocument()
})
it("shows pending proof without falsely activating the destination", () => {
  render(
    <ProfileEmail
      customer={customer}
      receipt={{
        ...receipt,
        pending: {
          id: "c1",
          email: "pending@example.invalid",
          status: "pending",
          expires_at: "2026-09-20T13:00:00Z",
          retry_at: null,
        },
      }}
    />
  )
  expect(screen.getByLabelText("Verification code")).toHaveAttribute(
    "autocomplete",
    "one-time-code"
  )
  expect(screen.getByText(/Future order receipts/)).toHaveTextContent(
    customer.email
  )
  expect(screen.getByText(/Pending verification/)).toHaveTextContent(
    "pending@example.invalid"
  )
  expect(
    screen.getByRole("button", {
      name: "Use sign-in email and cancel pending changes",
    })
  ).toBeEnabled()
})
it("offers the newer unsent first-login suggestion without activating it", () => {
  render(
    <ProfileEmail
      customer={customer}
      receipt={{
        ...receipt,
        suggested_email: "newer@example.invalid",
        pending: {
          id: "c1",
          email: "older@example.invalid",
          status: "pending",
          expires_at: "2026-09-20T13:00:00Z",
          retry_at: null,
        },
      }}
    />
  )
  expect(screen.getByLabelText("Receipt email")).toHaveValue(
    "newer@example.invalid"
  )
  expect(screen.getByText(/Future order receipts/)).toHaveTextContent(
    customer.email
  )
  expect(screen.getByText(/Pending verification/)).toHaveTextContent(
    "older@example.invalid"
  )
})
it.each(["expired", "locked", "delivery_problem"])(
  "explains %s and offers recovery",
  (status) => {
    render(
      <ProfileEmail
        customer={customer}
        receipt={{
          ...receipt,
          pending: {
            id: "c1",
            email: "pending@example.invalid",
            status,
            expires_at: "2026-09-20T13:00:00Z",
            retry_at: null,
          },
        }}
      />
    )
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.queryByLabelText("Verification code")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Send a new code" })
    ).toBeInTheDocument()
  }
)
it("does not offer a pretend save in staff context or when settings are unavailable", () => {
  const { rerender } = render(
    <ProfileEmail customer={customer} receipt={receipt} canManage={false} />
  )
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
  rerender(
    <ProfileEmail customer={customer} receipt={null} canManage={false} />
  )
  expect(screen.getByText(/Only the signed-in customer/)).toBeInTheDocument()
})
