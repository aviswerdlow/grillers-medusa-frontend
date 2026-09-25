import { gql } from "graphql-request"
import { cachedStrapiRequest } from "@lib/strapi"
import { LEGACY_STRAPI_CACHE_TAG } from "@lib/strapi/cache-tags"

export type FAQItem = {
  Question: string
  Answer: string
}

export type CustomerServiceData = {
  Title: string
  Intro: string
  ContactEmail: string
  ContactPhone: string
  ContactHours: string
  FAQs: FAQItem[]
  Content?: any[] // optional BlocksRenderer content for additional copy
  UpdatedAt?: string
}

// Strapi `customer-service` single type. Schema lives in the
// grillers-strapi repo (api/customer-service). Field names match the
// shared Capitalized convention used elsewhere in the project.
export const GetCustomerServiceQuery = gql`
  query CustomerService {
    customerService {
      Title
      Intro
      ContactEmail
      ContactPhone
      ContactHours
      FAQs {
        Question
        Answer
      }
      Content
      UpdatedAt: updatedAt
    }
  }
`

const PLACEHOLDER: CustomerServiceData = {
  Title: "Customer Service",
  Intro:
    "We're a family-run Atlanta butcher counter. When you have a question, a real person picks up. Use the channels below or scan the FAQ for the fastest answer.",
  ContactEmail: "peter@grillerspride.com",
  ContactPhone: "(770) 454-8108",
  ContactHours:
    "Monday–Thursday 9:00 AM – 5:00 PM ET · Friday 9:00 AM – 2:00 PM ET · Closed Saturday and major Jewish holidays",
  FAQs: [
    {
      Question: "How do I know my meat is kosher?",
      Answer:
        "Every product is supervised by the Atlanta Kashruth Commission (AKC), with a mashgiach on every shift since 2002. Each pack ships with the kashruth seal intact. The PDP for each item shows the specific hechsher.",
    },
    {
      Question: "How does catch-weight pricing work?",
      Answer:
        "Premium cuts are sold by the pound, but each piece weighs slightly differently. At checkout you're charged a target estimate; once your order is packed and weighed, your card is adjusted to reflect the exact weight. You only ever pay for what you actually receive.",
    },
    {
      Question: "When will my order arrive?",
      Answer:
        "Atlanta-area delivery: typically next-day if you order before noon ET. Southeast pickup: scheduled at one of our partner locations. Nationwide UPS shipping: 1–3 business days, packed in our cold-chain shipper that holds temperature for 72 hours.",
    },
    {
      Question: "What's your free-shipping threshold?",
      Answer:
        "Free Atlanta home delivery on orders over $250 in eligible Metro Atlanta ZIP codes. Free UPS Ground to our in-region states (GA, TN, TX, NC, FL, SC, AL) on orders over $350, and free nationwide shipping on orders over $500. Otherwise standard shipping rates apply at checkout.",
    },
    {
      Question: "How do I return an order?",
      Answer:
        "Because of food safety, we can't accept returns of opened or thawed product. If your order arrives damaged, mis-packed, or thawed, contact us within 24 hours of delivery and we'll replace or refund. See our Terms of Sale for the full policy.",
    },
    {
      Question: "Do you offer wholesale or B2B accounts?",
      Answer:
        "Yes. We work with restaurants, caterers, and institutional buyers. Email us with your business details and we'll set you up with an account and pricing.",
    },
    {
      Question: "Where are you located?",
      Answer:
        "Our plant and counter are in Doraville, GA. Pickup is available at the plant; we also work with partner pickup locations across the Southeast.",
    },
    {
      Question: "What if I have a special-occasion order?",
      Answer:
        "Holidays (Pesach, Rosh Hashanah, Sukkot, Shabbos) and large gatherings, give us a call directly. We'll walk through quantities and timing so nothing gets cut close.",
    },
  ],
}

export async function getCustomerServiceData(): Promise<CustomerServiceData> {
  try {
    const data = await cachedStrapiRequest<{
      customerService?: CustomerServiceData
    }>("customer-service", GetCustomerServiceQuery, undefined, {
      tags: [LEGACY_STRAPI_CACHE_TAG],
    })
    const cs = data?.customerService
    if (cs?.Title) {
      // Merge with placeholder so partial Strapi entries still render fully.
      return {
        ...PLACEHOLDER,
        ...cs,
        FAQs: cs.FAQs?.length ? cs.FAQs : PLACEHOLDER.FAQs,
      }
    }
  } catch {
    // Strapi `customer-service` single type not created yet — fall through
    // to placeholder.
  }
  return PLACEHOLDER
}
