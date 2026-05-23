import type { Metadata, StrapiProductData } from "types/strapi"

type ProductFactsProps = {
  strapiProductData: StrapiProductData
}

export type ProductFactRow = {
  label: string
  value: string
}

export type ProductFactGroup = {
  title: string
  rows: ProductFactRow[]
}

type FlagDefinition = {
  key: keyof Metadata
  label: string
}

const HECHSHER_FLAGS: FlagDefinition[] = [
  { key: "CHK", label: "CHK" },
  { key: "OU", label: "OU" },
  { key: "StarK", label: "Star-K" },
  { key: "CRC", label: "CRC" },
  { key: "RabbiWeissmandl", label: "Rabbi Weissmandl" },
  { key: "RabbiTeitelbaum", label: "Rabbi Teitelbaum" },
  { key: "Lubavitch", label: "Lubavitch" },
  { key: "ChassidishShchita", label: "Chassidish shchita" },
  { key: "KosherForPassover", label: "Kosher for Passover" },
]

const DIETARY_FLAGS: FlagDefinition[] = [
  { key: "Meat", label: "Meat" },
  { key: "Pareve", label: "Pareve" },
  { key: "Dairy", label: "Dairy" },
  { key: "CholovYisroel", label: "Cholov Yisroel" },
  { key: "GlutenFree", label: "Gluten free" },
  { key: "MSG", label: "No MSG" },
]

const PREP_FLAGS: FlagDefinition[] = [
  { key: "Uncooked", label: "Uncooked" },
  { key: "Cooked", label: "Ready to eat" },
  { key: "HeatAndServe", label: "Heat and serve" },
]

const SOURCING_FLAGS: FlagDefinition[] = [
  { key: "Angus", label: "American Angus" },
  { key: "GrassFed", label: "100% grass-fed" },
  { key: "Organic", label: "Organic" },
  { key: "FreeRange", label: "Free range" },
  { key: "AntibioticFree", label: "No antibiotics" },
  { key: "HormoneFree", label: "No hormones" },
  { key: "NoSteroids", label: "No steroids" },
  { key: "NoNitrites", label: "No nitrites" },
  { key: "NoNitrates", label: "No nitrates" },
  { key: "SouthAmerican", label: "South American" },
]

const CUT_FORM_FLAGS: FlagDefinition[] = [
  { key: "BoneIn", label: "Bone-in" },
  { key: "Boneless", label: "Boneless" },
  { key: "SkinOn", label: "Skin-on" },
  { key: "Skinless", label: "Skinless" },
  { key: "Trimmed", label: "Trimmed" },
  { key: "Untrimmed", label: "Untrimmed" },
  { key: "VacuumPacked", label: "Vacuum packed" },
  { key: "Smoked", label: "Smoked" },
  { key: "Pickled", label: "Pickled" },
  { key: "Cured", label: "Cured" },
  { key: "Marinated", label: "Marinated" },
  { key: "Sliced", label: "Sliced" },
  { key: "Ground", label: "Ground" },
]

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : null
}

function flagLabels(
  metadata: Metadata | null | undefined,
  flags: FlagDefinition[]
) {
  if (!metadata) return []
  return flags
    .filter((flag) => Boolean(metadata[flag.key]))
    .map((flag) => flag.label)
}

function addRow(rows: ProductFactRow[], label: string, value: string | null) {
  if (!value) return
  if (rows.some((row) => row.label === label && row.value === value)) return
  rows.push({ label, value })
}

function stripTagPrefix(value: string) {
  return value.replace(/^L[123]:\s*/i, "").trim()
}

function firstTagMatching(
  strapiProductData: StrapiProductData,
  pattern: RegExp
) {
  const tags =
    strapiProductData?.Categorization?.ProductTags?.map(
      (tag: { Name?: string }) => tag.Name || ""
    ) || []

  return tags.find((tag: string) => pattern.test(tag)) || null
}

function group(title: string, rows: ProductFactRow[]): ProductFactGroup | null {
  return rows.length > 0 ? { title, rows } : null
}

export function buildProductFactGroups({
  strapiProductData,
}: ProductFactsProps): ProductFactGroup[] {
  const metadata = strapiProductData?.Metadata || {}
  const collection = strapiProductData?.Categorization?.ProductCollections?.[0]
  const l3Tag = firstTagMatching(strapiProductData, /^L3:/i)
  const l2Tag = firstTagMatching(strapiProductData, /^L2:/i)

  const itemRows: ProductFactRow[] = []
  addRow(itemRows, "Collection", textValue(collection?.Name))
  addRow(
    itemRows,
    "Cut family",
    textValue(stripTagPrefix(l3Tag || l2Tag || ""))
  )

  const packRows: ProductFactRow[] = []
  addRow(packRows, "Pack size", textValue(metadata.AvgPackSize))
  addRow(packRows, "Average weight", textValue(metadata.AvgPackWeight))
  addRow(packRows, "Pieces per pack", numberValue(metadata.PiecesPerPack))
  addRow(packRows, "Serves", textValue(metadata.Serves))
  addRow(
    packRows,
    "Preparation",
    flagLabels(metadata, PREP_FLAGS).join(", ") || null
  )
  addRow(
    packRows,
    "Form",
    flagLabels(metadata, CUT_FORM_FLAGS).join(", ") || null
  )

  const trustRows: ProductFactRow[] = []
  addRow(
    trustRows,
    "Hechsher",
    flagLabels(metadata, HECHSHER_FLAGS).join(", ") || null
  )
  addRow(
    trustRows,
    "Dietary",
    flagLabels(metadata, DIETARY_FLAGS).join(", ") || null
  )
  addRow(trustRows, "Brand", textValue(metadata.Brand))
  addRow(trustRows, "Source", textValue(metadata.Source))
  addRow(trustRows, "Origin", textValue(metadata.Origin))
  addRow(
    trustRows,
    "Sourcing flags",
    flagLabels(metadata, SOURCING_FLAGS).join(", ") || null
  )

  return [
    group("Item", itemRows),
    group("Pack", packRows),
    group("Kashruth and sourcing", trustRows),
  ].filter((factGroup): factGroup is ProductFactGroup => Boolean(factGroup))
}

export default function ProductFacts(props: ProductFactsProps) {
  const groups = buildProductFactGroups(props)

  if (groups.length === 0) return null

  return (
    <section
      aria-labelledby="product-facts-heading"
      className="mb-6 border-y border-Charcoal/15"
    >
      <h2
        id="product-facts-heading"
        className="py-3 font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-Charcoal"
      >
        Product details
      </h2>
      <div className="divide-y divide-Charcoal/10">
        {groups.map((factGroup) => (
          <details key={factGroup.title} className="group">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-4 py-3 font-maison-neue text-sm font-bold text-Charcoal [&::-webkit-details-marker]:hidden">
              <span>{factGroup.title}</span>
              <span
                aria-hidden="true"
                className="text-lg leading-none text-Charcoal/60 transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <dl className="grid gap-3 pb-4 font-maison-neue text-sm sm:grid-cols-2">
              {factGroup.rows.map((row) => (
                <div
                  key={`${factGroup.title}-${row.label}`}
                  className="min-w-0"
                >
                  <dt className="font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal/60">
                    {row.label}
                  </dt>
                  <dd className="mt-1 break-words leading-relaxed text-Charcoal/80">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ))}
      </div>
    </section>
  )
}
