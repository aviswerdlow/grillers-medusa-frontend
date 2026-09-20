import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import FulfillmentCalendarPicker from "@modules/checkout/components/fulfillment-calendar"
import { getCheckoutCalendar, saveCheckoutCalendar } from "@lib/data/cart"

jest.mock("@lib/data/cart", () => ({
  getCheckoutCalendar: jest.fn(),
  saveCheckoutCalendar: jest.fn(),
}))
const list = getCheckoutCalendar as jest.Mock
const select = saveCheckoutCalendar as jest.Mock
const cart = {
  id: "cart_test",
  items: [
    {
      id: "line_test",
      variant_id: "variant_test",
      quantity: 1,
      unit_price: 10,
    },
  ],
  shipping_address: { postal_code: "10001" },
} as any
const first = {
  arrivalDate: "2026-10-08",
  window: {
    id: "test-window",
    label: "Test afternoon",
    start: "13:00",
    end: "17:00",
  },
  cutoffAt: "2026-10-07T16:00:00Z",
}
const page = (choices = [first]) => ({
  calendar: {
    generatedAt: "2026-10-05T18:00:00Z",
    expiresAt: "2026-10-05T18:10:00Z",
    timezone: "America/New_York",
    choices,
    unavailableReason: choices.length ? null : "no_available_dates",
  },
  contextRevision: "test-revision",
  shippingOptionId: "so_test",
})
beforeEach(() => {
  jest.clearAllMocks()
  list.mockResolvedValue({ ok: true, data: page() })
  select.mockResolvedValue({ ok: true, data: { state: "selected" } })
})
afterEach(() => {
  jest.useRealTimers()
})

test.each([
  "plant_pickup",
  "atlanta_delivery",
  "southeast_pickup",
  "ups_shipping",
] as const)(
  "%s asks the server and requires an explicit date and confirmation",
  async (fulfillmentType) => {
    const onSaved = jest.fn(),
      user = userEvent.setup()
    render(
      <FulfillmentCalendarPicker
        cart={cart}
        fulfillmentType={fulfillmentType}
        routeId="test-route"
        onSaved={onSaved}
      />
    )
    const date = await screen.findByRole("button", { name: /Thu, Oct 8, 2026/ })
    const confirm = screen.getByRole("button", {
      name: /Confirm (pickup|arrival) date/,
    })
    expect(confirm).toBeDisabled()
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        cartId: "cart_test",
        fulfillmentType,
        routeId: "test-route",
      })
    )
    await user.click(date)
    await user.click(confirm)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({
        choice: {
          arrivalDate: "2026-10-08",
          windowId: "test-window",
          routeId: "test-route",
          shippingOptionId: "so_test",
          contextRevision: "test-revision",
          replacementQuote: undefined,
        },
      })
    )
  }
)
test("an empty route stays empty and a source outage offers retry without invented dates", async () => {
  list
    .mockResolvedValueOnce({ ok: true, data: page([]) })
    .mockResolvedValueOnce({
      ok: false,
      error: "Dates are unavailable. Please retry.",
    })
  const user = userEvent.setup()
  render(
    <FulfillmentCalendarPicker
      cart={cart}
      fulfillmentType="southeast_pickup"
      routeId="gainesville"
      onSaved={jest.fn()}
    />
  )
  expect(await screen.findByText(/No dates are available/)).toBeVisible()
  expect(
    screen.queryByRole("button", { name: /Confirm/ })
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole("button", { name: "Refresh dates" }))
  const alert = await screen.findByRole("alert")
  expect(alert).toHaveTextContent("Dates are unavailable")
  expect(alert).toHaveFocus()
  expect(select).not.toHaveBeenCalled()
})
test("a changed carrier estimate is announced and needs a new keyboard selection and confirmation", async () => {
  const replacement = { ...first, arrivalDate: "2026-10-12", window: null }
  select.mockResolvedValueOnce({
    ok: true,
    data: {
      state: "changed",
      message: "Please confirm the updated date.",
      page: {
        ...page([replacement] as any),
        contextRevision: "revised",
        replacementQuote: "signed-replacement",
      },
    },
  })
  const user = userEvent.setup(),
    onSaved = jest.fn()
  render(
    <FulfillmentCalendarPicker
      cart={cart}
      fulfillmentType="ups_shipping"
      onSaved={onSaved}
    />
  )
  await user.click(
    await screen.findByRole("button", { name: /Thu, Oct 8, 2026/ })
  )
  await user.click(screen.getByRole("button", { name: "Confirm arrival date" }))
  expect(await screen.findByRole("alert")).toHaveFocus()
  expect(onSaved).not.toHaveBeenCalled()
  expect(
    screen.getByRole("button", { name: "Confirm arrival date" })
  ).toBeDisabled()
  await user.tab()
  expect(
    screen.getByRole("button", { name: /Mon, Oct 12, 2026/ })
  ).toHaveFocus()
  await user.keyboard("{Enter}")
  await user.tab()
  await user.keyboard("{Enter}")
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  expect(select.mock.calls[1][0].choice).toEqual(
    expect.objectContaining({
      arrivalDate: "2026-10-12",
      replacementQuote: "signed-replacement",
      contextRevision: "revised",
    })
  )
})
test("late responses for an old address cannot replace current choices", async () => {
  let resolveOld!: (value: any) => void
  list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve
      })
  )
  const onSaved = jest.fn()
  const view = render(
    <FulfillmentCalendarPicker
      cart={cart}
      fulfillmentType="ups_shipping"
      onSaved={onSaved}
    />
  )
  view.rerender(
    <FulfillmentCalendarPicker
      cart={{ ...cart, shipping_address: { postal_code: "30340" } }}
      fulfillmentType="ups_shipping"
      onSaved={onSaved}
    />
  )
  expect(
    await screen.findByRole("button", { name: /Thu, Oct 8, 2026/ })
  ).toBeVisible()
  await act(async () =>
    resolveOld({
      ok: true,
      data: page([{ ...first, arrivalDate: "2026-10-12" }]),
    })
  )
  expect(
    screen.queryByRole("button", { name: /Mon, Oct 12/ })
  ).not.toBeInTheDocument()
})
test("server lifetime expiration disables submission until refreshed, regardless of shopper clock", async () => {
  jest.useFakeTimers()
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  render(
    <FulfillmentCalendarPicker
      cart={cart}
      fulfillmentType="ups_shipping"
      onSaved={jest.fn()}
    />
  )
  await act(async () => {})
  await user.click(screen.getByRole("button", { name: /Thu, Oct 8, 2026/ }))
  act(() => {
    jest.advanceTimersByTime(600_000)
  })
  expect(screen.getByRole("alert")).toHaveTextContent("Refresh dates")
  expect(
    screen.queryByRole("button", { name: /Confirm/ })
  ).not.toBeInTheDocument()
  expect(select).not.toHaveBeenCalled()
})

test("staff adapters show only server-provided locations and require explicit exception review for each date", async () => {
  const actions = {
    load: jest.fn(),
    save: jest.fn(async () => ({
      ok: true as const,
      data: { state: "selected" as const },
    })),
  }
  const locations = [
    { id: "approved-route", city: "Fixture city", state: "SC" },
  ]
  actions.load.mockImplementation(async ({ routeId }) => ({
    ok: true,
    data: {
      ...page(routeId ? [first, { ...first, arrivalDate: "2026-10-09" }] : []),
      regionalLocations: locations,
    },
  }))
  const saved = jest.fn(),
    user = userEvent.setup()
  render(
    <FulfillmentCalendarPicker
      cart={cart}
      fulfillmentType="southeast_pickup"
      actions={actions}
      inventoryOverrideReview
      onSaved={saved}
    />
  )
  await user.selectOptions(
    await screen.findByRole("combobox", { name: /Pickup location/ }),
    "approved-route"
  )
  await user.click(await screen.findByRole("button", { name: /Thu, Oct 8/ }))
  const confirmButton = screen.getByRole("button", {
    name: "Confirm pickup date",
  })
  expect(confirmButton).toBeDisabled()
  await user.click(
    screen.getByRole("checkbox", { name: /inventory exceptions/ })
  )
  expect(confirmButton).toBeEnabled()
  await user.click(screen.getByRole("button", { name: /Fri, Oct 9/ }))
  expect(confirmButton).toBeDisabled()
  await user.click(
    screen.getByRole("checkbox", { name: /inventory exceptions/ })
  )
  await user.click(confirmButton)
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
  expect(actions.save).toHaveBeenCalledWith(
    expect.objectContaining({
      choice: expect.objectContaining({
        routeId: "approved-route",
        staffOverrideConfirmed: true,
        arrivalDate: "2026-10-09",
      }),
    })
  )
  expect(list).not.toHaveBeenCalled()
  expect(select).not.toHaveBeenCalled()
})
