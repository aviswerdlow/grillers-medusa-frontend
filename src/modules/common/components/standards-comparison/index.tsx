import {
  standardsComparisonRows,
  type StandardsRow,
} from "@lib/content/standards-comparison"

type StandardsComparisonProps = {
  rows?: StandardsRow[]
  title?: string
  eyebrow?: string
  comparisonLabel?: string
  compact?: boolean
}

export default function StandardsComparison({
  rows = standardsComparisonRows,
  title = "Our standards vs. the ordinary online meat listing",
  eyebrow = "Why customers choose us",
  comparisonLabel = "Ordinary listing",
  compact = false,
}: StandardsComparisonProps) {
  return (
    <section
      aria-labelledby="standards-comparison-heading"
      className={compact ? "bg-white py-10" : "bg-Scroll py-12 md:py-16"}
    >
      <div className="content-container">
        <div className="mb-7 max-w-3xl">
          <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
            {eyebrow}
          </p>
          <h2
            id="standards-comparison-heading"
            className="mt-3 font-gyst text-h2-mobile font-bold leading-tight text-Charcoal md:text-h2"
          >
            {title}
          </h2>
        </div>

        <div className="overflow-hidden rounded-[5px] border border-Charcoal/15 bg-white">
          <div className="hidden grid-cols-[0.75fr_1fr_1fr] border-b border-Charcoal/15 bg-Charcoal text-white sm:grid">
            <div className="px-3 py-3 font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide sm:px-5">
              Standard
            </div>
            <div className="px-3 py-3 font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide sm:px-5">
              Griller&apos;s Pride
            </div>
            <div className="px-3 py-3 font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide sm:px-5">
              {comparisonLabel}
            </div>
          </div>
          {rows.map((row) => (
            <div
              key={row.area}
              className="grid grid-cols-1 border-b border-Charcoal/10 last:border-b-0 sm:grid-cols-[0.75fr_1fr_1fr]"
            >
              <div className="bg-Charcoal/5 px-4 py-4 font-maison-neue font-bold text-Charcoal sm:px-5">
                {row.area}
              </div>
              <div className="px-4 py-4 font-maison-neue text-sm leading-relaxed text-Charcoal sm:px-5">
                <span className="mb-1 block font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal/50 sm:hidden">
                  Griller&apos;s Pride
                </span>
                {row.grillers}
              </div>
              <div className="px-4 py-4 font-maison-neue text-sm leading-relaxed text-Charcoal/65 sm:px-5">
                <span className="mb-1 block font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal/50 sm:hidden">
                  {comparisonLabel}
                </span>
                {row.ordinary}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
