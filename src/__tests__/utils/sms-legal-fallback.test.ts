import { getLegalPage } from "@lib/data/strapi/legal"
import strapiClient from "@lib/strapi"

jest.mock("@lib/strapi", () => ({
  __esModule: true,
  default: {
    request: jest.fn(),
  },
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
    ;(strapiClient.request as jest.Mock).mockRejectedValueOnce(
      new Error("Strapi unavailable")
    )

    const page = await getLegalPage("sms-terms")
    const copy = flattenText(page?.Content)

    expect(copy).toMatch(/recurring SMS marketing program/i)
    expect(copy).toMatch(/unchecked by default/i)
    expect(copy).toMatch(/reply STOP/i)
    expect(copy).not.toMatch(/order|delivery|pickup|shipped/i)
    expect(copy).not.toMatch(/manage your text preferences/i)
  })
})
