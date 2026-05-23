import React from "react"
import { render, screen } from "@testing-library/react"

import ProductFacts from "@modules/products/components/product-facts"
import { buildProductFactGroups } from "@modules/products/components/product-facts"

const productData = (overrides: Record<string, any> = {}) =>
  ({
    Title: "Flank Steak",
    Metadata: {},
    Categorization: {
      ProductTags: [],
      ProductCollections: [],
    },
    MedusaProduct: {
      ProductId: "prod_1",
      Title: "Flank Steak",
      Description: "",
      Handle: "flank-steak",
    },
    ...overrides,
  } as any)

describe("product facts", () => {
  it("renders only rows backed by Strapi fields", () => {
    const groups = buildProductFactGroups({
      strapiProductData: productData({
        Metadata: {
          AvgPackSize: "2 x 8 oz",
          PiecesPerPack: 2,
          OU: true,
          Angus: true,
        },
        Categorization: {
          ProductTags: [{ Name: "L3: Flank Steak" }],
          ProductCollections: [{ Name: "Kosher Beef", Slug: "kosher-beef" }],
        },
      }),
    })

    expect(groups.map((group) => group.title)).toEqual([
      "Item",
      "Pack",
      "Kashruth and sourcing",
    ])
    expect(groups.flatMap((group) => group.rows)).toEqual(
      expect.arrayContaining([
        { label: "Cut family", value: "Flank Steak" },
        { label: "Pack size", value: "2 x 8 oz" },
        { label: "Pieces per pack", value: "2" },
        { label: "Hechsher", value: "OU" },
        { label: "Sourcing flags", value: "American Angus" },
      ])
    )
  })

  it("does not add generic kashruth or availability fallback facts", () => {
    const groups = buildProductFactGroups({
      strapiProductData: productData(),
    })
    const rows = groups.flatMap((group) => group.rows)

    expect(rows).not.toContainEqual({
      label: "Hechsher",
      value: "Certified kosher",
    })
    expect(rows.some((row) => row.label === "Availability")).toBe(false)
  })

  it("keeps secondary details collapsed by default", () => {
    render(
      React.createElement(ProductFacts, {
        strapiProductData: productData({
          Metadata: {
            AvgPackSize: "2 x 8 oz",
            OU: true,
          },
          Categorization: {
            ProductTags: [{ Name: "L3: Flank Steak" }],
            ProductCollections: [],
          },
        }),
      })
    )

    expect(screen.getByText("Product details")).toBeInTheDocument()
    document.querySelectorAll("details").forEach((element) => {
      expect(element).not.toHaveAttribute("open")
    })
  })
})
