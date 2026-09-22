import { emitStorefrontOpsAlert } from "@lib/ops-alert"

type StoreCatalogFailureStage = "primary" | "legacy"

type StoreCatalogFailureAlertInput = {
  stage: StoreCatalogFailureStage
  error: unknown
  timeoutMs: number
  recovered: boolean
  primaryError?: unknown
}

type StoreCatalogEmptyAlertInput = {
  rawCount: number
  visibleCount: number
}

type StoreCatalogInventoryMissingAlertInput = {
  productCount: number
  variantCount: number
  examples: Array<{
    productId?: string | null
    productTitle?: string | null
    variantId?: string | null
    sku?: string | null
  }>
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export async function emitStoreCatalogLoadFailureAlert({
  stage,
  error,
  timeoutMs,
  recovered,
  primaryError,
}: StoreCatalogFailureAlertInput) {
  const message = errorMessage(error)

  await emitStorefrontOpsAlert({
    alertKind: recovered
      ? "store_catalog_load_degraded"
      : "store_catalog_load_failed",
    severity: recovered ? "warn" : "page",
    title: recovered
      ? `Store catalog ${stage} Strapi query failed; recovered by fallback`
      : "Store catalog failed to load from Strapi",
    path: "src/lib/data/strapi/collections.ts",
    source: "medusa-server",
    fingerprint: `store_catalog:${stage}:${recovered ? "degraded" : "failed"}`,
    dedupeWindowMs: 5 * 60 * 1000,
    meta: {
      catalog_surface: "store",
      stage,
      recovered,
      timeout_ms: timeoutMs,
      error_message: message.slice(0, 500),
      primary_error_message: primaryError
        ? errorMessage(primaryError).slice(0, 500)
        : null,
    },
  })
}

export async function emitStoreCatalogEmptyAlert({
  rawCount,
  visibleCount,
}: StoreCatalogEmptyAlertInput) {
  await emitStorefrontOpsAlert({
    alertKind: "store_catalog_empty",
    severity: "page",
    title: "Store catalog resolved with no visible products",
    path: "src/app/[countryCode]/(main)/store/page.tsx",
    source: "medusa-server",
    fingerprint: "store_catalog:empty",
    dedupeWindowMs: 5 * 60 * 1000,
    meta: {
      catalog_surface: "store",
      raw_product_count: rawCount,
      visible_product_count: visibleCount,
    },
  })
}

export async function emitStoreCatalogInventoryMissingAlert({
  productCount,
  variantCount,
  examples,
}: StoreCatalogInventoryMissingAlertInput) {
  await emitStorefrontOpsAlert({
    alertKind: "store_catalog_inventory_missing",
    severity: "warn",
    title:
      "Store catalog has product cards without live inventory observations",
    path: "src/app/[countryCode]/(main)/store/page.tsx",
    source: "medusa-server",
    fingerprint: "store_catalog:inventory_missing",
    meta: {
      catalog_surface: "store",
      product_count: productCount,
      variant_count: variantCount,
      examples: examples.slice(0, 5),
    },
  })
}
