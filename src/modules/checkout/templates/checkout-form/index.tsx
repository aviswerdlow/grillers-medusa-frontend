import { listCartShippingMethods } from "@lib/data/fulfillment"
import { emitCheckoutFulfillmentInvariantAlerts } from "@lib/checkout-fulfillment-invariants"
import {
  getSavedPaymentMethods,
  listCartPaymentMethods,
} from "@lib/data/payment"
import { HttpTypes } from "@medusajs/types"
import Addresses from "@modules/checkout/components/addresses"
import Payment from "@modules/checkout/components/payment"
import Shipping from "@modules/checkout/components/shipping"
import FulfillmentStep from "@modules/checkout/components/fulfillment-step"
import CheckoutLoginBanner from "@modules/checkout/components/checkout-login-banner"
import CheckoutStepsGate from "@modules/checkout/components/checkout-steps-gate"
import { FulfillmentEditProvider } from "@modules/checkout/context/fulfillment-edit-context"
import type { FulfillmentType } from "@lib/data/cart"
import type {
  FulfillmentConfigData,
  PickupCreditConfig,
} from "@lib/data/strapi/checkout"
import type { FulfillmentBlackouts } from "@lib/util/eligible-arrival-dates"

function needsShippingMethodSelection(cart: HttpTypes.StoreCart): boolean {
  const fulfillmentType = cart.metadata?.fulfillmentType as
    | FulfillmentType
    | undefined
  return fulfillmentType === "ups_shipping"
}

export default async function CheckoutForm({
  cart,
  customer,
  fulfillmentConfig,
  availableFulfillmentTypes,
  pickupCreditConfig,
  fulfillmentBlackouts,
  currentStep,
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
  fulfillmentConfig: FulfillmentConfigData["checkout"]
  availableFulfillmentTypes: FulfillmentType[]
  pickupCreditConfig: PickupCreditConfig
  fulfillmentBlackouts: FulfillmentBlackouts
  currentStep?: string
}) {
  if (!cart) {
    return null
  }

  const [shippingMethods, paymentMethods, savedPaymentMethods] =
    await Promise.all([
      listCartShippingMethods(cart.id),
      listCartPaymentMethods(cart.region?.id ?? ""),
      customer ? getSavedPaymentMethods() : Promise.resolve([]),
    ])

  if (!shippingMethods || !paymentMethods) {
    return null
  }

  const fulfillmentType = cart.metadata?.fulfillmentType as
    | FulfillmentType
    | undefined
  const hasFulfillment = Boolean(
    fulfillmentType && String(fulfillmentType).length > 0
  )
  const showShippingMethodSelection = needsShippingMethodSelection(cart)

  const isLoggedIn = Boolean(customer)

  const addressComplete = !!(
    cart.shipping_address?.first_name && cart.shipping_address?.address_1
  )
  const hasShippingMethod = (cart.shipping_methods?.length ?? 0) > 0

  void emitCheckoutFulfillmentInvariantAlerts({
    cart,
    atlantaZipCodes: fulfillmentConfig.AtlantaDeliveryZipCodes,
  }).catch(() => {
    // Fail-open: observability must never block checkout rendering.
  })

  return (
    <div className="w-full grid grid-cols-1 gap-y-6">
      <CheckoutLoginBanner customer={customer} />

      {/* Everything below requires authentication */}
      {isLoggedIn && (
        <FulfillmentEditProvider>
          {/* Step 1: Fulfillment selection */}
          <FulfillmentStep
            cart={cart}
            customer={customer}
            config={fulfillmentConfig}
            availableFulfillmentTypes={availableFulfillmentTypes}
            pickupCreditConfig={pickupCreditConfig}
          />

          {/* Steps 2-4: Hidden when fulfillment is being edited */}
          <CheckoutStepsGate>
            {/* Step 2: Address — only after fulfillment chosen */}
            {hasFulfillment && (
              <Addresses
                cart={cart}
                customer={customer}
                atlantaZipCodes={fulfillmentConfig.AtlantaDeliveryZipCodes}
              />
            )}

            {/* Step 3: Delivery options — only for UPS shipping, only after address */}
            {hasFulfillment &&
              addressComplete &&
              showShippingMethodSelection && (
                <Shipping
                  cart={cart}
                  availableShippingMethods={shippingMethods}
                  serverNowIso={new Date().toISOString()}
                  atlantaZipConfig={fulfillmentConfig.AtlantaDeliveryZipDays}
                  fulfillmentBlackouts={fulfillmentBlackouts}
                />
              )}

            {/* Step 4: Payment — only after all previous steps complete and delivery step is closed */}
            {hasFulfillment &&
              addressComplete &&
              (!showShippingMethodSelection || hasShippingMethod) &&
              currentStep !== "delivery" && (
                <Payment
                  cart={cart}
                  availablePaymentMethods={paymentMethods}
                  savedPaymentMethods={savedPaymentMethods}
                  invoiceApproved={
                    (customer?.metadata as Record<string, unknown> | undefined)
                      ?.gp_offline_payment_approved === true
                  }
                />
              )}
          </CheckoutStepsGate>
        </FulfillmentEditProvider>
      )}
    </div>
  )
}
