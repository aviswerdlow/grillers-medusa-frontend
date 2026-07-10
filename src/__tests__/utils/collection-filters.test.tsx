import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"

import CollectionFilters, {
  buildFacetGroups,
  filterProducts,
  getEmptyFilters,
} from "@modules/collections/components/collection-filters"

function product(id: string, metadata: Record<string, any> = {}) {
  return {
    Title: id,
    Metadata: metadata,
    Categorization: { ProductTags: [], ProductCollections: [] },
    MedusaProduct: {
      ProductId: id,
      Variants: [{ Price: { CalculatedPriceNumber: 10 } }],
    },
  } as any
}

describe("collection hechsher filters", () => {
  it("builds hechsher options from a table and hides zero-count options", () => {
    const groups = buildFacetGroups([
      product("multi", { OU: true, CHK: true }),
      product("none"),
    ])

    const hechsher = groups.find((group) => group.id === "hechsher")

    expect(hechsher?.label).toBe("Hechsher")
    expect(hechsher?.label).not.toContain("Shchita")
    expect(hechsher?.includeAnyOption).toBe(true)
    expect(hechsher?.options.map((option) => option.field)).toEqual([
      "CHK",
      "OU",
    ])
    expect(hechsher?.options.map((option) => option.count)).toEqual([1, 1])
  })

  it("keeps the hechsher group visible when one hechsher exists", () => {
    const groups = buildFacetGroups([product("ou", { OU: true }), product("none")])

    expect(groups.find((group) => group.id === "hechsher")?.options).toEqual([
      expect.objectContaining({ field: "OU", count: 1 }),
    ])
  })

  it("supports products with multiple hechshers when filtering", () => {
    const products = [
      product("multi", { OU: true, CHK: true }),
      product("star-k", { StarK: true }),
      product("none"),
    ]

    expect(
      filterProducts(products, {
        ...getEmptyFilters(),
        metadata: { hechsher: ["OU", "StarK"] },
      }).map((item) => item.Title)
    ).toEqual(["multi", "star-k"])
  })

  it("renders an Any option that clears selected hechsher filters", () => {
    const onFilterChange = jest.fn()

    render(
      <CollectionFilters
        products={[product("ou", { OU: true }), product("chk", { CHK: true })]}
        activeFilters={{
          ...getEmptyFilters(),
          metadata: { hechsher: ["OU"] },
        }}
        onFilterChange={onFilterChange}
      />
    )

    expect(screen.getByText("Hechsher")).toBeInTheDocument()
    expect(screen.queryByText("Hechsher / Shchita")).not.toBeInTheDocument()

    const anyInput = screen
      .getByText("Any")
      .closest("label")
      ?.querySelector("input")

    expect(anyInput).toBeTruthy()
    fireEvent.click(anyInput!)

    expect(onFilterChange).toHaveBeenCalledWith({
      ...getEmptyFilters(),
      metadata: {},
    })
  })
})
