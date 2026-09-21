import { overlayRecipeImages } from "@modules/recipes/lib/live-images"

const snapshot = [
  {
    Slug: "roast-chicken",
    Title: "Roast chicken",
    Image: { url: "https://media.example/chicken-remediated.jpg" },
    PrimaryRecipeBucket: "shabbos-table",
  },
  {
    Slug: "brisket",
    Title: "Brisket",
    Image: { url: "https://media.example/brisket-remediated.jpg" },
  },
]
const liveUrl = "https://media.example/gp_kitchen_20260909_chicken.jpg"

describe("overlayRecipeImages", () => {
  it("uses the live URL while preserving snapshot text and taxonomy", () => {
    const cards = overlayRecipeImages(snapshot, new Map([["roast-chicken", liveUrl]]))
    expect(cards[0]).toEqual({ ...snapshot[0], Image: { url: liveUrl } })
  })

  it("keeps the snapshot image when the slug is missing from the live map", () => {
    const cards = overlayRecipeImages(snapshot, new Map([["roast-chicken", liveUrl]]))
    expect(cards[1]).toBe(snapshot[1])
  })

  it("leaves every card unchanged for an empty map", () => {
    const cards = overlayRecipeImages(snapshot, new Map())
    expect(cards).toEqual(snapshot)
    cards.forEach((card, index) => expect(card).toBe(snapshot[index]))
  })

  it("does not mutate the input cards or their nested images", () => {
    const frozen = Object.freeze(
      snapshot.map((card) =>
        Object.freeze({ ...card, Image: Object.freeze({ ...card.Image }) })
      )
    )
    const before = JSON.stringify(frozen)
    const cards = overlayRecipeImages(frozen, new Map([["roast-chicken", liveUrl]]))
    expect(JSON.stringify(frozen)).toBe(before)
    expect(cards[0]).not.toBe(frozen[0])
    expect(cards[0].Image).not.toBe(frozen[0].Image)
  })
})
