"use client"

import { RadioGroup } from "@headlessui/react"
import { isStripe as isStripeFunc, paymentInfoMap } from "@lib/constants"
import {
  createPaymentMethodSetupIntent,
  type SavedPaymentMethod,
} from "@lib/data/payment"
import { trackAddPaymentInfo } from "@lib/gtm"
import { jitsuTrack } from "@lib/jitsu"
import { useCartTitleMap } from "@lib/hooks/use-cart-title-map"
import { CreditCard } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import ErrorMessage from "@modules/checkout/components/error-message"
import InventoryResolutionNotice from "@modules/checkout/components/inventory-resolution-notice"
import PaymentButton from "@modules/checkout/components/payment-button"
import CheckoutOrderReview from "@modules/checkout/components/order-review"
import OrderSmsConsent from "@modules/checkout/components/order-sms-consent"
import { StripeCardContainer } from "@modules/checkout/components/payment-container"
import {
  getCheckoutAnalyticsItems,
  getCheckoutAnalyticsValue,
} from "@modules/checkout/utils/analytics"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { isCheckoutFulfillmentReadyForPayment } from "@lib/checkout-payment-readiness"

const Payment = ({
  cart,
  availablePaymentMethods,
  savedPaymentMethods = [],
  invoiceApproved = false,
  invoiceTermsName,
}: {
  cart: any
  availablePaymentMethods: any[]
  savedPaymentMethods?: SavedPaymentMethod[]
  // #283: when true, the customer is an approved B2B account and may pay by invoice.
  invoiceApproved?: boolean
  invoiceTermsName?: string
}) => {
  const cartTitleMap = useCartTitleMap(cart?.items)
  const showsDeliveryStep = cart?.metadata?.fulfillmentType === "ups_shipping"
  const stepNumber = showsDeliveryStep ? 4 : 3
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, setCardBrand] = useState<string | null>(null)
  const [cardComplete, setCardComplete] = useState(false)
  const [setupIntentClientSecret, setSetupIntentClientSecret] = useState<
    string | null
  >(null)
  const cardPaymentMethods =
    availablePaymentMethods?.filter((pm) => isStripeFunc(pm.id)) ?? []
  const stripeProviderId = cardPaymentMethods[0]?.id

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("")
  const [selectedSavedPaymentMethodId, setSelectedSavedPaymentMethodId] =
    useState<string | null>(null)
  // #283: approved B2B accounts can switch to the no-card invoice path.
  const [payByInvoice, setPayByInvoice] = useState(false)
  const invoiceSelected = invoiceApproved && payByInvoice
  // #283 (Codex P2): true while any place-order submit is in flight, locking the payment-mode
  // toggle so a card submit can't be switched to invoice (or vice versa) mid-flight.
  const [submitting, setSubmitting] = useState(false)

  const hasPreparedSetupIntent = useRef(false)
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

  const paymentItems = getCheckoutAnalyticsItems(cart)
  const paymentValue = getCheckoutAnalyticsValue(cart)

  const trackPaymentInfo = (paymentType: string) => {
    trackAddPaymentInfo({
      total: paymentValue,
      currency: cart.currency_code?.toUpperCase(),
      paymentType,
      items: paymentItems,
      titleMap: cartTitleMap,
    })

    jitsuTrack("payment_info_submitted", {
      cart_id: cart.id,
      payment_type: paymentType,
      value: paymentValue,
      currency: cart.currency_code?.toUpperCase() || "USD",
      items: paymentItems.map((item: any) => ({
        item_id: item.id,
        item_name: (cartTitleMap && cartTitleMap[item.id]) || item.title,
        price: item.price,
        quantity: item.quantity,
      })),
    })
  }

  const prepareSetupIntent = async (force = false) => {
    if (!force && (setupIntentClientSecret || hasPreparedSetupIntent.current)) {
      return
    }

    setIsLoading(true)
    hasPreparedSetupIntent.current = true
    try {
      const result = await createPaymentMethodSetupIntent()
      if ("error" in result) {
        setError(result.error)
        hasPreparedSetupIntent.current = false
        return
      }
      setSetupIntentClientSecret(result.client_secret)
    } catch (err: any) {
      setError(err.message || "Could not start card setup. Please try again.")
      hasPreparedSetupIntent.current = false
    } finally {
      setIsLoading(false)
    }
  }

  const setPaymentMethod = async (method: string) => {
    if (!isStripeFunc(method)) {
      setError("Credit card payment is the only available payment method.")
      return
    }

    setError(null)
    setSelectedPaymentMethod(method)
    setSelectedSavedPaymentMethodId(null)
    setCardComplete(false)
    void prepareSetupIntent()
  }

  const handleSavedCardSelect = async (method: SavedPaymentMethod) => {
    if (!stripeProviderId) return
    setSelectedSavedPaymentMethodId(method.id)
    setSelectedPaymentMethod(stripeProviderId)
    setCardComplete(true)
    setSetupIntentClientSecret(null)
    hasPreparedSetupIntent.current = false
    const brand = method.data?.card?.brand || "card"
    const last4 = method.data?.card?.last4 || "saved"
    trackPaymentInfo(`${brand} ending in ${last4}`)
  }

  const handleUseNewStripeCard = async () => {
    if (!stripeProviderId) return
    hasAutoSelectedSavedCard.current = true
    setSelectedSavedPaymentMethodId(null)
    setCardComplete(false)
    setSetupIntentClientSecret(null)
    hasPreparedSetupIntent.current = false
    setSelectedPaymentMethod(stripeProviderId)
    await prepareSetupIntent(true)
  }

  const paidByGiftcard =
    cart?.gift_cards && cart?.gift_cards?.length > 0 && cart?.total === 0

  const hasPreparedCardForFinalCharge = Boolean(
    selectedSavedPaymentMethodId || (setupIntentClientSecret && cardComplete)
  )

  // All fulfillment types attach a shipping method in a two-step write. Do not
  // expose or enable payment until the method exists and that write is settled.
  const fulfillmentReady = isCheckoutFulfillmentReadyForPayment(cart)
  const paymentReady =
    fulfillmentReady && (hasPreparedCardForFinalCharge || paidByGiftcard)

  // #283: invoice path needs no card — just a shipping method on the cart.
  const invoiceReady = invoiceSelected && fulfillmentReady

  // Check if address step is complete (required before payment)
  const addressComplete = !!(
    cart?.shipping_address?.first_name && cart?.shipping_address?.address_1
  )

  const isOpen = addressComplete && fulfillmentReady

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

  useEffect(() => {
    setError(null)
    if (!isOpen) {
      hasPreparedSetupIntent.current = false
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
      !selectedSavedPaymentMethodId &&
      !setupIntentClientSecret &&
      !hasPreparedSetupIntent.current
    ) {
      void prepareSetupIntent()
    }
  }, [
    isOpen,
    selectedPaymentMethod,
    selectedSavedPaymentMethodId,
    setupIntentClientSecret,
  ])

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
          {invoiceApproved && !paidByGiftcard && (
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                How would you like to pay?
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setPayByInvoice(false)}
                  className={clx(
                    "w-full min-h-[50px] px-4 py-3 rounded-lg border text-left text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    !invoiceSelected
                      ? "border-Gold bg-Gold/5 text-Charcoal"
                      : "border-gray-200 text-gray-700 hover:border-Gold/60"
                  )}
                >
                  Pay with card
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setPayByInvoice(true)}
                  className={clx(
                    "w-full min-h-[50px] px-4 py-3 rounded-lg border text-left text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    invoiceSelected
                      ? "border-Gold bg-Gold/5 text-Charcoal"
                      : "border-gray-200 text-gray-700 hover:border-Gold/60"
                  )}
                >
                  Pay by invoice ({invoiceTermsName || "approved terms"})
                </button>
              </div>
            </div>
          )}

          {!invoiceSelected &&
            !paidByGiftcard &&
            cardPaymentMethods.length > 0 && (
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
                                "border-gray-200 hover:border-Gold/60":
                                  !selected,
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
                  onChange={(value: string) => void setPaymentMethod(value)}
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
                          setupIntentClientSecret={setupIntentClientSecret}
                          isPreparingSetupIntent={isLoading}
                        />
                      </div>
                    )
                  })}
                </RadioGroup>
              </>
            )}

          {!invoiceSelected &&
            !paidByGiftcard &&
            cardPaymentMethods.length === 0 && (
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

          {isStripe && isLoading && !paidByGiftcard && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
              Preparing secure card setup...
            </div>
          )}

          {/* Place Order section - shown when payment is set up */}
          {(paymentReady || invoiceReady) && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <InventoryResolutionNotice cart={cart} />
              <CheckoutOrderReview
                cart={cart}
                paymentMode={invoiceSelected ? "invoice" : "card"}
                disabled={submitting}
              >
                {({ acceptance, invalidate }) => (
                  <OrderSmsConsent cart={cart} controlsDisabled={submitting}>
                    {({ orderPlacementBlocked }) => (
                      <PaymentButton
                        cart={cart}
                        cardComplete={cardComplete}
                        disabled={orderPlacementBlocked || !acceptance}
                        acceptance={acceptance}
                        onReviewRequired={invalidate}
                        savedPaymentMethodId={selectedSavedPaymentMethodId}
                        setupIntentClientSecret={setupIntentClientSecret}
                        payByInvoice={invoiceSelected}
                        onSubmittingChange={setSubmitting}
                        data-testid="submit-order-button"
                      />
                    )}
                  </OrderSmsConsent>
                )}
              </CheckoutOrderReview>
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
