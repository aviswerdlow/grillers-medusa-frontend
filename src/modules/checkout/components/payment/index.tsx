"use client"

import { RadioGroup } from "@headlessui/react"
import { isStripe as isStripeFunc, paymentInfoMap } from "@lib/constants"
import { initiatePaymentSession } from "@lib/data/cart"
import type { SavedPaymentMethod } from "@lib/data/payment"
import { trackAddPaymentInfo } from "@lib/gtm"
import { jitsuTrack } from "@lib/jitsu"
import { useCartTitleMap } from "@lib/hooks/use-cart-title-map"
import { CreditCard } from "@medusajs/icons"
import { Button, clx } from "@medusajs/ui"
import ErrorMessage from "@modules/checkout/components/error-message"
import PaymentButton from "@modules/checkout/components/payment-button"
import { StripeCardContainer } from "@modules/checkout/components/payment-container"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

// Net-weight authorization disclaimer
const NetWeightDisclaimer = () => (
  <div className="bg-Gold/10 border border-Gold/20 rounded-lg p-4 mb-5">
    <div className="flex gap-3">
      <div className="shrink-0">
        <svg
          className="w-5 h-5 text-Gold"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 mb-1">
          About Your Order Total
        </p>
        <p className="text-sm text-gray-600 leading-relaxed">
          Your card will be authorized for the estimated amount shown. The final
          charge will be based on actual product weights when your order is
          weighed and packed.{" "}
          <a
            href="/page/catch-weight-pricing"
            className="text-Gold hover:text-Gold/80 underline"
          >
            Learn more
          </a>
        </p>
      </div>
    </div>
  </div>
)

const Payment = ({
  cart,
  availablePaymentMethods,
  savedPaymentMethods = [],
}: {
  cart: any
  availablePaymentMethods: any[]
  savedPaymentMethods?: SavedPaymentMethod[]
}) => {
  const cartTitleMap = useCartTitleMap(cart?.items)
  const showsDeliveryStep = cart?.metadata?.fulfillmentType === "ups_shipping"
  const stepNumber = showsDeliveryStep ? 4 : 3
  const pendingPaymentSession = cart.payment_collection?.payment_sessions?.find(
    (paymentSession: any) => paymentSession.status === "pending"
  )
  const activeSession = isStripeFunc(pendingPaymentSession?.provider_id)
    ? pendingPaymentSession
    : undefined

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setCardBrand] = useState<string | null>(null)
  const [cardComplete, setCardComplete] = useState(false)
  const cardPaymentMethods =
    availablePaymentMethods?.filter((pm) => isStripeFunc(pm.id)) ?? []
  const stripeProviderId = cardPaymentMethods[0]?.id

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    isStripeFunc(activeSession?.provider_id) ? activeSession?.provider_id : ""
  )
  const [selectedSavedPaymentMethodId, setSelectedSavedPaymentMethodId] =
    useState<string | null>(null)

  const hasInitiatedSession = useRef(false)
  const hasAutoSelectedSavedCard = useRef(false)

  useEffect(() => {
    if (
      stripeProviderId &&
      (!selectedPaymentMethod || !isStripeFunc(selectedPaymentMethod))
    ) {
      setSelectedPaymentMethod(stripeProviderId)
    }
  }, [stripeProviderId, selectedPaymentMethod])

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const isStripe = isStripeFunc(selectedPaymentMethod)

  const paymentItems =
    cart.items?.map((item: any) => ({
      id: item.product_id || item.id,
      title: item.product_title || "",
      price: (item.unit_price || 0) / 100,
      quantity: item.quantity,
    })) || []

  const trackPaymentInfo = (paymentType: string) => {
    trackAddPaymentInfo({
      total: (cart.total || 0) / 100,
      currency: cart.currency_code?.toUpperCase(),
      paymentType,
      items: paymentItems,
      titleMap: cartTitleMap,
    })

    jitsuTrack("payment_info_submitted", {
      cart_id: cart.id,
      payment_type: paymentType,
      value: (cart.total || 0) / 100,
      currency: cart.currency_code?.toUpperCase() || "USD",
      items: paymentItems.map((item: any) => ({
        item_id: item.id,
        item_name: (cartTitleMap && cartTitleMap[item.id]) || item.title,
        price: item.price,
        quantity: item.quantity,
      })),
    })
  }

  const setPaymentMethod = async (
    method: string,
    data: Record<string, any> = { setup_future_usage: "off_session" }
  ) => {
    if (!isStripeFunc(method)) {
      setError("Credit card payment is the only available payment method.")
      return
    }

    setError(null)
    setSelectedPaymentMethod(method)
    if (!data.payment_method_id) {
      setSelectedSavedPaymentMethodId(null)
    }
    try {
      await initiatePaymentSession(cart, {
        provider_id: method,
        data,
      })
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleSavedCardSelect = async (method: SavedPaymentMethod) => {
    if (!stripeProviderId) return
    setSelectedSavedPaymentMethodId(method.id)
    setSelectedPaymentMethod(stripeProviderId)
    setCardComplete(true)
    await setPaymentMethod(stripeProviderId, {
      payment_method_id: method.id,
      setup_future_usage: "off_session",
    })
    const brand = method.data?.card?.brand || "card"
    const last4 = method.data?.card?.last4 || "saved"
    trackPaymentInfo(`${brand} ending in ${last4}`)
  }

  const handleUseNewStripeCard = async () => {
    if (!stripeProviderId) return
    hasAutoSelectedSavedCard.current = true
    setSelectedSavedPaymentMethodId(null)
    setCardComplete(false)
    await setPaymentMethod(stripeProviderId)
  }

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const hasCardPaymentSession =
    activeSession && isStripeFunc(activeSession.provider_id)

  // All fulfillment types (including pickup) now set a shipping method on the cart,
  // so we always require shipping_methods to be present.
  const paymentReady =
    (hasCardPaymentSession && (cart?.shipping_methods?.length ?? 0) > 0) ||
    paidByGiftcard

  // Check if address step is complete (required before payment)
  const addressComplete = !!(
    cart?.shipping_address?.first_name && cart?.shipping_address?.address_1
  )

  // For UPS shipping, also require a shipping method before showing payment
  const fulfillmentType = cart?.metadata?.fulfillmentType as string | undefined
  const hasShippingMethod = (cart?.shipping_methods?.length ?? 0) > 0
  const isOpen =
    addressComplete && (fulfillmentType !== "ups_shipping" || hasShippingMethod)

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)

      return params.toString()
    },
    [searchParams]
  )

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), {
      scroll: false,
    })
  }

  // For Stripe: initiate session when card details entered
  const handleInitiateStripe = async () => {
    setIsLoading(true)
    try {
      if (!selectedPaymentMethod || !isStripeFunc(selectedPaymentMethod)) {
        setError("Credit card payment is the only available payment method.")
        return
      }

      const checkActiveSession =
        activeSession?.provider_id === selectedPaymentMethod

      if (!checkActiveSession) {
        await initiatePaymentSession(cart, {
          provider_id: selectedPaymentMethod,
          data: { setup_future_usage: "off_session" },
        })
      }

      trackPaymentInfo(
        paymentInfoMap[selectedPaymentMethod]?.title || selectedPaymentMethod
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setError(null)
    if (!isOpen) {
      hasInitiatedSession.current = false
      hasAutoSelectedSavedCard.current = false
    }
  }, [isOpen])

  useEffect(() => {
    if (
      !isOpen ||
      !stripeProviderId ||
      savedPaymentMethods.length === 0 ||
      selectedSavedPaymentMethodId ||
      hasAutoSelectedSavedCard.current
    ) {
      return
    }

    const preferredSavedCard =
      savedPaymentMethods.find((method) => method.is_default) ||
      savedPaymentMethods[0]

    if (!preferredSavedCard) return
    hasAutoSelectedSavedCard.current = true
    void handleSavedCardSelect(preferredSavedCard)
  }, [
    isOpen,
    stripeProviderId,
    savedPaymentMethods,
    selectedSavedPaymentMethodId,
  ])

  useEffect(() => {
    if (
      isOpen &&
      selectedPaymentMethod &&
      isStripeFunc(selectedPaymentMethod) &&
      !activeSession &&
      !hasInitiatedSession.current
    ) {
      hasInitiatedSession.current = true
      initiatePaymentSession(cart, {
        provider_id: selectedPaymentMethod,
        data: { setup_future_usage: "off_session" },
      }).catch((err: any) => setError(err.message))
    }
  }, [isOpen, selectedPaymentMethod, activeSession])

  // Check if all steps are ready to place order
  const readyToPlaceOrder = paymentReady && addressComplete

  return (
    <div
      className={clx("rounded-2xl p-5 shadow-sm border transition-colors", {
        "bg-white border-gray-200": isOpen,
        "bg-gray-50 border-gray-200": !isOpen,
      })}
    >
      {/* Step header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span
            className={clx(
              "flex items-center justify-center w-7 h-7 rounded-full text-sm font-semibold",
              {
                "bg-Gold text-white": isOpen,
                "bg-gray-200 text-gray-400": !isOpen,
              }
            )}
          >
            {stepNumber}
          </span>
          <h2
            className={clx("text-lg font-semibold", {
              "text-gray-900": isOpen,
              "text-gray-400": !isOpen,
            })}
          >
            Payment
          </h2>
        </div>
      </div>

      {isOpen && (
        <div>
          {!paidByGiftcard && cardPaymentMethods.length > 0 && (
            <>
              {stripeProviderId && savedPaymentMethods.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Saved cards
                  </p>
                  <div className="space-y-2">
                    {savedPaymentMethods.map((method) => {
                      const card = method.data?.card
                      const brand = card?.brand || "Card"
                      const selected =
                        selectedSavedPaymentMethodId === method.id
                      return (
                        <button
                          key={method.id}
                          type="button"
                          onClick={() => handleSavedCardSelect(method)}
                          className={clx(
                            "w-full min-h-[56px] px-4 py-3 rounded-lg border text-left flex items-center justify-between transition-colors",
                            {
                              "border-Gold bg-Gold/5": selected,
                              "border-gray-200 hover:border-Gold/60": !selected,
                            }
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <span
                              className={clx(
                                "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                selected ? "border-Gold" : "border-gray-300"
                              )}
                            >
                              {selected && (
                                <span className="w-2 h-2 rounded-full bg-Gold" />
                              )}
                            </span>
                            <span>
                              <span className="block text-sm font-medium text-gray-900 capitalize">
                                {brand} ending in {card?.last4 || "****"}
                              </span>
                              {method.is_default && (
                                <span className="block text-xs text-Gold font-medium">
                                  Default card
                                </span>
                              )}
                            </span>
                          </span>
                          <CreditCard className="text-gray-400" />
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={handleUseNewStripeCard}
                      className={clx(
                        "w-full min-h-[50px] px-4 py-3 rounded-lg border text-left text-sm font-medium transition-colors",
                        {
                          "border-Gold bg-Gold/5 text-Charcoal":
                            selectedPaymentMethod === stripeProviderId &&
                            !selectedSavedPaymentMethodId,
                          "border-gray-200 text-gray-700 hover:border-Gold/60":
                            selectedSavedPaymentMethodId ||
                            selectedPaymentMethod !== stripeProviderId,
                        }
                      )}
                    >
                      Use a new card
                    </button>
                  </div>
                </div>
              )}

              <RadioGroup
                value={selectedPaymentMethod}
                onChange={(value: string) => setPaymentMethod(value)}
              >
                {cardPaymentMethods.map((paymentMethod) => {
                  if (
                    savedPaymentMethods.length > 0 &&
                    (selectedPaymentMethod !== paymentMethod.id ||
                      selectedSavedPaymentMethodId)
                  ) {
                    return null
                  }

                  return (
                    <div key={paymentMethod.id}>
                      <StripeCardContainer
                        paymentProviderId={paymentMethod.id}
                        selectedPaymentOptionId={selectedPaymentMethod}
                        paymentInfoMap={paymentInfoMap}
                        setCardBrand={setCardBrand}
                        setError={setError}
                        setCardComplete={setCardComplete}
                      />
                    </div>
                  )
                })}
              </RadioGroup>
            </>
          )}

          {!paidByGiftcard && cardPaymentMethods.length === 0 && (
            <div className="mb-4 rounded-lg border border-red-200/80 bg-red-50 p-4 text-sm text-red-700">
              Credit card payments are currently unavailable. Please try again
              shortly.
            </div>
          )}

          {paidByGiftcard && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Payment method
              </p>
              <p
                className="text-sm text-gray-600"
                data-testid="payment-method-summary"
              >
                Gift card covers entire order
              </p>
            </div>
          )}

          <ErrorMessage
            error={error}
            data-testid="payment-method-error-message"
          />

          {/* For Stripe without active session, show button to enter card */}
          {isStripe &&
            !activeSession &&
            !paidByGiftcard &&
            !selectedSavedPaymentMethodId && (
              <Button
                size="large"
                className="mt-5"
                onClick={handleInitiateStripe}
                isLoading={isLoading}
                disabled={!cardComplete}
                data-testid="submit-payment-button"
              >
                Enter card details
              </Button>
            )}

          {/* Place Order section - shown when payment is set up */}
          {(paymentReady || paidByGiftcard) && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <NetWeightDisclaimer />

              <PaymentButton
                cart={cart}
                cardComplete={cardComplete}
                savedPaymentMethodId={selectedSavedPaymentMethodId}
                data-testid="submit-order-button"
              />

              <p className="text-xs text-gray-500 mt-4 leading-relaxed text-center">
                By clicking Complete Purchase, you agree to our{" "}
                <a href="/terms" className="text-Gold hover:underline">
                  Terms of Use
                </a>
                ,{" "}
                <a href="/terms-of-sale" className="text-Gold hover:underline">
                  Terms of Sale
                </a>
                , and{" "}
                <a href="/privacy" className="text-Gold hover:underline">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          )}
        </div>
      )}

      {!isOpen && (
        <p className="text-sm text-gray-400">
          Complete previous steps to continue
        </p>
      )}
    </div>
  )
}

export default Payment
