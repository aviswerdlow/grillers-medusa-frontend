import { resolveStaffLinePricingBasis } from "@modules/staff/components/catch-weight-finalization-console/pricing-basis"

describe("staff finalization pricing basis", () => {
  it.each(["fixed", "fixed_price"])(
    "uses packed quantity for explicit %s lines even when weight hints exist",
    (pricingMode) => {
      expect(
        resolveStaffLinePricingBasis(
          {
            pricing_mode: pricingMode,
            estimated_weight_total: "4",
          },
          "Empire Chicken Drumsticks 4 lb"
        )
      ).toBe("per_pack")
    }
  )

  it("requires item weights when per-pound pricing is explicit", () => {
    expect(
      resolveStaffLinePricingBasis(
        {
          pricing_mode: "per_lb",
          estimated_weight_total: null,
        },
        "Boneless ribeye"
      )
    ).toBe("by_weight")
  })

  it("keeps legacy weight hints as a fallback when pricing mode is missing", () => {
    expect(
      resolveStaffLinePricingBasis(
        {
          pricing_mode: "",
          estimated_weight_total: "4",
        },
        "Prepared side"
      )
    ).toBe("by_weight")

    expect(
      resolveStaffLinePricingBasis(
        {
          pricing_mode: null,
          estimated_weight_total: null,
        },
        "Whole chicken 4 lb"
      )
    ).toBe("by_weight")
  })
})
