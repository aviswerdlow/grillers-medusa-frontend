import LocalizedClientLink from "@modules/common/components/localized-client-link"
import FulfillmentProgress from "@modules/common/components/fulfillment-progress"
import type { CartConversionState } from "@lib/data/conversion"
import type { PurchaseHistoryItem } from "@lib/data/orders"
import { toMoneyAmount } from "@lib/util/money"

type ProductConversionPanelProps = {
  cartState?: CartConversionState | null
  currencyCode?: string
  purchaseHistoryItem?: PurchaseHistoryItem | null
}

function formatDate(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function ProductConversionPanel({
  cartState,
  currencyCode = "usd",
  purchaseHistoryItem,
}: ProductConversionPanelProps) {
  const subtotal = toMoneyAmount(cartState?.subtotal) ?? 0
  const cartSubtotal = toMoneyAmount(cartState?.cartSubtotal)

  const lastOrdered = formatDate(purchaseHistoryItem?.lastOrderedAt)

  return (
    <div className="mb-5 space-y-3">
      {purchaseHistoryItem && (
        <div className="rounded-[5px] border border-Charcoal/15 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-VibrantRed">
                Ordered before
              </p>
              <p className="mt-1 font-maison-neue text-sm leading-snug text-Charcoal/70">
                {lastOrdered
                  ? `Last ordered ${lastOrdered}`
                  : "This item is in your order history"}
                {purchaseHistoryItem.timesOrdered > 1
                  ? ` - ${purchaseHistoryItem.timesOrdered} total orders`
                  : ""}
                .
              </p>
            </div>
            <LocalizedClientLink
              href="/account/reorder"
              className="inline-flex min-h-[44px] items-center rounded-[5px] border border-Charcoal px-3 font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal transition-colors hover:bg-Charcoal hover:text-white"
            >
              Reorder list
            </LocalizedClientLink>
          </div>
        </div>
      )}

      <FulfillmentProgress
        subtotal={subtotal}
        cartSubtotal={cartSubtotal}
        excludedSubtotal={cartState?.excludedSubtotal}
        currencyCode={currencyCode}
        fulfillmentType={cartState?.fulfillmentType}
        shipState={cartState?.shipState}
        postalCode={cartState?.postalCode}
        atlantaZipConfig={cartState?.atlantaZipConfig}
        inRegionThreshold={cartState?.inRegionThreshold}
        nationalThreshold={cartState?.nationalThreshold}
        context="pdp"
      />
    </div>
  )
}
