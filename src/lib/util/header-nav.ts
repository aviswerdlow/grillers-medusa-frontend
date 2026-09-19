import type {
  HeaderNavLink,
  NavBottomBar,
  NavFeatured,
  NavItem,
  NavSection,
} from "@lib/data/strapi/header"
import { generatedSiteImages } from "@lib/content/generated-site-images"
import { WAYS_TO_SHOP_MISSIONS } from "@lib/content/ways-to-shop"

const FALLBACK_FEATURED_IMAGES: Record<string, string> = {
  "butcher-counter": generatedSiteImages.navButcherFeature,
  "deli-counter": generatedSiteImages.navDeliFeature,
  "kitchen-counter": generatedSiteImages.navKitchenFeature,
  provisions: generatedSiteImages.navProvisionsFeature,
}

const APPROVED_NAV_IMAGE_REPLACEMENTS: Record<
  string,
  { previousUrl: string; url: string }
> = {
  "deli-counter": {
    previousUrl:
      "https://helpful-nature-fab70f9c51.media.strapiapp.com/gp_nav_deli_counter_kosher_prepared_18964a40d0.png",
    url: generatedSiteImages.navDeliFeature,
  },
  "kitchen-counter": {
    previousUrl:
      "https://helpful-nature-fab70f9c51.media.strapiapp.com/gp_nav_kitchen_counter_ready_meals_54622d6e0b.png",
    url: generatedSiteImages.navKitchenFeature,
  },
}

const BEEF_TOP_CUTS: NavItem[] = [
  { Text: "Ribeye", Url: "/search?q=ribeye" },
  { Text: "Strip Steak", Url: "/search?q=strip%20steak" },
  { Text: "Filet", Url: "/search?q=filet" },
  { Text: "Brisket", Url: "/search?q=brisket" },
]

const WAYS_TO_SHOP_MENU_MISSION_BY_ID = new Map(
  WAYS_TO_SHOP_MISSIONS.map((mission) => [mission.id, mission])
)

const GIFT_CERTIFICATE_PRODUCT_PATH =
  "/products/gift-certificate-voucher-each-unit-is-the-equivalent-of-one-dollar-please-specify-how-many-units-you-would-like-valid-for-180-calendar-days-from-date-of-issue"

function waysToShopMissionHref(
  id: (typeof WAYS_TO_SHOP_MISSIONS)[number]["id"],
  hrefType: "shopHref" | "cookHref" | "learnHref"
) {
  return WAYS_TO_SHOP_MENU_MISSION_BY_ID.get(id)?.[hrefType] || "/collections"
}

const WAYS_TO_SHOP_NAV_SECTIONS: NavSection[] = [
  {
    title: "Start an Order",
    Url: "/collections",
    items: [
      {
        Text: "First-order favorites",
        Url: waysToShopMissionHref("first-order", "shopHref"),
      },
      { Text: "Bestsellers", Url: "/store" },
      { Text: "Gift certificates", Url: GIFT_CERTIFICATE_PRODUCT_PATH },
      {
        Text: "Build a freezer box",
        Url: waysToShopMissionHref("freezer-stock-up", "shopHref"),
      },
      { Text: "Shop by counter", Url: "/store" },
      { Text: "Need help choosing?", Url: "/contact" },
    ],
  },
  {
    title: "Plan a Meal",
    Url: "/recipes",
    items: [
      {
        Text: "Shabbos dinner",
        Url: waysToShopMissionHref("shabbos", "cookHref"),
      },
      {
        Text: "Weeknight dinner",
        Url: waysToShopMissionHref("weeknight", "cookHref"),
      },
      {
        Text: "Grill night",
        Url: waysToShopMissionHref("grilling", "cookHref"),
      },
      {
        Text: "Holiday table",
        Url: waysToShopMissionHref("holiday-table", "cookHref"),
      },
      { Text: "Recipes by cut", Url: "/recipes#recipes-results" },
    ],
  },
  {
    title: "Order With Confidence",
    Url: "/learn",
    items: [
      { Text: "Kashrut supervision", Url: "/kashruth/supervision" },
      {
        Text: "How much to buy",
        Url: "/learn/guides/how-much-meat-per-person",
      },
      { Text: "Shipping, pickup, and dry ice", Url: "/shipping" },
      {
        Text: "Storage and thawing",
        Url: "/learn/guides/thawing-frozen-kosher-meat",
      },
      { Text: "Talk to a real person", Url: "/contact" },
    ],
  },
]

const WAYS_TO_SHOP_NAV: HeaderNavLink = {
  id: "ways-to-shop",
  slug: "ways-to-shop",
  title: "Ways to Shop",
  sections: WAYS_TO_SHOP_NAV_SECTIONS,
  featured: {
    title: "First order? Start here",
    description:
      "Begin with dependable favorites, then use recipes and buying guides when the meal needs more planning.",
    badge: "Guided shopping",
    image: { url: generatedSiteImages.navButcherFeature },
    url: waysToShopMissionHref("first-order", "shopHref"),
  },
  bottomBar: {
    certifications: [
      { icon: "star", text: "Shop by the meal you are solving" },
      { icon: "award", text: "Recipes stay connected to the cart" },
      { icon: "clock", text: "Kashrut and shipping details before checkout" },
    ],
    viewAllText: "Open guided shopping",
    viewAllUrl: "/collections#collections-results",
  },
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

function isWaysToShopSection(section: NavSection) {
  return slugify(section.title) === "ways-to-shop"
}

function isWaysToShopLink(link: HeaderNavLink) {
  return (
    slugify(link.title) === "ways-to-shop" ||
    slugify(link.slug) === "ways-to-shop"
  )
}

function isPrimaryShopLink(link: HeaderNavLink) {
  if (isWaysToShopLink(link)) return false
  return /shop|butcher|meat|product|all/i.test(`${link.title} ${link.slug}`)
}

function moveWaysToShopBeforePrimaryShop(navLinks: HeaderNavLink[]) {
  const waysIndex = navLinks.findIndex(isWaysToShopLink)
  if (waysIndex < 0) return navLinks

  const primaryIndex = navLinks.findIndex(
    (link, index) => index !== waysIndex && isPrimaryShopLink(link)
  )

  if (primaryIndex < 0 || waysIndex < primaryIndex) {
    return navLinks
  }

  const waysToShop = navLinks[waysIndex]
  const withoutWays = navLinks.filter((_, index) => index !== waysIndex)
  const adjustedPrimaryIndex = withoutWays.findIndex(isPrimaryShopLink)

  if (adjustedPrimaryIndex < 0) {
    return navLinks
  }

  return [
    ...withoutWays.slice(0, adjustedPrimaryIndex),
    waysToShop,
    ...withoutWays.slice(adjustedPrimaryIndex),
  ]
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
  const next = sections
    .filter((section) => !isWaysToShopSection(section))
    .map((section) => {
      const normalized = normalizeSection(section)
      if (slugify(normalized.title) !== "beef") return normalized
      return {
        ...normalized,
        items: mergeItems(normalized.items || [], BEEF_TOP_CUTS),
      }
    })

  if (!sectionExists(next, "Beef")) {
    next.splice(1, 0, {
      title: "Beef",
      Url: "/collections/kosher-beef",
      items: BEEF_TOP_CUTS,
    })
  }

  return next
}

function addWaysToShopSections(sections: NavSection[]) {
  const next = sections.map(normalizeSection)

  for (const required of WAYS_TO_SHOP_NAV_SECTIONS) {
    const index = next.findIndex(
      (section) => slugify(section.title) === slugify(required.title)
    )

    if (index >= 0) {
      next[index] = {
        ...next[index],
        Url: next[index].Url || required.Url,
        items: mergeItems(next[index].items || [], required.items),
      }
    } else {
      next.push(required)
    }
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
  const replacement = APPROVED_NAV_IMAGE_REPLACEMENTS[link.slug]
  const currentImage = featured?.image
  const image = currentImage?.url
    ? replacement && currentImage.url === replacement.previousUrl
      ? { ...currentImage, url: replacement.url }
      : currentImage
    : { url: featuredImageFallback(link) }

  return {
    ...FALLBACK_FEATURED,
    ...(featured || {}),
    image,
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
  const detectedPrimaryIndex = source.findIndex(isPrimaryShopLink)
  const primaryIndex = Math.max(0, detectedPrimaryIndex)

  const augmented = source.map((link, index) => {
    const sections = isWaysToShopLink(link)
      ? addWaysToShopSections(link.sections || [])
      : index === primaryIndex
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

  if (augmented.some(isWaysToShopLink)) {
    return moveWaysToShopBeforePrimaryShop(augmented)
  }

  const insertAt =
    detectedPrimaryIndex >= 0
      ? primaryIndex
      : Math.min(primaryIndex + 1, augmented.length)
  return moveWaysToShopBeforePrimaryShop([
    ...augmented.slice(0, insertAt),
    WAYS_TO_SHOP_NAV,
    ...augmented.slice(insertAt),
  ])
}
