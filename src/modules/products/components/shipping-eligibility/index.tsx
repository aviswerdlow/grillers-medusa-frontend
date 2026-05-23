import LocalizedClientLink from "@modules/common/components/localized-client-link"

/**
 * PDP shipping-eligibility callout (#39).
 *
 * Soft, non-absolute copy by design — Codex flagged that the previous
 * "every SKU ships nationwide" wording was too strong. Some catalog
 * items are Plant Pickup Only or carry FedEx surcharges, and Atlanta
 * delivery depends on ZIP starting with 30 (gated by checkout). What
 * the customer actually sees is the option matrix at checkout, so this
 * card sets that expectation rather than promising shipping on every
 * SKU.
 *
 * Future-state: per-SKU shipping overrides in Strapi (e.g. "this item
 * is Atlanta pickup only" or "ships only Mon-Wed for transit-time"
 * gates). When those land, this component should accept them as props
 * and branch.
 */

export default function ShippingEligibility({
  countryCode,
}: {
  countryCode: string
}) {
  const lines = [
    {
      label: "Nationwide shipping",
      sub: "UPS Ground with insulated, dry-ice packaging when frozen. Most ZIPs eligible; checkout confirms.",
    },
    {
      label: "Atlanta home delivery",
      sub: "ZIPs starting with 30 in the 7-state Southeast pickup region. Selectable at checkout, free over $250.",
    },
    {
      label: "Southeast Pickup",
      sub: "Pick up at the plant or scheduled rendezvous. Available for in-region addresses.",
    },
  ]
  const coldChainSteps = [
    "Packed frozen",
    "Insulated shipper",
    "Dry ice calibrated",
    "Checkout confirms lane",
  ]
  return (
    <section
      aria-labelledby="shipping-eligibility-heading"
      className="mb-6 rounded-md border border-Charcoal/15 bg-Scroll/40 p-4"
    >
      <h2
        id="shipping-eligibility-heading"
        className="text-p-sm-mono font-maison-neue font-bold uppercase text-Charcoal mb-3"
      >
        Shipping &amp; pickup
      </h2>
      <div className="mb-4 rounded-md border border-Gold/30 bg-white p-3">
        <p className="mb-3 text-[11px] font-maison-neue-mono font-bold uppercase tracking-wide text-Charcoal/70">
          Cold Chain Guarantee
        </p>
        <ol className="grid gap-2 sm:grid-cols-4" role="list">
          {coldChainSteps.map((step, index) => (
            <li key={step} className="flex items-center gap-2 sm:block">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-Gold font-maison-neue-mono text-xs font-bold text-Charcoal">
                {index + 1}
              </span>
              <span className="text-xs font-maison-neue font-semibold text-Charcoal sm:mt-2 sm:block">
                {step}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <ul
        className="space-y-2.5 text-sm font-maison-neue text-Charcoal mb-3"
        role="list"
      >
        {lines.map((l) => (
          <li key={l.label} className="flex items-start gap-2.5">
            <svg
              className="w-4 h-4 mt-0.5 flex-shrink-0 text-Gold"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.5 7.6a1 1 0 0 1-1.42 0L3.29 9.81a1 1 0 1 1 1.42-1.41l3.79 3.79 6.78-6.88a1 1 0 0 1 1.414-.006Z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <span className="font-semibold">{l.label}.</span>{" "}
              <span className="text-Charcoal/70">{l.sub}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs font-maison-neue text-Charcoal/60">
        Final options + costs are confirmed at checkout based on your address
        and basket. See our{" "}
        <LocalizedClientLink
          href="/shipping/ups"
          className="underline underline-offset-2 hover:text-Gold"
        >
          full shipping policy
        </LocalizedClientLink>
        .
      </p>
    </section>
  )
}
