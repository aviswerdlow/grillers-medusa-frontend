"use client"

import { Fragment, useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Dialog,
  DialogPanel,
  Transition,
  TransitionChild,
} from "@headlessui/react"
import { HttpTypes } from "@medusajs/types"
import { convertToLocale } from "@lib/util/money"
import DeleteButton from "@modules/common/components/delete-button"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useProductFeaturedImageSrc } from "@lib/hooks/use-product-featured-image"
import { useProductMetadata } from "@lib/hooks/use-product-metadata"
import { useProductTitle } from "@lib/hooks/use-product-title"
import { formatProductPriceDisplay } from "@lib/util/price-display"
import { useCart } from "./cart-context"
import { updateLineItem } from "@lib/data/cart"
import { jitsuTrack } from "@lib/jitsu"
import Spinner from "@modules/common/icons/spinner"
import {
  CatchWeightBadge,
} from "@modules/common/components/cart-helpers"
import CartUpsells from "@modules/cart/components/cart-upsells"
import type { CartUpsellProduct } from "@modules/cart/components/cart-upsells/types"
import FulfillmentProgress from "@modules/common/components/fulfillment-progress"
import type { AtlantaZipDayConfig } from "@lib/util/eligible-arrival-dates"
import {
  getExcludedFreeDeliverySubtotal,
  getFreeDeliveryEligibleSubtotal,
  getLineItemFreeDeliveryExclusionReason,
  getLineItemSubtotal,
  isLineItemFreeDeliveryEligible,
} from "@lib/util/free-delivery-eligibility"
import {
  DELIVERY_ZIP_EVENT,
  getStoredDeliveryZip,
  normalizeDeliveryZip,
} from "@lib/util/delivery-zip"
import { dispatchCartUpdated } from "@lib/util/cart-events"

// Cart item image with Strapi fallback
const CartItemImage = ({ item }: { item: HttpTypes.StoreCartLineItem }) => {
  const imgSrc = useProductFeaturedImageSrc(
    item.product_id || item?.product?.id,
    "https://placehold.co/96x96"
  )

  return (
    <div className="relative w-full h-full">
      <Image
        src={imgSrc}
        alt={item.title || "Product"}
        fill
        className="object-cover"
      />
    </div>
  )
}

/**
 * Side-cart line item price. Renders per-lb vs per-pack with the same
 * decision logic as PLP / PDP (#31 / #104). Falls back to the legacy
 * "$X.XX/lb" display until the Strapi metadata SWR call resolves so
 * the cart never shows a blank price block.
 */
const CartItemPrice = ({
  item,
}: {
  item: HttpTypes.StoreCartLineItem
  currencyCode: string
}) => {
  const productId = item.product_id || item.product?.id
  const metadata = useProductMetadata(productId)
  const unit = item.unit_price ?? 0
  // formatProductPriceDisplay already does the per-lb math (pack price
  // ÷ avg weight) and returns the headline, so render `display.primary`
  // instead of the raw `unit`. Previously this surface bypassed the
  // resolver and rendered $packPrice / LB for catch-weight items, which
  // is exactly the bug we fixed on PDP/PLP (#31/#104). Codex review.
  const display = formatProductPriceDisplay(
    unit,
    metadata,
    item.variant?.sku ?? null
  )
  return (
    <div>
      <p className="mt-1 text-p-sm font-maison-neue font-semibold text-Charcoal">
        <span>{display.primary}</span>
        {display.primaryLabel && (
          <span className="text-xs font-maison-neue text-Charcoal/60 ml-0.5">
            {display.primaryLabel}
          </span>
        )}
      </p>
      {display.secondary && (
        <p className="text-xs font-maison-neue text-Charcoal/60 mt-0.5">
          {display.secondary}
        </p>
      )}
      {display.mode === "per_lb" && <CatchWeightBadge className="mt-1.5" />}
    </div>
  )
}

// Cart item title with Strapi fallback
const CartItemTitle = ({
  item,
  closeCart,
}: {
  item: HttpTypes.StoreCartLineItem
  closeCart: () => void
}) => {
  const title = useProductTitle(item.product_id || item?.product?.id, item.product_title)

  return (
    <LocalizedClientLink
      href={`/products/${item.product_handle}`}
      onClick={closeCart}
      className="hover:text-VibrantRed transition-colors"
    >
      <h3 className="text-p-sm font-maison-neue font-semibold text-Charcoal line-clamp-2 leading-snug">
        {title}
      </h3>
    </LocalizedClientLink>
  )
}

// Quantity selector
const QuantitySelector = ({
  item,
  onOptimisticDelta,
  countsTowardFreeDelivery,
}: {
  item: HttpTypes.StoreCartLineItem
  onOptimisticDelta: (delta: number, eligibleDelta: number) => void
  countsTowardFreeDelivery: boolean
}) => {
  const router = useRouter()
  const [isUpdating, setIsUpdating] = useState(false)
  const [optimisticQuantity, setOptimisticQuantity] = useState(item.quantity)

  useEffect(() => {
    setOptimisticQuantity(item.quantity)
  }, [item.quantity])

  const handleQuantityChange = async (newQuantity: number) => {
    if (newQuantity < 1 || isUpdating) return

    const qtyDelta = newQuantity - optimisticQuantity
    const priceDelta = qtyDelta * (item.unit_price ?? 0)
    const eligiblePriceDelta = countsTowardFreeDelivery ? priceDelta : 0

    setIsUpdating(true)
    setOptimisticQuantity(newQuantity)
    onOptimisticDelta(priceDelta, eligiblePriceDelta)

    try {
      await updateLineItem({ lineId: item.id, quantity: newQuantity })
      dispatchCartUpdated({
        action: "quantity",
        lineId: item.id,
        quantity: newQuantity,
      })
      jitsuTrack("cart_updated", {
        item_id: item.product_id || item.id,
        item_name: item.product_title || item.title,
        previous_quantity: item.quantity,
        new_quantity: newQuantity,
        price: (item.unit_price ?? 0) / 100,
      })
      router.refresh()
    } catch (error) {
      setOptimisticQuantity(item.quantity)
      onOptimisticDelta(-priceDelta, -eligiblePriceDelta)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="inline-flex items-center border border-Charcoal/20 rounded-[5px]">
      <button
        type="button"
        onClick={() => handleQuantityChange(optimisticQuantity - 1)}
        disabled={isUpdating || optimisticQuantity <= 1}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-Charcoal hover:bg-Charcoal/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Decrease quantity"
      >
        <span className="text-sm font-maison-neue">−</span>
      </button>
      <span className="w-8 text-center text-p-sm font-maison-neue font-semibold text-Charcoal tabular-nums" aria-label={`Quantity: ${optimisticQuantity}`}>
        {isUpdating ? <Spinner size={14} /> : optimisticQuantity}
      </span>
      <button
        type="button"
        onClick={() => handleQuantityChange(optimisticQuantity + 1)}
        disabled={isUpdating}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-Charcoal hover:bg-Charcoal/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="Increase quantity"
      >
        <span className="text-sm font-maison-neue">+</span>
      </button>
    </div>
  )
}

type SideCartProps = {
  cart?: HttpTypes.StoreCart | null
  upsellProducts?: CartUpsellProduct[]
  countryCode?: string
  atlantaZipConfig?: Record<string, AtlantaZipDayConfig>
  initialDeliveryZip?: string | null
}

export default function SideCart({
  cart,
  upsellProducts = [],
  countryCode = "us",
  atlantaZipConfig,
  initialDeliveryZip,
}: SideCartProps) {
  const { isOpen, closeCart, openCart } = useCart()
  const [announcement, setAnnouncement] = useState("")
  const previousItemCount = useRef<number | null>(null)
  const isInitialMount = useRef(true)
  const [optimisticDelta, setOptimisticDelta] = useState(0)
  const [optimisticEligibleDelta, setOptimisticEligibleDelta] = useState(0)
  const [deliveryZip, setDeliveryZip] = useState(
    normalizeDeliveryZip(initialDeliveryZip)
  )
  const prevCartRef = useRef(cart?.subtotal)

  // Reset optimistic delta when server data arrives
  useEffect(() => {
    if (cart?.subtotal !== prevCartRef.current) {
      setOptimisticDelta(0)
      setOptimisticEligibleDelta(0)
      prevCartRef.current = cart?.subtotal
    }
  }, [cart?.subtotal])

  const handleOptimisticDelta = useCallback((delta: number, eligibleDelta = delta) => {
    setOptimisticDelta((prev) => prev + delta)
    setOptimisticEligibleDelta((prev) => prev + eligibleDelta)
  }, [])

  const totalItems =
    cart?.items?.reduce((acc, item) => acc + item.quantity, 0) || 0
  const subtotal = (cart?.subtotal ?? 0) + optimisticDelta
  const eligibleSubtotal =
    getFreeDeliveryEligibleSubtotal(cart?.items) + optimisticEligibleDelta
  const excludedSubtotal =
    getExcludedFreeDeliverySubtotal(cart?.items) +
    Math.max(0, optimisticDelta - optimisticEligibleDelta)
  const postalCode =
    cart?.shipping_address?.postal_code ||
    deliveryZip ||
    normalizeDeliveryZip(initialDeliveryZip)

  const checkoutUrl = "/checkout"
  const sortedItems =
    cart?.items
      ?.slice()
      .sort((a, b) =>
        (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
      ) || []

  useEffect(() => {
    setDeliveryZip(getStoredDeliveryZip() || normalizeDeliveryZip(initialDeliveryZip))

    const handleDeliveryZipUpdate = (event: Event) => {
      const nextZip = (event as CustomEvent<{ zip?: string }>).detail?.zip
      setDeliveryZip(normalizeDeliveryZip(nextZip) || getStoredDeliveryZip())
    }

    window.addEventListener(DELIVERY_ZIP_EVENT, handleDeliveryZipUpdate)
    return () =>
      window.removeEventListener(DELIVERY_ZIP_EVENT, handleDeliveryZipUpdate)
  }, [initialDeliveryZip])

  // Track cart_viewed when side cart opens
  useEffect(() => {
    if (isOpen && cart?.items?.length) {
      jitsuTrack("cart_viewed", {
        cart_id: cart.id,
        value: (cart.subtotal ?? 0) / 100,
        currency: cart.currency_code?.toUpperCase() || "USD",
        item_count: cart.items.reduce((acc, item) => acc + item.quantity, 0),
        items: cart.items.map((item) => ({
          item_id: item.product_id || item.id,
          item_name: item.product_title || item.title,
          price: (item.unit_price ?? 0) / 100,
          quantity: item.quantity,
        })),
      })
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open cart when items are added (not on initial page load)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      previousItemCount.current = totalItems
      return
    }

    if (previousItemCount.current !== null && totalItems > previousItemCount.current) {
      openCart()
      const diff = totalItems - previousItemCount.current
      setAnnouncement(
        `${diff} item${diff > 1 ? "s" : ""} added to cart. Cart now has ${totalItems} item${totalItems > 1 ? "s" : ""}.`
      )
    }
    previousItemCount.current = totalItems
  }, [totalItems, openCart])

  return (
    <>
      {/* ARIA live region */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <Transition show={isOpen} as={Fragment}>
        <Dialog onClose={closeCart} className="relative z-[60]">
          {/* Backdrop */}
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
          </TransitionChild>

          {/* Panel */}
          <div className="fixed inset-0 overflow-hidden">
            <div className="absolute inset-0 overflow-hidden">
              <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full">
                <TransitionChild
                  as={Fragment}
                  enter="transform transition ease-out duration-300"
                  enterFrom="translate-x-full"
                  enterTo="translate-x-0"
                  leave="transform transition ease-in duration-200"
                  leaveFrom="translate-x-0"
                  leaveTo="translate-x-full"
                >
                  <DialogPanel className="pointer-events-auto w-screen max-w-[420px]">
                    <div className="flex h-full flex-col bg-white">
                      {/* Header */}
                      <div className="flex items-center justify-between px-6 py-5 border-b border-Charcoal/10">
                        <h2 className="text-h5 font-rexton font-bold text-Charcoal uppercase tracking-wider">
                          Cart
                          {totalItems > 0 && (
                            <span className="text-p-sm font-maison-neue font-normal text-Charcoal/60 normal-case tracking-normal ml-2">
                              ({totalItems} {totalItems === 1 ? "item" : "items"})
                            </span>
                          )}
                        </h2>
                        <button
                          type="button"
                          onClick={closeCart}
                          className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-Charcoal/40 hover:text-Charcoal transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold rounded"
                          aria-label="Close cart"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {cart && cart.items?.length ? (
                        <>
                          {/* Items */}
                          <div className="flex-1 overflow-y-auto">
                            <ul>
                              {sortedItems.map((item, index) => {
                                const metadata = (item.metadata || {}) as Record<string, any>
                                const countsTowardFreeDelivery =
                                  isLineItemFreeDeliveryEligible(item)
                                const exclusionReason =
                                  getLineItemFreeDeliveryExclusionReason(item)
                                const substitutionStatus =
                                  metadata.substitution_status
                                const originalProductName =
                                  typeof metadata.original_product_name === "string"
                                    ? metadata.original_product_name
                                    : null
                                const substitutionNote =
                                  typeof metadata.substitution_note === "string"
                                    ? metadata.substitution_note
                                    : null
                                const collectionTitle =
                                  metadata.curated_collection_title ||
                                  metadata.bundle_title
                                const previousMetadata =
                                  (sortedItems[index - 1]?.metadata || {}) as Record<string, any>
                                const previousCollectionTitle =
                                  previousMetadata.curated_collection_title ||
                                  previousMetadata.bundle_title
                                const showCollectionHeader =
                                  collectionTitle &&
                                  collectionTitle !== previousCollectionTitle

                                return (
                                  <Fragment key={item.id}>
                                    {showCollectionHeader && (
                                      <li className="border-b border-Charcoal/5 bg-Scroll px-6 py-2">
                                        <p className="font-maison-neue-mono text-[10px] font-bold uppercase tracking-wide text-Charcoal/60">
                                          Added from: {collectionTitle}
                                        </p>
                                      </li>
                                    )}
                                    <li className="border-b border-Charcoal/5">
                                    <div className="flex gap-4 px-6 py-5">
                                      {/* Image */}
                                      <LocalizedClientLink
                                        href={`/products/${item.product_handle}`}
                                        className="flex-shrink-0 w-[88px] h-[88px] bg-gray-50 overflow-hidden"
                                        onClick={closeCart}
                                      >
                                        <CartItemImage item={item} />
                                      </LocalizedClientLink>

                                      {/* Details */}
                                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                                        <div>
                                          <CartItemTitle item={item} closeCart={closeCart} />
                                          {collectionTitle && (
                                            <p className="mt-1 font-maison-neue-mono text-[10px] font-bold uppercase tracking-wide text-VibrantRed">
                                              Collection item
                                            </p>
                                          )}
                                          {substitutionStatus && (
                                            <p className="mt-1 font-maison-neue text-xs leading-snug text-Charcoal/60">
                                              Substituted
                                              {originalProductName
                                                ? ` for ${originalProductName}`
                                                : ""}
                                              {substitutionNote
                                                ? `: ${substitutionNote}`
                                                : "."}
                                            </p>
                                          )}
                                          {/* Price — per-lb vs per-pack
                                              decided by the same helper
                                              used on PLP + PDP (#31 / #104). */}
                                          <CartItemPrice
                                            item={item}
                                            currencyCode={cart.currency_code}
                                          />
                                          {!countsTowardFreeDelivery && (
                                            <p className="mt-1 font-maison-neue text-xs leading-snug text-Charcoal/60">
                                              Does not count toward free delivery
                                              {exclusionReason
                                                ? `: ${exclusionReason}`
                                                : "."}
                                            </p>
                                          )}
                                        </div>

                                        {/* Quantity + Remove */}
                                        <div className="flex items-center justify-between mt-3">
                                          <QuantitySelector
                                            item={item}
                                            countsTowardFreeDelivery={countsTowardFreeDelivery}
                                            onOptimisticDelta={handleOptimisticDelta}
                                          />
                                          <DeleteButton
                                            id={item.id}
                                            onDeleted={() =>
                                              handleOptimisticDelta(
                                                -getLineItemSubtotal(item),
                                                countsTowardFreeDelivery
                                                  ? -getLineItemSubtotal(item)
                                                  : 0
                                              )
                                            }
                                          >
                                            <span className="text-xs font-maison-neue underline">Remove</span>
                                          </DeleteButton>
                                        </div>
                                      </div>
                                    </div>
                                  </li>
                                  </Fragment>
                                )
                              })}
                            </ul>
                          </div>

                          {/* Cart upsells */}
                          <div className="px-6 py-4 bg-Scroll/30 border-t border-Charcoal/5">
                            <CartUpsells
                              surface="side_cart"
                              products={upsellProducts}
                              countryCode={countryCode}
                              compact
                              excludeProductIds={cart.items?.map((item) => item.product_id)}
                            />
                          </div>

                          {/* Kosher trust badge */}
                          <div className="px-6 py-3 bg-Scroll/50 border-t border-Charcoal/5">
                            <div className="flex items-center justify-center gap-2">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-Gold">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                              </svg>
                              <span className="text-xs font-maison-neue-mono uppercase tracking-wider text-Charcoal/60">
                                Certified Kosher &bull; Premium Quality
                              </span>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="border-t border-Charcoal/10 px-6 py-5">
                            {/* Subtotal */}
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-p-sm font-maison-neue-mono uppercase tracking-wider text-Charcoal/60">
                                Subtotal
                              </span>
                              <span className="text-[20px] font-maison-neue font-bold text-Charcoal">
                                {convertToLocale({
                                  amount: subtotal,
                                  currency_code: cart.currency_code,
                                })}
                              </span>
                            </div>

                            <FulfillmentProgress
                              subtotal={Math.max(0, eligibleSubtotal)}
                              cartSubtotal={subtotal}
                              excludedSubtotal={excludedSubtotal}
                              currencyCode={cart.currency_code}
                              shipState={cart.shipping_address?.province}
                              fulfillmentType={
                                (cart.metadata as Record<string, any> | null)
                                  ?.fulfillmentType
                              }
                              postalCode={postalCode}
                              atlantaZipConfig={atlantaZipConfig}
                              context="cart"
                              className="mb-3"
                            />

                            <p className="text-xs font-maison-neue text-Charcoal/60 mb-4">
                              Shipping and taxes calculated at checkout.
                            </p>

                            {/* Checkout button */}
                            <LocalizedClientLink
                              href={checkoutUrl}
                              onClick={closeCart}
                              className="block w-full py-3.5 rounded-[5px] border border-Charcoal bg-Gold text-Charcoal font-rexton text-sm font-bold uppercase tracking-wide text-center transition-opacity hover:opacity-90"
                            >
                              Checkout
                            </LocalizedClientLink>

                            {/* Continue shopping */}
                            <button
                              type="button"
                              onClick={closeCart}
                              className="block w-full mt-3 py-3 text-center text-p-sm font-maison-neue text-Charcoal/60 hover:text-Charcoal transition-colors"
                            >
                              Continue Shopping
                            </button>
                          </div>
                        </>
                      ) : (
                        /* Empty state */
                        <div className="flex-1 flex flex-col items-center justify-center px-8 py-16">
                          <div className="w-20 h-20 bg-Scroll/50 rounded-full flex items-center justify-center mb-6">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-Charcoal/30">
                              <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                          </div>
                          <h3 className="text-[20px] font-maison-neue font-bold text-Charcoal mb-2">
                            Your cart is empty
                          </h3>
                          <p className="text-p-sm font-maison-neue text-Charcoal/60 text-center mb-8">
                            Explore our premium kosher selection and add your favorites.
                          </p>
                          <LocalizedClientLink
                            href="/store"
                            onClick={closeCart}
                            className="px-8 py-3 rounded-[5px] border border-Charcoal bg-Gold text-Charcoal font-rexton text-sm font-bold uppercase tracking-wide text-center transition-opacity hover:opacity-90"
                          >
                            Start Shopping
                          </LocalizedClientLink>
                        </div>
                      )}
                    </div>
                  </DialogPanel>
                </TransitionChild>
              </div>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  )
}
