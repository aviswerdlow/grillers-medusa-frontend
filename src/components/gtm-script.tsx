"use client"

import { useEffect } from "react"
import Script from "next/script"
import {
  canUseProductionGtm,
  publishGtmConsentState,
} from "@lib/analytics/browser-boundary"

type GTMScriptProps = {
  gtmId: string
  enabled: boolean
  debug?: boolean
}

export default function GTMScript({ gtmId, enabled, debug }: GTMScriptProps) {
  useEffect(() => {
    if (enabled && canUseProductionGtm()) {
      // Initialize dataLayer
      window.dataLayer = window.dataLayer || []
      publishGtmConsentState()

      if (debug) {
        console.log("GTM Debug Mode: Initialized with ID", gtmId)
      }
    }
  }, [enabled, gtmId, debug])

  if (!enabled || !/^GTM-[A-Z0-9]+$/.test(gtmId) || !canUseProductionGtm()) {
    return null
  }

  return (
    <>
      {/* GTM Head Script */}
      <Script
        id="gtm-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${gtmId}');
          `,
        }}
      />
    </>
  )
}
