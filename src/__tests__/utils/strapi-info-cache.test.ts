import { cachedStrapiRequest } from "@lib/strapi"
import { getInfoPage } from "@lib/data/strapi/legal"
import { getCustomerServiceData } from "@lib/data/strapi/customer-service"

jest.mock("graphql-request", () => ({
  gql: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce(
      (query, part, index) => query + part + String(values[index] ?? ""),
      ""
    ),
}))

jest.mock("@lib/strapi", () => ({
  cachedStrapiRequest: jest.fn(),
}))

const request = cachedStrapiRequest as jest.Mock

describe("information page result caching", () => {
  beforeEach(() => request.mockReset())

  it("caches a published information page under the webhook's strapi tag", async () => {
    request.mockResolvedValueOnce({
      legalPages: [
        {
          Slug: "about-us",
          Title: "About us",
          Body: [{ __typename: "ComponentSharedRichText", body: "Our story" }],
        },
      ],
    })

    expect((await getInfoPage("about-us"))?.Title).toBe("About us")
    expect(request).toHaveBeenCalledWith(
      "legal-page",
      expect.any(String),
      { slug: "about-us" },
      { tags: ["strapi"] }
    )
  })

  it("caches customer service under the same publish-invalidated tag", async () => {
    request.mockResolvedValueOnce({
      customerService: { Title: "Customer Service", FAQs: [] },
    })

    expect((await getCustomerServiceData()).Title).toBe("Customer Service")
    expect(request).toHaveBeenCalledWith(
      "customer-service",
      expect.any(String),
      undefined,
      { tags: ["strapi"] }
    )
  })
})
