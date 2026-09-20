import {
  canReviewIncomingStock,
  receivingInstant,
  receivingLocal,
} from "@lib/util/incoming-stock"

describe("Receiving time and authority", () => {
  it("converts explicitly selected plant time independently of the browser timezone", () => {
    expect(receivingInstant("2026-10-05T08:00", "America/New_York")).toBe(
      "2026-10-05T12:00:00.000Z"
    )
    expect(receivingInstant("2026-12-05T08:00", "America/New_York")).toBe(
      "2026-12-05T13:00:00.000Z"
    )
    expect(receivingInstant("2026-10-05T08:00", "America/Chicago")).toBe(
      "2026-10-05T13:00:00.000Z"
    )
    expect(receivingLocal("2026-10-05T12:00:00.000Z", "America/New_York")).toBe(
      "2026-10-05T08:00"
    )
  })
  it.each(["2026-03-08T02:30", "2026-11-01T01:30"])(
    "refuses ambiguous or missing clock-change time %s",
    (local) => {
      expect(() => receivingInstant(local, "America/New_York")).toThrow(
        "clocks change"
      )
    }
  )
  it("refuses impossible dates and unspecified timezone", () => {
    expect(() =>
      receivingInstant("2026-02-30T08:00", "America/New_York")
    ).toThrow("real usable")
    expect(() => receivingInstant("2026-10-05T08:00", "")).toThrow(
      "receiving timezone"
    )
  })
  it("allows inventory roles while denying customers, merchandising and revoked sessions", () => {
    for (const role of [
      "staff",
      "office",
      "picker",
      "packer",
      "manager",
      "super_admin",
    ])
      expect(
        canReviewIncomingStock({ metadata: { gp_staff_role: role } })
      ).toBe(true)
    for (const role of ["customer", "merchandising_reviewer"])
      expect(
        canReviewIncomingStock({ metadata: { gp_staff_role: role } })
      ).toBe(false)
    expect(
      canReviewIncomingStock({
        metadata: { gp_staff_role: "super_admin" },
        staff_access: { session_current: false },
      })
    ).toBe(false)
  })
})
