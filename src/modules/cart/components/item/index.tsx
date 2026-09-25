"use client"

import { Table, Text, clx } from "@medusajs/ui"
import { updateLineItem } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { useRouter } from "next/navigation"
import CartItemSelect from "@modules/cart/components/cart-item-select"
import ErrorMessage from "@modules/checkout/components/error-message"
import DeleteButton from "@modules/common/components/delete-button"
import LineItemOptions from "@modules/common/components/line-item-options"
import LineItemPrice from "@modules/common/components/line-item-price"
import LineItemUnitPrice from "@modules/common/components/line-item-unit-price"
import NetWeightPricing, {
  NetWeightBadge,
} from "@modules/common/components/net-weight-pricing"
import { parseAvgPackWeight, resolvePricingMode } from "@lib/util/price-display"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Spinner from "@modules/common/icons/spinner"
import Thumbnail from "@modules/products/components/thumbnail"
import { useState } from "react"
import { useProductFeaturedImageSrc } from "@lib/hooks/use-product-featured-image"
import { useProductMetadata } from "@lib/hooks/use-product-metadata"
import { useProductTitle } from "@lib/hooks/use-product-title"
import { dispatchCartUpdated } from "@lib/util/cart-events"
import { toMoneyAmount } from "@lib/util/money"
import type {
  CartProductDetails,
  CartProductDetailsMap,
} from "@lib/util/cart-product-details"

type ItemProps = {
  item: HttpTypes.StoreCartLineItem
  type?: "full" | "preview"
  currencyCode: string
  productDetailsMap?: CartProductDetailsMap
}

const Item = ({
  item,
  type = "full",
  currencyCode,
  productDetailsMap = {},
}: ItemProps) => {
  const router = useRouter()
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changeQuantity = async (quantity: number) => {
    setError(null)
    setUpdating(true)

    await updateLineItem({
      lineId: item.id,
      quantity,
    })
      .then(() => {
        dispatchCartUpdated({
          action: "cart-page-quantity",
          lineId: item.id,
          quantity,
        })
        // Refresh to get updated cart data from server
        router.refresh()
      })
      .catch((err) => {
        setError(err.message)
      })
      .finally(() => {
        setUpdating(false)
      })
  }

  // TODO: Update this to grab the actual max inventory
  const maxQtyFromInventory = 10
  const maxQuantity = item.variant?.manage_inventory ? 10 : maxQtyFromInventory

  const productId = item.product_id || item?.product?.id
  const productDetails: CartProductDetails | undefined = productId
    ? productDetailsMap[productId]
    : undefined
  const imgSrc = useProductFeaturedImageSrc(
    productId,
    item.thumbnail || "https://placehold.co/96x96",
    productDetails?.image
  )

  // Fetch Strapi product title
  const productTitle = useProductTitle(
    productId,
    item.product_title,
    productDetails?.title
  )

  // Fetch product metadata for net-weight pricing
  const metadata = useProductMetadata(productId, productDetails?.metadata)
  // Gate NetWeightPricing on the actual resolved pricing mode, not just
  // on whether `AvgPackWeight` is present. A fixed-price item that
  // happens to carry an `AvgPackWeight` (e.g. 10-08-22-1 prepared food
  // at "4.6 lb") was previously routed through the per-lb divide and
  // rendered $5.43/lb — exactly the bug Peter flagged. The resolver
  // honors QB-driven PricingMode → bundled SKU map → weight heuristic.
  // Codex review follow-up to #104/#31.
  const parsedWeight = parseAvgPackWeight(metadata?.AvgPackWeight)
  const pricingMode = resolvePricingMode(
    metadata,
    item.variant?.sku ?? null,
    parsedWeight
  )
  const isNetWeight =
    pricingMode === "per_lb" && Boolean(metadata?.AvgPackWeight)
  const sku = String(
    item.variant?.sku || (item as { variant_sku?: string }).variant_sku || ""
  ).trim()

  return (
    <Table.Row className="w-full" data-testid="product-row">
      <Table.Cell className="!pl-0 p-4 w-24">
        <LocalizedClientLink
          href={`/products/${item.product_handle}`}
          className={clx("flex", {
            "w-16": type === "preview",
            "small:w-24 w-12": type === "full",
          })}
        >
          <Thumbnail
            thumbnail={imgSrc}
            images={item.variant?.product?.images}
            size="square"
            imageSizes={type === "preview" ? "64px" : "96px"}
          />
        </LocalizedClientLink>
      </Table.Cell>

      <Table.Cell className="text-left">
        <Text
          className="txt-medium-plus text-ui-fg-base"
          data-testid="product-title"
        >
          {productTitle}
        </Text>
        <LineItemOptions variant={item.variant} data-testid="product-variant" />
        {sku && (
          <p
            className="mt-1 text-xs font-maison-neue-mono uppercase text-ui-fg-muted"
            data-testid="product-sku"
          >
            SKU {sku}
          </p>
        )}
        {isNetWeight && (
          <div className="mt-2 space-y-1">
            <NetWeightBadge />
            <NetWeightPricing
              unitPrice={toMoneyAmount(item.unit_price) ?? 0}
              currencyCode={currencyCode}
              avgWeight={metadata?.AvgPackWeight}
              isNetWeight={isNetWeight}
              variant="compact"
            />
          </div>
        )}
      </Table.Cell>

      {type === "full" && (
        <Table.Cell>
          <div className="flex gap-2 items-center w-28">
            <DeleteButton
              id={item.id}
              data-testid="product-delete-button"
              productInfo={{
                id: item.product_id || item.id,
                title: item.product_title || "",
                price: toMoneyAmount(item.unit_price) ?? undefined,
                quantity: item.quantity,
                currency: currencyCode,
              }}
            />
            <CartItemSelect
              value={item.quantity}
              onChange={(value) => changeQuantity(parseInt(value.target.value))}
              className="w-14 h-10 p-4"
              data-testid="product-select-button"
            >
              {/* TODO: Update this with the v2 way of managing inventory */}
              {Array.from(
                {
                  length: Math.min(maxQuantity, 10),
                },
                (_, i) => (
                  <option value={i + 1} key={i}>
                    {i + 1}
                  </option>
                )
              )}

              <option value={1} key={1}>
                1
              </option>
            </CartItemSelect>
            {updating && <Spinner />}
          </div>
          <ErrorMessage error={error} data-testid="product-error-message" />
        </Table.Cell>
      )}

      {type === "full" && (
        <Table.Cell className="hidden small:table-cell">
          <LineItemUnitPrice
            item={item}
            style="tight"
            currencyCode={currencyCode}
          />
        </Table.Cell>
      )}

      <Table.Cell className="!pr-0">
        <span
          className={clx("!pr-0", {
            "flex flex-col items-end h-full justify-center": type === "preview",
          })}
        >
          {type === "preview" && (
            <span className="flex gap-x-1 ">
              <Text className="text-ui-fg-muted">{item.quantity}x </Text>
              <LineItemUnitPrice
                item={item}
                style="tight"
                currencyCode={currencyCode}
              />
            </span>
          )}
          <LineItemPrice
            item={item}
            style="tight"
            currencyCode={currencyCode}
          />
        </span>
      </Table.Cell>
    </Table.Row>
  )
}

export default Item
