import { augmentHeaderNav, sectionHref } from "@lib/util/header-nav"
import type { HeaderNavLink } from "@lib/data/strapi/header"

const baseNav: HeaderNavLink[] = [
  {
    id: "main",
    slug: "shop",
    title: "Shop",
    sections: [
      {
        title: "Beef",
        items: [{ Text: "Ground Beef", Url: "/search?q=ground%20beef" }],
      },
      {
        title: "Offal and Bones",
        items: [{ Text: "Offal & Bones", Url: "/search?q=offal" }],
      },
    ],
    featured: {
      title: "",
      description: "",
      badge: "",
    },
    bottomBar: {
      certifications: [],
      viewAllText: "",
      viewAllUrl: "",
    },
  },
]

describe("header nav augmentation", () => {
  it("adds ways-to-shop and top beef cuts without removing Strapi links", () => {
    const [nav] = augmentHeaderNav(baseNav)
    const waysToShop = nav.sections.find(
      (section) => section.title === "Ways to Shop"
    )
    const beef = nav.sections.find((section) => section.title === "Beef")

    expect(waysToShop?.items.map((item) => item.Text)).toEqual(
      expect.arrayContaining([
        "Shabbos Dinner",
        "Freezer Stock-Up",
        "Grill & Steak Night",
      ])
    )
    expect(waysToShop?.items.map((item) => item.Url)).toEqual([
      "/collections/welcome-pack",
      "/collections/shabbos-dinner-made-easy",
      "/collections/weeknight-low-prep-family",
      "/collections/freezer-basics",
      "/collections/steak-night",
      "/collections/rosh-hashanah-table",
    ])
    expect(new Set(waysToShop?.items.map((item) => item.Url)).size).toBe(
      waysToShop?.items.length
    )
    expect(beef?.items.map((item) => item.Text)).toEqual(
      expect.arrayContaining([
        "Ground Beef",
        "Ribeye",
        "Strip Steak",
        "Filet",
        "Brisket",
      ])
    )
  })

  it("standardizes bones and offal naming", () => {
    const [nav] = augmentHeaderNav(baseNav)
    expect(nav.sections.map((section) => section.title)).toContain(
      "Bones & Offal"
    )
  })

  it("keeps explicit section URLs", () => {
    expect(
      sectionHref({ title: "Ways to Shop", Url: "/collections", items: [] })
    ).toBe("/collections")
  })

  it("provides a resilient fallback nav when Strapi is unavailable", () => {
    const [nav] = augmentHeaderNav([])
    expect(nav.title).toBe("Shop")
    expect(nav.featured.image?.url).toContain("media.strapiapp.com")
  })
})
