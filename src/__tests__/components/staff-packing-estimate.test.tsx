import { render, screen } from "@testing-library/react"
import { PackingEstimate } from "@modules/staff/components/catch-weight-finalization-console/packing-estimate"

test("missing legacy estimate is unavailable and never rendered as a zero-cost plan", () => {
  render(<PackingEstimate metadata={{ shipping_packing_plan_v1: { version: 1, packages: [] } }} />)
  expect(screen.getByText(/estimate unavailable/)).toBeInTheDocument()
  expect(screen.queryByText(/\$0.00/)).not.toBeInTheDocument()
})

test("staff sees the frozen exposure, contents, capacity and cost without raw product identities", () => {
  render(<PackingEstimate metadata={{ shipping_packing_plan_v1: {
    version: 1, boxes: 1, dryIceLb: 4, dryIceCost: 8, boxCost: 10, total: 18,
    weights: { qbd_list_id: "private-accounting-id" },
    appliedPolicy: { policy: { name: "Synthetic hot", revision: "fixture-v2", approvedBy: "Synthetic reviewer", approvedAt: "2026-09-19T16:00:00Z", effectiveFrom: "2026-10-01", effectiveThrough: "2026-10-31", delayAllowanceHours: 4 }, packedAt: "2026-10-05T16:00:00Z", arrivalBy: "2026-10-06T16:00:00Z", elapsedHours: 24, exposureHours: 28, dryIceUsdPerLb: 2 },
    packages: [{ boxName: "Synthetic box", productWeightLb: 8, dryIceLb: 4, tareLb: 1, grossWeightLb: 13, grossWeightLimitLb: 40, totalFitUnits: 6.5, fitCapacity: 10, lengthIn: 10, widthIn: 11, heightIn: 12 }],
  } }} />)
  expect(screen.getByText(/24 hours \+ 4 hours delay = 28 hours/)).toBeInTheDocument()
  expect(screen.getByText("13 / 40")).toBeInTheDocument()
  expect(screen.getByText("6.5 / 10")).toBeInTheDocument()
  expect(screen.getByText(/packing costs, not the customer's shipping charge/)).toBeInTheDocument()
  expect(screen.queryByText("private-accounting-id")).not.toBeInTheDocument()
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
})
