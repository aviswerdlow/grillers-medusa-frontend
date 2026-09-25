import { render } from "@testing-library/react"
import type { CollectionPageLoadResult } from "@lib/data/strapi/collection-page"
import CollectionSourceMarker from "@modules/collections/components/source-marker"

const content = {
  kind: "products" as const,
  collection: { Name: "Kosher Beef", Slug: "kosher-beef" },
  products: [],
  tagSEODescription: "",
}

describe("collection source diagnostic marker", () => {
  it("identifies a fresh render with zero fallback age", () => {
    const result: Extract<CollectionPageLoadResult, { status: "ready" }> = {
      status: "ready",
      content,
      stale: false,
    }
    render(<CollectionSourceMarker result={result} />)
    const marker = document.querySelector('meta[name="gp-collection-source"]')
    expect(marker).toHaveAttribute("content", "fresh")
    expect(marker).toHaveAttribute("data-age-seconds", "0")
  })

  it("identifies last-good content and its age", () => {
    const result: Extract<CollectionPageLoadResult, { status: "ready" }> = {
      status: "ready",
      content,
      stale: true,
      lastGoodAgeSeconds: 37,
    }
    render(<CollectionSourceMarker result={result} />)
    const marker = document.querySelector('meta[name="gp-collection-source"]')
    expect(marker).toHaveAttribute("content", "last-good")
    expect(marker).toHaveAttribute("data-age-seconds", "37")
  })
})
