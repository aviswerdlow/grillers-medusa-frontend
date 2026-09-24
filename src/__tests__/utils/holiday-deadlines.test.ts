import {
  easternCalendarDate,
  getActiveHoliday,
  getUpcomingCutoffs,
  type Holiday,
} from "@lib/data/holiday-deadlines"

const holiday: Holiday = {
  name: "Test holiday",
  firstNight: "2026-09-25",
  active: true,
  cutoffs: [
    { service: "UPS Ground", cutoff: "2026-09-23" },
    { service: "Delivery", cutoff: "2026-09-24" },
    { service: "Pickup", cutoff: "1 business day before" },
  ],
}

describe("holiday deadline visibility", () => {
  it("uses the Eastern calendar through UTC midnight and daylight saving time", () => {
    expect(easternCalendarDate(new Date("2026-09-24T03:59:59Z"))).toBe("2026-09-23")
    expect(easternCalendarDate(new Date("2026-09-24T04:00:00Z"))).toBe("2026-09-24")
    expect(easternCalendarDate(new Date("2026-12-04T04:59:59Z"))).toBe("2026-12-03")
    expect(easternCalendarDate(new Date("2026-12-04T05:00:00Z"))).toBe("2026-12-04")
  })

  it("removes passed dated cutoffs but retains today's and relative cutoffs", () => {
    expect(getUpcomingCutoffs(holiday, new Date("2026-09-24T16:00:00Z")).map((c) => c.service)).toEqual([
      "Delivery",
      "Pickup",
    ])
  })

  it("returns no entries once every dated cutoff has passed", () => {
    const datedOnly = { ...holiday, cutoffs: holiday.cutoffs.slice(0, 2) }
    expect(getUpcomingCutoffs(datedOnly, new Date("2026-09-25T04:00:00Z"))).toEqual([])
  })

  it("keeps the holiday banner's Eastern date window open until the end day", () => {
    expect(getActiveHoliday(new Date("2026-09-25T03:59:59Z"))?.name).toBe("Sukkot")
    expect(getActiveHoliday(new Date("2026-09-25T04:00:00Z"))?.name).not.toBe("Sukkot")
  })
})
