import { createRef } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Input from "@modules/common/components/input"
import NativeSelect from "@modules/common/components/native-select"
import AddressAutocomplete from "@modules/checkout/components/address-autocomplete"

it("gives repeated names distinct stable labels while preserving submitted field names", async () => {
  const user = userEvent.setup()
  const fields = (
    <form aria-label="Addresses">
      <Input label="Shipping city" name="city" defaultValue="Atlanta" />
      <Input label="Billing city" name="city" defaultValue="Savannah" />
    </form>
  )
  const { rerender } = render(fields)
  const shipping = screen.getByRole("textbox", {
    name: "Shipping city",
  }) as HTMLInputElement
  const billing = screen.getByRole("textbox", {
    name: "Billing city",
  }) as HTMLInputElement
  expect(shipping.id).toBeTruthy()
  expect(billing.id).not.toBe(shipping.id)
  const id = billing.id
  await user.click(screen.getByText("Billing city"))
  expect(billing).toHaveFocus()
  rerender(fields)
  expect(screen.getByLabelText("Billing city")).toHaveAttribute("id", id)
  expect(
    new FormData(screen.getByRole("form") as HTMLFormElement).getAll("city")
  ).toEqual(["Atlanta", "Savannah"])
})

it("preserves explicit identity, forwarding, autocomplete and described errors", async () => {
  const ref = createRef<HTMLInputElement>()
  render(
    <>
      <Input
        ref={ref}
        id="checkout-email"
        name="customer.email"
        label="Email"
        required
        autoComplete="email"
        aria-describedby="email-help email-error"
        aria-invalid="true"
      />
      <p id="email-help">Use your receipt address.</p>
      <p id="email-error">Enter a valid address.</p>
    </>
  )
  const input = screen.getByRole("textbox", { name: "Email" })
  expect(input).toBe(ref.current)
  expect(input).toHaveAttribute("id", "checkout-email")
  expect(input).toHaveAttribute("name", "customer.email")
  expect(input).toHaveAttribute("autocomplete", "email")
  expect(input).toBeRequired()
  expect(input).toHaveAccessibleDescription(
    "Use your receipt address. Enter a valid address."
  )
  await userEvent.click(screen.getByText("Email"))
  expect(input).toHaveFocus()
})

it("keeps a keyboard-operable reveal attached to its own password without submitting", async () => {
  const user = userEvent.setup(),
    submit = jest.fn((e) => e.preventDefault())
  render(
    <form onSubmit={submit}>
      <Input
        name="password"
        label="Password"
        type="password"
        defaultValue="synthetic-secret"
      />
    </form>
  )
  const input = screen.getByLabelText("Password")
  await user.click(screen.getByText("Password"))
  await user.tab()
  const button = screen.getByRole("button", { name: "Show password" })
  expect(button).toHaveFocus()
  expect(button).toHaveAttribute("aria-controls", input.id)
  await user.keyboard("{Enter}")
  expect(input).toHaveAttribute("type", "text")
  expect(button).toHaveAttribute("aria-pressed", "true")
  await user.keyboard(" ")
  expect(input).toHaveAttribute("type", "password")
  expect(button).toHaveAccessibleName("Show password")
  expect(submit).not.toHaveBeenCalled()
})

it("names native country/state selects and preserves caller naming overrides", () => {
  render(
    <>
      <NativeSelect name="country" placeholder="Country">
        <option value="us">United States</option>
      </NativeSelect>
      <NativeSelect name="state" placeholder="State" aria-label="Billing state">
        <option value="GA">Georgia</option>
      </NativeSelect>
    </>
  )
  expect(screen.getByRole("combobox", { name: "Country" })).toHaveAttribute(
    "name",
    "country"
  )
  expect(
    screen.getByRole("combobox", { name: "Billing state" })
  ).toHaveAttribute("name", "state")
})

it("associates repeated address autocompletes with their own labels", async () => {
  render(
    <>
      <AddressAutocomplete
        name="address_1"
        label="Shipping address"
        value=""
        onChange={jest.fn()}
        onAddressSelect={jest.fn()}
      />
      <AddressAutocomplete
        id="billing-address"
        name="address_1"
        label="Billing address"
        value=""
        onChange={jest.fn()}
        onAddressSelect={jest.fn()}
      />
    </>
  )
  const shipping = screen.getByRole("combobox", { name: "Shipping address" })
  const billing = screen.getByRole("combobox", { name: "Billing address" })
  expect(shipping.id).not.toBe(billing.id)
  expect(billing.id).toBe("billing-address")
  await userEvent.click(screen.getByText("Billing address"))
  expect(billing).toHaveFocus()
})
