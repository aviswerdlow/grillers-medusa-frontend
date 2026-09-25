import { render, screen, waitFor } from "@testing-library/react"
import InstitutionalCollectionStatus from "@modules/staff/components/institutional-collection-status"
import { getStaffInstitutionalCollection } from "@lib/data/staff/institutional-collection"

jest.mock("@lib/data/staff/institutional-collection", () => ({
  getStaffInstitutionalCollection: jest.fn(),
}))

const read = getStaffInstitutionalCollection as jest.Mock

beforeEach(() => jest.clearAllMocks())

it("does not turn an uncertain QBD balance into zero collected or reconciled", async () => {
  read.mockResolvedValue({
    status: "quarantined",
    invoiceTxnId: "TEST_INVOICE_G",
    collection: {
      confirmedCollectedCents: 0,
      confirmedCreditCents: 0,
      verifiedRemainingCents: null,
      appliedReceiptCount: 0,
      quarantineReasons: ["credit_pending_detail"],
    },
  })
  render(<InstitutionalCollectionStatus orderId="order_fixture_g" />)

  await waitFor(() => expect(screen.getByText("On reconciliation hold")).toBeInTheDocument())
  expect(screen.getByText(/Verified remaining A\/R: Pending exact QuickBooks readback/))
    .toBeInTheDocument()
  expect(screen.getByText(/Do not treat a pending payment or credit as collected/))
    .toBeInTheDocument()
  expect(read).toHaveBeenCalledWith("order_fixture_g")
})

it("shows a source-confirmed zero balance as zero", async () => {
  read.mockResolvedValue({
    status: "reconciled",
    invoiceTxnId: "TEST_INVOICE_E",
    collection: {
      confirmedCollectedCents: 50000,
      confirmedCreditCents: 0,
      verifiedRemainingCents: 0,
      appliedReceiptCount: 1,
      quarantineReasons: [],
    },
  })
  render(<InstitutionalCollectionStatus orderId="order_fixture_e" />)

  await waitFor(() => expect(screen.getByText("Reconciled with QuickBooks invoice"))
    .toBeInTheDocument())
  expect(screen.getByText(/Verified remaining A\/R: \$0\.00/)).toBeInTheDocument()
})
