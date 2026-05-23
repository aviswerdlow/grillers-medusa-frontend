export type StandardsRow = {
  area: string
  grillers: string
  ordinary: string
}

export type CompetitorComparisonRow = {
  area: string
  grillers: string
  growAndBehold: string
  customerTakeaway: string
}

export const standardsComparisonRows: StandardsRow[] = [
  {
    area: "Sourcing",
    grillers:
      "Item pages surface source, grade, pack size, and clean-label flags when the catalog has them.",
    ordinary:
      "Many listings stop at a cut name and leave source, pack math, or handling details to fine print.",
  },
  {
    area: "Kashrut",
    grillers:
      "PDP badges show item-level hechsher signals such as OU, Star-K, CHK, CRC, and kosher-for-Passover where available.",
    ordinary:
      "Kosher status is often presented as a blanket promise without enough item-level supervision detail.",
  },
  {
    area: "Cold chain",
    grillers:
      "Frozen shipping is framed as a cold-chain workflow: packed frozen, insulated, dry ice calibrated, and lane-confirmed at checkout.",
    ordinary:
      "Delivery promises are frequently generic and do not explain how frozen meat stays frozen in transit.",
  },
  {
    area: "Cut variety",
    grillers:
      "Navigation and search emphasize butcher cuts, Shabbos tables, holiday collections, freezer stock-up, grilling, and bulk-friendly packs.",
    ordinary:
      "Navigation commonly groups by broad protein only, forcing customers to hunt for cuts or occasions.",
  },
]

export const growAndBeholdComparisonRows: CompetitorComparisonRow[] = [
  {
    area: "Best-fit cart",
    grillers:
      "A practical kosher butcher cart for Shabbos, weeknight dinners, freezer stocking, grilling, premium cuts, South African specialties, and holiday tables.",
    growAndBehold:
      "A pasture-raised kosher meat program for shoppers who want source-forward meat and poultry with a strong farm/provenance story.",
    customerTakeaway:
      "Use the comparison around the meal plan: GP is strongest when the cart needs to become a table or freezer plan; G&B is strongest when the sourcing model is the lead requirement.",
  },
  {
    area: "Ways to shop",
    grillers:
      "A la carte PDPs plus live curated collection pages such as Welcome Pack, Shabbos Dinner Made Easy, Weeknight Low Prep Family, Freezer Basics, Steak Night, and Rosh Hashanah Table.",
    growAndBehold:
      "Primarily a la carte product shopping supported by education about farms, husbandry, and delivery options.",
    customerTakeaway:
      "If you want a guided basket, start with GP collections. If you already know the exact cuts and care most about provenance, compare G&B product pages directly.",
  },
  {
    area: "Kashruth detail",
    grillers:
      "GP product pages read Strapi item metadata for hechsher flags including OU, Star-K, CHK, CRC, Rabbi Weissmandl, Rabbi Teitelbaum, Lubavitch, Chassidish shchita, and Kosher for Passover.",
    growAndBehold:
      "G&B is a kosher meat retailer with its own supervision and product labeling. Customers should verify the hechsher shown on the specific G&B item before buying.",
    customerTakeaway:
      "For stricter household standards, compare item pages, not brand promises. The right answer is the hechsher on the exact SKU.",
  },
  {
    area: "Fulfillment model",
    grillers:
      "Atlanta local delivery, Southeast pickup, and UPS frozen shipping are selected at checkout by address and basket. Shipped orders use a cardboard shipper, styrofoam insulation, and dry ice.",
    growAndBehold:
      "G&B publishes NY/NJ area delivery and pickup options plus UPS/FedEx frozen shipping for broader delivery.",
    customerTakeaway:
      "The winner depends on lane and date. Put your ZIP and cart in checkout before comparing total cost or arrival timing.",
  },
  {
    area: "Price and pack math",
    grillers:
      "PDP price display separates per-pound and fixed-price items and shows pack-size or estimated-pack facts only when the catalog has the underlying data.",
    growAndBehold:
      "G&B product pages publish current prices and pack details by item; final shipping and delivery terms depend on cart and destination.",
    customerTakeaway:
      "Compare the final delivered cart, not just the per-pound headline. Pack size, shipping, and freezer use change the real value.",
  },
]

export const growAndBeholdFaqs = [
  {
    question: "Is Griller's Pride or Grow & Behold better for kosher meat?",
    answer:
      "The better fit depends on the cart. Griller's Pride is built for guided kosher meal planning, freezer stocking, premium cuts, and item-level kashrut details. Grow & Behold is a separate kosher meat retailer with a pasture-raised sourcing model.",
  },
  {
    question: "Does Griller's Pride ship frozen kosher meat?",
    answer:
      "Yes. Griller's Pride supports frozen UPS shipping with insulated, dry-ice packaging where eligible, and checkout confirms the delivery lane for the address and basket.",
  },
  {
    question: "Can I compare hechsher details before buying?",
    answer:
      "Yes. Griller's Pride product pages show item-level kashrut badges when available and link to the kashruth policy for supervision details.",
  },
]

export function faqJsonLd(faqs: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }
}
