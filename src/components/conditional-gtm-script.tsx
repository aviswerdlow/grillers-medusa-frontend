"use client"

import { useEffect, useState } from "react"
import { CONSENT_CHANGED_EVENT } from "@lib/utils/cookies"
import {
  canUseProductionGtm,
  publishGtmConsentState,
} from "@lib/analytics/browser-boundary"
import GTMScript from "./gtm-script"

type ConditionalGTMScriptProps = {
  gtmId: string
  ga4Id?: string
  enabled: boolean
  debug?: boolean
}

export default function ConditionalGTMScript({
  gtmId,
  ga4Id,
  enabled,
  debug,
}: ConditionalGTMScriptProps) {
  const [hasAnalyticsConsent, setHasAnalyticsConsent] = useState(false)

  useEffect(() => {
    const refresh = () => {
      publishGtmConsentState()
      setHasAnalyticsConsent(canUseProductionGtm())
    }
    refresh()
    window.addEventListener(CONSENT_CHANGED_EVENT, refresh)
    window.addEventListener("focus", refresh)
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, refresh)
      window.removeEventListener("focus", refresh)
    }
  }, [])

  // Don't load GTM if user hasn't consented to analytics
  if (!hasAnalyticsConsent || !enabled || !canUseProductionGtm()) {
    if (debug) {
      console.log("GTM blocked: No analytics consent")
    }
    return null
  }

  return (
    <>
      <GTMScript gtmId={gtmId} enabled={enabled} debug={debug} />
      {/* GTM noscript fallback */}
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
    </>
  )
}
