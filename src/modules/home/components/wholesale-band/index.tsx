import React from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { ArrowRight } from "lucide-react"

const WholesaleBand: React.FC = () => {
  return (
    <section
      aria-label="Wholesale and catering"
      className="relative overflow-hidden border-y border-Charcoal/10 bg-Scroll text-Charcoal"
    >
      <div className="absolute inset-x-0 top-0 h-[5px] bg-Gold" />
      <div className="content-container py-12 md:py-16 lg:py-24">
        <div className="lg:hidden">
          <p className="mb-4 font-rexton text-[11px] font-bold uppercase tracking-[2px] text-[#755016]">
            For caterers · restaurants · congregations
          </p>
          <h2 className="mb-4 max-w-[390px] font-rexton text-[34px] font-bold uppercase leading-[0.98] tracking-[0.06em] text-Charcoal">
            Volume orders, standing accounts, custom packaging.
          </h2>
          <p className="mb-6 max-w-[460px] font-maison-neue text-p-md leading-relaxed text-Charcoal/75">
            Weekly catering, school lunch programs, simchas, or restaurant
            supply. Approved business accounts receive their agreed payment terms.
          </p>
          <LocalizedClientLink
            href="/page/wholesale"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-[5px] bg-Charcoal px-5 py-3 font-rexton text-h6 font-bold uppercase tracking-wide text-Scroll transition-colors hover:bg-Gold hover:text-Charcoal"
          >
            Wholesale pricing
            <ArrowRight className="size-4" aria-hidden="true" />
          </LocalizedClientLink>
        </div>

        <div className="hidden lg:grid lg:grid-cols-12 lg:items-end lg:gap-12">
          <div className="lg:col-span-7">
            <div className="mb-5 font-rexton text-[11px] font-bold uppercase tracking-[2px] text-[#755016]">
              For caterers · restaurants · congregations
            </div>
            <h2 className="mb-6 max-w-[700px] font-rexton text-[clamp(3.5rem,5.6vw,6.8rem)] font-bold uppercase leading-[0.98] tracking-[0.06em] text-Charcoal">
              Volume orders, standing accounts, custom packaging.
            </h2>
            <p className="mb-4 max-w-[620px] font-maison-neue text-p-md leading-relaxed text-Charcoal/75">
              If you order in volume, like Friday-night dinners for a synagogue,
              weekly catering, restaurant supply, school lunch programs, or
              simchas, we&apos;d love to talk.
            </p>
            <p className="font-maison-neue text-p-md text-Charcoal/60">
              Volume pricing &middot; Standing orders &middot; Account-specific terms
              for approved businesses &middot; Custom packaging
            </p>
          </div>

          <div className="lg:col-span-5 lg:flex lg:justify-end">
            <LocalizedClientLink
              href="/page/wholesale"
              className="inline-flex min-h-[54px] items-center gap-3 rounded-[5px] bg-Charcoal px-8 py-4 font-rexton text-h6 font-bold uppercase tracking-wide text-Scroll transition-colors hover:bg-Gold hover:text-Charcoal"
            >
              Get wholesale pricing
              <ArrowRight className="size-5" aria-hidden="true" />
            </LocalizedClientLink>
          </div>
        </div>
      </div>
    </section>
  )
}

export default WholesaleBand
