// Cookie consent utilities

export type ConsentPreferences = {
  analytics: boolean
  marketing: boolean
  timestamp: number
}

const CONSENT_COOKIE_NAME = "cookie_consent"
const CONSENT_COOKIE_EXPIRY_DAYS = 365
export const CONSENT_CHANGED_EVENT = "gp:consent-changed"
let consentWriteFailed = false

function validPreferences(value: any): value is ConsentPreferences {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.analytics === "boolean" &&
    typeof value.marketing === "boolean" &&
    typeof value.timestamp === "number" &&
    Number.isFinite(value.timestamp) &&
    value.timestamp > 0
  )
}

export function getConsentCookie(): ConsentPreferences | null {
  if (typeof document === "undefined" || consentWriteFailed) return null

  let cookie: string | undefined
  try {
    cookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${CONSENT_COOKIE_NAME}=`))
  } catch {
    return null
  }

  if (!cookie) return null

  try {
    const equalsIndex = cookie.indexOf("=")
    const value = equalsIndex >= 0 ? cookie.slice(equalsIndex + 1) : ""
    const parsed = JSON.parse(decodeURIComponent(value))
    return validPreferences(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function setConsentCookie(preferences: ConsentPreferences): void {
  if (typeof document === "undefined") return

  consentWriteFailed = false
  try {
    if (!validPreferences(preferences))
      throw new Error("Invalid consent preferences")
    const expires = new Date()
    expires.setDate(expires.getDate() + CONSENT_COOKIE_EXPIRY_DAYS)

    const cookieValue = encodeURIComponent(JSON.stringify(preferences))
    const secure =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "; Secure"
        : ""
    document.cookie = `${CONSENT_COOKIE_NAME}=${cookieValue}; expires=${expires.toUTCString()}; path=/; SameSite=Lax${secure}`
    const saved = getConsentCookie()
    consentWriteFailed =
      !saved ||
      saved.analytics !== preferences.analytics ||
      saved.marketing !== preferences.marketing ||
      saved.timestamp !== preferences.timestamp
  } catch {
    consentWriteFailed = true
    // Consent UI should never break browsing if storage is unavailable.
  } finally {
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT))
  }
}

export function hasConsent(category: "analytics" | "marketing"): boolean {
  const consent = getConsentCookie()
  if (!consent) return false
  return consent[category] === true
}

export function hasAnyConsent(): boolean {
  return getConsentCookie() !== null
}

export function acceptAllCookies(): void {
  setConsentCookie({
    analytics: true,
    marketing: true,
    timestamp: Date.now(),
  })
}

export function rejectAllCookies(): void {
  setConsentCookie({
    analytics: false,
    marketing: false,
    timestamp: Date.now(),
  })
}
