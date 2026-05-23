import { Metadata } from "next"
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  faqJsonLd,
  growAndBeholdComparisonRows,
  growAndBeholdFaqs,
} from "@lib/content/standards-comparison"
import { generatedSiteImages } from "@lib/content/generated-site-images"
import { getBaseURL } from "@lib/util/env"
import { generateAlternates } from "@lib/util/seo"

type PageProps = {
  params: Promise<{ countryCode: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { countryCode } = await params
  const baseUrl = getBaseURL()
  const path = "/pages/grillers-vs-grow-and-behold"

  return {
    title: "Griller's Pride vs Grow & Behold | Kosher Meat Comparison",
    description:
      "Compare Griller's Pride and Grow & Behold by catalog fit, kashrut detail, frozen shipping, pack math, and service model.",
    alternates: {
      ...(await generateAlternates(path, countryCode)),
      canonical: `${baseUrl}/${countryCode}${path}`,
    },
  }
}

const decisionRows = [
  {
    label: "Use Griller's Pride when",
    value:
      "You want a guided kosher cart for Shabbos, weeknights, freezer stocking, grilling, holiday tables, or item-level hechsher checks.",
  },
  {
    label: "Use Grow & Behold when",
    value:
      "You specifically want their pasture-raised program and source-forward model. Their public materials emphasize farms, animal raising, and delivery options.",
  },
  {
    label: "Compare closely on",
    value:
      "The exact hechsher on the SKU, pack size, delivered cart total, delivery date, and whether your address fits the service lane you need.",
  },
]

export default function GrillersVsGrowAndBeholdPage() {
  const schema = faqJsonLd(growAndBeholdFaqs)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <main className="bg-Scroll">
        <section className="relative min-h-[430px] overflow-hidden bg-Charcoal text-white">
          <Image
            src={generatedSiteImages.comparisonHero}
            alt=""
            fill
            priority
            className="object-cover opacity-55"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-Charcoal via-Charcoal/75 to-Charcoal/20" />
          <div className="content-container relative z-[1] py-16 md:py-24">
            <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-Gold">
              Kosher meat comparison
            </p>
            <h1 className="mt-4 max-w-4xl font-gyst text-h1-mobile font-bold leading-tight md:text-h1">
              Griller&apos;s Pride vs Grow &amp; Behold
            </h1>
            <p className="mt-5 max-w-2xl font-maison-neue text-p-lg leading-relaxed text-white/85">
              A practical buyer&apos;s guide for choosing a premium kosher meat
              cart, with the details that matter before frozen meat ships.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LocalizedClientLink
                href="/collections"
                className="inline-flex min-h-[44px] items-center rounded-[5px] bg-Gold px-5 py-3 font-rexton text-xs font-bold uppercase text-Charcoal hover:bg-Gold/90"
              >
                Shop collections
              </LocalizedClientLink>
              <LocalizedClientLink
                href="/kashruth/hechsherim"
                className="inline-flex min-h-[44px] items-center rounded-[5px] border border-white/50 px-5 py-3 font-rexton text-xs font-bold uppercase text-white hover:border-Gold hover:text-Gold"
              >
                Check hechsherim
              </LocalizedClientLink>
            </div>
          </div>
        </section>

        <section className="content-container py-12 md:py-16">
          <div className="max-w-3xl">
            <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
              Short answer
            </p>
            <h2 className="mt-3 font-gyst text-h2-mobile font-bold leading-tight text-Charcoal md:text-h2">
              Pick based on the job your cart needs to do.
            </h2>
          </div>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {decisionRows.map((row) => (
              <div
                key={row.label}
                className="rounded-[5px] border border-Charcoal/15 bg-white p-5"
              >
                <h3 className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-Charcoal">
                  {row.label}
                </h3>
                <p className="mt-3 font-maison-neue text-sm leading-relaxed text-Charcoal/70">
                  {row.value}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-5 max-w-3xl font-maison-neue text-xs leading-relaxed text-Charcoal/55">
            Source references used for this comparison:{" "}
            <LocalizedClientLink
              href="/collections"
              className="underline underline-offset-2 hover:text-Gold"
            >
              GP collections
            </LocalizedClientLink>
            {", "}
            <LocalizedClientLink
              href="/shipping/ups"
              className="underline underline-offset-2 hover:text-Gold"
            >
              GP shipping
            </LocalizedClientLink>
            {", "}
            <LocalizedClientLink
              href="/kashruth/hechsherim"
              className="underline underline-offset-2 hover:text-Gold"
            >
              GP hechsherim
            </LocalizedClientLink>
            {", "}
            <a
              href="https://www.growandbehold.com/our-farms"
              className="underline underline-offset-2 hover:text-Gold"
              rel="noopener noreferrer"
            >
              G&amp;B Our Farms
            </a>
            {", "}
            <a
              href="https://www.growandbehold.com/shipping"
              className="underline underline-offset-2 hover:text-Gold"
              rel="noopener noreferrer"
            >
              G&amp;B Shipping
            </a>
            {", and "}
            <a
              href="https://www.growandbehold.com/ny-nj-area-delivery"
              className="underline underline-offset-2 hover:text-Gold"
              rel="noopener noreferrer"
            >
              G&amp;B NY/NJ delivery
            </a>
            .
          </p>
        </section>

        <section className="bg-white py-12 md:py-16">
          <div className="content-container">
            <div className="max-w-3xl">
              <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
                Product and service comparison
              </p>
              <h2 className="mt-3 font-gyst text-h2-mobile font-bold leading-tight text-Charcoal md:text-h2">
                Compare the actual cart experience, not just the brand story.
              </h2>
            </div>

            <div className="mt-8 overflow-x-auto border border-Charcoal/15 bg-Scroll">
              <table className="min-w-[900px] table-fixed border-collapse text-left font-maison-neue text-sm text-Charcoal">
                <caption className="sr-only">
                  Griller&apos;s Pride and Grow &amp; Behold product and service
                  comparison
                </caption>
                <thead className="bg-Charcoal text-white">
                  <tr>
                    <th scope="col" className="w-[16%] px-4 py-4 font-bold">
                      Compare
                    </th>
                    <th scope="col" className="w-[28%] px-4 py-4 font-bold">
                      Griller&apos;s Pride
                    </th>
                    <th scope="col" className="w-[28%] px-4 py-4 font-bold">
                      Grow &amp; Behold
                    </th>
                    <th scope="col" className="w-[28%] px-4 py-4 font-bold">
                      Customer takeaway
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {growAndBeholdComparisonRows.map((row, index) => (
                    <tr
                      key={row.area}
                      className={index % 2 === 0 ? "bg-white" : "bg-Scroll"}
                    >
                      <th
                        scope="row"
                        className="border-t border-Charcoal/10 px-4 py-5 align-top font-maison-neue-mono text-xs font-bold uppercase tracking-wide text-Charcoal"
                      >
                        {row.area}
                      </th>
                      <td className="border-t border-Charcoal/10 px-4 py-5 align-top leading-relaxed text-Charcoal/75">
                        {row.grillers}
                      </td>
                      <td className="border-t border-Charcoal/10 px-4 py-5 align-top leading-relaxed text-Charcoal/75">
                        {row.growAndBehold}
                      </td>
                      <td className="border-t border-Charcoal/10 px-4 py-5 align-top leading-relaxed text-Charcoal/75">
                        {row.customerTakeaway}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="content-container py-12 md:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
                FAQ
              </p>
              <h2 className="mt-3 font-gyst text-h2-mobile font-bold leading-tight text-Charcoal md:text-h2">
                Common comparison questions
              </h2>
            </div>
            <div className="space-y-4">
              {growAndBeholdFaqs.map((faq) => (
                <div
                  key={faq.question}
                  className="rounded-[5px] border border-Charcoal/15 bg-white p-5"
                >
                  <h3 className="font-maison-neue text-p-lg font-bold text-Charcoal">
                    {faq.question}
                  </h3>
                  <p className="mt-2 font-maison-neue text-sm leading-relaxed text-Charcoal/70">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
