import { act, fireEvent, render, screen } from "@testing-library/react"
import StaffQuickBooksSyncStatusConsole from "@modules/staff/components/quickbooks-sync-status-console"
import {
  quickBooksSessionView,
  type QuickBooksSessionHealth,
} from "@lib/util/quickbooks-session-health"
import { getStaffQuickBooksSyncStatus } from "@lib/data/staff/quickbooks-sync"

jest.mock("@lib/data/staff/quickbooks-sync", () => ({
  getStaffQuickBooksSyncStatus: jest.fn(),
  requeueStaffQuickBooksSyncOrder: jest.fn(),
}))
const load = getStaffQuickBooksSyncStatus as jest.Mock
const health = (): QuickBooksSessionHealth => ({
  version: 1,
  state: "fresh",
  activity: "idle",
  observed_at: "2026-09-20T16:00:00Z",
  max_age_seconds: 900,
  age_seconds: 60,
  last_auth_at: "2026-09-20T15:59:00Z",
  last_auth_status: "success",
  last_accepted_auth_at: "2026-09-20T15:59:00Z",
  expires_at: "2026-09-20T16:14:00Z",
  issue: null,
  completion_evidence: "not_recorded",
  owner: "Test sync operator",
  monitor: null,
})
const response = () => ({
  summary: {
    total_orders: 7,
    open: 7,
    waiting: 7,
    stale_pending: 0,
    blocked: 0,
    error: 0,
    warning: 0,
    skipped: 0,
    synced: 0,
  },
  sync_status: { active: true, health: health() },
  orders: {
    data: [],
    current_page: 1,
    per_page: 20,
    total: 7,
    last_page: 1,
    has_more_pages: false,
  },
  recent_logs: [],
})
async function settle() {
  await act(async () => {
    await Promise.resolve()
  })
}
beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date("2026-09-20T16:00:00Z"))
  load.mockReset().mockResolvedValue(response())
})
afterEach(() => {
  jest.useRealTimers()
})

it("expires server evidence at the age boundary and rejects a backwards local clock", () => {
  expect(quickBooksSessionView(health(), 839_000).state).toBe("fresh")
  expect(quickBooksSessionView(health(), 840_000).state).toBe("stale")
  expect(quickBooksSessionView(health(), -1).state).toBe("unknown")
  expect(quickBooksSessionView(undefined, 0).state).toBe("unknown")
})

it("renders old successful authentication as stale despite an active flag", async () => {
  const data = response()
  data.sync_status.health.state = "stale"
  data.sync_status.health.age_seconds = 19 * 86400
  data.sync_status.health.last_auth_at = "2026-08-31T16:00:00Z"
  load.mockResolvedValue(data)
  render(<StaffQuickBooksSyncStatusConsole />)
  await settle()
  expect(
    screen.getByRole("heading", { name: "Web Connector session is stale" })
  ).toBeInTheDocument()
  expect(screen.queryByText(/is currently active/)).not.toBeInTheDocument()
  expect(screen.getByText(/All times UTC/)).toHaveTextContent("2026")
  expect(
    screen.getByText(
      /Sign-in does not prove a completed session or a posted order/
    )
  ).toBeInTheDocument()
})

it("removes previous status and counts after refresh failure and recovers without clearing the backlog", async () => {
  render(<StaffQuickBooksSyncStatusConsole />)
  await settle()
  expect(screen.getByText("Showing page 1 of 1 | 7 rows")).toBeInTheDocument()
  load.mockRejectedValueOnce(new Error("Sync service unavailable"))
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
  await settle()
  expect(
    screen.getByRole("heading", { name: "Session status unavailable" })
  ).toBeInTheDocument()
  expect(screen.getByText("Queue counts unavailable")).toBeInTheDocument()
  expect(screen.queryByText(/Showing page/)).not.toBeInTheDocument()
  expect(screen.getAllByText("Unavailable")).toHaveLength(5)
  expect(screen.queryByText("No orders in this view")).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }))
  await settle()
  expect(
    screen.getByRole("heading", { name: "Recent sign-in; connector idle" })
  ).toBeInTheDocument()
  expect(screen.getByText("Showing page 1 of 1 | 7 rows")).toBeInTheDocument()
})

it("expires freshness while an already open page waits for its next server refresh", async () => {
  const data = response()
  data.sync_status.health.age_seconds = 899
  load.mockResolvedValue(data)
  render(<StaffQuickBooksSyncStatusConsole />)
  await settle()
  expect(
    screen.getByRole("heading", { name: "Recent sign-in; connector idle" })
  ).toBeInTheDocument()
  await act(async () => {
    jest.advanceTimersByTime(1000)
  })
  expect(
    screen.getByRole("heading", { name: "Web Connector session is stale" })
  ).toBeInTheDocument()
  expect(load).toHaveBeenCalledTimes(1)
})

it("polls automatically and shows monitor delivery as pending independently of fresh sign-in", async () => {
  const data = response()
  data.sync_status.health.monitor = {
    checked_at: "2026-09-20T16:00:00Z",
    state: "fresh",
    delivery: "pending",
    last_sink_accepted_at: null,
    last_recovered_at: null,
  }
  load.mockResolvedValue(data)
  render(<StaffQuickBooksSyncStatusConsole />)
  await settle()
  expect(
    screen.getByText(/monitoring alert has not been accepted/)
  ).toBeInTheDocument()
  load.mockRejectedValueOnce(new Error("refresh failed"))
  await act(async () => {
    jest.advanceTimersByTime(60_000)
    await Promise.resolve()
  })
  expect(load).toHaveBeenCalledTimes(2)
  expect(screen.getByText("Queue counts unavailable")).toBeInTheDocument()
})
