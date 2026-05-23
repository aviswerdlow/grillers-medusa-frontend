import { buildAgenticCommerceProductFeed } from "@lib/agentic-commerce/feed"

describe("buildAgenticCommerceProductFeed", () => {
  it("emits one variant-level item per product variant", () => {
    const feed = buildAgenticCommerceProductFeed(
      [
        {
          id: "prod_123",
          title: "Kosher Ribeye Steak, Uncooked, Vacuum Pack $29.99/lb.",
          description: "<p>Hand trimmed premium kosher steak.</p>",
          handle: "kosher-ribeye-steak",
          thumbnail: "/ribeye.jpg",
          images: [{ url: "https://cdn.example.com/side.jpg" }],
          tags: [{ value: "Beef" }],
          categories: [
            {
              name: "Steaks",
              parent_category: { name: "Beef" },
            },
          ],
          metadata: {
            OU: true,
            GlutenFree: "true",
          },
          variants: [
            {
              id: "variant_1",
              sku: "RB-1",
              title: "2 pack",
              calculated_price: {
                calculated_amount: 42.5,
                currency_code: "usd",
              },
              manage_inventory: true,
              allow_backorder: false,
              inventory_quantity: 4,
            },
            {
              id: "variant_2",
              sku: "RB-2",
              title: "4 pack",
              calculated_price: {
                calculated_amount: 80,
                currency_code: "usd",
              },
              manage_inventory: true,
              allow_backorder: false,
              inventory_quantity: 0,
            },
          ],
        } as any,
      ],
      {
        baseUrl: "https://example.com/",
        countryCode: "US",
        generatedAt: "2026-05-23T12:00:00.000Z",
      }
    )

    expect(feed.schema_version).toBe(
      "grillers-pride.agentic-commerce-products.v1"
    )
    expect(feed.merchant.default_country_code).toBe("us")
    expect(feed.integration.universal_cart_cookie).toBe("_medusa_cart_id")
    expect(feed.products).toHaveLength(2)

    expect(feed.products[0]).toMatchObject({
      item_id: "variant_1",
      product_id: "prod_123",
      variant_id: "variant_1",
      sku: "RB-1",
      mpn: "RB-1",
      title: "Kosher Ribeye Steak - 2 pack",
      description: "Hand trimmed premium kosher steak.",
      url: "https://example.com/us/products/kosher-ribeye-steak",
      image_url: "https://example.com/ribeye.jpg",
      additional_image_urls: ["https://cdn.example.com/side.jpg"],
      availability: "in_stock",
      price: {
        amount: 42.5,
        currency: "USD",
      },
      categories: ["Beef", "Steaks"],
      tags: ["Beef"],
      kosher: {
        merchant: "Grillers Pride",
        claims: ["kosher", "OU", "GlutenFree"],
      },
    })
    expect(feed.products[1].availability).toBe("out_of_stock")
  })

  it("keeps required text fields present for products without variants", () => {
    const feed = buildAgenticCommerceProductFeed(
      [
        {
          id: "prod_without_variants",
          title: "",
          description: "",
          handle: "",
          variants: [],
        } as any,
      ],
      {
        baseUrl: "https://example.com",
        countryCode: "us",
        generatedAt: "2026-05-23T12:00:00.000Z",
      }
    )

    expect(feed.products[0].item_id).toBe("prod_without_variants")
    expect(feed.products[0].title).toBe("Grillers Pride product")
    expect(feed.products[0].description).toContain("Grillers Pride product")
    expect(feed.products[0].url).toBe(
      "https://example.com/us/products/prod_without_variants"
    )
    expect(feed.products[0].availability).toBe("out_of_stock")
    expect(feed.products[0].price).toEqual({
      amount: null,
      currency: "USD",
    })
  })

  it("does not duplicate legacy product titles from matching variant titles", () => {
    const feed = buildAgenticCommerceProductFeed(
      [
        {
          id: "prod_ground_beef",
          title:
            "1 lb. Pack Ground Beef Extra Lean 90/10, Uncooked, Vacuum Pack",
          handle: "ground-beef-extra-lean",
          variants: [
            {
              id: "variant_ground_beef",
              title:
                "1 lb. Pack Ground Beef Extra Lean 90/10, Uncooked, Vacuum Pack",
              calculated_price: {
                calculated_amount: 11.49,
                currency_code: "usd",
              },
            },
          ],
        } as any,
      ],
      {
        baseUrl: "https://example.com",
        countryCode: "us",
        generatedAt: "2026-05-23T12:00:00.000Z",
      }
    )

    expect(feed.products[0].title).toBe(
      "1 lb. Pack Ground Beef Extra Lean 90/10"
    )
  })
})
