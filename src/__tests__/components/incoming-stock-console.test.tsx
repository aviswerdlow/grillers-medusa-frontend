import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import IncomingStockConsole from "@modules/staff/components/incoming-stock-console"
import {
  getIncomingExceptions,
  getIncomingStock,
  saveIncomingStock,
  searchIncomingProducts,
} from "@lib/data/staff/incoming-stock"
jest.mock("@lib/data/staff/incoming-stock", () => ({
  getIncomingExceptions: jest.fn(),
  getIncomingStock: jest.fn(),
  saveIncomingStock: jest.fn(),
  searchIncomingProducts: jest.fn(),
}))
const product = { variant_id: "variant_pie", title: "Test pies", sku: "PIE" }
const batch = {
  id: "batch_1",
  variant_id: product.variant_id,
  stock_unit: "pack",
  source_system: "receiving",
  source_ref: "Fixture-001",
  expected_quantity: 10,
  confirmed_quantity: 10,
  committed_quantity: 8,
  available_quantity: 2,
  usable_at: "2026-10-04T12:00:00.000Z",
  status: "confirmed",
  revision: 1,
}
const queue = { demands: [], next_cursor: null, can_manage: true }
const view = {
  batches: [batch],
  demands: [],
  receipts: [],
  can_manage: true,
  checkout_enabled: false,
}
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: jest.fn(() => "fixture-request-id"),
  })
  ;(searchIncomingProducts as jest.Mock).mockResolvedValue({
    ok: true,
    data: [product],
  })
  ;(getIncomingStock as jest.Mock).mockResolvedValue({ ok: true, data: view })
  ;(getIncomingExceptions as jest.Mock).mockResolvedValue({
    ok: true,
    data: queue,
  })
  ;(saveIncomingStock as jest.Mock).mockResolvedValue({
    ok: true,
    data: { receipt_pending: false, affected_count: 0 },
  })
})
async function selectProduct() {
  change("Receiving timezone", "America/New_York")
  change("Product name or SKU", "pies")
  fireEvent.click(screen.getByRole("button", { name: "Search products" }))
  fireEvent.click(await screen.findByRole("button", { name: "Test pies PIE" }))
  await screen.findByRole("button", { name: "Add expected batch" })
}
it("shows quantities together and keeps mutations unavailable to a read-only staff member", async () => {
  ;(getIncomingStock as jest.Mock).mockResolvedValue({
    ok: true,
    data: { ...view, can_manage: false },
  })
  render(
    <IncomingStockConsole
      actorId="staff"
      initialQueue={{ ok: true, data: queue }}
    />
  )
  change("Receiving timezone", "America/New_York")
  change("Product name or SKU", "pies")
  fireEvent.click(screen.getByRole("button", { name: "Search products" }))
  fireEvent.click(await screen.findByRole("button", { name: "Test pies PIE" }))
  await screen.findByText(/approved receiving operator must make changes/)
  expect(screen.getByRole("button", { name: "Revise" })).toBeDisabled()
  expect(
    screen.queryByRole("button", { name: "Add expected batch" })
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole("columnheader", { name: "Committed" })
  ).toBeInTheDocument()
  expect(screen.getByRole("cell", { name: "8" })).toBeInTheDocument()
})
it("preserves the exact request through uncertainty and a reload, then clears it on confirmed receipt", async () => {
  const first = render(
    <IncomingStockConsole
      actorId="staff"
      initialQueue={{ ok: true, data: queue }}
    />
  )
  await selectProduct()
  fireEvent.click(screen.getByRole("button", { name: "Revise" }))
  change("Confirmed quantity", "6")
  change("Reason and evidence", "Supplier confirmed short production")
  ;(saveIncomingStock as jest.Mock).mockResolvedValueOnce({
    ok: false,
    error: "Response lost",
    uncertain: true,
  })
  fireEvent.click(
    screen.getByRole("button", { name: "Revise confirmed batch" })
  )
  await screen.findByRole("button", { name: "Retry saved request" })
  const submitted = (saveIncomingStock as jest.Mock).mock.calls[0][0]
  expect(submitted).toMatchObject({
    quantity: 6,
    expected_revision: 1,
    request_id: "fixture-request-id",
  })
  expect(screen.getByLabelText("Confirmed quantity")).toBeDisabled()
  first.unmount()
  render(
    <IncomingStockConsole
      actorId="staff"
      initialQueue={{ ok: true, data: queue }}
    />
  )
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry saved request" })
  )
  await screen.findByText("Receiving change recorded.")
  expect((saveIncomingStock as jest.Mock).mock.calls[1][0]).toEqual(submitted)
  expect(sessionStorage.getItem("gp-incoming-pending:staff")).toBeNull()
})
it("requires final-receipt acknowledgement and reports that stock has not increased", async () => {
  render(
    <IncomingStockConsole
      actorId="staff"
      initialQueue={{ ok: true, data: queue }}
    />
  )
  await selectProduct()
  fireEvent.click(screen.getByRole("button", { name: "Record receipt" }))
  change("Source record type", "receiving-log")
  change("Unique source reference", "receipt-001")
  change("Reason and evidence", "Final short delivery verified")
  const checkbox = screen.getByRole("checkbox", { name: /final delivery/ })
  expect(checkbox).toBeRequired()
  fireEvent.click(checkbox)
  ;(saveIncomingStock as jest.Mock).mockResolvedValueOnce({
    ok: true,
    data: { receipt_pending: true, affected_count: 1 },
  })
  fireEvent.click(screen.getByRole("button", { name: "Record final receipt" }))
  await screen.findByText(
    /Final receipt recorded. It is awaiting reconciliation/
  )
  expect((saveIncomingStock as jest.Mock).mock.calls[0][0]).toMatchObject({
    action: "stage_receipt",
    receipt_final_confirmed: true,
    expected_revision: 1,
  })
})
it("preserves affected-order customer dates and pages the cross-product queue", async () => {
  const demand = {
    id: "d1",
    variant_id: product.variant_id,
    order_id: "order_fixture",
    cart_id: null,
    line_item_id: "line_fixture",
    product_title: "Test pies",
    quantity: 8,
    remaining_quantity: 8,
    stock_unit: "pack",
    customer_date: "2026-10-09",
    needed_by: "2026-10-05T12:00:00Z",
    exception_reason: "incoming_short",
    status: "committed",
  }
  render(
    <IncomingStockConsole
      actorId="staff"
      initialQueue={{
        ok: true,
        data: { ...queue, demands: [demand], next_cursor: "d1" },
      }}
    />
  )
  expect(screen.getByText(/Customer date 2026-10-09/)).toBeInTheDocument()
  expect(screen.getByText(/Order: order_fixture/)).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole("button", { name: "Load more affected orders" })
  )
  await waitFor(() => expect(getIncomingExceptions).toHaveBeenCalledWith("d1"))
})
