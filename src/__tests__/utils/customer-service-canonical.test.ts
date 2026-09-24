import { generateMetadata } from "../../app/[countryCode]/(main)/customer-service/page"

jest.mock("@lib/data/strapi/customer-service", () => ({
  getCustomerServiceData: jest.fn(async () => ({
    Title: "Customer Service",
    Intro: "Contact Grillers Pride.",
  })),
}))
jest.mock("@lib/util/env", () => ({
  getBaseURL: () => "https://www.grillerspride.com",
}))

test("customer service has one same-host canonical and social URL", async () => {
  const metadata = await generateMetadata({
    params: Promise.resolve({ countryCode: "us" }),
  })
  expect(metadata.alternates).toEqual({
    canonical: "https://www.grillerspride.com/us/customer-service",
  })
  expect(metadata.openGraph).toMatchObject({
    url: "https://www.grillerspride.com/us/customer-service",
  })
})
