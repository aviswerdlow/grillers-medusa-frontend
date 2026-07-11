"use client"

import {
  setAddresses,
  setOrderNotes,
  clearFulfillmentDetails,
} from "@lib/data/cart"
import type { FulfillmentType } from "@lib/data/cart"
import compareAddresses from "@lib/util/compare-addresses"
import { unscrambleAddress } from "@lib/util/format-address"
import { formatPhone, stripPhone } from "@lib/util/format-phone"
import { trackBeginCheckout } from "@lib/gtm"
import { jitsuTrack } from "@lib/jitsu"
import { useCartTitleMap } from "@lib/hooks/use-cart-title-map"
import { ATLANTA_DELIVERY_ZIP_DAYS } from "@lib/util/atlanta-delivery-zips"
import { normalizeDeliveryZip } from "@lib/util/delivery-zip"
import { isFulfillmentTypeRegionValid } from "@lib/util/fulfillment-eligibility"
import {
  getCheckoutAnalyticsItems,
  getCheckoutAnalyticsValue,
} from "@modules/checkout/utils/analytics"
import { HttpTypes } from "@medusajs/types"
import { useToggleState } from "@medusajs/ui"
import Spinner from "@modules/common/icons/spinner"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useActionState, useCallback, useEffect, useRef, useState } from "react"
import BillingAddress from "../billing_address"
import ErrorMessage from "../error-message"
import ShippingAddress from "../shipping-address"
import { SubmitButton } from "../submit-button"

const FALLBACK_ATLANTA_ZIP_CODES = Object.keys(ATLANTA_DELIVERY_ZIP_DAYS)

function getPreferredAddress(customer: HttpTypes.StoreCustomer | null) {
  const addresses = customer?.addresses || []
  if (!addresses.length) return null
  const preferred =
    addresses.find((address) => address.is_default_shipping) ||
    addresses.find((address) => address.is_default_billing) ||
    addresses[0]
  return preferred ? unscrambleAddress(preferred) : null
}

const Addresses = ({
  cart,
  customer,
  atlantaZipCodes = [],
}: {
  cart: HttpTypes.StoreCart | null
  customer: HttpTypes.StoreCustomer | null
  atlantaZipCodes?: string[]
}) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Determine if this is a pickup order (no shipping address needed)
  const fulfillmentType = cart?.metadata?.fulfillmentType as
    | FulfillmentType
    | undefined
  const isPickup =
    fulfillmentType === "plant_pickup" || fulfillmentType === "southeast_pickup"

  // Check if address is already filled
  const hasRequiredAddress = isPickup
    ? !!(
        cart?.shipping_address?.first_name || cart?.billing_address?.first_name
      )
    : !!(
        cart?.shipping_address?.first_name && cart?.shipping_address?.address_1
      )

  // Auto-open if address not filled, or if explicitly set via URL
  const isOpen = searchParams.get("step") === "address" || !hasRequiredAddress

  const { state: sameAsBilling, toggle: toggleSameAsBilling } = useToggleState(
    cart?.shipping_address && cart?.billing_address
      ? compareAddresses(cart?.shipping_address, cart?.billing_address)
      : true
  )

  const cartTitleMap = useCartTitleMap(cart?.items)

  const hasTrackedCheckout = useRef(false)
  useEffect(() => {
    if (cart && !hasTrackedCheckout.current) {
      hasTrackedCheckout.current = true
      const checkoutItems = getCheckoutAnalyticsItems(cart)
      const checkoutValue = getCheckoutAnalyticsValue(cart)

      trackBeginCheckout({
        id: cart.id,
        total: checkoutValue,
        currency: cart.currency_code?.toUpperCase(),
        items: checkoutItems,
        titleMap: cartTitleMap,
      })

      const coupon = (cart as any).promotions?.[0]?.code || undefined
      jitsuTrack("checkout_started", {
        cart_id: cart.id,
        value: checkoutValue,
        currency: cart.currency_code?.toUpperCase() || "USD",
        coupon,
        items: checkoutItems.map((item) => ({
          item_id: item.id,
          item_name: (cartTitleMap && cartTitleMap[item.id]) || item.title,
          price: item.price,
          quantity: item.quantity,
        })),
      })
    }
  }, [cart, cartTitleMap])

  // Track postal code for real-time validation against fulfillment type
  const preferredAddress = getPreferredAddress(customer)
  const cartShippingAddress = cart?.shipping_address
    ? unscrambleAddress(cart.shipping_address)
    : null
  const [postalCode, setPostalCode] = useState(
    cartShippingAddress?.postal_code || preferredAddress?.postal_code || ""
  )

  const handlePostalCodeChange = useCallback((value: string) => {
    setPostalCode(value)
  }, [])

  // Determine if the address is invalid for the selected fulfillment type
  const normalizedPostalCode = normalizeDeliveryZip(postalCode)
  const activeAtlantaZipCodes =
    atlantaZipCodes.length > 0
      ? atlantaZipCodes.map((zip) => normalizeDeliveryZip(zip))
      : FALLBACK_ATLANTA_ZIP_CODES
  const matchesAtlantaDelivery =
    normalizedPostalCode.length === 5 &&
    activeAtlantaZipCodes.includes(normalizedPostalCode)
  // A new out-of-region ZIP is a valid address edit. The server writes the new
  // address and clears the old Atlanta selection atomically, then this client
  // returns to fulfillment. The server remains authoritative for the rare
  // case where an already-invalid cart is submitted without an address change.
  const addressMismatch =
    fulfillmentType === "atlanta_delivery" &&
    normalizedPostalCode.length === 5 &&
    !matchesAtlantaDelivery
  const addressMismatchMessage = addressMismatch
    ? "This ZIP is outside the Atlanta delivery area. Continuing will save the changed address and return you to choose an available fulfillment method."
    : null
  // UPS chosen but the ZIP is inside our Atlanta delivery area → UPS isn't used
  // locally. We DON'T block here (the customer's own address is valid); on
  // submit we clear the method and send them back to the selector to choose
  // local delivery or pickup. This notice just sets the expectation up front.
  const upsInAtlantaArea =
    fulfillmentType === "ups_shipping" &&
    normalizedPostalCode.length === 5 &&
    matchesAtlantaDelivery

  const handleEdit = () => {
    router.push(pathname + "?step=address")
  }

  const [message, formAction] = useActionState(setAddresses, null)

  // When server action succeeds, navigate to next step without a full page reload
  useEffect(() => {
    if (typeof message === "string" && message.startsWith("__SUCCESS__")) {
      const [, countryCode = "us", outcome] = message.split(":")

      // The server clears an address-dependent fulfillment choice in the same
      // cart write as the new address. Route directly back to the selector;
      // waiting for a client effect would briefly render stale metadata and
      // can attach/report the old method against the new destination.
      if (outcome === "fulfillment_reset") {
        router.replace(`/${countryCode}/checkout`, { scroll: false })
        router.refresh()
        return
      }

      // The just-saved address can invalidate the chosen method (e.g. UPS to an
      // Atlanta-area ZIP). Instead of advancing to a now-wrong delivery/payment
      // step, clear the method and let the form collapse back to the
      // fulfillment selector (clearing fulfillmentType drops `hasFulfillment`),
      // so the customer re-picks a local option. FulfillmentStep also guards
      // this on render — doing it here just avoids a flash of the delivery step.
      const typeStillValid = isFulfillmentTypeRegionValid(
        fulfillmentType,
        postalCode,
        { atlantaZipCodes: activeAtlantaZipCodes }
      )
      const cartId = cart?.id
      if (!typeStillValid && cartId) {
        ;(async () => {
          try {
            await clearFulfillmentDetails(cartId)
          } catch {
            /* best-effort — render-time guard still forces a re-pick */
          }
          router.replace(`/${countryCode}/checkout`, { scroll: false })
          router.refresh()
        })()
        return
      }

      const needsDeliveryStep = fulfillmentType === "ups_shipping"
      const nextStep = needsDeliveryStep ? "delivery" : "payment"
      router.replace(`/${countryCode}/checkout?step=${nextStep}`, {
        scroll: false,
      })
      router.refresh()
    }
    // Intentionally fire only on the success transition (and fulfillment type),
    // reading postalCode/zip-list/cart from the closure. Adding `cart` to the
    // deps would re-run this on every cart refresh and loop the routing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, router, fulfillmentType])

  const [checkoutEmail, setCheckoutEmail] = useState(cart?.email || "")
  const handleEmailBlur = useCallback((email: string) => {
    setCheckoutEmail(email)
  }, [])

  const [orderNotes, setOrderNotesState] = useState(
    (cart?.metadata?.orderNotes as string) || ""
  )
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleNotesChange = useCallback(
    (value: string) => {
      setOrderNotesState(value)
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      notesTimerRef.current = setTimeout(() => {
        if (cart?.id) {
          setOrderNotes({ cartId: cart.id, notes: value })
        }
      }, 800)
    },
    [cart?.id]
  )

  // For pickup orders, we show a simplified form
  if (isPickup) {
    const hasAddress = cart?.billing_address || cart?.shipping_address

    return (
      <div
        className={`rounded-2xl p-5 shadow-sm border transition-colors ${
          isOpen
            ? "bg-white border-gray-200"
            : "bg-gradient-to-br from-Gold/[0.12] via-Gold/[0.06] to-transparent border-Gold/20"
        }`}
      >
        {/* Step header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-Gold text-white text-sm font-semibold shadow-sm">
              2
            </span>
            <h2 className="text-lg font-semibold text-gray-900">
              Contact & Billing
            </h2>
            {!isOpen && hasAddress && (
              <svg
                className="w-5 h-5 text-green-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
          {!isOpen && hasAddress && (
            <button
              onClick={handleEdit}
              className="text-sm text-Gold hover:text-Gold/80 font-medium"
              data-testid="edit-address-button"
            >
              Edit
            </button>
          )}
        </div>

        {isOpen ? (
          <form action={formAction}>
            <p className="text-sm text-gray-500 mb-5">
              We just need your contact details and billing information for
              payment.
            </p>

            {/* For pickup orders, always use shipping address as billing */}
            <input type="hidden" name="same_as_billing" value="on" />
            <input
              type="hidden"
              name="fulfillmentType"
              value={fulfillmentType || ""}
            />

            <ShippingAddress
              customer={customer}
              checked={true}
              onChange={() => {}}
              cart={cart}
              isPickupOrder={true}
              onEmailBlur={handleEmailBlur}
            />

            <div className="mt-6">
              <label
                htmlFor="order-notes"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Order Notes{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="order-notes"
                name="orderNotes"
                rows={3}
                value={orderNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Any special requests or instructions for your order..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-Gold focus:ring-1 focus:ring-Gold resize-none"
              />
            </div>

            <div className="flex justify-end mt-6">
              <SubmitButton
                className="!w-auto px-8"
                data-testid="submit-address-button"
              >
                Continue to payment
              </SubmitButton>
            </div>
            <ErrorMessage error={message} data-testid="address-error-message" />
          </form>
        ) : (
          <div>
            {cart && hasAddress ? (
              <div className="grid grid-cols-2 gap-6">
                <div data-testid="contact-summary">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Contact
                  </p>
                  <p className="text-sm text-gray-900">
                    {cart.shipping_address?.first_name ||
                      cart.billing_address?.first_name}{" "}
                    {cart.shipping_address?.last_name ||
                      cart.billing_address?.last_name}
                  </p>
                  <p className="text-sm text-gray-600">{cart.email}</p>
                  <p className="text-sm text-gray-600">
                    {formatPhone(
                      stripPhone(
                        cart.shipping_address?.phone ||
                          cart.billing_address?.phone ||
                          ""
                      )
                    )}
                  </p>
                </div>

                <div data-testid="billing-address-summary">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Billing Address
                  </p>
                  <p className="text-sm text-gray-600">
                    {cart.billing_address?.address_1 ||
                      cart.shipping_address?.address_1}
                  </p>
                  <p className="text-sm text-gray-600">
                    {cart.billing_address?.city || cart.shipping_address?.city},{" "}
                    {cart.billing_address?.province ||
                      cart.shipping_address?.province}{" "}
                    {cart.billing_address?.postal_code ||
                      cart.shipping_address?.postal_code}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // For delivery orders (atlanta_delivery, ups_shipping), show full shipping + billing
  return (
    <div
      className={`rounded-2xl p-5 shadow-sm border transition-colors ${
        isOpen
          ? "bg-white border-gray-200"
          : "bg-gradient-to-br from-Gold/[0.12] via-Gold/[0.06] to-transparent border-Gold/20"
      }`}
    >
      {/* Step header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-Gold text-white text-sm font-semibold shadow-sm">
            2
          </span>
          <h2 className="text-lg font-semibold text-gray-900">
            Shipping Address
          </h2>
          {!isOpen && cart?.shipping_address && (
            <svg
              className="w-5 h-5 text-green-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        {!isOpen && cart?.shipping_address && (
          <button
            onClick={handleEdit}
            className="text-sm text-Gold hover:text-Gold/80 font-medium"
            data-testid="edit-address-button"
          >
            Edit
          </button>
        )}
      </div>

      {isOpen ? (
        <form action={formAction}>
          <input
            type="hidden"
            name="fulfillmentType"
            value={fulfillmentType || ""}
          />

          {fulfillmentType === "atlanta_delivery" && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
              <svg
                className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-amber-800">
                Atlanta Metro Delivery is available only for eligible
                Atlanta-area ZIP codes.
              </p>
            </div>
          )}

          {upsInAtlantaArea && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
              <svg
                className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-amber-800">
                This address is in our Atlanta delivery area, where we use local
                delivery or pickup instead of UPS. When you continue, we&apos;ll
                bring you back to choose a local option.
              </p>
            </div>
          )}

          <ShippingAddress
            customer={customer}
            checked={sameAsBilling}
            onChange={toggleSameAsBilling}
            cart={cart}
            onPostalCodeChange={handlePostalCodeChange}
            onEmailBlur={handleEmailBlur}
          />

          {!sameAsBilling && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-base font-medium text-gray-900 mb-4">
                Billing Address
              </h3>
              <BillingAddress cart={cart} customer={customer} />
            </div>
          )}

          {addressMismatch && (
            <div className="mt-4 p-3 rounded-lg flex gap-2 bg-amber-50 border border-amber-200">
              <svg
                className="w-5 h-5 shrink-0 mt-0.5 text-amber-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-amber-800">
                {addressMismatchMessage}
              </p>
            </div>
          )}

          <div className="mt-6">
            <label
              htmlFor="order-notes-shipping"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Order Notes{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="order-notes-shipping"
              name="orderNotes"
              rows={3}
              value={orderNotes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Any special requests or instructions for your order..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-Gold focus:ring-1 focus:ring-Gold resize-none"
            />
          </div>

          <div className="flex justify-end mt-6">
            <SubmitButton
              className="!w-auto px-8"
              data-testid="submit-address-button"
            >
              {fulfillmentType === "ups_shipping"
                ? "Continue to delivery"
                : "Continue to payment"}
            </SubmitButton>
          </div>
          <ErrorMessage error={message} data-testid="address-error-message" />
        </form>
      ) : (
        <div>
          {cart && cart.shipping_address ? (
            <div className="grid grid-cols-3 gap-4">
              <div data-testid="shipping-address-summary">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Shipping
                </p>
                <p className="text-sm text-gray-900">
                  {cart.shipping_address.first_name}{" "}
                  {cart.shipping_address.last_name}
                </p>
                <p className="text-sm text-gray-600">
                  {cart.shipping_address.address_1}
                </p>
                <p className="text-sm text-gray-600">
                  {cart.shipping_address.city},{" "}
                  {cart.shipping_address.postal_code}
                </p>
              </div>

              <div data-testid="shipping-contact-summary">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Contact
                </p>
                <p className="text-sm text-gray-600">{cart.email}</p>
                <p className="text-sm text-gray-600">
                  {formatPhone(stripPhone(cart.shipping_address.phone || ""))}
                </p>
              </div>

              <div data-testid="billing-address-summary">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Billing
                </p>
                {sameAsBilling ? (
                  <p className="text-sm text-gray-600">Same as shipping</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">
                      {cart.billing_address?.address_1}
                    </p>
                    <p className="text-sm text-gray-600">
                      {cart.billing_address?.city},{" "}
                      {cart.billing_address?.postal_code}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Addresses
