import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { usePathname } from "next/navigation"
import NewsletterPopup from "@components/newsletter-popup"
import { subscribeToNewsletter } from "@lib/data/newsletter"

jest.mock("next/navigation", () => ({ usePathname: jest.fn() }))
jest.mock("@lib/data/newsletter", () => ({ subscribeToNewsletter: jest.fn() }))
const pathname = usePathname as jest.Mock

beforeEach(() => {
  jest.useFakeTimers()
  localStorage.clear()
  pathname.mockReturnValue("/us/recipes")
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 3000,
  })
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  })
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: 0,
    writable: true,
  })
})
afterEach(() => jest.useRealTimers())
const readHalfPage = () => {
  window.scrollY = 1200
  fireEvent.scroll(window)
}

it.each([
  "/us",
  "/us/search",
  "/us/products/brisket",
  "/us/cart",
  "/us/checkout",
])("does not interrupt shopping at %s", (route) => {
  pathname.mockReturnValue(route)
  render(<NewsletterPopup />)
  act(() => jest.advanceTimersByTime(90000))
  readHalfPage()
  expect(
    screen.queryByRole("button", { name: "Email updates" })
  ).not.toBeInTheDocument()
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
})

it.each([{ subscribed: true }, { snoozedUntil: Date.now() + 86400000 }])(
  "respects an existing preference %j",
  (preference) => {
    localStorage.setItem("gp-newsletter-popup", JSON.stringify(preference))
    render(<NewsletterPopup />)
    act(() => jest.advanceTimersByTime(90000))
    readHalfPage()
    expect(
      screen.queryByRole("button", { name: "Email updates" })
    ).not.toBeInTheDocument()
  }
)

it("requires both reading time and scroll, opens only on request, and restores focus after Escape", async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  const { unmount } = render(<NewsletterPopup />)
  act(() => jest.advanceTimersByTime(60000))
  expect(
    screen.queryByRole("button", { name: "Email updates" })
  ).not.toBeInTheDocument()
  readHalfPage()
  const trigger = screen.getByRole("button", { name: "Email updates" })
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  await user.click(trigger)
  act(() => jest.advanceTimersByTime(100))
  expect(screen.getByRole("dialog")).toHaveAccessibleName(
    "First crack at holiday cuts"
  )
  expect(screen.getByRole("textbox", { name: "Email address" })).toHaveFocus()
  await user.keyboard("{Escape}")
  act(() => jest.advanceTimersByTime(100))
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  expect(
    JSON.parse(localStorage.getItem("gp-newsletter-popup")!).snoozedUntil
  ).toBeGreaterThan(Date.now())
  expect(subscribeToNewsletter).not.toHaveBeenCalled()
  unmount()
  render(<NewsletterPopup />)
  act(() => jest.advanceTimersByTime(90000))
  readHalfPage()
  expect(
    screen.queryByRole("button", { name: "Email updates" })
  ).not.toBeInTheDocument()
})
