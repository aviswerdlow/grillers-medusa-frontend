import {
  isStrictSearchQuery,
  rankSearchHits,
  searchQueryForAlgolia,
} from "@lib/algolia/search-relevance"

const product = (Title: string, extra: Record<string, any> = {}) => ({
  objectID: Title,
  Title,
  MedusaProduct: {
    Handle: Title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    Variants: [{ Sku: Title.slice(0, 6) }],
  },
  ...extra,
})

describe("search relevance", () => {
  it("filters fuzzy franks out of flank steak searches", () => {
    const ranked = rankSearchHits(
      [
        product("Beef Franks"),
        product("London Broil Flank Steak"),
        product("Skirt Steak"),
      ],
      "flank steak"
    )

    expect(ranked.map((hit) => hit.Title)).toEqual([
      "London Broil Flank Steak",
      "Skirt Steak",
    ])
  })

  it("keeps cut-specific searches strict", () => {
    expect(isStrictSearchQuery("flank steak")).toBe(true)
    expect(isStrictSearchQuery("kosher beef")).toBe(false)
  })

  it("normalizes plural steak searches before querying Algolia", () => {
    expect(searchQueryForAlgolia("flank steaks")).toBe("flank")
    expect(searchQueryForAlgolia("flank steak")).toBe("flank")
    expect(searchQueryForAlgolia("ribeye steaks")).toBe("ribeye steak")
  })

  it("matches flank steak results when the customer searches plural flank steaks", () => {
    const ranked = rankSearchHits(
      [
        product("Beef Franks"),
        product("American Angus Bone-In Miami Ribs Thin-Cut Flanken"),
        product("London Broil Flank Steak"),
        product("Skirt Steak"),
      ],
      "flank steaks"
    )

    expect(ranked.map((hit) => hit.Title)).toEqual([
      "London Broil Flank Steak",
      "Skirt Steak",
      "American Angus Bone-In Miami Ribs Thin-Cut Flanken",
    ])
  })

  it("ranks exact cut matches above broader matches", () => {
    const ranked = rankSearchHits(
      [
        product("Boneless Beef Steak"),
        product("Whole Brisket"),
        product("Second Cut Brisket"),
      ],
      "brisket"
    )

    expect(ranked.map((hit) => hit.Title)).toEqual([
      "Whole Brisket",
      "Second Cut Brisket",
    ])
  })
})
