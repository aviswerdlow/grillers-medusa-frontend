import { act, fireEvent, render, screen } from "@testing-library/react"
import JitsuScript from "@components/jitsu-script"
import ConditionalGTMScript from "@components/conditional-gtm-script"
import CookieConsentBanner from "@components/cookie-consent-banner"
import {
  CONSENT_CHANGED_EVENT,
  getConsentCookie,
  rejectAllCookies,
  setConsentCookie,
} from "@lib/utils/cookies"
import { jitsuPage } from "@lib/jitsu"

jest.mock("next/navigation", () => ({ usePathname: () => "/us" }))
jest.mock("@lib/jitsu", () => ({
  jitsuPage: jest.fn(),
  getJitsuIdentityContext: jest.fn(),
}))
jest.mock(
  "@components/gtm-script",
  () =>
    function MockGtm() {
      return <div data-testid="gtm" />
    }
)

const originalEnv = { ...process.env }
beforeEach(() => {
  process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT = "production"
  process.env.NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID = ""
  process.env.NEXT_PUBLIC_STRIPE_MODE_OVERRIDE = "live"
  process.env.NEXT_PUBLIC_STRIPE_KEY_LIVE = "pk_live_fixture"
  process.env.NEXT_PUBLIC_GTM_CONSENT_READY = "true"
  rejectAllCookies()
  window.dataLayer = []
  jest.clearAllMocks()
})
afterEach(() => {
  process.env = { ...originalEnv }
})

it("loads on saved consent, sends the current page once and withdraws on revocation", () => {
  render(
    <>
      <JitsuScript />
      <ConditionalGTMScript gtmId="GTM-FIXTURE" enabled />
    </>
  )
  expect(jitsuPage).not.toHaveBeenCalled()
  expect(screen.queryByTestId("gtm")).toBeNull()
  act(() =>
    setConsentCookie({
      analytics: true,
      marketing: false,
      timestamp: Date.now(),
    })
  )
  expect(jitsuPage).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId("gtm")).toBeInTheDocument()
  expect(window.dataLayer.at(-1)).toMatchObject({
    analytics_storage: "granted",
    ad_storage: "denied",
  })
  act(() => window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT)))
  expect(jitsuPage).toHaveBeenCalledTimes(1)
  act(() => rejectAllCookies())
  expect(screen.queryByTestId("gtm")).toBeNull()
  expect(window.dataLayer.at(-1)).toMatchObject({
    analytics_storage: "denied",
    ad_storage: "denied",
  })
  expect(jitsuPage).toHaveBeenCalledTimes(1)
})

it("reads actual cookies on focus and never trusts a consent event payload", () => {
  render(<JitsuScript />)
  act(() =>
    window.dispatchEvent(
      new CustomEvent(CONSENT_CHANGED_EVENT, { detail: { analytics: true } })
    )
  )
  expect(jitsuPage).not.toHaveBeenCalled()
  document.cookie = `cookie_consent=${encodeURIComponent(
    JSON.stringify({ analytics: true, marketing: false, timestamp: Date.now() })
  )};path=/`
  act(() => window.dispatchEvent(new Event("focus")))
  expect(jitsuPage).toHaveBeenCalledTimes(1)
})

it("accepting the banner updates mounted tracking without needing a page reload", () => {
  document.cookie = "cookie_consent=;path=/;max-age=0"
  sessionStorage.clear()
  render(
    <>
      <JitsuScript />
      <CookieConsentBanner
        message="Cookie choices"
        acceptText="Accept all"
        rejectText="Reject all"
        preferencesText="Preferences"
        categories={[]}
      />
    </>
  )
  fireEvent.click(screen.getByRole("button", { name: "Accept all" }))
  expect(getConsentCookie()).toMatchObject({ analytics: true, marketing: true })
  expect(screen.queryByRole("button", { name: "Accept all" })).toBeNull()
  expect(jitsuPage).toHaveBeenCalledTimes(1)
})

it.each(["rehearsal", "unverified_container"])(
  "does not mount production GTM in %s",
  (scenario) => {
    setConsentCookie({
      analytics: true,
      marketing: true,
      timestamp: Date.now(),
    })
    if (scenario === "rehearsal") {
      process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT = "rehearsal"
      process.env.NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID = "launch-test"
      process.env.NEXT_PUBLIC_STRIPE_MODE_OVERRIDE = "test"
      process.env.NEXT_PUBLIC_STRIPE_KEY_TEST = "pk_test_fixture"
    } else process.env.NEXT_PUBLIC_GTM_CONSENT_READY = "false"
    render(<ConditionalGTMScript gtmId="GTM-FIXTURE" enabled />)
    expect(screen.queryByTestId("gtm")).toBeNull()
  }
)
