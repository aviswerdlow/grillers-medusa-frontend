"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { CONSENT_CHANGED_EVENT, hasConsent } from "@lib/utils/cookies"
import { getJitsuIdentityContext, jitsuPage } from "@lib/jitsu"

export default function JitsuScript() {
  const [hasAnalyticsConsent, setHasAnalyticsConsent] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const refresh = () => {
      const consent = hasConsent("analytics")
      if (!consent) getJitsuIdentityContext()
      setHasAnalyticsConsent(consent)
    }
    refresh()
    window.addEventListener(CONSENT_CHANGED_EVENT, refresh)
    window.addEventListener("focus", refresh)
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, refresh)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  // Track page views on route changes
  useEffect(() => {
    if (hasAnalyticsConsent && pathname) {
      try {
        jitsuPage({
          url: typeof window !== "undefined" ? window.location.href : undefined,
          path: pathname,
          referrer:
            typeof document !== "undefined" ? document.referrer : undefined,
          title: typeof document !== "undefined" ? document.title : undefined,
        })
      } catch {
        // Analytics failures must not trip app route boundaries.
      }
    }
  }, [pathname, hasAnalyticsConsent])

  return null
}
