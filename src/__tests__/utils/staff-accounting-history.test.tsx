import { render, screen } from "@testing-library/react"
import AccountingHistory from "../../modules/staff/components/order-exception-console/accounting-history"

it("distinguishes a delivered charge from recorded refunds without collapsing their receipts", () => {
  render(<AccountingHistory actions={[
    { id: "charge", request_key: "charge:one", action: "final_card_charge_accounting_record", status: "delivered", amount_minor: 3000, currency_code: "usd", created_at: "2026-09-19" },
    { id: "refund", request_key: "refund:one", action: "card_refund_accounting_record", status: "posted", amount_minor: 500, currency_code: "usd", created_at: "2026-09-19", receipt: { transactions: [{ kind: "card_refund", txn_id: "TEST-REFUND" }] } },
  ]} />)
  expect(screen.getByText("Final card charge · $30.00")).toBeInTheDocument()
  expect(screen.getByText("Awaiting QuickBooks")).toBeInTheDocument()
  expect(screen.getByText("Card refund · $5.00")).toBeInTheDocument()
  expect(screen.getByText("Recorded")).toBeInTheDocument()
  expect(screen.getByText("card_refund: TEST-REFUND")).toBeInTheDocument()
})

it("does not show an empty-success state when accounting history cannot be read", () => {
  render(<AccountingHistory error="Accounting history is unavailable." />)
  expect(screen.getByRole("alert")).toHaveTextContent("Accounting history is unavailable.")
  expect(screen.queryByText(/No durable accounting actions/)).not.toBeInTheDocument()
})
