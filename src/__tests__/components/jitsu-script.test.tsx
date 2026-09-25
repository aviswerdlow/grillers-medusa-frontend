import { render } from "@testing-library/react"
import JitsuScript from "@components/jitsu-script"
import { hasConsent } from "@lib/utils/cookies"
import { jitsuPage } from "@lib/jitsu"

let pathname = "/us"

jest.mock("next/navigation", () => ({
  usePathname: () => pathname,
}))

jest.mock("@lib/utils/cookies", () => ({
  hasConsent: jest.fn(),
  CONSENT_CHANGED_EVENT: "gp:consent-changed",
}))

jest.mock("@lib/jitsu", () => ({
  jitsuPage: jest.fn(),
  getJitsuIdentityContext: jest.fn(),
}))

describe("JitsuScript page tracking", () => {
  beforeEach(() => {
    pathname = "/us"
    ;(hasConsent as jest.Mock).mockReturnValue(true)
    ;(jitsuPage as jest.Mock).mockClear()
    window.history.replaceState({}, "", "/us?utm_source=one")
    document.title = "Grillers Pride"
  })

  it("tracks once per pathname change without search-param-only double fires", () => {
    const { rerender } = render(<JitsuScript />)

    expect(jitsuPage).toHaveBeenCalledTimes(1)
    expect(jitsuPage).toHaveBeenLastCalledWith({
      url: "http://localhost/us?utm_source=one",
      path: "/us",
      referrer: "",
      title: "Grillers Pride",
    })

    window.history.replaceState({}, "", "/us?utm_source=two")
    rerender(<JitsuScript />)

    expect(jitsuPage).toHaveBeenCalledTimes(1)

    pathname = "/us/store"
    window.history.replaceState({}, "", "/us/store?utm_source=two")
    rerender(<JitsuScript />)

    expect(jitsuPage).toHaveBeenCalledTimes(2)
    expect(jitsuPage).toHaveBeenLastCalledWith({
      url: "http://localhost/us/store?utm_source=two",
      path: "/us/store",
      referrer: "",
      title: "Grillers Pride",
    })
  })
})
