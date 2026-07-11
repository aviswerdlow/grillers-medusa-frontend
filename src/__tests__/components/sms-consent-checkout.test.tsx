import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import CheckoutLoginBanner from "@modules/checkout/components/checkout-login-banner"
import Register from "@modules/account/components/register"
import ContactVerification from "@modules/account/components/contact-verification"
import { signupWithCredentials } from "@lib/data/customer"
import { useStorefrontSession } from "@modules/layout/components/storefront-session"
import { useExitStaffContext } from "@modules/staff/hooks/use-exit-staff-context"

jest.mock("@lib/data/customer", () => ({
  signup: jest.fn(),
  loginWithCredentials: jest.fn(),
  signupWithCredentials: jest.fn(),
  signoutKeepCart: jest.fn(),
  requestPasswordReset: jest.fn(),
}))

jest.mock("@lib/data/contact-verification", () => ({
  submitContactVerification: jest.fn(),
}))

jest.mock("@lib/jitsu", () => ({
  jitsuIdentify: jest.fn(),
  jitsuTrack: jest.fn(),
}))

jest.mock("@modules/layout/components/storefront-session", () => ({
  useStorefrontSession: jest.fn(),
}))

jest.mock("@modules/staff/hooks/use-exit-staff-context", () => ({
  useExitStaffContext: jest.fn(),
}))

const mockedSignup = signupWithCredentials as jest.MockedFunction<
  typeof signupWithCredentials
>
const mockedUseStorefrontSession = useStorefrontSession as jest.MockedFunction<
  typeof useStorefrontSession
>
const mockedUseExitStaffContext = useExitStaffContext as jest.MockedFunction<
  typeof useExitStaffContext
>

describe("SMS consent surfaces", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseStorefrontSession.mockReturnValue({
      customer: null,
      staffImpersonation: null,
      cart: null,
      cartItemCount: 0,
      shippingOptions: [],
      deliveryZip: null,
      deliveryZipSource: null,
      loaded: true,
      refreshing: false,
      refreshSession: jest.fn(),
    })
    mockedUseExitStaffContext.mockReturnValue({
      exitContext: jest.fn(),
      isExiting: false,
    })
    mockedSignup.mockResolvedValue({ success: true, error: null })
  })

  it("uses the same unchecked marketing consent and legal links at account signup", () => {
    render(<Register setCurrentView={jest.fn()} />)

    expect(
      screen.getByRole("checkbox", {
        name: /send me Griller's Pride deals and promotional updates/i,
      })
    ).not.toBeChecked()
    expect(screen.getByRole("link", { name: "SMS Terms" })).toHaveAttribute(
      "href",
      "/us/page/sms-terms"
    )
    expect(
      screen.getAllByRole("link", { name: "Privacy Policy" })[0]
    ).toHaveAttribute("href", "/us/page/privacy-policy")
  })

  it("uses the same unchecked marketing consent and legal links at first login", () => {
    render(
      <ContactVerification
        countryCode="us"
        customer={
          {
            id: "cus_migrated",
            email: "customer@example.com",
            first_name: "Customer",
            addresses: [],
          } as any
        }
        phoneCandidates={[]}
      />
    )

    expect(
      screen.getByRole("checkbox", {
        name: /send me Griller's Pride deals and promotional updates/i,
      })
    ).not.toBeChecked()
    expect(screen.getByRole("link", { name: "SMS Terms" })).toHaveAttribute(
      "href",
      "/us/page/sms-terms"
    )
    expect(
      screen.getByRole("link", { name: "Privacy Policy" })
    ).toHaveAttribute("href", "/us/page/privacy-policy")
  })

  it("keeps marketing optional and exposes working legal links", async () => {
    render(<CheckoutLoginBanner customer={null} />)

    fireEvent.click(screen.getByRole("button", { name: "Create an account" }))

    const checkbox = screen.getByRole("checkbox", {
      name: /send me Griller's Pride deals and promotional updates/i,
    })
    expect(checkbox).not.toBeChecked()
    expect(screen.getByRole("link", { name: "SMS Terms" })).toHaveAttribute(
      "href",
      "/us/page/sms-terms"
    )
    expect(
      screen.getByRole("link", { name: "Privacy Policy" })
    ).toHaveAttribute("href", "/us/page/privacy-policy")

    fireEvent.change(screen.getByPlaceholderText("First name"), {
      target: { value: "Test" },
    })
    fireEvent.change(screen.getByPlaceholderText("Last name"), {
      target: { value: "Customer" },
    })
    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "test@example.com" },
    })
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    })
    fireEvent.click(
      screen.getByRole("button", { name: "Create Account & Continue" })
    )

    await waitFor(() =>
      expect(mockedSignup).toHaveBeenCalledWith(
        expect.objectContaining({
          sms_marketing_opt_in: false,
        })
      )
    )
  })
})
