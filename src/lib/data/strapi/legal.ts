import { gql } from "graphql-request"
import { cache } from "react"
import strapiClient from "@lib/strapi"

export type StrapiMedia = {
  url: string
  name?: string | null
  width?: number
  height?: number
  alternativeText?: string | null
}

export type StrapiLink = {
  Text: string
  Url: string
}

export type InfoHero = {
  Eyebrow?: string | null
  Headline: string
  Subhead?: string | null
  Image?: StrapiMedia | null
  ImageAlt?: string | null
  PrimaryCta?: StrapiLink | null
  SecondaryCta?: StrapiLink | null
}

export type InfoFeatureCard = {
  Icon?: StrapiMedia | null
  Title: string
  Body?: string | null
}

export type InfoTableColumn = {
  Label: string
  Key: string
  Alignment?: "left" | "center" | "right" | null
  IsPrimary?: boolean | null
}

export type InfoTableRow = {
  Label?: string | null
  Cells?: Record<string, string | number | boolean | null> | null
}

export type InfoComparisonRow = {
  Label: string
  LeftValue: string
  RightValue: string
}

export type InfoBodyComponent =
  | {
      __typename: "ComponentInfoSection"
      // Aliased in the GraphQL query because GraphQL flags Image/Title/Body
      // selections that overlap across inline fragments with mismatched
      // nullability. Renderer reads these aliased names directly.
      SectionTitle?: string | null
      SectionBody?: any[] | null
      SectionImage?: StrapiMedia | null
      ImageAlt?: string | null
      ImagePosition?: "none" | "full" | "left" | "right" | null
    }
  | {
      __typename: "ComponentInfoFeatureGrid"
      Heading?: string | null
      Intro?: string | null
      Cards?: InfoFeatureCard[] | null
    }
  | {
      __typename: "ComponentInfoImageBlock"
      BlockImage: StrapiMedia
      Alt: string
      Caption?: string | null
      Width?: "contained" | "full" | null
    }
  | {
      __typename: "ComponentSharedRichText"
      body?: string | null
    }
  | {
      __typename: "ComponentInfoTableBlock"
      Heading?: string | null
      Intro?: string | null
      Columns?: InfoTableColumn[] | null
      Rows?: InfoTableRow[] | null
      MobilePresentation?: "scroll-table" | "cards" | "comparison" | null
      Caption?: string | null
    }
  | {
      __typename: "ComponentInfoComparisonTable"
      Heading?: string | null
      Intro?: string | null
      DecisionLabel: string
      LeftOptionLabel: string
      RightOptionLabel: string
      Rows?: InfoComparisonRow[] | null
      Caption?: string | null
    }

export type LegalPageData = {
  Slug: string
  Title: string
  Hero?: InfoHero | null
  Body?: InfoBodyComponent[] | null
  Content?: any[] | null
  UpdatedAt?: string
  SEO?: {
    metaTitle?: string
    metaDescription?: string
    canonicalUrl?: string
  }
}

export type LegalPagesQueryResult = {
  legalPages?: LegalPageData[]
}

export const GetLegalPageQuery = gql`
  query LegalPage($slug: String!) {
    legalPages(filters: { Slug: { eq: $slug } }) {
      Slug
      Title
      Hero {
        Eyebrow
        Headline
        Subhead
        Image {
          url
          name
          width
          height
          alternativeText
        }
        ImageAlt
        PrimaryCta {
          Text
          Url
        }
        SecondaryCta {
          Text
          Url
        }
      }
      Body {
        __typename
        ... on ComponentInfoSection {
          SectionTitle: Title
          SectionBody: Body
          SectionImage: Image {
            url
            name
            width
            height
            alternativeText
          }
          ImageAlt
          ImagePosition
        }
        ... on ComponentInfoFeatureGrid {
          Heading
          Intro
          Cards {
            Title
            Body
            Icon {
              url
              name
              width
              height
              alternativeText
            }
          }
        }
        ... on ComponentInfoImageBlock {
          BlockImage: Image {
            url
            name
            width
            height
            alternativeText
          }
          Alt
          Caption
          Width
        }
        ... on ComponentSharedRichText {
          body
        }
        ... on ComponentInfoTableBlock {
          Heading
          Intro
          Columns {
            Label
            Key
            Alignment
            IsPrimary
          }
          TableRows: Rows {
            Label
            Cells
          }
          MobilePresentation
          Caption
        }
        ... on ComponentInfoComparisonTable {
          Heading
          Intro
          DecisionLabel
          LeftOptionLabel
          RightOptionLabel
          ComparisonRows: Rows {
            Label
            LeftValue
            RightValue
          }
          Caption
        }
      }
      Content
      UpdatedAt: updatedAt
      SEO {
        metaTitle
        metaDescription
        canonicalUrl
      }
    }
  }
`

export const LEGAL_SLUGS = [
  "privacy-policy",
  "terms-of-sale",
  "terms-of-use",
  "sms-terms",
] as const

export type LegalSlug = (typeof LEGAL_SLUGS)[number]

export function isLegalSlug(slug: string): slug is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(slug)
}

const PLACEHOLDER_TITLES: Record<LegalSlug, string> = {
  "privacy-policy": "Privacy Policy",
  "terms-of-sale": "Terms of Sale",
  "terms-of-use": "Terms of Use",
  "sms-terms": "SMS Program Terms",
}

// BlocksRenderer-shaped placeholder content (Lorem ipsum). Lives in code
// until the Strapi `legal-page` collection-type is created and lawyer-
// reviewed copy is loaded in. The page route uses this exact shape so
// when Strapi entries land, no template changes are needed.
const LATIN_HEADING = (text: string) => ({
  type: "heading",
  level: 2,
  children: [{ type: "text", text }],
})

const LATIN_PARAGRAPH = (text: string) => ({
  type: "paragraph",
  children: [{ type: "text", text }],
})

const LOREM_LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur."

const LOREM_MED =
  "Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium."

const LOREM_SHORT =
  "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt."

const PLACEHOLDER_CONTENT: Record<LegalSlug, any[]> = {
  "privacy-policy": [
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Information We Collect"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_PARAGRAPH(LOREM_MED),
    LATIN_HEADING("How We Use Your Information"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Third-Party Services"),
    LATIN_PARAGRAPH(LOREM_MED),
    LATIN_PARAGRAPH(LOREM_SHORT),
    LATIN_HEADING("Cookies"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Your Rights"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Contact Us"),
    LATIN_PARAGRAPH(LOREM_SHORT),
  ],
  "terms-of-sale": [
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Catch-Weight Pricing"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Substitutions"),
    LATIN_PARAGRAPH(LOREM_MED),
    LATIN_HEADING("Cold-Chain & Delivery"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Returns & Refunds"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Shipping"),
    LATIN_PARAGRAPH(LOREM_MED),
    LATIN_HEADING("Kashruth"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Pricing Errors"),
    LATIN_PARAGRAPH(LOREM_SHORT),
    LATIN_HEADING("Governing Law"),
    LATIN_PARAGRAPH(LOREM_SHORT),
  ],
  "terms-of-use": [
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Account Creation"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Acceptable Use"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Intellectual Property"),
    LATIN_PARAGRAPH(LOREM_MED),
    LATIN_HEADING("Limitations of Liability"),
    LATIN_PARAGRAPH(LOREM_LONG),
    LATIN_HEADING("Dispute Resolution"),
    LATIN_PARAGRAPH(LOREM_MED),
    LATIN_HEADING("Changes to These Terms"),
    LATIN_PARAGRAPH(LOREM_SHORT),
  ],
  // Real program terms, not Lorem — this is compliance copy carriers review
  // during toll-free verification, so the code fallback must match the
  // Strapi entry rather than render filler if Strapi is unavailable.
  "sms-terms": [
    LATIN_PARAGRAPH(
      "Griller's Pride Marketing Texts is a recurring SMS marketing program operated by Grillerspride, LLC (\"Griller's Pride\") that sends promotional messages such as specials, holiday promotions, and product availability announcements."
    ),
    LATIN_HEADING("Enrollment & Consent"),
    LATIN_PARAGRAPH(
      "You enroll by checking the marketing text opt-in box during account signup or first-login contact verification, providing your mobile number, and submitting the form. The box is optional and unchecked by default. Consent to receive marketing text messages is not a condition of any purchase. We keep a record of your consent, including the date, enrollment source, mobile number, and consent language shown to you."
    ),
    LATIN_HEADING("Message Frequency & Cost"),
    LATIN_PARAGRAPH(
      "Message frequency varies, typically 2 to 6 promotional messages per month. Message and data rates may apply according to your mobile plan. Carriers are not liable for delayed or undelivered messages."
    ),
    LATIN_HEADING("Opt Out & Help"),
    LATIN_PARAGRAPH(
      "Reply STOP to any message to unsubscribe at any time; you will receive a single confirmation message. Reply HELP for help, or contact us at (770) 454-8108 or peter@grillerspride.com."
    ),
    LATIN_HEADING("Privacy"),
    LATIN_PARAGRAPH(
      "Your mobile number and consent records are handled as described in our Privacy Policy. We do not sell your phone number, and text messaging originator opt-in data and consent are not shared with third parties for their own marketing purposes."
    ),
  ],
}

function pageHasContent(page?: LegalPageData | null) {
  if (!page?.Title) return false
  return Boolean(
    page.Hero?.Headline ||
      (page.Body && page.Body.length > 0) ||
      (page.Content && page.Content.length > 0)
  )
}

function flattenRichText(children?: any[]): string {
  if (!Array.isArray(children)) return ""
  return children
    .map((child) => {
      if (child?.type === "text") return child.text || ""
      return flattenRichText(child?.children)
    })
    .join("")
}

function shouldDropEditorBlock(block: any) {
  if (block?.type !== "paragraph") return false
  return /managed in Strapi|Strapi-managed|Strapi managed/i.test(
    flattenRichText(block.children)
  )
}

function sanitizeLegalPage(page: LegalPageData): LegalPageData {
  if (!Array.isArray(page.Body)) return page

  return {
    ...page,
    Body: page.Body.map((block) => {
      if (block.__typename === "ComponentInfoTableBlock") {
        return {
          ...block,
          Rows: (block as any).TableRows || block.Rows,
        }
      }
      if (block.__typename === "ComponentInfoComparisonTable") {
        return {
          ...block,
          Rows: (block as any).ComparisonRows || block.Rows,
        }
      }
      if (
        block.__typename === "ComponentInfoSection" &&
        Array.isArray(block.SectionBody)
      ) {
        return {
          ...block,
          SectionBody: block.SectionBody.filter(
            (richBlock) => !shouldDropEditorBlock(richBlock)
          ),
        }
      }
      return block
    }),
  }
}

const fetchLegalPage = cache(
  async (slug: string): Promise<LegalPageData | null> => {
    try {
      const data = await strapiClient.request<LegalPagesQueryResult>(
        GetLegalPageQuery,
        { slug }
      )
      const page = data?.legalPages?.[0]
      if (pageHasContent(page)) return sanitizeLegalPage(page!)
    } catch {
      // Network or schema error — return null so the route 404s cleanly.
    }
    return null
  }
)

export async function getLegalPage(
  slug: string
): Promise<LegalPageData | null> {
  if (!isLegalSlug(slug)) return null
  const page = await fetchLegalPage(slug)
  if (page) return page
  return {
    Slug: slug,
    Title: PLACEHOLDER_TITLES[slug],
    Content: PLACEHOLDER_CONTENT[slug],
  }
}

// Generic static-page fetcher — uses the same `legal-page` collection-type
// but without the LEGAL_SLUGS restriction. Used by the footer info pages
// (#11/#18 — Ship to Me, About, Mission, Careers, etc.) so the entire footer
// content lives in one Strapi collection editors can manage in admin.
export async function getInfoPage(slug: string): Promise<LegalPageData | null> {
  if (!slug) return null
  return fetchLegalPage(slug)
}
