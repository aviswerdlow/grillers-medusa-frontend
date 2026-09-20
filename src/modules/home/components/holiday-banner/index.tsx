import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  getActiveHoliday,
  formatBannerDate,
  type Holiday,
} from "@lib/data/holiday-deadlines"

type HolidayBannerProps = {
  /** Override the active holiday — used by tests / Storybook. Production
   *  callers should pass nothing so the date-windowed selector runs. */
  holiday?: Holiday | null
}

export default function HolidayBanner({ holiday }: HolidayBannerProps = {}) {
  const active = holiday === undefined ? getActiveHoliday() : holiday
  if (!active) return null

  return (
    <section
      aria-label={`${active.name} order deadlines`}
      className="bg-Gold/15 border-y border-Gold/30"
    >
      <div className="content-container py-4 md:py-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-6">
          <div className="flex items-start md:items-center gap-3 md:gap-4 min-w-0">
            <span
              aria-hidden="true"
              className="text-2xl md:text-3xl shrink-0 leading-none"
            >
              {active.emoji ?? "🕯️"}
            </span>
            <div className="min-w-0">
              <p className="text-p-sm md:text-p-md font-maison-neue text-Charcoal">
                <span className="font-semibold">
                  {active.name} order deadlines are coming up.
                </span>
              </p>
              <ul className="mt-1 md:mt-0.5 text-p-sm font-maison-neue text-Charcoal/80 flex flex-wrap gap-x-4 gap-y-1">
                {active.cutoffs.map((c) => (
                  <li key={c.service} className="whitespace-nowrap">
                    <span className="text-Charcoal/60">{c.service}:</span>{" "}
                    <span className="font-semibold text-Charcoal">
                      {formatBannerDate(c.cutoff)}
                    </span>
                    {c.note && (
                      <span className="text-Charcoal/50"> ({c.note})</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <LocalizedClientLink
            href="/holidays/order-deadlines"
            className="shrink-0 inline-flex items-center gap-2 text-p-sm-mono font-maison-neue-mono uppercase tracking-widest text-Charcoal hover:text-Gold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold rounded"
          >
            See all deadlines
            <svg
              width="16"
              height="12"
              viewBox="0 0 16 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M10 1l5 5-5 5M15 6H0"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </LocalizedClientLink>
        </div>
      </div>
    </section>
  )
}
