import { augmentHeaderNav, sectionHref } from "@lib/util/header-nav"
import type { HeaderNavLink } from "@lib/data/strapi/header"
import { generatedSiteImages } from "@lib/content/generated-site-images"

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
  it.each([
    [
      "deli-counter",
      "https://helpful-nature-fab70f9c51.media.strapiapp.com/gp_nav_deli_counter_kosher_prepared_18964a40d0.png",
      generatedSiteImages.navDeliFeature,
    ],
    [
      "kitchen-counter",
      "https://helpful-nature-fab70f9c51.media.strapiapp.com/gp_nav_kitchen_counter_ready_meals_54622d6e0b.png",
      generatedSiteImages.navKitchenFeature,
    ],
  ])("replaces only the approved legacy image in %s", (slug, previousUrl, url) => {
    const image = { url: previousUrl, alternativeText: "Existing description" }
    const input = {
      ...baseNav[0],
      slug,
      featured: { ...baseNav[0].featured, image },
    }
    const result = augmentHeaderNav([input]).find((item) => item.slug === slug)

    expect(result?.featured.image).toEqual({ ...image, url })
    expect(input.featured.image.url).toBe(previousUrl)

    const customImage = { url: "https://example.com/editor-selected.jpg" }
    const custom = augmentHeaderNav([
      { ...input, featured: { ...input.featured, image: customImage } },
    ]).find((item) => item.slug === slug)
    expect(custom?.featured.image).toBe(customImage)

    const otherSlot = augmentHeaderNav([{ ...input, slug: "provisions" }]).find(
      (item) => item.slug === "provisions"
    )
    expect(otherSlot?.featured.image).toBe(image)

    const missing = augmentHeaderNav([
      { ...input, featured: { ...input.featured, image: undefined } },
    ]).find((item) => item.slug === slug)
    expect(missing?.featured.image?.url).toBe(url)
  })

  it("promotes ways-to-shop to top-level filtered hub destinations and preserves beef cuts", () => {
    const navLinks = augmentHeaderNav(baseNav)
    const [waysToShop, nav] = navLinks
    const beef = nav.sections.find((section) => section.title === "Beef")

    expect(waysToShop.title).toBe("Ways to Shop")
    expect(waysToShop.sections.map((section) => section.title)).toEqual([
      "Start an Order",
      "Plan a Meal",
      "Order With Confidence",
    ])
    expect(nav.sections.map((section) => section.title)).not.toContain(
      "Ways to Shop"
    )
    expect(
      waysToShop.sections.flatMap((section) =>
        section.items.map((item) => item.Url)
      )
    ).toEqual([
      "/collections?mission=first-order#collections-results",
      "/store",
      "/products/gift-certificate-voucher-each-unit-is-the-equivalent-of-one-dollar-please-specify-how-many-units-you-would-like-valid-for-180-calendar-days-from-date-of-issue",
      "/collections?mission=freezer-stock-up#collections-results",
      "/store",
      "/contact",
      "/recipes?mission=shabbos#recipes-results",
      "/recipes?mission=weeknight#recipes-results",
      "/recipes?mission=grilling#recipes-results",
      "/recipes?mission=holiday-table#recipes-results",
      "/recipes#recipes-results",
      "/kashruth/supervision",
      "/learn/guides/how-much-meat-per-person",
      "/shipping",
      "/learn/guides/thawing-frozen-kosher-meat",
      "/contact",
    ])
    expect(
      waysToShop.sections.flatMap((section) =>
        section.items.map((item) => item.Text)
      )
    ).toEqual([
      "First-order favorites",
      "Bestsellers",
      "Gift certificates",
      "Build a freezer box",
      "Shop by counter",
      "Need help choosing?",
      "Shabbos dinner",
      "Weeknight dinner",
      "Grill night",
      "Holiday table",
      "Recipes by cut",
      "Kashrut supervision",
      "How much to buy",
      "Shipping, pickup, and dry ice",
      "Storage and thawing",
      "Talk to a real person",
    ])
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
    const nav = augmentHeaderNav(baseNav).find((item) => item.title === "Shop")
    expect(nav?.sections.map((section) => section.title)).toContain(
      "Bones & Offal"
    )
  })

  it("keeps explicit section URLs", () => {
    expect(
      sectionHref({ title: "Ways to Shop", Url: "/collections", items: [] })
    ).toBe("/collections")
  })

  it("provides a resilient fallback nav when Strapi is unavailable", () => {
    const navLinks = augmentHeaderNav([])
    expect(navLinks.map((nav) => nav.title)).toEqual(["Ways to Shop", "Shop"])
    expect(navLinks[1].featured.image?.url).toContain("media.strapiapp.com")
  })

  it("moves explicit ways-to-shop before the primary butcher menu", () => {
    const explicitWaysToShop: HeaderNavLink = {
      ...baseNav[0],
      id: "ways-to-shop",
      slug: "ways-to-shop",
      title: "Ways to Shop",
      sections: [],
    }

    const navLinks = augmentHeaderNav([
      {
        ...baseNav[0],
        slug: "butcher-counter",
        title: "Butcher Counter",
      },
      explicitWaysToShop,
    ])

    expect(navLinks.map((nav) => nav.title)).toEqual([
      "Ways to Shop",
      "Butcher Counter",
    ])
    expect(
      navLinks[0].sections
        .flatMap((section) => section.items)
        .map((item) => item.Text)
    ).toContain("Gift certificates")
  })
})
