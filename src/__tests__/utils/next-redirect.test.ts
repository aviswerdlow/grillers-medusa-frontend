import { isExpectedNextRedirect } from "@lib/util/next-redirect"

describe("isExpectedNextRedirect", () => {
  it.each([
    new Error("NEXT_REDIRECT"),
    "NEXT_REDIRECT",
    { message: "NEXT_REDIRECT" },
    { digest: "NEXT_REDIRECT;replace;/us/order/order_123/confirmed;307;" },
  ])("recognizes redirect signals across the server-action bridge", (error) => {
    expect(isExpectedNextRedirect(error)).toBe(true)
  })

  it.each([
    new Error("NEXT_REDIRECT failed"),
    { digest: "SOME_OTHER_ERROR" },
    "Could not place the order",
    null,
  ])("does not suppress real checkout errors", (error) => {
    expect(isExpectedNextRedirect(error)).toBe(false)
  })
})
