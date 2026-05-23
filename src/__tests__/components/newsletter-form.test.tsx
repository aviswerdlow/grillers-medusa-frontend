import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import NewsletterForm from "@components/newsletter-form"

// Mock the server action
jest.mock("@lib/data/newsletter", () => ({
  subscribeToNewsletter: jest.fn(),
}))

jest.mock("@medusajs/ui", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

import { subscribeToNewsletter } from "@lib/data/newsletter"
import { toast } from "@medusajs/ui"

const mockSubscribe = subscribeToNewsletter as jest.MockedFunction<
  typeof subscribeToNewsletter
>
const mockToast = toast as jest.Mocked<typeof toast>

const getEmailInput = () => screen.getByLabelText("Email address")

describe("NewsletterForm", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn().mockRejectedValue(new Error("network error"))
  })

  it("renders with default props", () => {
    render(<NewsletterForm />)

    expect(screen.getByText("Subscribe to our newsletter")).toBeInTheDocument()
    expect(getEmailInput()).toHaveAttribute(
      "placeholder",
      "Enter your email address"
    )
    expect(
      screen.getByRole("button", { name: /subscribe/i })
    ).toBeInTheDocument()
  })

  it("renders with custom props", () => {
    render(
      <NewsletterForm
        title="Join our list"
        description="Get exclusive offers"
        buttonText="Sign Up"
        placeholderText="Your email"
      />
    )

    expect(screen.getByText("Join our list")).toBeInTheDocument()
    expect(screen.getByText("Get exclusive offers")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Your email")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /sign up/i })).toBeInTheDocument()
  })

  it("shows success message on successful subscription", async () => {
    mockSubscribe.mockResolvedValue({
      success: true,
      message: "Thank you for subscribing!",
    })

    render(<NewsletterForm />)

    const input = getEmailInput()
    const button = screen.getByRole("button", { name: /subscribe/i })

    await userEvent.type(input, "test@example.com")
    await userEvent.click(button)

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith(
        "Thank you for subscribing!",
        expect.any(Object)
      )
    })

    expect(mockSubscribe).toHaveBeenCalledWith("test@example.com", "website")
  })

  it("shows error message on failed subscription", async () => {
    mockSubscribe.mockResolvedValue({
      success: false,
      error: "Unable to subscribe. Please try again later.",
    })

    render(<NewsletterForm />)

    const input = getEmailInput()
    const button = screen.getByRole("button", { name: /subscribe/i })

    await userEvent.type(input, "test@example.com")
    await userEvent.click(button)

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        "Unable to subscribe. Please try again later."
      )
    })
  })

  it("disables button while submitting", async () => {
    mockSubscribe.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ success: true }), 100)
        )
    )

    render(<NewsletterForm />)

    const input = getEmailInput()
    const button = screen.getByRole("button", { name: /subscribe/i })

    await userEvent.type(input, "test@example.com")
    await userEvent.click(button)

    expect(button).toBeDisabled()
    expect(screen.getByText("Subscribing...")).toBeInTheDocument()

    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it("clears input after successful submission", async () => {
    mockSubscribe.mockResolvedValue({ success: true })

    render(<NewsletterForm />)

    const input = getEmailInput() as HTMLInputElement
    const button = screen.getByRole("button", { name: /subscribe/i })

    await userEvent.type(input, "test@example.com")
    expect(input.value).toBe("test@example.com")

    await userEvent.click(button)

    await waitFor(() => {
      expect(input.value).toBe("")
    })
  })

  it("has proper accessibility attributes", () => {
    render(<NewsletterForm />)

    const input = getEmailInput()
    expect(input).toHaveAttribute("type", "email")
    expect(input).toHaveAttribute("required")

    // Check for screen reader label
    expect(screen.getByLabelText("Email address")).toBeInTheDocument()
  })
})
