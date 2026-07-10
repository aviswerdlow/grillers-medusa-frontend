import React from "react"
import { render, screen } from "@testing-library/react"

import ProductFacts from "@modules/products/components/product-facts"
import { buildProductFactHighlights } from "@modules/products/components/product-facts"

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
  it("builds compact visual highlights from product metadata", () => {
    const highlights = buildProductFactHighlights({
      strapiProductData: productData({
        Metadata: {
          AvgPackSize: "2 x 8 oz",
          OU: true,
          KosherForPassover: true,
          Angus: true,
          GlutenFree: true,
          MSG: true,
          Uncooked: true,
        },
        Categorization: {
          ProductTags: [{ Name: "L3: Flank Steak" }],
          ProductCollections: [],
        },
      }),
    })

    expect(highlights).toEqual(
      expect.arrayContaining([
        {
          key: "AvgPackSize",
          label: "Pack size",
          value: "2 x 8 oz",
          iconSrc: "/images/pdp/attribute-icons/avg-pack-size.png",
        },
        {
          key: "KosherForPassover",
          label: "Kosher for Passover",
          iconSrc: "/images/pdp/attribute-icons/kosher-for-passover.png",
        },
        {
          key: "OU",
          label: "OU",
          iconSrc: "/images/pdp/attribute-icons/hechsher-ou.png",
        },
        {
          key: "GlutenFree",
          label: "Gluten free",
          iconSrc: "/images/pdp/attribute-icons/gluten-free.png",
        },
        {
          key: "MSG",
          label: "No MSG",
          iconSrc: "/images/pdp/attribute-icons/no-msg.png",
        },
        {
          key: "Uncooked",
          label: "Raw",
          iconSrc: "/images/pdp/attribute-icons/raw.png",
        },
        {
          key: "Angus",
          label: "American Angus",
          iconSrc: "/images/pdp/attribute-icons/american-angus.png",
        },
      ])
    )
  })

  it("does not render redundant item detail dropdowns", () => {
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

    expect(screen.getByText("At a glance")).toBeInTheDocument()
    expect(document.querySelector("details")).not.toBeInTheDocument()
    expect(screen.queryByText("Item")).not.toBeInTheDocument()
    expect(screen.queryByText("Pack")).not.toBeInTheDocument()
    expect(screen.queryByText("Kashruth and sourcing")).not.toBeInTheDocument()
  })

  it("adds the five exact legacy Hechshers without removing other kashruth attributes", () => {
    const highlights = buildProductFactHighlights({
      strapiProductData: productData({
        Metadata: {
          OU: true,
          CHK: true,
          ChassidishRecognized: true,
          ChassidishShchita: true,
          AgriStarLamedKLubavitchOrRabbiWeissmandl: true,
          AgriStarLamedKLubavitch: true,
        },
      }),
    })

    expect(highlights.map((fact) => fact.label)).toEqual(
      expect.arrayContaining([
        "OU",
        "CHK Certification",
        "Chassidish Recognized",
        "Chassidish shchita",
        "AgriStar Lamed-K · Lubavich or Rabbi Weismandl",
        "AgriStar Lamed-K · Lubavich",
      ])
    )
  })

  it("keeps description and kashruth policy as supporting content", () => {
    render(
      React.createElement(ProductFacts, {
        strapiProductData: productData({
          Metadata: {
            OU: true,
          },
        }),
        description: "Sear hard, then braise covered until tender.",
        countryCode: "us",
      })
    )

    expect(screen.getByText("Description")).toBeInTheDocument()
    expect(screen.queryByText("Catalog hechsher key:")).not.toBeInTheDocument()
    expect(screen.getByText("View our kashruth policy")).toHaveAttribute(
      "href",
      "/us/kashruth/hechsherim"
    )
  })
})
