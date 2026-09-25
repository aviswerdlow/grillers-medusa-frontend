"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  getConsentCookie,
  acceptAllCookies,
  rejectAllCookies,
  setConsentCookie,
} from "@lib/utils/cookies"
import type { CookieCategory } from "@lib/data/strapi/cookie-consent"

const BANNER_DISMISSED_KEY = "cookie_banner_dismissed"

function getSessionDismissed() {
  try {
    return sessionStorage.getItem(BANNER_DISMISSED_KEY) === "true"
  } catch {
    return false
  }
}

function setSessionDismissed() {
  try {
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "true")
  } catch {
    // Consent is persisted in a cookie. Session storage is only a UI nicety.
  }
}

type CookieConsentBannerProps = {
  message: string
  acceptText: string
  rejectText: string
  preferencesText: string
  privacyLink?: {
    Text: string
    Url: string
  }
  categories: CookieCategory[]
  position?: string
  backgroundColor?: string
  textColor?: string
}

export default function CookieConsentBanner({
  message,
  acceptText,
  rejectText,
  preferencesText,
  privacyLink,
  categories,
  position = "bottom",
  backgroundColor = "#1A1A1A",
  textColor = "#FFFFFF",
}: CookieConsentBannerProps) {
  const [showBanner, setShowBanner] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  const [preferences, setPreferences] = useState({
    analytics: false,
    marketing: false,
  })

  useEffect(() => {
    // The durable source of truth is the 365-day consent cookie. The old
    // session-only check caused the banner to reappear on every new browser
    // session even after the visitor had accepted or rejected cookies.
    if (getConsentCookie()) {
      setSessionDismissed()
      return
    }

    if (!getSessionDismissed()) {
      setShowBanner(true)
    }
  }, [])

  const handleAcceptAll = () => {
    acceptAllCookies()
    setShowBanner(false)
    setSessionDismissed()
  }

  const handleRejectAll = () => {
    rejectAllCookies()
    setShowBanner(false)
    setSessionDismissed()
  }

  const handleSavePreferences = () => {
    setConsentCookie({
      ...preferences,
      timestamp: Date.now(),
    })
    setShowBanner(false)
    setSessionDismissed()
  }

  if (!showBanner) {
    return null
  }

  const positionClasses =
    position === "top"
      ? "top-0"
      : position === "center"
        ? "top-1/2 -translate-y-1/2"
        : "bottom-0"

  return (
    <div
      className={`fixed left-0 right-0 z-50 ${positionClasses} shadow-2xl`}
      style={{ backgroundColor, color: textColor }}
    >
      <div className="content-container py-6">
        {!showPreferences ? (
          // Simple Banner
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm md:text-base">{message}</p>
              {privacyLink && (
                <Link
                  href={
                    !privacyLink.Url || privacyLink.Url === "#"
                      ? "/page/privacy-policy"
                      : privacyLink.Url
                  }
                  className="min-h-[44px] inline-flex items-center text-sm underline hover:opacity-80 mt-2"
                  style={{ color: textColor }}
                >
                  {privacyLink.Text}
                </Link>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleRejectAll}
                className="px-6 py-2 min-h-[44px] text-sm font-semibold border rounded hover:opacity-80 transition"
                style={{ borderColor: textColor, color: textColor }}
              >
                {rejectText}
              </button>
              <button
                onClick={() => setShowPreferences(true)}
                className="px-6 py-2 min-h-[44px] text-sm font-semibold border rounded hover:opacity-80 transition"
                style={{ borderColor: textColor, color: textColor }}
              >
                {preferencesText}
              </button>
              <button
                onClick={handleAcceptAll}
                className="px-6 py-2 min-h-[44px] text-sm font-semibold rounded hover:opacity-90 transition"
                style={{
                  backgroundColor: textColor,
                  color: backgroundColor,
                }}
              >
                {acceptText}
              </button>
            </div>
          </div>
        ) : (
          // Preferences Panel
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Cookie Preferences</h3>
              <button
                onClick={() => setShowPreferences(false)}
                className="text-2xl hover:opacity-80"
                aria-label="Close preferences"
              >
                ×
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {categories.map((category) => {
                const categoryName = category.Name?.toLowerCase()
                const categoryKey: "analytics" | "marketing" =
                  categoryName === "marketing" ? "marketing" : "analytics"
                const isRequired = category.Required

                return (
                  <div
                    key={category.id}
                    className="flex items-start justify-between py-3 border-t"
                    style={{ borderColor: `${textColor}40` }}
                  >
                    <div className="flex-1 pr-4">
                      <h4 className="font-semibold text-sm mb-1">
                        {category.Name}
                      </h4>
                      <p className="text-xs opacity-80">
                        {category.Description}
                      </p>
                    </div>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isRequired || preferences[categoryKey]}
                        disabled={isRequired}
                        onChange={(e) => {
                          if (!isRequired) {
                            setPreferences((prev) => ({
                              ...prev,
                              [categoryKey]: e.target.checked,
                            }))
                          }
                        }}
                        className="mr-2 h-5 w-5"
                      />
                      <span className="text-sm">
                        {isRequired ? "Required" : "Optional"}
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowPreferences(false)}
                className="px-6 py-2 min-h-[44px] text-sm font-semibold border rounded hover:opacity-80 transition"
                style={{ borderColor: textColor, color: textColor }}
              >
                Cancel
              </button>
              <button
                onClick={handleSavePreferences}
                className="px-6 py-2 min-h-[44px] text-sm font-semibold rounded hover:opacity-90 transition"
                style={{
                  backgroundColor: textColor,
                  color: backgroundColor,
                }}
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
