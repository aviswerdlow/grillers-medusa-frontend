import Image from "next/image"
import type { Metadata, StrapiProductData } from "types/strapi"

type ProductFactsProps = {
  strapiProductData: StrapiProductData
  description?: string
  countryCode?: string
  presentation?: "standard" | "compact_disclosures"
}

export type ProductFactHighlight = {
  key: string
  label: string
  iconSrc: string
  value?: string
}

export type FlagDefinition = {
  key: keyof Metadata
  label: string
  slug: string
  priority: number
}

type TextDefinition = FlagDefinition & {
  formatter?: (value: unknown) => string | null
}

const ATTRIBUTE_ICON_BASE = "/images/pdp/attribute-icons"

const PACK_TEXT_ATTRIBUTES: TextDefinition[] = [
  {
    key: "AvgPackSize",
    label: "Pack size",
    slug: "avg-pack-size",
    priority: 10,
  },
  {
    key: "AvgPackWeight",
    label: "Avg weight",
    slug: "avg-pack-weight",
    priority: 11,
  },
  { key: "Serves", label: "Serves", slug: "serves", priority: 12 },
  {
    key: "PiecesPerPack",
    label: "Pieces",
    slug: "pieces-per-pack",
    priority: 13,
    formatter: (value) => {
      const pieces = numberValue(value)
      return pieces ? `${pieces}/pack` : null
    },
  },
]

const SOURCING_TEXT_ATTRIBUTES: TextDefinition[] = [
  { key: "Brand", label: "Brand", slug: "brand", priority: 70 },
  { key: "Source", label: "Source", slug: "source", priority: 71 },
  { key: "Origin", label: "Origin", slug: "origin", priority: 72 },
  { key: "Breed", label: "Breed", slug: "breed", priority: 73 },
  { key: "Supplier", label: "Supplier", slug: "supplier", priority: 120 },
]

const CUT_TEXT_ATTRIBUTES: TextDefinition[] = [
  { key: "Thickness", label: "Thickness", slug: "thickness", priority: 61 },
]

const PREPARATION_TEXT_ATTRIBUTES: TextDefinition[] = [
  {
    key: "MarinadeFlavor",
    label: "Marinade",
    slug: "marinade-flavor",
    priority: 91,
  },
]

const HECHSHER_FLAGS: FlagDefinition[] = [
  {
    key: "KosherForPassover",
    label: "Kosher for Passover",
    slug: "kosher-for-passover",
    priority: 20,
  },
  {
    key: "CHK",
    label: "CHK Certification",
    slug: "hechsher-chk",
    priority: 21,
  },
  { key: "OU", label: "OU", slug: "hechsher-ou", priority: 22 },
  {
    key: "ChassidishRecognized",
    label: "Chassidish Recognized",
    slug: "hechsher-chassidish-recognized",
    priority: 23,
  },
  {
    key: "AgriStarLamedKLubavitchOrRabbiWeissmandl",
    label: "AgriStar Lamed-K · Lubavich or Rabbi Weismandl",
    slug: "hechsher-agristar-lubavitch-or-weissmandl",
    priority: 24,
  },
  {
    key: "AgriStarLamedKLubavitch",
    label: "AgriStar Lamed-K · Lubavich",
    slug: "hechsher-agristar-lubavitch",
    priority: 25,
  },
]

const DIETARY_FLAGS: FlagDefinition[] = [
  {
    key: "GlutenFree",
    label: "Gluten free",
    slug: "gluten-free",
    priority: 30,
  },
  { key: "MSG", label: "No MSG", slug: "no-msg", priority: 31 },
  { key: "Pareve", label: "Pareve", slug: "pareve", priority: 32 },
  { key: "Meat", label: "Meat", slug: "meat", priority: 33 },
  { key: "Dairy", label: "Dairy", slug: "dairy", priority: 34 },
  {
    key: "CholovYisroel",
    label: "Cholov Yisroel",
    slug: "cholov-yisroel",
    priority: 35,
  },
]

const PREP_FLAGS: FlagDefinition[] = [
  { key: "Uncooked", label: "Raw", slug: "raw", priority: 40 },
  { key: "Cooked", label: "Ready to eat", slug: "ready-to-eat", priority: 41 },
  {
    key: "HeatAndServe",
    label: "Heat and serve",
    slug: "heat-and-serve",
    priority: 42,
  },
]

const SOURCING_FLAGS: FlagDefinition[] = [
  {
    key: "Angus",
    label: "American Angus",
    slug: "american-angus",
    priority: 50,
  },
  { key: "GrassFed", label: "Grass-fed", slug: "grass-fed", priority: 51 },
  { key: "Organic", label: "Organic", slug: "organic", priority: 52 },
  { key: "FreeRange", label: "Free range", slug: "free-range", priority: 53 },
  {
    key: "SouthAmerican",
    label: "South American",
    slug: "south-american",
    priority: 54,
  },
  { key: "GrainFree", label: "Grain free", slug: "grain-free", priority: 55 },
  {
    key: "AntibioticFree",
    label: "No antibiotics",
    slug: "antibiotic-free",
    priority: 56,
  },
  {
    key: "HormoneFree",
    label: "No hormones",
    slug: "hormone-free",
    priority: 57,
  },
  {
    key: "NoSteroids",
    label: "No steroids",
    slug: "no-steroids",
    priority: 58,
  },
  {
    key: "NoNitrites",
    label: "No nitrites",
    slug: "no-nitrites",
    priority: 59,
  },
  {
    key: "NoNitrates",
    label: "No nitrates",
    slug: "no-nitrates",
    priority: 60,
  },
]

const CUT_FORM_FLAGS: FlagDefinition[] = [
  { key: "BoneIn", label: "Bone-in", slug: "bone-in", priority: 62 },
  { key: "Boneless", label: "Boneless", slug: "boneless", priority: 63 },
  { key: "SkinOn", label: "Skin-on", slug: "skin-on", priority: 64 },
  { key: "Skinless", label: "Skinless", slug: "skinless", priority: 65 },
  { key: "Trimmed", label: "Trimmed", slug: "trimmed", priority: 66 },
  { key: "Untrimmed", label: "Untrimmed", slug: "untrimmed", priority: 67 },
  { key: "Netted", label: "Netted", slug: "netted", priority: 68 },
  { key: "FirstCut", label: "First cut", slug: "first-cut", priority: 69 },
  { key: "DeckelOn", label: "Deckel-on", slug: "deckel-on", priority: 74 },
  {
    key: "WholePacker",
    label: "Whole packer",
    slug: "whole-packer",
    priority: 75,
  },
  { key: "CowboyCut", label: "Cowboy cut", slug: "cowboy-cut", priority: 76 },
  { key: "Pargiot", label: "Pargiot", slug: "pargiot", priority: 77 },
  { key: "Capon", label: "Capon", slug: "capon", priority: 78 },
  { key: "Schnitzel", label: "Schnitzel", slug: "schnitzel", priority: 79 },
  { key: "Strips", label: "Strips", slug: "strips", priority: 80 },
  { key: "Marrow", label: "Marrow", slug: "marrow", priority: 81 },
  { key: "Kebab", label: "Kebab", slug: "kebab", priority: 82 },
]

const PREPARATION_STYLE_FLAGS: FlagDefinition[] = [
  { key: "Smoked", label: "Smoked", slug: "smoked", priority: 92 },
  { key: "Pickled", label: "Pickled", slug: "pickled", priority: 93 },
  { key: "Cured", label: "Cured", slug: "cured", priority: 94 },
  { key: "Marinated", label: "Marinated", slug: "marinated", priority: 95 },
  {
    key: "CharGrilled",
    label: "Char-grilled",
    slug: "char-grilled",
    priority: 96,
  },
  { key: "Sliced", label: "Sliced", slug: "sliced", priority: 97 },
  { key: "Ground", label: "Ground", slug: "ground", priority: 98 },
  { key: "Bulk", label: "Bulk", slug: "bulk", priority: 99 },
  { key: "Offcut", label: "Offcut", slug: "offcut", priority: 100 },
]

const PACKAGING_FLAGS: FlagDefinition[] = [
  {
    key: "VacuumPacked",
    label: "Vacuum packed",
    slug: "vacuum-packed",
    priority: 110,
  },
  { key: "BulkPack", label: "Bulk pack", slug: "bulk-pack", priority: 111 },
  {
    key: "BoilablePouch",
    label: "Boilable pouch",
    slug: "boilable-pouch",
    priority: 112,
  },
  {
    key: "AluminumPan",
    label: "Aluminum pan",
    slug: "aluminum-pan",
    priority: 113,
  },
  { key: "IQF", label: "IQF", slug: "iqf", priority: 114 },
  {
    key: "QualifiesForFreeDeliveryOffers",
    label: "Free delivery eligible",
    slug: "free-delivery-eligible",
    priority: 130,
  },
]

const TEXT_ATTRIBUTE_DEFINITIONS = [
  ...PACK_TEXT_ATTRIBUTES,
  ...SOURCING_TEXT_ATTRIBUTES,
  ...CUT_TEXT_ATTRIBUTES,
  ...PREPARATION_TEXT_ATTRIBUTES,
]

const BOOLEAN_ATTRIBUTE_DEFINITIONS = [
  ...HECHSHER_FLAGS,
  ...DIETARY_FLAGS,
  ...PREP_FLAGS,
  ...SOURCING_FLAGS,
  ...CUT_FORM_FLAGS,
  ...PREPARATION_STYLE_FLAGS,
  ...PACKAGING_FLAGS,
]

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : null
}

function attributeIconSrc(slug: string) {
  return `${ATTRIBUTE_ICON_BASE}/${slug}.png`
}

function textFactValue(metadata: Metadata, definition: TextDefinition) {
  const value = metadata[definition.key]
  if (definition.formatter) return definition.formatter(value)
  if (typeof value === "number") return numberValue(value)
  return textValue(value)
}

function shouldShowTextHighlight(
  metadata: Metadata,
  definition: TextDefinition,
  value: string
) {
  if (definition.key === "Supplier") return false

  if (definition.key === "AvgPackWeight") {
    const packSize = textValue(metadata.AvgPackSize)?.toLowerCase()
    if (packSize?.includes(value.toLowerCase())) return false
  }

  if (definition.key === "Source") {
    const source = value.toLowerCase()
    const duplicateSource = SOURCING_FLAGS.filter((flag) =>
      Boolean(metadata[flag.key])
    ).some((flag) => {
      const label = flag.label.toLowerCase()
      return label.includes(source) || source.includes(label)
    })

    if (duplicateSource) return false
  }

  return true
}

function buildTextHighlight(
  metadata: Metadata,
  definition: TextDefinition
): ProductFactHighlight | null {
  const value = textFactValue(metadata, definition)
  if (!value) return null
  if (!shouldShowTextHighlight(metadata, definition, value)) return null
  return {
    key: String(definition.key),
    label: definition.label,
    value,
    iconSrc: attributeIconSrc(definition.slug),
  }
}

function buildBooleanHighlight(
  metadata: Metadata,
  definition: FlagDefinition
): ProductFactHighlight | null {
  if (!metadata[definition.key]) return null
  return {
    key: String(definition.key),
    label: definition.label,
    iconSrc: attributeIconSrc(definition.slug),
  }
}

export function buildProductFactHighlights({
  strapiProductData,
}: ProductFactsProps): ProductFactHighlight[] {
  const metadata = strapiProductData?.Metadata || {}

  return [
    ...TEXT_ATTRIBUTE_DEFINITIONS.map((definition) =>
      buildTextHighlight(metadata, definition)
    ),
    ...BOOLEAN_ATTRIBUTE_DEFINITIONS.map((definition) =>
      buildBooleanHighlight(metadata, definition)
    ),
  ]
    .filter((highlight): highlight is ProductFactHighlight =>
      Boolean(highlight)
    )
    .sort((a, b) => {
      const aDefinition =
        TEXT_ATTRIBUTE_DEFINITIONS.find(
          (definition) => definition.key === a.key
        ) ||
        BOOLEAN_ATTRIBUTE_DEFINITIONS.find(
          (definition) => definition.key === a.key
        )
      const bDefinition =
        TEXT_ATTRIBUTE_DEFINITIONS.find(
          (definition) => definition.key === b.key
        ) ||
        BOOLEAN_ATTRIBUTE_DEFINITIONS.find(
          (definition) => definition.key === b.key
        )

      return (aDefinition?.priority || 999) - (bDefinition?.priority || 999)
    })
}

function hasKashruthSignal(highlights: ProductFactHighlight[]) {
  const hechsherKeys = new Set(HECHSHER_FLAGS.map((flag) => String(flag.key)))
  return highlights.some((highlight) => hechsherKeys.has(highlight.key))
}

function FactList({ highlights }: { highlights: ProductFactHighlight[] }) {
  if (!highlights.length) return null

  return (
    <ul
      className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3"
      role="list"
    >
      {highlights.map((highlight) => (
        <li key={highlight.key} className="flex min-w-0 items-center gap-3">
          <span className="block h-10 w-10 shrink-0">
            <Image
              src={highlight.iconSrc}
              alt=""
              width={40}
              height={40}
              sizes="40px"
              className="h-full w-full object-contain"
            />
          </span>
          <span className="block min-w-0">
            <span className="block break-words font-maison-neue-mono text-[9px] font-bold uppercase leading-tight text-Charcoal/55">
              {highlight.label}
            </span>
            {highlight.value && (
              <span className="mt-1 block break-words font-maison-neue text-xs font-semibold leading-snug text-Charcoal">
                {highlight.value}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function ProductFacts({
  strapiProductData,
  description,
  countryCode = "us",
  presentation = "standard",
}: ProductFactsProps) {
  const highlights = buildProductFactHighlights({ strapiProductData })
  const normalizedDescription = description?.trim()
  const showKashruthPolicyLink = hasKashruthSignal(highlights)
  const isCompact = presentation === "compact_disclosures"
  const visibleHighlights = isCompact ? highlights.slice(0, 6) : highlights
  const secondaryHighlights = isCompact ? highlights.slice(6) : []
  const hasSecondaryDetails =
    secondaryHighlights.length > 0 || Boolean(normalizedDescription)

  if (!normalizedDescription && highlights.length === 0) return null

  return (
    <section
      aria-labelledby="product-facts-heading"
      className="mb-6 border-y border-Charcoal/15 py-5"
    >
      <h2
        id="product-facts-heading"
        className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-Charcoal"
      >
        At a glance
      </h2>

      {highlights.length > 0 && (
        <div className="mt-5">
          <FactList highlights={visibleHighlights} />
        </div>
      )}

      {showKashruthPolicyLink && (
        <p className="mt-5 border-t border-Charcoal/10 pt-4 font-maison-neue text-sm leading-relaxed text-Charcoal/70">
          Need supervision details?{" "}
          <a
            href={`/${countryCode}/kashruth/hechsherim`}
            className="text-Charcoal underline underline-offset-2 hover:text-Gold focus-visible:text-Gold"
          >
            View our kashruth policy
          </a>
          .
        </p>
      )}

      {isCompact && hasSecondaryDetails && (
        <details className="mt-5 border-t border-Charcoal/10 pt-4">
          <summary className="cursor-pointer list-none font-maison-neue text-sm font-bold text-Charcoal marker:hidden">
            <span className="inline-flex items-center gap-2">
              More item details
              <span aria-hidden="true" className="text-Charcoal/45">
                +
              </span>
            </span>
          </summary>
          {secondaryHighlights.length > 0 && (
            <div className="mt-4">
              <FactList highlights={secondaryHighlights} />
            </div>
          )}
          {normalizedDescription && (
            <p
              className="mt-4 font-maison-neue text-base leading-relaxed text-Charcoal/80"
              data-testid="product-description"
            >
              {normalizedDescription}
            </p>
          )}
        </details>
      )}

      {!isCompact && normalizedDescription && (
        <div className="mt-5 border-t border-Charcoal/10 pt-4">
          <h3 className="font-maison-neue text-sm font-bold text-Charcoal">
            Description
          </h3>
          <p
            className="mt-3 font-maison-neue text-base leading-relaxed text-Charcoal/80"
            data-testid="product-description"
          >
            {normalizedDescription}
          </p>
        </div>
      )}
    </section>
  )
}
