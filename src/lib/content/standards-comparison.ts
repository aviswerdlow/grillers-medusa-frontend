export type StandardsRow = {
  title: string
  body: string
  proof: string
}

export type CompetitorComparisonRow = {
  area: string
  grillers: string
  growAndBehold: string
  customerTakeaway: string
}

export const standardsComparisonRows: StandardsRow[] = [
  {
    title: "A full kosher butcher cart, not a single-purpose meat box",
    body:
      "Build the order around the way your household eats: Shabbos dinner, weeknight basics, freezer stock-up, grill night, holidays, prepared sides, and specialty cuts.",
    proof:
      "Shop by collections, butcher-counter categories, prepared foods, and hard-to-find items like South African specialties and custom-cut requests.",
  },
  {
    title: "Standards you can check before checkout",
    body:
      "Kosher meat is not one-size-fits-all. Product pages show hechsher, Passover status, meat/dairy/pareve signals, and prepared-item details when that information is available.",
    proof:
      "Item-level badges and kashruth pages help stricter households verify the exact product before it reaches the cart.",
  },
  {
    title: "Packed for the trip, not just packed to ship",
    body:
      "Frozen orders are packed in a cardboard shipper with styrofoam insulation and dry ice, and checkout confirms shipping or local-delivery availability for your address.",
    proof:
      "That matters when the nearest kosher butcher is not nearby and the order has to arrive cold enough for your freezer or holiday prep.",
  },
  {
    title: "The staples and the special orders live together",
    body:
      "A good kosher order often mixes everyday chicken, roasts, soups, prepared foods, biltong, lamb, veal, steaks, and holiday-only needs.",
    proof:
      "One cart can cover the everyday staples, the special requests, and the holiday prep without sending you across multiple stores.",
  },
  {
    title: "People answer when the order has to be right",
    body:
      "Questions about substitutions, delivery timing, custom cuts, or household standards do not always fit into a filter menu.",
    proof:
      "The family-run Atlanta team is still part of the butcher-counter experience when you need a real answer.",
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
      "Use the comparison around the meal plan: Griller's Pride is strongest when the cart needs to become a table or freezer plan; Grow & Behold is strongest when the sourcing model is the lead requirement.",
  },
  {
    area: "Ways to shop",
    grillers:
      "A la carte product shopping plus curated collections such as Welcome Pack, Shabbos Dinner Made Easy, Weeknight Low Prep Family, Freezer Basics, Steak Night, and Rosh Hashanah Table.",
    growAndBehold:
      "Primarily a la carte product shopping supported by education about farms, husbandry, and delivery options.",
    customerTakeaway:
      "If you want a guided basket, start with Griller's Pride collections. If you already know the exact cuts and care most about provenance, compare Grow & Behold product pages directly.",
  },
  {
    area: "Kashruth detail",
    grillers:
      "Griller's Pride product pages show item-level kashruth badges when available, including OU, Star-K, CHK, CRC, Rabbi Weissmandl, Rabbi Teitelbaum, Lubavitch, Chassidish shchita, and Kosher for Passover.",
    growAndBehold:
      "Grow & Behold is a kosher meat retailer with its own supervision and product labeling. Customers should verify the hechsher shown on the specific item before buying.",
    customerTakeaway:
      "For stricter household standards, compare item pages, not brand promises. The right answer is the hechsher on the exact product.",
  },
  {
    area: "Fulfillment model",
    grillers:
      "Atlanta local delivery, Southeast pickup, and UPS frozen shipping are selected at checkout by address and basket. Shipped orders use a cardboard shipper, styrofoam insulation, and dry ice.",
    growAndBehold:
      "Grow & Behold publishes NY/NJ area delivery and pickup options plus UPS/FedEx frozen shipping for broader delivery.",
    customerTakeaway:
      "The winner depends on lane and date. Put your ZIP and cart in checkout before comparing total cost or arrival timing.",
  },
  {
    area: "Price and pack math",
    grillers:
      "Product pages separate per-pound and fixed-price items and show pack-size or estimated-pack facts only when that information is available.",
    growAndBehold:
      "Grow & Behold product pages publish current prices and pack details by item; final shipping and delivery terms depend on cart and destination.",
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
      "Yes. Griller's Pride supports frozen UPS shipping with insulated, dry-ice packaging where eligible, and checkout confirms shipping availability for the address and basket.",
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
