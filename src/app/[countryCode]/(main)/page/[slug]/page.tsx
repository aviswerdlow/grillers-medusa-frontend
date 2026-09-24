import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getBaseURL, isProductionHost } from "@lib/util/env"
import {
  getInfoPage,
  getLegalPage,
  isLegalSlug,
  LEGAL_SLUGS,
} from "@lib/data/strapi/legal"
import InfoPageTemplate from "@modules/info/templates/info-page"
import WholesaleLeadForm from "../../../../../components/wholesale-lead-form"

type Props = {
  params: Promise<{ countryCode: string; slug: string }>
}

const INFO_SLUGS = [
  "about-us",
  "our-mission",
  "careers",
  "catch-weight-pricing",
  "wholesale",
  "specialty",
] as const
type InfoSlug = (typeof INFO_SLUGS)[number]

const VALID_SLUGS = new Set<string>([...LEGAL_SLUGS, ...INFO_SLUGS])

const SECTION_BY_SLUG: Record<InfoSlug, string> = {
  "about-us": "About",
  "our-mission": "About",
  careers: "About",
  "catch-weight-pricing": "How it works",
  wholesale: "Wholesale",
  specialty: "Specialty",
}

export async function generateStaticParams() {
  return Array.from(VALID_SLUGS).map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, countryCode } = await params
  if (!VALID_SLUGS.has(slug)) {
    return { title: "Not Found | Grillers Pride", robots: { index: false, follow: false } }
  }
  const page = isLegalSlug(slug)
    ? await getLegalPage(slug)
    : await getInfoPage(slug)
  if (!page) return { title: "Not Found | Grillers Pride", robots: { index: false, follow: false } }
  const canonical = `${getBaseURL()}/${countryCode}/page/${slug}`
  const title = page?.SEO?.metaTitle || `${page?.Title} | Grillers Pride`
  return {
    title,
    alternates: { canonical },
    openGraph: { url: canonical, title, type: "website" },
    robots: { index: isProductionHost(), follow: isProductionHost() },
    description:
      page?.SEO?.metaDescription ||
      `Read ${page?.Title} from Grillers Pride.`,
  }
}

export default async function StaticPage({ params }: Props) {
  const { slug } = await params
  if (!VALID_SLUGS.has(slug)) notFound()

  if (isLegalSlug(slug)) {
    const page = await getLegalPage(slug)
    if (!page) notFound()

    return <InfoPageTemplate page={page} section="Policy" />
  }

  const page = await getInfoPage(slug)
  if (!page) notFound()
  return (
    <>
      <InfoPageTemplate
        page={page}
        section={SECTION_BY_SLUG[slug as InfoSlug]}
      />
      {slug === "wholesale" && (
        <section className="content-container py-12 md:py-20">
          <WholesaleLeadForm />
        </section>
      )}
    </>
  )
}

export const dynamic = "force-dynamic"
