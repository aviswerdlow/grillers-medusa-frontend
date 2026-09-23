export const dynamic = "force-dynamic"

import { Metadata } from "next"
import { retrieveCustomer } from "@lib/data/customer"
import {
  listAllLegacyCustomerOrders,
  listPurchaseHistory,
} from "@lib/data/orders"
import {
  getProductsByMedusaLookupRefs,
  type StrapiCollectionProduct,
} from "@lib/data/strapi/collections"
import { enrichStrapiProductsWithMedusaPrices } from "@lib/data/products"
import { emitOrderHistoryDataFailureAlert } from "@lib/order-history-ops-alerts"
import strapiClient from "@lib/strapi"
import ReorderBrowser from "@modules/account/components/reorder-browser"
import LoginTemplate from "@modules/account/templates/login-template"

const REORDER_PAGE_PATH =
  "src/app/[countryCode]/(main)/account/reorder/page.tsx"

function presentString(value: string | null | undefined): value is string {
  return Boolean(value)
}

export const metadata: Metadata = {
  title: "Reorder | Grillers Pride",
  description: "Restock from your Grillers Pride purchase history.",
}

export default async function ReorderPage({
  params,
  searchParams,
}: {
  params: Promise<{ countryCode: string }>
  searchParams?: Promise<{ start?: string }>
}) {
  const { countryCode } = await params
  const resolvedSearchParams = await searchParams
  const customer = await retrieveCustomer().catch(() => null)

  if (!customer) {
    return <LoginTemplate />
  }

  const [historyResult, legacyOrderHistoryResult] = await Promise.allSettled([
    listPurchaseHistory(),
    listAllLegacyCustomerOrders(),
  ])

  const history = historyResult.status === "fulfilled" ? historyResult.value : []
  if (historyResult.status === "rejected") {
    void emitOrderHistoryDataFailureAlert({
      stage: "medusa_purchase_history",
      mode: "customer",
      error: historyResult.reason,
      path: REORDER_PAGE_PATH,
    }).catch(() => {
      // Fail open: the reorder page should still render with empty history.
    })
  }

  const legacyOrderHistory =
    legacyOrderHistoryResult.status === "fulfilled"
      ? legacyOrderHistoryResult.value
      : { orders: [], count: 0, limit: 0, offset: 0 }
  if (legacyOrderHistoryResult.status === "rejected") {
    void emitOrderHistoryDataFailureAlert({
      stage: "legacy_customer_orders",
      mode: "customer",
      error: legacyOrderHistoryResult.reason,
      path: REORDER_PAGE_PATH,
    }).catch(() => {
      // Fail open: the reorder page should still render without legacy rows.
    })
  }

  const productIds = Array.from(
    new Set(history.map((h) => h.productId).filter(presentString))
  )
  const variantIds = Array.from(
    new Set(history.map((h) => h.variantId).filter(presentString))
  )
  const skus = Array.from(
    new Set(history.map((h) => h.sku).filter(presentString))
  )

  let strapiProducts: StrapiCollectionProduct[] = []
  try {
    const products = await getProductsByMedusaLookupRefs(
      { productIds, variantIds, skus },
      strapiClient
    )
    strapiProducts = await enrichStrapiProductsWithMedusaPrices(
      products,
      countryCode,
      { requireLivePrices: true }
    )
  } catch (error) {
    void emitOrderHistoryDataFailureAlert({
      stage: "reorder_strapi_enrichment",
      mode: "customer",
      failureCount: productIds.length + variantIds.length + skus.length,
      error,
      path: REORDER_PAGE_PATH,
    }).catch(() => {
      // Fail open: Strapi enrichment should not block reorder history.
    })
  }

  const strapiMap: Record<string, StrapiCollectionProduct> = {}
  for (const sp of strapiProducts) {
    if (sp.MedusaProduct?.ProductId) {
      strapiMap[sp.MedusaProduct.ProductId] = sp
    }
    for (const variant of sp.MedusaProduct?.Variants || []) {
      if (variant.VariantId) {
        strapiMap[variant.VariantId] = sp
      }
      if (variant.Sku) {
        strapiMap[variant.Sku.trim().toLowerCase()] = sp
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h3 font-gyst font-bold text-Charcoal">Reorder</h1>
        <p className="text-sm font-maison-neue text-Charcoal/50 mt-1">
          Restock from your usuals, staples, and past orders.
        </p>
      </div>
      <ReorderBrowser
        history={history}
        legacyOrders={legacyOrderHistory.orders || []}
        legacyOrderCount={legacyOrderHistory.count || 0}
        strapiMap={strapiMap}
        countryCode={countryCode}
        initialAction={
          resolvedSearchParams?.start === "usuals" ? "usuals" : undefined
        }
      />
    </div>
  )
}
