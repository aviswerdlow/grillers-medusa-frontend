import strapiClient from "@lib/strapi"
import { getInfoSupplementalData } from "@modules/info/templates/supplemental-modules"

jest.mock("graphql-request", () => ({
  gql: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce(
      (query, part, index) => query + part + String(values[index] ?? ""),
      ""
    ),
}))

jest.mock("@lib/strapi", () => ({
  __esModule: true,
  default: { request: jest.fn() },
}))

jest.mock("@lib/data/strapi/fulfillment", () => ({
  getAtlantaDeliveryZones: jest.fn(),
}))

const request = strapiClient.request as jest.Mock
const rows = [
  { documentId: "past", HolidayDate: "2026-09-23" },
  { documentId: "today", HolidayDate: "2026-09-24" },
  { documentId: "future", HolidayDate: "2026-09-25" },
  { documentId: "undated", HolidayDate: null },
  { documentId: "relative", HolidayDate: "1 business day before" },
]

describe("Strapi holiday deadline row visibility", () => {
  afterEach(() => {
    jest.useRealTimers()
    request.mockReset()
  })

  it("expires dated rows at Eastern midnight and keeps undated or relative rows", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-25T03:59:59Z"))
    request.mockResolvedValue({ holidayDeadlines: rows })

    const beforeMidnight = await getInfoSupplementalData(
      "holidays-order-deadlines"
    )
    expect(beforeMidnight?.holidayDeadlines?.map((row) => row.documentId)).toEqual([
      "today",
      "future",
      "undated",
      "relative",
    ])

    jest.setSystemTime(new Date("2026-09-25T04:00:00Z"))
    const afterMidnight = await getInfoSupplementalData(
      "holidays-order-deadlines"
    )
    expect(afterMidnight?.holidayDeadlines?.map((row) => row.documentId)).toEqual([
      "future",
      "undated",
      "relative",
    ])
  })
})
