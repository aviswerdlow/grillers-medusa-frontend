import { render, screen } from "@testing-library/react"
import FulfillmentDetails from "@modules/order/components/fulfillment-details"
import FulfillmentBanner from "@modules/checkout/components/fulfillment-banner"
import {
  calendarWindowLabel,
  formatCalendarDate,
  fulfillmentDateKey,
} from "@lib/fulfillment-calendar"

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}))
jest.mock("@lib/data/cart", () => ({ clearFulfillmentDetails: jest.fn() }))

test.each(["2026-03-08", "2026-11-01", "2028-02-29"])(
  "keeps civil date %s across timezone and DST boundaries",
  (date) => {
    const formatted = formatCalendarDate(date)
    const expected = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`))
    expect(formatted).toBe(expected)
  }
)

test("normalizes old U.S. dates and refuses impossible days instead of rolling them forward", () => {
  expect(fulfillmentDateKey("10/8/2026")).toBe("2026-10-08")
  expect(formatCalendarDate("10/8/2026")).toBe("Thu, Oct 8, 2026")
  for (const value of [
    "2026-02-30",
    "2/29/2026",
    "2026-13-01",
    "2026-10-08T00:00:00Z",
  ]) {
    expect(fulfillmentDateKey(value)).toBeNull()
    expect(formatCalendarDate(value)).toBe("Date needs review")
  }
})

test.each([
  "ups_shipping",
  "plant_pickup",
  "atlanta_delivery",
  "southeast_pickup",
])(
  "confirmation shows arrival, never dispatch or preparation, for %s",
  (mode) => {
    render(
      <FulfillmentDetails
        order={
          {
            metadata: {
              fulfillmentType: mode,
              scheduledDate: "2026-10-08",
              requestedDeliveryDate: "2026-10-08",
              qbdDueDate: "2026-10-07",
              fulfillmentDispatchDate: "2026-10-07",
              fulfillmentPickDate: "2026-10-05",
              scheduledTimeWindow: "custom-window",
              fulfillmentWindowLabel: "2–4 PM",
              fulfillmentCalendarTimezone: "America/New_York",
            },
          } as any
        }
      />
    )
    expect(screen.getByText("Thursday, October 8, 2026")).toBeInTheDocument()
    expect(screen.queryByText(/October (5|7),/)).not.toBeInTheDocument()
    if (mode !== "ups_shipping")
      expect(screen.getByText("2–4 PM ET")).toBeInTheDocument()
  }
)

test("checkout uses the confirmed label instead of inventing a window from its id", () => {
  const metadata = {
    fulfillmentType: "plant_pickup",
    scheduledDate: "2026-10-08",
    scheduledTimeWindow: "morning",
    fulfillmentWindowLabel: "10–11 AM",
    fulfillmentCalendarTimezone: "America/New_York",
  }
  render(<FulfillmentBanner cart={{ id: "cart_fixture", metadata } as any} />)
  expect(screen.getByText("Thu, Oct 8, 2026")).toBeInTheDocument()
  expect(screen.getByText("10–11 AM ET")).toBeInTheDocument()
  expect(screen.queryByText("9:00 AM - 12:00 PM")).not.toBeInTheDocument()
  expect(calendarWindowLabel({ scheduledTimeWindow: "morning" })).toBe(
    "9:00 AM - 12:00 PM"
  )
})
