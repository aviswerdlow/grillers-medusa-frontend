import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Login from "@modules/account/components/login"
import Register from "@modules/account/components/register"
import ForgotPassword from "@modules/account/components/forgot-password"
import ResetPassword from "@modules/account/components/reset-password"
import AddressFormFields from "@modules/account/components/address-card/address-form-fields"
import { login, completePasswordReset } from "@lib/data/customer"
jest.mock("@lib/data/customer", () => ({
  login: jest.fn(async () => "Check your sign-in details."),
  signup: jest.fn(),
  requestPasswordReset: jest.fn(),
  completePasswordReset: jest.fn(),
}))
jest.mock("@lib/jitsu", () => ({
  jitsuTrack: jest.fn(),
  jitsuIdentify: jest.fn(),
}))

beforeEach(() => jest.clearAllMocks())

it("names login fields and associates the returned error with keyboard-focused inputs", async () => {
  const user = userEvent.setup()
  render(<Login setCurrentView={jest.fn()} />)
  const email = screen.getByRole("textbox", { name: "Email or username" })
  const password = screen.getByLabelText("Password", { exact: false })
  await user.type(email, "synthetic-user")
  await user.type(password, "synthetic-password")
  await user.click(screen.getByRole("button", { name: "Sign in" }))
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Check your sign-in details."
  )
  expect(email).toHaveAccessibleDescription("Check your sign-in details.")
  expect(password).toHaveAccessibleDescription("Check your sign-in details.")
  expect(login).toHaveBeenCalledTimes(1)
})

it("names registration and reset-request controls without sending or granting consent", () => {
  const { unmount } = render(<Register setCurrentView={jest.fn()} />)
  for (const label of [
    "First name",
    "Last name",
    "Email",
    "Phone",
    "Password",
  ]) {
    expect(screen.getByLabelText(label, { exact: false })).toHaveAccessibleName(label)
  }
  expect(screen.getByRole("checkbox")).not.toBeChecked()
  unmount()
  render(<ForgotPassword setCurrentView={jest.fn()} />)
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
    "autocomplete",
    "email"
  )
})

it.each([
  ["short", "short", "New password", "Password must be at least 8 characters."],
  [
    "long-password",
    "different-password",
    "Confirm new password",
    "Passwords do not match.",
  ],
])(
  "focuses the invalid reset field and exposes its error (%s)",
  async (password, confirm, field, error) => {
    const user = userEvent.setup()
    render(
      <ResetPassword
        token="synthetic-unused-token"
        email="synthetic@example.invalid"
      />
    )
    await user.type(screen.getByLabelText("New password", { exact: false }), password)
    await user.type(screen.getByLabelText("Confirm new password", { exact: false }), confirm)
    await user.click(screen.getByRole("button", { name: "Update password" }))
    const invalid = screen.getByLabelText(field, { exact: false })
    expect(invalid).toHaveFocus()
    expect(invalid).toHaveAttribute("aria-invalid", "true")
    expect(invalid).toHaveAccessibleDescription(error)
    expect(screen.getByRole("alert")).toHaveTextContent(error)
    expect(completePasswordReset).not.toHaveBeenCalled()
  }
)

it("keeps two address forms independently named and focused", async () => {
  render(
    <>
      <section aria-label="Shipping">
        <AddressFormFields />
      </section>
      <section aria-label="Billing">
        <AddressFormFields />
      </section>
    </>
  )
  const shipping = within(screen.getByRole("region", { name: "Shipping" }))
  const billing = within(screen.getByRole("region", { name: "Billing" }))
  for (const label of [
    "First name",
    "Last name",
    "Company",
    "Address",
    "Apartment, suite, etc.",
    "Postal code",
    "City",
    "Phone",
  ]) {
    const first = shipping.getByLabelText(label, { exact: false }),
      second = billing.getByLabelText(label, { exact: false })
    expect(first.id).not.toBe(second.id)
    await userEvent.click(billing.getByText(label))
    expect(second).toHaveFocus()
  }
  expect(shipping.getByRole("combobox", { name: "State" })).toBeInTheDocument()
})
