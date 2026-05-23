jest.mock("graphql-request", () => ({
  gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce(
      (acc, part, index) => `${acc}${part}${values[index] ?? ""}`,
      ""
    ),
}))

import { generateProductJsonLd } from "@lib/data/strapi/pdp"

describe("PDP JSON-LD", () => {
  it("emits kosher diet, shipping details, and delivery event schema", () => {
    const schema = generateProductJsonLd(
      {
        id: "prod_1",
        title: "Flank Steak, $19.99/lb",
        description: "Kosher flank steak",
        handle: "flank-steak",
        variants: [
          {
            id: "var_1",
            sku: "SKU-1",
            calculated_price: {
              calculated_amount: 19.99,
              currency_code: "usd",
            },
            inventory_quantity: 4,
            manage_inventory: true,
            allow_backorder: false,
          },
        ],
      },
      {
        Title: "Flank Steak",
        FeaturedImage: { url: "https://example.com/flank.jpg" },
        MedusaProduct: { Description: "Premium kosher flank steak" },
        Metadata: {
          GlutenFree: true,
          OU: true,
          AvgPackWeight: "2 lb",
        },
      },
      "https://www.grillerspride.com",
      "us"
    ) as any

    const product = schema["@graph"][0]
    const deliveryEvent = schema["@graph"][1]

    expect(product["@type"]).toBe("Product")
    expect(product.suitableForDiet).toBe("https://schema.org/KosherDiet")
    expect(product.offers.shippingDetails["@type"]).toBe("OfferShippingDetails")
    expect(product.additionalProperty).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Kashrut", value: "OU" }),
        expect.objectContaining({ name: "Average pack weight", value: "2 lb" }),
      ])
    )
    expect(deliveryEvent["@type"]).toBe("DeliveryEvent")
  })
})
