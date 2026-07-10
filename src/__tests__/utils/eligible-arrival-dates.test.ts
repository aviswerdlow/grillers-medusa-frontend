/**
 * @jest-environment jsdom
 */

import {
  computeEligibleArrivalDates,
  computeQuickBooksDueDateForArrival,
  isArrivalDateValid,
  isUpsGroundAvailableForZip,
  lookupUpsGroundDays,
  normalizeUpsServiceCode,
  toIsoDate,
  UPS_GROUND_TRANSIT_DAYS_BY_PREFIX,
} from "@lib/util/eligible-arrival-dates"

describe("UPS Ground transit lookup", () => {
  it("returns 1 day for in-region GA zips", () => {
    // 30340 = Doraville (origin) → 1 day
    expect(lookupUpsGroundDays("30340")).toBe(1)
  })

  it("returns 5 days for Los Angeles 90048 (issue #72 case)", () => {
    expect(lookupUpsGroundDays("90048")).toBe(5)
    expect(isUpsGroundAvailableForZip("90048")).toBe(false)
  })

  it("returns 5 day fallback for unknown prefix", () => {
    expect(lookupUpsGroundDays("00000")).toBe(5)
  })

  it("does not include weekend zip prefixes mistakenly", () => {
    // Sanity: every transit value should be 1-7
    for (const v of Object.values(UPS_GROUND_TRANSIT_DAYS_BY_PREFIX)) {
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(7)
    }
  })
})

describe("UPS Ground arrival eligibility — issue #72", () => {
  it("does NOT allow tomorrow as arrival for 90048 from Wed 2026-04-29", () => {
    // Reproduce the exact bug: customer in 90048 ordering Wed 2026-04-29 ~14:35 ET
    const now = new Date(2026, 3, 29, 14, 35) // April 29 2026, 2:35 PM
    const result = computeEligibleArrivalDates({
      method: "ups_ground",
      destinationZip: "90048",
      now,
    })
    // Tomorrow = April 30 — must NOT be eligible
    expect(result.isoSet.has("2026-04-30")).toBe(false)
    expect(result.earliest).toBeNull()
    expect(result.reason).toContain("UPS Ground to 90048 takes ~5 business days")
  })

  it("does not offer Ground dates when transit is over 3 business days", () => {
    const now = new Date(2026, 3, 29, 14, 35)
    const result = computeEligibleArrivalDates({
      method: "ups_ground",
      destinationZip: "90048",
      now,
    })
    expect(result.dates).toHaveLength(0)
  })

  it("UPS Overnight allows next business day arrival", () => {
    const now = new Date(2026, 3, 29, 10, 0) // Wed AM, before cutoff
    const result = computeEligibleArrivalDates({
      method: "ups_overnight",
      destinationZip: "90048",
      now,
    })
    // pack-out same day (before 3PM ET cutoff), dispatch Wed, overnight = Thu 4/30
    expect(result.isoSet.has("2026-04-30")).toBe(true)
  })

  it("UPS Ground after cutoff bumps to next operating day for dispatch", () => {
    const now = new Date(2026, 3, 29, 16, 0) // Wed 4:00 PM — past 3PM cutoff
    const result = computeEligibleArrivalDates({
      method: "ups_ground",
      destinationZip: "30340",
      now,
    })
    // Pack-out Thu 4/30, dispatch Thu 4/30 (lead = 1 means same dispatch day),
    // GA is 1-day transit, but frozen UPS arrivals are Monday-Thursday only.
    // Today Wed 4/29 must NOT be valid.
    expect(result.isoSet.has("2026-04-29")).toBe(false)
    expect(result.isoSet.has("2026-05-01")).toBe(false)
    // #288: Monday 5/4 would require shipping Friday 5/1 and sitting in transit over the
    // weekend (dry ice spoils), so it is no longer offered. Earliest is Tuesday 5/5 (ship Mon).
    expect(result.isoSet.has("2026-05-04")).toBe(false)
    expect(result.isoSet.has("2026-05-05")).toBe(true)
  })

  it("does not offer Friday UPS arrivals", () => {
    const now = new Date(2026, 3, 29, 16, 0)
    const result = computeEligibleArrivalDates({
      method: "ups_overnight",
      destinationZip: "30340",
      now,
    })
    expect(result.isoSet.has("2026-05-01")).toBe(false)
    // #288: Monday 5/4 (which needs a Friday ship sitting over the weekend) is excluded;
    // earliest weekend-safe arrival is Tuesday 5/5.
    expect(result.earliest && toIsoDate(result.earliest)).toBe("2026-05-05")
  })

  it("normalizes UPS service codes from backend/carrier labels", () => {
    expect(normalizeUpsServiceCode("Ground")).toBe("GROUND")
    expect(normalizeUpsServiceCode("UPS 2nd Day Air")).toBe("2ND_DAY_AIR")
    expect(normalizeUpsServiceCode("UPS 3 Day Select")).toBe("3_DAY_SELECT")
    expect(normalizeUpsServiceCode("Next Day Air Overnight")).toBe("OVERNIGHT")
  })

  it("computes QuickBooks ready-by date from UPS arrival date", () => {
    expect(
      computeQuickBooksDueDateForArrival("4/30/2026", {
        method: "ups_overnight",
        destinationZip: "30340",
      })
    ).toBe("2026-04-29")

    expect(
      computeQuickBooksDueDateForArrival("5/6/2026", {
        method: "ups_2day",
        destinationZip: "30340",
      })
    ).toBe("2026-05-04")

    expect(
      computeQuickBooksDueDateForArrival("5/7/2026", {
        method: "ups_3day",
        destinationZip: "90048",
      })
    ).toBe("2026-05-04")

    expect(
      computeQuickBooksDueDateForArrival("5/14/2026", {
        method: "ups_ground",
        destinationZip: "90048",
      })
    ).toBeNull()
  })

  it.each([
    ["GA", "30340"],
    ["TX", "75201"],
    ["NC", "28202"],
    ["FL", "33101"],
    ["CA", "90048"],
  ])("computes Ground and Overnight eligibility for %s", (_state, zip) => {
    const now = new Date(2026, 3, 29, 14, 35)
    const ground = computeEligibleArrivalDates({
      method: "ups_ground",
      destinationZip: zip,
      now,
    })
    const overnight = computeEligibleArrivalDates({
      method: "ups_overnight",
      destinationZip: zip,
      now,
    })

    expect(overnight.isoSet.has("2026-04-30")).toBe(true)

    if (lookupUpsGroundDays(zip) > 3) {
      expect(ground.earliest).toBeNull()
    } else {
      expect(ground.earliest).toBeTruthy()
      expect(
        isArrivalDateValid(toIsoDate(ground.earliest!), {
          method: "ups_ground",
          destinationZip: zip,
          now,
        })
      ).toBe(true)
    }

    if (lookupUpsGroundDays(zip) > 1 && lookupUpsGroundDays(zip) <= 3) {
      expect(ground.isoSet.has("2026-04-30")).toBe(false)
    }
  })
})

describe("Atlanta Delivery cutoff — issue #36", () => {
  const ATL_CFG = {
    "30328": { weekdays: [2], cutoffHour: 12 }, // Sandy Springs Tuesday route
  }

  it("Sunday → next Tuesday is eligible", () => {
    const sunday = new Date(2026, 3, 26, 10, 0) // Sun Apr 26 2026
    const result = computeEligibleArrivalDates({
      method: "atlanta_delivery",
      destinationZip: "30328",
      now: sunday,
      atlantaZipConfig: ATL_CFG,
    })
    expect(result.isoSet.has("2026-04-28")).toBe(true) // Tue Apr 28
  })

  it("Monday 11:59 AM → Tuesday IS still eligible", () => {
    const mon = new Date(2026, 3, 27, 11, 59)
    const result = computeEligibleArrivalDates({
      method: "atlanta_delivery",
      destinationZip: "30328",
      now: mon,
      atlantaZipConfig: ATL_CFG,
    })
    expect(result.isoSet.has("2026-04-28")).toBe(true)
  })

  it("Monday 12:01 PM → Tuesday is NOT eligible (cutoff passed)", () => {
    const mon = new Date(2026, 3, 27, 12, 1)
    const result = computeEligibleArrivalDates({
      method: "atlanta_delivery",
      destinationZip: "30328",
      now: mon,
      atlantaZipConfig: ATL_CFG,
    })
    expect(result.isoSet.has("2026-04-28")).toBe(false)
    // Should offer the FOLLOWING Tuesday instead
    expect(result.isoSet.has("2026-05-05")).toBe(true)
  })

  it("Tuesday delivery day → today NOT eligible (already past cutoff)", () => {
    const tue = new Date(2026, 3, 28, 9, 0) // Tue Apr 28 2026 9 AM
    const result = computeEligibleArrivalDates({
      method: "atlanta_delivery",
      destinationZip: "30328",
      now: tue,
      atlantaZipConfig: ATL_CFG,
    })
    expect(result.isoSet.has("2026-04-28")).toBe(false)
    expect(result.earliest && toIsoDate(result.earliest)).toBe("2026-05-05")
  })

  it("only Tuesdays are eligible for a Tuesday-route zip", () => {
    const sun = new Date(2026, 3, 26, 10, 0)
    const result = computeEligibleArrivalDates({
      method: "atlanta_delivery",
      destinationZip: "30328",
      now: sun,
      atlantaZipConfig: ATL_CFG,
    })
    for (const d of result.dates) {
      expect(d.getDay()).toBe(2)
    }
  })
})

describe("isArrivalDateValid server-side check", () => {
  it("rejects today's date for Atlanta Delivery past noon", () => {
    const tue = new Date(2026, 3, 28, 13, 0)
    const ok = isArrivalDateValid("4/28/2026", {
      method: "atlanta_delivery",
      destinationZip: "30328",
      now: tue,
      atlantaZipConfig: { "30328": { weekdays: [2], cutoffHour: 12 } },
    })
    expect(ok).toBe(false)
  })

  it("rejects tomorrow for UPS Ground GA→CA", () => {
    const ok = isArrivalDateValid("4/30/2026", {
      method: "ups_ground",
      destinationZip: "90048",
      now: new Date(2026, 3, 29, 14, 35),
    })
    expect(ok).toBe(false)
  })

  it("accepts a far-future Monday-Thursday date that's a UPS delivery day", () => {
    const ok = isArrivalDateValid("5/14/2026", {
      method: "ups_ground",
      destinationZip: "30340",
      now: new Date(2026, 3, 29, 14, 35),
    })
    expect(ok).toBe(true)
  })
})

describe("Holiday + Shabbos exclusions", () => {
  it("excludes UPS holidays from arrival eligibility", () => {
    // 2026-12-25 Christmas — UPS does not deliver
    const now = new Date(2026, 11, 18, 10, 0) // Dec 18 2026
    const result = computeEligibleArrivalDates({
      method: "ups_ground",
      destinationZip: "30340", // 1 day transit
      now,
    })
    expect(result.isoSet.has("2026-12-25")).toBe(false)
  })

  it("does not pack out on Saturdays", () => {
    const fri = new Date(2026, 4, 1, 10, 0) // Fri May 1 2026
    const result = computeEligibleArrivalDates({
      method: "ups_ground",
      destinationZip: "30340",
      now: fri,
    })
    // No arrival should fall on Saturday
    for (const d of result.dates) {
      expect(d.getDay()).not.toBe(6)
      expect(d.getDay()).not.toBe(0)
    }
  })

  it("excludes Yom Kippur 2026-09-21 from operating days", () => {
    const now = new Date(2026, 8, 15, 10, 0) // Sep 15 2026
    const result = computeEligibleArrivalDates({
      method: "atlanta_delivery",
      destinationZip: "30328",
      now,
      atlantaZipConfig: { "30328": { weekdays: [2], cutoffHour: 12 } },
    })
    expect(result.isoSet.has("2026-09-21")).toBe(false)
  })
})

describe("operator-managed fulfillment blackouts — issue #297", () => {
  it("moves UPS dispatch when the carrier has a pickup blackout", () => {
    const result = computeEligibleArrivalDates({
      method: "ups_overnight",
      destinationZip: "38120",
      now: new Date(2026, 6, 6, 10, 0), // Monday before cutoff
      blackouts: { upsPickupIso: ["2026-07-06"] },
    })

    expect(result.isoSet.has("2026-07-07")).toBe(false)
    expect(result.isoSet.has("2026-07-08")).toBe(true)
  })

  it("removes a UPS delivery blackout without blocking local delivery", () => {
    const blackouts = { upsDeliveryIso: ["2026-07-08"] }
    const ups = computeEligibleArrivalDates({
      method: "ups_overnight",
      destinationZip: "38120",
      now: new Date(2026, 6, 6, 10, 0),
      blackouts,
    })
    const local = computeEligibleArrivalDates({
      method: "atlanta_delivery",
      destinationZip: "30328",
      now: new Date(2026, 6, 6, 10, 0),
      atlantaZipConfig: { "30328": { weekdays: [3], cutoffHour: 12 } },
      blackouts,
    })

    expect(ups.isoSet.has("2026-07-08")).toBe(false)
    expect(local.isoSet.has("2026-07-08")).toBe(true)
  })

  it("blocks plant operations across local and Southeast route calendars", () => {
    const blackouts = { operationsIso: ["2026-07-14"] }
    const local = computeEligibleArrivalDates({
      method: "atlanta_delivery",
      destinationZip: "30328",
      now: new Date(2026, 6, 9, 10, 0),
      atlantaZipConfig: { "30328": { weekdays: [2], cutoffHour: 12 } },
      blackouts,
    })
    const southeast = computeEligibleArrivalDates({
      method: "southeast_pickup",
      now: new Date(2026, 6, 9, 10, 0),
      southeastAvailableIso: ["2026-07-14", "2026-07-21"],
      blackouts,
    })

    expect(local.isoSet.has("2026-07-14")).toBe(false)
    expect(local.isoSet.has("2026-07-21")).toBe(true)
    expect(southeast.isoSet.has("2026-07-14")).toBe(false)
    expect(southeast.isoSet.has("2026-07-21")).toBe(true)
  })

  it("rejects a QBD ready-by date that falls on a pickup blackout", () => {
    expect(
      computeQuickBooksDueDateForArrival("7/8/2026", {
        method: "ups_overnight",
        destinationZip: "38120",
        blackouts: { upsPickupIso: ["2026-07-07"] },
      })
    ).toBeNull()
  })
})

describe("UPS weekend-transit exclusion — issue #288", () => {
  it("does not offer Mon/Tue arrivals for a 2-day-transit zip (Memphis 38120)", () => {
    expect(lookupUpsGroundDays("38120")).toBe(2)
    // Monday Jun 22 2026 10:30 PM (Peter's report): after the 3 PM cutoff -> pack-out Tue,
    // dispatch Tue, 2-day transit -> earliest arrival Thursday Jun 25.
    const now = new Date(2026, 5, 22, 22, 30)
    const result = computeEligibleArrivalDates({
      method: "ups_ground",
      destinationZip: "38120",
      now,
    })
    expect(result.earliest && toIsoDate(result.earliest)).toBe("2026-06-25")
    // The impossible options Peter reported: Mon Jun 29 (needs Thu ship + weekend) and
    // Tue Jun 30 (needs Fri ship + weekend) must NOT be offered.
    expect(result.isoSet.has("2026-06-29")).toBe(false)
    expect(result.isoSet.has("2026-06-30")).toBe(false)
    // Weekend-safe 2-day arrivals are Wed (ship Mon) and Thu (ship Tue).
    expect(result.isoSet.has("2026-07-01")).toBe(true)
    expect(result.isoSet.has("2026-07-02")).toBe(true)
    // Every offered date is a Wednesday or Thursday for this 2-day zip.
    for (const d of result.dates) {
      expect([3, 4]).toContain(d.getDay())
    }
  })

  it("the server-side validator also rejects the impossible Mon/Tue dates (#288)", () => {
    const now = new Date(2026, 5, 22, 22, 30)
    expect(
      isArrivalDateValid("6/29/2026", { method: "ups_ground", destinationZip: "38120", now })
    ).toBe(false)
    expect(
      isArrivalDateValid("7/1/2026", { method: "ups_ground", destinationZip: "38120", now })
    ).toBe(true)
  })
})
