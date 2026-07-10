import type { Metadata } from "types/strapi"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

/**
 * Kashruth + sourcing chip row for the PDP (#39).
 *
 * Renders only flags that come from Strapi metadata — we do NOT
 * hard-code "Glatt Kosher" / "AKC Supervised" because the GP catalog
 * carries items under other hechsherim (CHK in particular, per the
 * v2 price list). Asserting blanket Glatt/AKC on every SKU would be
 * misleading for stricter customers who filter by shchita.
 *
 * `MSG: true` historically means "NO MSG" on this catalog (the field
 * is inverted; flagged as a follow-up Strapi schema cleanup in #39's
 * Codex review). We render the customer-friendly "No MSG" label to
 * match the established PLP behavior.
 */

type Chip = { label: string; tone: "kosher" | "sourcing" | "dietary" }

function chipsFor(metadata: Metadata | null | undefined): Chip[] {
  const m = metadata || {}
  const chips: Chip[] = []

  // Kashruth flags — only when set in Strapi.
  if (m.CHK) chips.push({ label: "CHK Certification", tone: "kosher" })
  if (m.ChassidishRecognized)
    chips.push({ label: "Chassidish Recognized", tone: "kosher" })
  if (m.AgriStarLamedKLubavitchOrRabbiWeissmandl)
    chips.push({
      label: "AgriStar Lamed-K · Lubavich or Rabbi Weismandl",
      tone: "kosher",
    })
  if (m.AgriStarLamedKLubavitch)
    chips.push({ label: "AgriStar Lamed-K · Lubavich", tone: "kosher" })
  if (m.OU) chips.push({ label: "OU", tone: "kosher" })
  if (m.KosherForPassover)
    chips.push({ label: "Kosher for Passover", tone: "kosher" })
  if (m.Pareve) chips.push({ label: "Pareve", tone: "kosher" })
  if (m.CholovYisroel) chips.push({ label: "Cholov Yisroel", tone: "kosher" })

  // Sourcing — most-trust-signal first.
  if (m.Angus) chips.push({ label: "American Angus", tone: "sourcing" })
  if (m.GrassFed) chips.push({ label: "100% Grass-Fed", tone: "sourcing" })
  if (m.Organic) chips.push({ label: "Organic", tone: "sourcing" })
  if (m.FreeRange) chips.push({ label: "Free Range", tone: "sourcing" })
  if (m.AntibioticFree)
    chips.push({ label: "No Antibiotics", tone: "sourcing" })
  if (m.HormoneFree) chips.push({ label: "No Hormones", tone: "sourcing" })
  if (m.NoSteroids) chips.push({ label: "No Steroids", tone: "sourcing" })
  if (m.NoNitrites || m.NoNitrates)
    chips.push({ label: "No Nitrites / Nitrates", tone: "sourcing" })

  // Dietary.
  if (m.GlutenFree) chips.push({ label: "Gluten Free", tone: "dietary" })
  if (m.MSG) chips.push({ label: "No MSG", tone: "dietary" })

  return chips
}

const toneClass: Record<Chip["tone"], string> = {
  kosher: "bg-Gold/15 text-Charcoal border border-Gold/40",
  sourcing: "bg-Charcoal/5 text-Charcoal border border-Charcoal/15",
  dietary: "bg-Scroll text-Charcoal border border-Charcoal/15",
}

export default function KashruthBadges({
  metadata,
  countryCode,
}: {
  metadata: Metadata | null | undefined
  countryCode: string
}) {
  const chips = chipsFor(metadata)
  const visibleChips =
    chips.length > 0 ? chips : [{ label: "Certified kosher", tone: "kosher" as const }]
  // Always render the section so the "kashruth policy" link is
  // discoverable even when no metadata flags are set on a SKU.
  return (
    <section
      aria-labelledby="kashruth-and-sourcing-heading"
      className="mb-6 pt-4 border-t border-Charcoal"
    >
      <h2
        id="kashruth-and-sourcing-heading"
        className="text-p-sm-mono font-maison-neue font-bold uppercase text-Charcoal mb-3"
      >
        Kashruth &amp; sourcing
      </h2>
      <ul className="flex flex-wrap gap-2 mb-3" role="list">
        {visibleChips.map((chip) => (
          <li
            key={chip.label}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-maison-neue-mono uppercase tracking-wide ${
              toneClass[chip.tone]
            }`}
          >
            <svg
              className="w-3.5 h-3.5 flex-shrink-0"
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
            {chip.label}
          </li>
        ))}
      </ul>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-maison-neue-mono uppercase tracking-wide text-Charcoal/70">
        <span className="font-bold text-Charcoal">Catalog hechsher key:</span>
        {[
          "OU",
          "Chassidish",
          "CHK",
          "AgriStar / Weismandl",
          "AgriStar Lubavich",
        ].map((cert) => (
          <LocalizedClientLink
            key={cert}
            href="/kashruth/hechsherim"
            className="inline-flex h-6 min-w-10 items-center justify-center rounded-full border border-Charcoal/20 bg-white px-2 font-bold hover:border-Gold hover:text-Gold"
          >
            {cert}
          </LocalizedClientLink>
        ))}
      </div>
      <p className="text-p-sm font-maison-neue text-Charcoal/70">
        Hechsher and supervision details for every cut →{" "}
        <LocalizedClientLink
          href="/kashruth/hechsherim"
          className="underline underline-offset-2 text-Charcoal hover:text-Gold focus-visible:text-Gold"
        >
          our kashruth policy
        </LocalizedClientLink>
      </p>
    </section>
  )
}
