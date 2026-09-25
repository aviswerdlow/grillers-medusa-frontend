import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import LocalMilestonesPhone from "@modules/staff/components/local-milestones-phone"
import {
  getLocalMilestoneOrder, listLocalEvidence, listLocalMilestones,
} from "@lib/data/staff/local-milestones"

jest.mock("@lib/data/staff/local-milestones", () => ({
  assignLocalMilestoneDriver: jest.fn(),
  getLocalMilestoneOrder: jest.fn(),
  listLocalEvidence: jest.fn(),
  listLocalMilestones: jest.fn(),
  recordLocalMilestone: jest.fn(),
  signLocalEvidence: jest.fn(),
}))

const state = {
  order_id: "order_fixture", fulfillment_id: "ful_fixture", mode: "local_delivery",
  milestone: "local_dispatched", version: 1, current_event_id: null,
  driver_customer_id: "cus_driver", updated_at: "2026-09-25T12:00:00Z",
  summary: {
    display_id: 42, recipient: "Fixture recipient", address_1: null,
    address_2: null, city: null, province: null, postal_code: null, phone: null,
  },
}

const originalFetch = global.fetch

beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  ;(listLocalMilestones as jest.Mock).mockResolvedValue({ ok: true, data: [state] })
  ;(getLocalMilestoneOrder as jest.Mock).mockResolvedValue({ ok: true, data: { state, events: [] } })
  ;(listLocalEvidence as jest.Mock).mockResolvedValue({ ok: true, data: [] })
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: jest.fn().mockReturnValueOnce("first-attempt").mockReturnValueOnce("fresh-attempt"),
  })
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    value: { digest: jest.fn(async () => new Uint8Array(32).buffer) },
  })
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: "storage unavailable" }) })
    .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ message: "evidence_upload_id_conflict" }) })
    .mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({ evidence: { status: "stored_private" }, duplicate: false }) }) as any
})

afterAll(() => { global.fetch = originalFetch })

it("keeps the upload ID after uncertainty but mints a new one after a swept attempt returns 409", async () => {
  render(<LocalMilestonesPhone office={false} />)
  fireEvent.click(await screen.findByRole("button", { name: /Order #42/ }))
  const uploadButton = await screen.findByRole("button", { name: "Store photo privately" })
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])
  const photo = new File([bytes], "delivery.jpg", { type: "image/jpeg" })
  Object.defineProperty(photo, "arrayBuffer", { value: async () => bytes.buffer })
  fireEvent.change(screen.getByLabelText("Delivery photo"), { target: { files: [photo] } })

  fireEvent.click(uploadButton)
  await screen.findByText(/Photo upload is incomplete/)
  fireEvent.click(uploadButton)
  await screen.findByText(/attempt can no longer be retried/)
  expect(sessionStorage.getItem(sessionStorage.key(0)!)).toBe("upload_fresh-attempt")
  fireEvent.click(uploadButton)
  await screen.findByText(/Photo stored privately/)

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3))
  const urls = (global.fetch as jest.Mock).mock.calls.map(call => String(call[0]))
  expect(urls[0]).toContain("/evidence/upload_first-attempt")
  expect(urls[1]).toBe(urls[0])
  expect(urls[2]).toContain("/evidence/upload_fresh-attempt")
  expect(sessionStorage.length).toBe(0)
})
