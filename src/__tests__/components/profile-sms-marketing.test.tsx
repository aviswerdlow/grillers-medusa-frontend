import { fireEvent, render, screen } from "@testing-library/react"

import ProfileSmsMarketing from "@modules/account/components/profile-sms-marketing"
import { buildSmsMarketingConsentMetadata } from "@lib/util/sms-consent"

let mockActionState: any = null
const mockFormAction = jest.fn()
jest.mock("react", () => {
  const actual = jest.requireActual("react")
  return {
    ...actual,
    useActionState: () => [mockActionState, mockFormAction],
  }
})

jest.mock("@lib/data/sms-marketing", () => ({
  submitSmsMarketingOptIn: jest.fn(),
}))

const refresh = jest.fn()
jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  useParams: () => ({ countryCode: "us" }),
}))

function customer(overrides: Record<string, unknown> = {}) {
  return {
    id: "cus_profile",
    email: "customer@example.com",
    first_name: "Customer",
    last_name: "Example",
    phone: "4045550100",
    metadata: {},
    ...overrides,
  } as any
}

function marketingStatus(
  status: "subscribed" | "unsubscribed" | "not_subscribed" = "not_subscribed",
  phone: string | null = null
) {
  return {
    status,
    phone,
    consented_at:
      status === "subscribed" ? "2026-07-14T12:00:00.000Z" : null,
    opted_out_at:
      status === "unsubscribed" ? "2026-07-14T13:00:00.000Z" : null,
  } as const
}

describe("signed-in SMS marketing opt-in", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => "synthetic-contact-request-01" })
    jest.clearAllMocks()
    mockActionState = null
  })

  it("requires a fresh unchecked customer action and permits editing the phone", () => {
    render(
      <ProfileSmsMarketing
        customer={customer()}
        marketingStatus={marketingStatus()}
      />
    )

    const checkbox = screen.getByRole("checkbox", {
      name: /send me Griller's Pride deals and promotional updates/i,
    })
    expect(checkbox).not.toBeChecked()
    expect(checkbox).toBeRequired()

    const phone = screen.getByTestId("sms-marketing-phone-input")
    expect(phone).toHaveValue("(404) 555-0100")
    expect(phone).not.toHaveAttribute("readonly")
    expect(screen.getByRole("link", { name: "SMS Terms" })).toHaveAttribute(
      "href",
      "/us/page/sms-terms"
    )
    expect(
      screen.getByRole("link", { name: "Privacy Policy" })
    ).toHaveAttribute("href", "/us/page/privacy-policy")
    expect(screen.getByTestId("sms-marketing-status")).toHaveTextContent(
      "Not subscribed"
    )
  })

  it("uses authoritative communications status instead of stale customer metadata", () => {
    const metadata = buildSmsMarketingConsentMetadata({
      phone: "4045550100",
      source: "account_profile",
      consentedAt: "2026-07-14T12:00:00.000Z",
    })
    const { rerender } = render(
      <ProfileSmsMarketing
        customer={customer({ metadata })}
        marketingStatus={marketingStatus("unsubscribed", "4045550100")}
      />
    )

    expect(screen.getByTestId("sms-marketing-status")).toHaveTextContent(
      "Unsubscribed"
    )
    expect(screen.getByText(/marketing texts are stopped for/i)).toHaveTextContent(
      "(404) 555-0100"
    )
    expect(
      screen.getByRole("checkbox", {
        name: /send me Griller's Pride deals and promotional updates/i,
      })
    ).not.toBeChecked()

    rerender(
      <ProfileSmsMarketing
        customer={customer({ metadata: {} })}
        marketingStatus={marketingStatus("subscribed", "4045550100")}
      />
    )
    expect(screen.getByTestId("sms-marketing-status")).toHaveTextContent(
      "Subscribed"
    )
  })

  it("fails closed visually when authoritative status is unavailable", () => {
    render(
      <ProfileSmsMarketing customer={customer()} marketingStatus={null} />
    )

    expect(screen.getByTestId("sms-marketing-status")).toHaveTextContent(
      "Status unavailable"
    )
  })

  it("resets and refreshes after every consecutive successful consent receipt", () => {
    const view = render(
      <ProfileSmsMarketing
        customer={customer()}
        marketingStatus={marketingStatus()}
      />
    )
    const checkbox = screen.getByRole("checkbox", {
      name: /send me Griller's Pride deals and promotional updates/i,
    })

    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    mockActionState = {
      success: true,
      error: null,
      phone: "4045550100",
      receipt: "receipt-one",
    }
    view.rerender(
      <ProfileSmsMarketing
        customer={customer()}
        marketingStatus={marketingStatus("subscribed", "4045550100")}
      />
    )
    expect(checkbox).not.toBeChecked()
    expect(refresh).toHaveBeenCalledTimes(1)

    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
    mockActionState = {
      success: true,
      error: null,
      phone: "4045550100",
      receipt: "receipt-two",
    }
    view.rerender(
      <ProfileSmsMarketing
        customer={customer()}
        marketingStatus={marketingStatus("subscribed", "4045550100")}
      />
    )
    expect(checkbox).not.toBeChecked()
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
