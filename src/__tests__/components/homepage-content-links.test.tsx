import { render, screen } from "@testing-library/react"
import BlogExploreSection from "@modules/home/components/blog-explore"
import HolidayBanner from "@modules/home/components/holiday-banner"
import LearnEntrySection from "@modules/home/components/learn-entry"
import { getLearnArticle } from "@modules/learn/data/butcher-guides"

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ fill, ...props }: { fill?: boolean; [key: string]: unknown }) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...props} />
  ),
}))

describe("homepage content destinations", () => {
  it("links storage and thawing to an existing, substantive guide", () => {
    render(<LearnEntrySection />)

    const link = screen.getByRole("link", { name: /storage & thawing/i })
    const href = link.getAttribute("href")!
    expect(href).toBe("/us/learn/guides/thawing-frozen-kosher-meat")
    const guide = getLearnArticle(href.replace("/us/learn/", ""))
    expect(guide?.title).toBe("How to Thaw Frozen Kosher Meat Safely")
    expect(guide?.sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(["arrival", "methods", "planning"])
    )
  })

  it("links a visible holiday banner to the canonical deadline page", () => {
    render(
      <HolidayBanner
        holiday={{
          name: "Test holiday",
          firstNight: "2099-09-20",
          active: true,
          cutoffs: [],
        }}
      />
    )

    expect(screen.getByRole("link", { name: "See all deadlines" })).toHaveAttribute(
      "href",
      "/us/holidays/order-deadlines"
    )
  })

  it.each([
    { name: "legacy CMS homepage URL", button: { Text: "Get Cooking", Url: "/" } },
    { name: "current CMS text-only contract", button: { Text: "Get Cooking" } },
  ])("opens recipes with the $name", ({ button }) => {
    render(
      <BlogExploreSection
        data={{
          CategoryLabel: "Recipes & Guides",
          BlogExploreTitle: "Explore the Blog & Get Cooking",
          Button: button,
          QuoteDecorImage: { url: "" },
          MainImage: { url: "" },
        }}
      />
    )

    expect(screen.getByRole("link", { name: "Get Cooking" })).toHaveAttribute(
      "href",
      "/us/recipes"
    )
  })
})
