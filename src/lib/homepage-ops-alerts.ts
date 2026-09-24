import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { shouldEmitRuntimeOpsAlerts } from "@lib/util/build-context"

export type HomepageProductRail = "bestsellers" | "specialty"

function suppressDuringProductionBuild(alertKind: string) {
  if (shouldEmitRuntimeOpsAlerts()) return false
  console.warn(
    `[build] ${alertKind} observed; runtime ops alert intentionally suppressed`
  )
  return true
}

function redactedErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : String(
          (error as any)?.data?.message ||
            (error as any)?.message ||
            (error as any)?.statusText ||
            error ||
            "homepage product rail failed"
        )

  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(
      /\b(?:prod|variant|cart|order|cus|customer|line|li)_[A-Za-z0-9_]+/g,
      "[redacted-id]"
    )
    .slice(0, 500)
}

function railLabel(rail: HomepageProductRail) {
  switch (rail) {
    case "bestsellers":
      return "bestsellers"
    case "specialty":
      return "specialty"
  }
}

function railPath(rail: HomepageProductRail) {
  switch (rail) {
    case "bestsellers":
      return "src/modules/home/components/shop-bestsellers/index.tsx"
    case "specialty":
      return "src/modules/home/components/specialty-row/index.tsx"
  }
}

export async function emitFallbackHomepageOpsAlert({
  countryCode,
  hasStrapiData,
  hasGlobalData,
}: {
  countryCode: string
  hasStrapiData: boolean
  hasGlobalData: boolean
}) {
  if (suppressDuringProductionBuild("fallback_homepage_rendered")) return

  return emitStorefrontOpsAlert({
    alertKind: "fallback_homepage_rendered",
    title: `Fallback homepage rendered for ${countryCode}`,
    path: "src/app/[countryCode]/(main)/page.tsx",
    dedupeWindowMs: 5 * 60 * 1000,
    meta: {
      country_code: countryCode,
      has_strapi_data: hasStrapiData,
      has_global_data: hasGlobalData,
    },
  })
}

export async function emitHomepageProductRailFailureAlert({
  rail,
  countryCode,
  handleCount,
  error,
}: {
  rail: HomepageProductRail
  countryCode: string
  handleCount: number
  error: unknown
}) {
  const label = railLabel(rail)

  if (suppressDuringProductionBuild("homepage_product_rail_degraded")) return

  return emitStorefrontOpsAlert({
    alertKind: "homepage_product_rail_degraded",
    severity: "warn",
    title: `Homepage ${label} product rail unavailable`,
    path: railPath(rail),
    source: "storefront-server",
    fingerprint: `homepage_product_rail:${rail}`,
    dedupeWindowMs: 5 * 60 * 1000,
    meta: {
      homepage_rail: rail,
      country_code: countryCode,
      handle_count: Math.max(0, handleCount),
      route_dependency: "strapi_products_by_handle",
      error_message: redactedErrorMessage(error),
    },
  })
}
