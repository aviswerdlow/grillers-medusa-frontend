import { createElement } from "react"
import { render, screen } from "@testing-library/react"
import { getLegalPage } from "@lib/data/strapi/legal"
import { cachedStrapiRequest } from "@lib/strapi"
import { StructuredInfoContent } from "@modules/info/templates/structured-content"

jest.mock("@lib/strapi", () => ({
  __esModule: true,
  cachedStrapiRequest: jest.fn(),
}))

jest.mock("graphql-request", () => ({
  gql: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce(
      (query, part, index) => query + part + String(values[index] ?? ""),
      ""
    ),
}))

function flattenText(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(flattenText).join(" ")
  if (!value || typeof value !== "object") return ""

  return Object.values(value as Record<string, unknown>)
    .map(flattenText)
    .join(" ")
}

describe("SMS terms fallback", () => {
  it("describes only the marketing program and only supported controls", async () => {
    ;(cachedStrapiRequest as jest.Mock).mockRejectedValueOnce(
      new Error("Strapi unavailable")
    )

    const page = await getLegalPage("sms-terms")
    const copy = flattenText(page?.Content)

    expect(copy).toMatch(/recurring SMS marketing program/i)
    expect(copy).toMatch(
      /seasonal specials, product announcements, promotional offers, and holiday sales deadlines/i
    )
    expect(copy).toMatch(/unchecked by default/i)
    expect(copy).toMatch(
      /another clearly labeled Griller's Pride marketing form/i
    )
    expect(copy).toMatch(
      /message frequency varies, up to 6 messages per month/i
    )
    expect(copy).toMatch(/reply STOP/i)
    expect(copy).not.toMatch(/order|delivery|pickup|shipped/i)
    expect(copy).not.toMatch(/manage your text preferences/i)

    render(
      createElement(StructuredInfoContent, {
        content: page?.Content,
      })
    )
    expect(
      screen.getByRole("link", { name: "Privacy Policy" })
    ).toHaveAttribute("href", "/us/page/privacy-policy")
  })
})

describe("order SMS legal fallbacks", () => {
  it("keeps the order-update terms delivery-only and order-specific", async () => {
    ;(cachedStrapiRequest as jest.Mock).mockRejectedValueOnce(
      new Error("Strapi unavailable")
    )

    const page = await getLegalPage("order-sms-terms")
    const copy = flattenText(page?.Content)

    expect(copy).toMatch(/automated, non-promotional/i)
    expect(copy).toMatch(/particular order/i)
    expect(copy).toMatch(/unchecked/i)
    expect(copy).toMatch(/up to 6 messages per order/i)
    expect(copy).toMatch(/required enrollment confirmation/i)
    expect(copy).toMatch(/actual UPS shipping and tracking updates/i)
    expect(copy).toMatch(/Reply STOP/i)
    expect(copy).toMatch(/Reply HELP/i)
    expect(copy).not.toMatch(/seasonal specials|promotional offers/i)

    render(
      createElement(StructuredInfoContent, {
        content: page?.Content,
      })
    )
    expect(
      screen.getByRole("link", {
        name: "Griller's Pride Order Updates Privacy Notice",
      })
    ).toHaveAttribute("href", "/us/page/order-sms-privacy")
  })

  it("keeps mobile consent out of third-party marketing sharing", async () => {
    ;(cachedStrapiRequest as jest.Mock).mockRejectedValueOnce(
      new Error("Strapi unavailable")
    )

    const page = await getLegalPage("order-sms-privacy")
    const copy = flattenText(page?.Content)

    expect(copy).toMatch(/evidence of your consent/i)
    expect(copy).toMatch(/related cart or order identifier/i)
    expect(copy).toMatch(/solely to operate and secure/i)
    expect(copy).toMatch(
      /All the above categories exclude text messaging originator opt-in data and consent/i
    )
    expect(copy).toMatch(/won’t be shared with any third parties/i)
    expect(copy).toMatch(/service providers solely to deliver and support/i)

    render(
      createElement(StructuredInfoContent, {
        content: page?.Content,
      })
    )
    expect(
      screen.getByRole("link", {
        name: "Griller's Pride Order Updates Terms",
      })
    ).toHaveAttribute("href", "/us/page/order-sms-terms")
  })
})
