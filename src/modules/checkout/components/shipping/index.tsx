"use client"

import { RadioGroup, Radio } from "@headlessui/react"
import { setFulfillmentDetails, setShippingMethod } from "@lib/data/cart"
import { calculatePriceForShippingOption, findShippingOptionByType } from "@lib/data/fulfillment"
import { convertToLocale } from "@lib/util/money"
import { trackAddShippingInfo } from "@lib/gtm"
import { jitsuTrack } from "@lib/jitsu"
import { useCartTitleMap } from "@lib/hooks/use-cart-title-map"
import {
  getCheckoutAnalyticsItems,
  getCheckoutAnalyticsValue,
} from "@modules/checkout/utils/analytics"

import { HttpTypes } from "@medusajs/types"
import {
  isUpsGroundAvailableForZip,
  normalizeUpsServiceCode,
  type AtlantaZipDayConfig,
  type FulfillmentBlackouts,
} from "@lib/util/eligible-arrival-dates"
import ErrorMessage from "@modules/checkout/components/error-message"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import ArriveFoodCalendar from "../arrival-calendar"
import { ALL_FREE_SHIP_CODES } from "@lib/util/free-shipping-codes"
import { isUpsServiceEligibleForFreeShipping } from "@lib/util/free-shipping-codes"

const PICKUP_OPTION_ON = "__PICKUP_ON"
const PICKUP_OPTION_OFF = "__PICKUP_OFF"

type ShippingProps = {
  cart: HttpTypes.StoreCart
  availableShippingMethods: HttpTypes.StoreCartShippingOption[] | null
  serverNowIso?: string
  atlantaZipConfig?: Record<string, AtlantaZipDayConfig>
  fulfillmentBlackouts?: FulfillmentBlackouts
}

type ShippingOptionAddress = {
  address_1?: string
  address_2?: string
  postal_code?: string
  city?: string
  country_code?: string
}

type ShippingOptionWithServiceZone = HttpTypes.StoreCartShippingOption & {
  data?: { service_code?: string }
  service_code?: string
  service_zone?: {
    fulfillment_set?: {
      type?: string
      location?: {
        address?: ShippingOptionAddress
      }
    }
  }
}

function formatAddress(address?: ShippingOptionAddress) {
  if (!address) {
    return ""
  }

  let ret = ""

  if (address.address_1) {
    ret += ` ${address.address_1}`
  }

  if (address.address_2) {
    ret += `, ${address.address_2}`
  }

  if (address.postal_code) {
    ret += `, ${address.postal_code} ${address.city}`
  }

  if (address.country_code) {
    ret += `, ${address.country_code.toUpperCase()}`
  }

  return ret
}

const RadioDot: React.FC<{ checked: boolean }> = ({ checked }) => (
  <div
    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
      checked ? "border-Gold" : "border-gray-300"
    }`}
  >
    {checked && <div className="w-2 h-2 rounded-full bg-Gold" />}
  </div>
)

const Shipping: React.FC<ShippingProps> = ({
  cart,
  availableShippingMethods,
  serverNowIso,
  atlantaZipConfig,
  fulfillmentBlackouts,
}) => {
  const cartTitleMap = useCartTitleMap(cart?.items)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingPrices, setIsLoadingPrices] = useState(true)

  const [showPickupOptions, setShowPickupOptions] =
    useState<string>(PICKUP_OPTION_OFF)
  const [calculatedPricesMap, setCalculatedPricesMap] = useState<
    Record<string, number>
  >({})
  const [error, setError] = useState<string | null>(null)
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(
    cart.shipping_methods?.at(-1)?.shipping_option_id || null
  )

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Check if address step is complete
  const addressComplete = !!(cart?.shipping_address?.first_name && cart?.shipping_address?.address_1)
  
  // Check if shipping method has been selected
  const cartShippingMethodSelected = (cart.shipping_methods?.length ?? 0) > 0

  const fulfillmentType = cart.metadata?.fulfillmentType as string | undefined
  const UPS_SERVICE_CODES = [
    "GROUND",
    "3_DAY_SELECT",
    "2ND_DAY_AIR",
    "OVERNIGHT",
  ]
  const destinationZip = (cart.shipping_address?.postal_code || "").trim()

  // A free-shipping promotion is "active" on the cart whenever Medusa has
  // attached one of our seeded codes. We use this to flip the UPS Ground row
  // to "FREE" with the carrier rate struck through.
  const isFreeShipPromoActive = Boolean(
    cart.promotions?.some(
      (p) => p.code && ALL_FREE_SHIP_CODES.includes(p.code)
    )
  )

  const _shippingMethods = useMemo(
    () =>
      availableShippingMethods?.filter((sm) => {
        const option = sm as ShippingOptionWithServiceZone
        if (option.service_zone?.fulfillment_set?.type === "pickup") return false

        if (fulfillmentType === "ups_shipping") {
          const serviceCode = normalizeUpsServiceCode(
            option.data?.service_code || option.service_code || option.name
          )

          if (!serviceCode || !UPS_SERVICE_CODES.includes(serviceCode)) {
            return false
          }

          if (serviceCode === "GROUND") {
            return isUpsGroundAvailableForZip(destinationZip)
          }
        }

        return true
      }),
    [availableShippingMethods, destinationZip, fulfillmentType]
  )

  const _pickupMethods = useMemo(
    () =>
      availableShippingMethods?.filter(
        (sm) =>
          (sm as ShippingOptionWithServiceZone).service_zone?.fulfillment_set
            ?.type === "pickup"
      ),
    [availableShippingMethods]
  )
  const showPickupSection = fulfillmentType !== "ups_shipping"
  const hasPickupOptions = !!_pickupMethods?.length && showPickupSection
  const selectedShippingMethodIsVisible = Boolean(
    shippingMethodId &&
      (_shippingMethods?.some((method) => method.id === shippingMethodId) ||
        (showPickupOptions === PICKUP_OPTION_ON &&
          _pickupMethods?.some((method) => method.id === shippingMethodId)))
  )
  const shippingMethodSelected =
    fulfillmentType === "ups_shipping"
      ? selectedShippingMethodIsVisible
      : cartShippingMethodSelected

  // Auto-open if: address is done AND no valid shipping method yet, OR explicitly via URL
  const isOpen = searchParams.get("step") === "delivery" || (addressComplete && !shippingMethodSelected)

  const [priceLoadError, setPriceLoadError] = useState(false)

  useEffect(() => {
    setIsLoadingPrices(true)
    setPriceLoadError(false)

    if (_shippingMethods?.length) {
      const calculatedMethods = _shippingMethods.filter((sm) => sm.price_type === "calculated")

      if (calculatedMethods.length) {
        const promises = calculatedMethods.map((sm) => calculatePriceForShippingOption(sm.id, cart.id))

        Promise.allSettled(promises).then((res) => {
          const pricesMap: Record<string, number> = {}
          const fulfilled = res.filter((r) => r.status === "fulfilled")
          fulfilled.forEach((p) => (pricesMap[p.value?.id || ""] = p.value?.amount!))

          setCalculatedPricesMap(pricesMap)
          setIsLoadingPrices(false)

          if (fulfilled.length === 0 && calculatedMethods.length > 0) {
            setPriceLoadError(true)
          }
        })
      } else {
        setIsLoadingPrices(false)
      }
    } else {
      setIsLoadingPrices(false)
    }

    if (_pickupMethods?.find((m) => m.id === shippingMethodId)) {
      setShowPickupOptions(PICKUP_OPTION_ON)
    }
  }, [_shippingMethods, _pickupMethods, shippingMethodId])

  const handleEdit = () => {
    router.push(pathname + "?step=delivery", { scroll: false })
  }


  const handleSetShippingMethod = async (
    id: string,
    variant: "shipping" | "pickup"
  ) => {
    setError(null)

    if (variant === "pickup") {
      setShowPickupOptions(PICKUP_OPTION_ON)
    } else {
      setShowPickupOptions(PICKUP_OPTION_OFF)
    }

    let currentId: string | null = null
    setIsLoading(true)
    setShippingMethodId((prev) => {
      currentId = prev
      return id
    })

    await setShippingMethod({ cartId: cart.id, shippingMethodId: id })
      .then(() => {
        const selectedMethod = availableShippingMethods?.find(m => m.id === id)
        const shippingItems = getCheckoutAnalyticsItems(cart)
        const shippingValue = getCheckoutAnalyticsValue(cart)

        trackAddShippingInfo({
          total: shippingValue,
          currency: cart.currency_code?.toUpperCase(),
          shippingTier: selectedMethod?.name,
          items: shippingItems,
          titleMap: cartTitleMap,
        })

        jitsuTrack("shipping_info_submitted", {
          cart_id: cart.id,
          shipping_tier: selectedMethod?.name,
          value: shippingValue,
          currency: cart.currency_code?.toUpperCase() || "USD",
          items: shippingItems.map(item => ({
            item_id: item.id,
            item_name: (cartTitleMap && cartTitleMap[item.id]) || item.title,
            price: item.price,
            quantity: item.quantity,
          })),
        })
        router.refresh()
      })
      .catch((err) => {
        setShippingMethodId(currentId)

        setError(err.message)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  useEffect(() => {
    setError(null)
  }, [isOpen])

  // Default the cart to the CHEAPEST available UPS option once the offered set and
  // its prices have loaded and the customer hasn't already chosen a still-valid
  // method. This keeps the order-summary price honest (e.g. CA, where Ground is
  // filtered out, defaults to Overnight; VA defaults to Ground) and replaces any
  // stale method that is no longer offered for the destination. The customer can
  // still upgrade to a pricier option. guardKey prevents re-selecting the same
  // (destination, option) target, so there is no render loop.
  const autoSelectGuardRef = useRef<string | null>(null)
  useEffect(() => {
    if (fulfillmentType !== "ups_shipping") return
    if (isLoadingPrices) return
    if (selectedShippingMethodIsVisible) return
    const methods = _shippingMethods ?? []
    if (methods.length === 0) return

    const priced: { id: string; price: number }[] = []
    for (const method of methods) {
      if (method.price_type === "flat") {
        priced.push({ id: method.id, price: method.amount ?? Number.POSITIVE_INFINITY })
        continue
      }
      const calculated = calculatedPricesMap[method.id]
      if (typeof calculated !== "number") return // a calculated price is still pending — wait
      if (calculated <= -10) continue // sentinel: not actually available
      priced.push({ id: method.id, price: calculated })
    }
    if (priced.length === 0) return

    const cheapest = priced.reduce((a, b) => (b.price < a.price ? b : a))
    if (!cheapest.id || cheapest.id === shippingMethodId) return

    const guardKey = `${destinationZip}:${cheapest.id}`
    if (autoSelectGuardRef.current === guardKey) return
    autoSelectGuardRef.current = guardKey
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    handleSetShippingMethod(cheapest.id, "shipping")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fulfillmentType,
    isLoadingPrices,
    selectedShippingMethodIsVisible,
    _shippingMethods,
    calculatedPricesMap,
    shippingMethodId,
    destinationZip,
  ])

  // Detect the empty Delivery Options dead-end: UPS chosen but no UPS rates apply
  // (typically because the cart's address falls inside our local-delivery region).
  const noUpsOptionsAvailable =
    fulfillmentType === "ups_shipping" &&
    !isLoadingPrices &&
    (_shippingMethods?.length ?? 0) === 0

  const handleSwitchFulfillment = async (
    nextType: "atlanta_delivery" | "plant_pickup"
  ) => {
    setError(null)
    setIsLoading(true)
    try {
      const today = new Date().toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "numeric",
      })
      await setFulfillmentDetails({
        cartId: cart.id,
        fulfillmentType: nextType,
        fulfillmentZip: nextType === "atlanta_delivery" ? cart.shipping_address?.postal_code || "" : "00000",
        scheduledDate: today,
      })
      if (nextType === "plant_pickup") {
        const option = await findShippingOptionByType(cart.id, "plant_pickup")
        if (option) {
          await setShippingMethod({ cartId: cart.id, shippingMethodId: option.id })
        }
      }
      router.replace(pathname, { scroll: false })
      router.refresh()
    } catch (err: any) {
      setError(err?.message || "Could not switch fulfillment method")
    } finally {
      setIsLoading(false)
    }
  }

  const isIncomplete = !isOpen && !shippingMethodSelected

  return (
    <div
      className={`rounded-2xl p-5 shadow-sm border transition-colors ${
        isOpen
          ? "bg-white border-gray-200"
          : "bg-gradient-to-br from-Gold/[0.12] via-Gold/[0.06] to-transparent border-Gold/20"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`flex items-center gap-3 ${isIncomplete ? "opacity-50 pointer-events-none select-none" : ""}`}>
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-Gold text-white text-sm font-semibold shadow-sm">
            3
          </span>
          <h2 className="text-lg font-semibold text-gray-900">
            Delivery Options
          </h2>
          {!isOpen && (cart.shipping_methods?.length ?? 0) > 0 && (
            <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        {!isOpen &&
          cart?.shipping_address &&
          cart?.billing_address &&
          cart?.email && (
            <button
              onClick={handleEdit}
              className="text-sm text-Gold hover:text-Gold/80 font-medium"
              data-testid="edit-delivery-button"
            >
              Edit
            </button>
          )}
      </div>

      {isOpen ? (
        <>
          {noUpsOptionsAvailable && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200/80 rounded-lg">
              <p className="text-sm font-semibold text-amber-900 mb-1">
                No UPS shipping options for this address
              </p>
              <p className="text-xs text-amber-800 mb-3 leading-relaxed">
                UPS Ground is only available where transit is 3 business days or less.
                If expedited UPS rates are unavailable, choose a local option:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSwitchFulfillment("atlanta_delivery")}
                  disabled={isLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-Gold rounded-lg hover:bg-Gold/90 transition-colors disabled:opacity-50"
                >
                  Switch to Atlanta Delivery
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchFulfillment("plant_pickup")}
                  disabled={isLoading}
                  className="px-4 py-2 text-xs font-semibold text-Charcoal bg-white border border-Charcoal/20 rounded-lg hover:border-Gold transition-colors disabled:opacity-50"
                >
                  Switch to Plant Pickup
                </button>
              </div>
            </div>
          )}
          <div>
            <div className="flex flex-col mb-3">
              <span className="text-sm font-medium text-gray-700">
                Shipping method
              </span>
              <span className="text-sm text-gray-500">
                How would you like your order delivered
              </span>
            </div>
            <div data-testid="delivery-options-container">
              <div className="pb-6">
                {hasPickupOptions && (
                  <RadioGroup
                    value={showPickupOptions}
                    onChange={(value) => {
                      const id = _pickupMethods.find(
                        (option) => !option.insufficient_inventory
                      )?.id

                      if (id) {
                        handleSetShippingMethod(id, "pickup")
                      }
                    }}
                  >
                    <Radio
                      value={PICKUP_OPTION_ON}
                      data-testid="delivery-option-radio"
                      className={`flex items-center justify-between cursor-pointer border rounded-lg px-4 py-3 mb-2 transition-colors ${
                        showPickupOptions === PICKUP_OPTION_ON
                          ? "border-Gold bg-Gold/5"
                          : "border-gray-200 hover:border-Gold/50"
                      }`}
                    >
                      <div className="flex items-center gap-x-3">
                        <RadioDot checked={showPickupOptions === PICKUP_OPTION_ON} />
                        <span className="text-sm text-gray-900">Local Pick Up</span>
                      </div>
                      <span className="text-sm text-gray-500">-</span>
                    </Radio>
                  </RadioGroup>
                )}
                <RadioGroup
                  value={shippingMethodId}
                  onChange={(v) => {
                    if (v) handleSetShippingMethod(v, "shipping")
                  }}
                >
                  {_shippingMethods?.map((option) => {
                    const isDisabled =
                      option.price_type === "calculated" &&
                      !isLoadingPrices &&
                      typeof calculatedPricesMap[option.id] !== "number"

                    // Free-shipping applies to the cheapest cold-chain-safe UPS
                    // service for the ZIP. Faster optional services stay paid.
                    // When a free-ship promo is on the cart, this method's
                    // shipping_method amount will be 0; show "FREE" with the
                    // carrier rate struck through so the customer can see the
                    // savings they actually get.
                    const serviceCode =
                      normalizeUpsServiceCode(
                        (option as ShippingOptionWithServiceZone).data?.service_code ||
                          (option as ShippingOptionWithServiceZone).service_code ||
                          option.name
                      )
                    const rawAmount =
                      option.price_type === "flat"
                        ? option.amount
                        : calculatedPricesMap[option.id]
                    const freeShipApplies =
                      isFreeShipPromoActive &&
                      isUpsServiceEligibleForFreeShipping({
                        serviceCode,
                        destinationZip,
                      }) &&
                      typeof rawAmount === "number" &&
                      rawAmount > 0

                    return (
                      calculatedPricesMap[option.id] > -10 && (
                        <Radio
                          key={option.id}
                          value={option.id}
                          data-testid="delivery-option-radio"
                          disabled={isDisabled}
                          className={`flex items-center justify-between cursor-pointer border rounded-lg px-4 py-3 mb-2 transition-colors ${
                            option.id === shippingMethodId
                              ? "border-Gold bg-Gold/5"
                              : "border-gray-200 hover:border-Gold/50"
                          } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <div className="flex items-center gap-x-3">
                            <RadioDot checked={option.id === shippingMethodId} />
                            <span className="text-sm text-gray-900">
                              {option.name}
                            </span>
                          </div>
                          <span className="text-sm text-gray-500 flex items-center gap-2">
                            {freeShipApplies && typeof rawAmount === "number" && (
                              <span className="text-xs text-gray-400 line-through">
                                {convertToLocale({
                                  amount: rawAmount,
                                  currency_code: cart?.currency_code,
                                })}
                              </span>
                            )}
                            {freeShipApplies ? (
                              <span className="text-emerald-600 font-semibold uppercase tracking-wide text-xs">
                                Free
                              </span>
                            ) : option.price_type === "flat" ? (
                              convertToLocale({
                                amount: option.amount!,
                                currency_code: cart?.currency_code,
                              })
                            ) : calculatedPricesMap[option.id] ? (
                              convertToLocale({
                                amount: calculatedPricesMap[option.id],
                                currency_code: cart?.currency_code,
                              })
                            ) : isLoadingPrices ? (
                              <span className="w-4 h-4 border-2 border-gray-300 border-t-Gold rounded-full animate-spin inline-block" />
                            ) : (
                              "-"
                            )}
                          </span>
                        </Radio>
                      )
                    )
                  })}
                </RadioGroup>
              </div>
            </div>
          </div>

          {showPickupOptions === PICKUP_OPTION_ON && (
            <div>
              <div className="flex flex-col mb-3">
                <span className="text-sm font-medium text-gray-700">
                  Store
                </span>
                <span className="text-sm text-gray-500">
                  Choose a store near you
                </span>
              </div>
              <div data-testid="delivery-options-container">
                <div className="pb-6">
                  <RadioGroup
                    value={shippingMethodId}
                    onChange={(v) => {
                      if (v) handleSetShippingMethod(v, "pickup")
                    }}
                  >
                    {_pickupMethods?.map((option) => {
                      return (
                        <Radio
                          key={option.id}
                          value={option.id}
                          disabled={option.insufficient_inventory}
                          data-testid="delivery-option-radio"
                          className={`flex items-center justify-between cursor-pointer border rounded-lg px-4 py-3 mb-2 transition-colors ${
                            option.id === shippingMethodId
                              ? "border-Gold bg-Gold/5"
                              : "border-gray-200 hover:border-Gold/50"
                          } ${option.insufficient_inventory ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <div className="flex items-start gap-x-3">
                            <RadioDot checked={option.id === shippingMethodId} />
                            <div className="flex flex-col">
                              <span className="text-sm text-gray-900">
                                {option.name}
                              </span>
                              <span className="text-sm text-gray-500">
                                {formatAddress(
                                  (option as ShippingOptionWithServiceZone)
                                    .service_zone?.fulfillment_set?.location
                                    ?.address
                                )}
                              </span>
                            </div>
                          </div>
                          <span className="text-sm text-gray-500">
                            {convertToLocale({
                              amount: option.amount!,
                              currency_code: cart?.currency_code,
                            })}
                          </span>
                        </Radio>
                      )
                    })}
                  </RadioGroup>
                </div>
              </div>
            </div>
          )}

          {selectedShippingMethodIsVisible && showPickupOptions === PICKUP_OPTION_OFF && (
            <div>
              <div className="flex flex-col mb-3">
                <span className="text-sm font-medium text-gray-700">
                  Arrival date
                </span>
                <span className="text-sm text-gray-500">
                  When do you want it to arrive?
                </span>
              </div>
              <div data-testid="shipment-options-container" className="pb-6">
                <ArriveFoodCalendar
                  cart={cart}
                  setError={setError}
                  availableShippingMethods={_shippingMethods}
                  serverNowIso={serverNowIso}
                  atlantaZipConfig={atlantaZipConfig}
                  fulfillmentBlackouts={fulfillmentBlackouts}
                />
              </div>
            </div>
          )}

          {priceLoadError && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200/80 rounded-lg">
              <p className="text-sm text-amber-800 font-medium mb-1">Unable to calculate shipping rates</p>
              <p className="text-xs text-amber-700">
                Please{" "}
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="underline font-semibold hover:text-amber-900"
                >
                  reload the page
                </button>{" "}
                to try again.
              </p>
            </div>
          )}

          <ErrorMessage
            error={error}
            data-testid="delivery-option-error-message"
          />

          {selectedShippingMethodIsVisible && (
            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={() => {
                  router.replace(pathname + "?step=payment", { scroll: false })
                  router.refresh()
                }}
                className="px-8 h-11 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors"
                data-testid="submit-delivery-button"
              >
                Continue to payment
              </button>
            </div>
          )}
        </>
      ) : (
        <div>
          {cart && (cart.shipping_methods?.length ?? 0) > 0 && (() => {
            const selected = cart.shipping_methods?.at(-1)
            const selectedAmount = selected?.amount ?? 0
            const cartShippingTotal = (cart as any).shipping_total ?? selectedAmount
            const selectedServiceCode = normalizeUpsServiceCode(
              (selected as any)?.data?.service_code ||
                (selected as any)?.service_code ||
                (selected as any)?.shipping_option?.data?.service_code ||
                (selected as any)?.shipping_option?.service_code ||
                (selected as any)?.shipping_option?.name ||
                selected?.name
            )
            const freeShipApplied =
              isFreeShipPromoActive &&
              cartShippingTotal === 0 &&
              selectedAmount > 0 &&
              isUpsServiceEligibleForFreeShipping({
                serviceCode: selectedServiceCode,
                destinationZip,
              })
            return (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Method
                  </p>
                  <p className="text-sm text-gray-800 font-medium">{selected?.name}</p>
                </div>
                <div className="text-right shrink-0">
                  {freeShipApplied ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 line-through">
                        {convertToLocale({
                          amount: selectedAmount,
                          currency_code: cart?.currency_code,
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
                        Free
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm font-semibold text-gray-900">
                      {convertToLocale({
                        amount: cartShippingTotal,
                        currency_code: cart?.currency_code,
                      })}
                    </span>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

export default Shipping
