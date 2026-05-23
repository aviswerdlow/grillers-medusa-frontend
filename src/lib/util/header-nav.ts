import type {
  HeaderNavLink,
  NavBottomBar,
  NavFeatured,
  NavItem,
  NavSection,
} from "@lib/data/strapi/header"
import { generatedSiteImages } from "@lib/content/generated-site-images"

const FALLBACK_FEATURED_IMAGES: Record<string, string> = {
  "butcher-counter": generatedSiteImages.navButcherFeature,
  "deli-counter": generatedSiteImages.navDeliFeature,
  "kitchen-counter": generatedSiteImages.navKitchenFeature,
  provisions: generatedSiteImages.navProvisionsFeature,
}

const BEEF_TOP_CUTS: NavItem[] = [
  { Text: "Ribeye", Url: "/search?q=ribeye" },
  { Text: "Strip Steak", Url: "/search?q=strip%20steak" },
  { Text: "Filet", Url: "/search?q=filet" },
  { Text: "Brisket", Url: "/search?q=brisket" },
]

const WAYS_TO_SHOP: NavSection = {
  title: "Ways to Shop",
  Url: "/collections",
  items: [
    { Text: "First Order Starter", Url: "/collections/welcome-pack" },
    { Text: "Shabbos Dinner", Url: "/collections/shabbos-dinner-made-easy" },
    {
      Text: "Weeknight Dinners",
      Url: "/collections/weeknight-low-prep-family",
    },
    { Text: "Freezer Stock-Up", Url: "/collections/freezer-basics" },
    { Text: "Grill & Steak Night", Url: "/collections/steak-night" },
    { Text: "Holiday Table", Url: "/collections/rosh-hashanah-table" },
  ],
}

const FALLBACK_BOTTOM_BAR: NavBottomBar = {
  certifications: [
    { icon: "award", text: "Item-level hechsher details" },
    { icon: "clock", text: "Cold-chain checkout lanes" },
    { icon: "star", text: "Premium kosher cuts" },
  ],
  viewAllText: "View all products",
  viewAllUrl: "/store",
}

const FALLBACK_FEATURED: NavFeatured = {
  title: "Holiday and freezer-ready bundles",
  description:
    "Build a full kosher table with curated bundles, bulk packages, and premium beef cuts.",
  badge: "Seasonal picks",
  image: { url: generatedSiteImages.navButcherFeature },
  url: "/collections/rosh-hashanah-table",
}

const FALLBACK_NAV: HeaderNavLink[] = [
  {
    id: "shop",
    slug: "shop",
    title: "Shop",
    sections: [
      WAYS_TO_SHOP,
      {
        title: "Beef",
        Url: "/collections/kosher-beef",
        items: BEEF_TOP_CUTS,
      },
      {
        title: "Proteins",
        Url: "/store",
        items: [
          { Text: "Chicken", Url: "/search?q=chicken" },
          { Text: "Lamb", Url: "/search?q=lamb" },
          { Text: "Rose Veal", Url: "/search?q=veal" },
          { Text: "Bones & Offal", Url: "/search?q=bones%20offal" },
        ],
      },
    ],
    featured: FALLBACK_FEATURED,
    bottomBar: FALLBACK_BOTTOM_BAR,
  },
]

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function normalizeLabel(value: string) {
  const compact = slugify(value)
  if (
    compact === "offal-and-bones" ||
    compact === "offal-bones" ||
    compact === "bones-and-offal" ||
    compact === "bones-offal"
  ) {
    return "Bones & Offal"
  }
  return value
}

function itemExists(items: NavItem[], text: string) {
  const target = slugify(text)
  return items.some((item) => slugify(item.Text) === target)
}

function sectionExists(sections: NavSection[], title: string) {
  const target = slugify(title)
  return sections.some((section) => slugify(section.title) === target)
}

function mergeItems(existing: NavItem[], required: NavItem[]) {
  const merged = [...existing]
  for (const item of required) {
    if (!itemExists(merged, item.Text)) {
      merged.push(item)
    }
  }
  return merged
}

function normalizeSection(section: NavSection): NavSection {
  return {
    ...section,
    title: normalizeLabel(section.title),
    items: (section.items || []).map((item) => ({
      ...item,
      Text: normalizeLabel(item.Text),
    })),
  }
}

function addPrimaryShopSections(sections: NavSection[]) {
  const next = sections.map((section) => {
    const normalized = normalizeSection(section)
    if (slugify(normalized.title) !== "beef") return normalized
    return {
      ...normalized,
      items: mergeItems(normalized.items || [], BEEF_TOP_CUTS),
    }
  })

  if (!sectionExists(next, "Ways to Shop")) {
    next.unshift(WAYS_TO_SHOP)
  }

  if (!sectionExists(next, "Beef")) {
    next.splice(1, 0, {
      title: "Beef",
      Url: "/collections/kosher-beef",
      items: BEEF_TOP_CUTS,
    })
  }

  return next
}

function featuredImageFallback(link: HeaderNavLink) {
  return (
    FALLBACK_FEATURED_IMAGES[link.slug] ||
    FALLBACK_FEATURED_IMAGES[slugify(link.title)] ||
    generatedSiteImages.navButcherFeature
  )
}

function featuredWithFallback(
  featured: NavFeatured | null | undefined,
  link: HeaderNavLink
) {
  return {
    ...FALLBACK_FEATURED,
    ...(featured || {}),
    image: featured?.image?.url
      ? featured.image
      : { url: featuredImageFallback(link) },
    url: featured?.url || FALLBACK_FEATURED.url,
  }
}

function bottomBarWithFallback(bottomBar: NavBottomBar | null | undefined) {
  if (!bottomBar) return FALLBACK_BOTTOM_BAR
  return {
    ...FALLBACK_BOTTOM_BAR,
    ...bottomBar,
    certifications: bottomBar.certifications?.length
      ? bottomBar.certifications
      : FALLBACK_BOTTOM_BAR.certifications,
  }
}

export function sectionHref(section: NavSection) {
  if (section.Url) return section.Url
  return `/collections/kosher-${slugify(section.title)}`
}

export function augmentHeaderNav(navLinks: HeaderNavLink[]) {
  const source = navLinks.length > 0 ? navLinks : FALLBACK_NAV
  const primaryIndex = Math.max(
    0,
    source.findIndex((link) =>
      /shop|butcher|meat|product|all/i.test(`${link.title} ${link.slug}`)
    )
  )

  return source.map((link, index) => {
    const sections =
      index === primaryIndex
        ? addPrimaryShopSections(link.sections || [])
        : (link.sections || []).map(normalizeSection)

    return {
      ...link,
      title: normalizeLabel(link.title),
      sections,
      featured: featuredWithFallback(link.featured, link),
      bottomBar: bottomBarWithFallback(link.bottomBar),
    }
  })
}
