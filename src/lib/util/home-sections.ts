// Fallback homepage sections, used when the Strapi `home` query is
// unavailable (slow / errored / cache just busted by a publish) so the
// homepage never renders a blank body.
//
// Why this exists: the `(main)` route is force-dynamic, so the home query
// runs live on every request with a 3s timeout + `.catch(() => null)`. Every
// A Strapi home publish purges the home-model cache; the next request must
// re-fetch live, and a slow/errored fetch produced a null `Sections` -> the
// page rendered an empty <section> (JSON-LD survived).
// That looked like "homepage blank on normal load, fine after hard reload".
// Failing open here removes the blank state entirely.

// Best-effort fallback Bestsellers handles, rendered ONLY when the Strapi home
// query is unavailable. Deliberately weighted toward year-round specialty and
// staple-cut items (not season-only SKUs) so the rail stays populated outside
// Passover. Keyed by handle (more stable than the integer id, which churns on
// republish). A handle that stops resolving is simply skipped by
// getProductsByHandles, so the rail degrades to empty rather than breaking the
// page — but review this list periodically as the catalog changes.
export const FALLBACK_BESTSELLER_HANDLES: string[] = [
  "kosherboeries-authentic-south-african-beef-grilling-sausages-no-nitrates-classic-6-pcs-24-oz",
  "classic-roasted-smoked-salmon-1-lb-in-house-smoked-and-vacuum-packed-not-kosher-for-passover-2249lb",
  "beef-biltong-slices-regular-south-african-beef-jerky-3-oz-not-kosher-for-passover",
  "london-broil-signature-cut-boneless-100-grass-fed-all-natural-no-hormones-no-antibiotics-175-lb-uncooked-kosher-for-passover-1899lb",
  "prime-ribeye-roast-boneless-100-grass-fed-all-natural-no-hormones-no-antibiotics-35-lb-uncooked-kosher-for-passover-2699lb",
  "kishke-16-oz-not-pareve-uncooked-not-kosher-for-passover",
]

export type HomeSection = { __typename: string; [key: string]: unknown }

// Minimal but on-brand homepage when the Strapi home query is unavailable.
// The Hero component already falls back to a generated background image, a
// hardcoded "Premium Kosher Meat, Shipped Frozen to Your Door" eyebrow, and a
// state-conditional CTA, so it only needs a title here. Bestsellers needs
// handles. The page's existing cascade (curated collections, delivery
// promise, Standards + Learn story sections) fills in the rest because none
// of those depend on the home query.
export const FALLBACK_HOME_SECTIONS: HomeSection[] = [
  {
    __typename: "ComponentHomeHero",
    HeroTitle: "Quality is the Promise. Kosher is the Standard.",
  },
  {
    __typename: "ComponentHomeBestsellers",
    BestsellersTitle: "Shop Bestsellers",
    Products: FALLBACK_BESTSELLER_HANDLES.map((Slug, index) => ({
      id: index,
      Slug,
    })),
  },
]

type HomeQueryData = { home?: { Sections?: unknown } } | null | undefined

// Returns the CMS sections when Strapi gave us a non-empty list, otherwise the
// fallback set. `usedFallback` lets the caller log when the homepage degraded
// so we can see how often it happens in production logs.
export function resolveHomeSections(strapiData: HomeQueryData): {
  sections: HomeSection[]
  usedFallback: boolean
} {
  const sections = strapiData?.home?.Sections
  if (Array.isArray(sections) && sections.length > 0) {
    return { sections: sections as HomeSection[], usedFallback: false }
  }
  return { sections: FALLBACK_HOME_SECTIONS, usedFallback: true }
}
