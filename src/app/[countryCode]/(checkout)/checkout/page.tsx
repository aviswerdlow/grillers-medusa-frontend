import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { getAvailableFulfillmentTypes } from "@lib/data/fulfillment"
import { buildCartProductDetailsMap } from "@lib/util/cart-product-details"
import { getAddressBookDeliveryZip } from "@lib/util/delivery-zip"
import { withTimeout } from "@lib/util/promise-timeout"
import strapiClient from "@lib/strapi"
import {
  GetCheckoutSEOQuery,
  FulfillmentConfigQuery,
  SoutheastPickupLocationsQuery,
  ShippingSettingQuery,
  type CheckoutPageData,
  type FulfillmentConfigData,
  type ShippingSettingData,
  type SoutheastPickupLocationsData,
  type PickupCreditConfig,
  getFulfillmentBlackouts,
} from "@lib/data/strapi/checkout"
import { getAtlantaDeliveryZipConfig } from "@lib/data/strapi/fulfillment"
import { ATLANTA_DELIVERY_ZIP_DAYS } from "@lib/util/atlanta-delivery-zips"
import { reportServerSoftFailure } from "@lib/server-soft-failure"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { Metadata } from "next"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

const CHECKOUT_PAGE_PATH =
  "src/app/[countryCode]/(checkout)/checkout/page.tsx"

// Default fulfillment config for when Strapi isn't set up yet
const defaultFulfillmentConfig: FulfillmentConfigData["checkout"] = {
  // Atlanta delivery ZIP codes (from Strapi shipping-zones)
  AtlantaDeliveryZipCodes: Object.keys(ATLANTA_DELIVERY_ZIP_DAYS),
  AtlantaDeliveryZipDays: undefined,
  SoutheastZipPrefixes: [
    "30",
    "31",
    "32",
    "33",
    "34",
    "35",
    "36",
    "37",
    "38",
    "39",
  ],
  // Southeast pickup locations - cities from Strapi shipping-zones with SCHEDULED_DELIVERY
  SoutheastPickupLocations: [
    {
      id: "nashville",
      Name: "Nashville, TN",
      Address: "TBD",
      City: "Nashville",
      State: "TN",
      ZipCode: "",
      AvailableDates: [],
      CutoffDays: 3,
    },
    {
      id: "raleigh",
      Name: "Raleigh, NC",
      Address: "TBD",
      City: "Raleigh",
      State: "NC",
      ZipCode: "",
      AvailableDates: [],
      CutoffDays: 3,
    },
    {
      id: "charlotte",
      Name: "Charlotte, NC",
      Address: "TBD",
      City: "Charlotte",
      State: "NC",
      ZipCode: "",
      AvailableDates: [],
      CutoffDays: 3,
    },
    {
      id: "birmingham",
      Name: "Birmingham, AL",
      Address: "TBD",
      City: "Birmingham",
      State: "AL",
      ZipCode: "",
      AvailableDates: [],
      CutoffDays: 3,
    },
    {
      id: "savannah",
      Name: "Savannah, GA",
      Address: "TBD",
      City: "Savannah",
      State: "GA",
      ZipCode: "",
      AvailableDates: [],
      CutoffDays: 3,
    },
    {
      id: "charleston",
      Name: "Charleston, SC",
      Address: "TBD",
      City: "Charleston",
      State: "SC",
      ZipCode: "",
      AvailableDates: [],
      CutoffDays: 3,
    },
  ],
  AtlantaDeliveryTimeWindows: [
    {
      id: "1",
      Label: "Morning (9am - 12pm)",
      StartTime: "09:00",
      EndTime: "12:00",
    },
    {
      id: "2",
      Label: "Afternoon (12pm - 4pm)",
      StartTime: "12:00",
      EndTime: "16:00",
    },
    {
      id: "3",
      Label: "Evening (4pm - 8pm)",
      StartTime: "16:00",
      EndTime: "20:00",
    },
  ],
  MinimumOrderThresholds: {
    PlantPickup: 0,
    AtlantaDelivery: 0,
    AtlantaDeliveryFree: 250,
    UPSShipping: 40,
    SoutheastPickup: 0,
  },
  PlantPickupAddress: "1945 Cliff Valley Way NE",
  PlantPickupCity: "Atlanta",
  PlantPickupState: "GA",
  PlantPickupZip: "30329",
  PlantPickupHours: "Mon-Thu 9am-4pm, Fri 9am-2pm",
  AtlantaDeliveryFee: 22.5,
  PlantPickupAvailableDays: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ],
  PlantPickupAdditionalDates: [],
  PlantPickupBlackoutDates: [],
  PlantPickupPostOrderNote:
    "We will call you when your order is ready on the day of pickup.",
  PlantPickupCutoffHours: 0,
}

const defaultPickupCreditConfig: PickupCreditConfig = {
  threshold: 150,
  creditAmount: 7.5,
  promoCode: "PLANTPICKUP750",
}

async function getFulfillmentConfig(): Promise<
  FulfillmentConfigData["checkout"]
> {
  try {
    const [checkoutData, seLocationsData, atlantaZipConfig] = await Promise.all(
      [
        strapiClient
          .request<FulfillmentConfigData>(FulfillmentConfigQuery)
          .catch((error) => {
            reportServerSoftFailure(
              `${CHECKOUT_PAGE_PATH}:getFulfillmentConfig:checkout`,
              error,
              { fallback: "defaultFulfillmentConfig" }
            )
            return null
          }),
        strapiClient
          .request<SoutheastPickupLocationsData>(SoutheastPickupLocationsQuery)
          .catch((error) => {
            reportServerSoftFailure(
              `${CHECKOUT_PAGE_PATH}:getFulfillmentConfig:southeastPickupLocations`,
              error,
              { fallback: "defaultFulfillmentConfig" }
            )
            return null
          }),
        getAtlantaDeliveryZipConfig().catch((error) => {
          reportServerSoftFailure(
            `${CHECKOUT_PAGE_PATH}:getFulfillmentConfig:atlantaZipConfig`,
            error,
            { fallback: "defaultFulfillmentConfig" }
          )
          return null
        }),
      ]
    )

    const seLocations = (seLocationsData?.southeastPickupLocations ?? []).map(
      (loc) => ({
        id: loc.documentId,
        Name: `${loc.City}, ${loc.State}`,
        Address: loc.Address ?? "",
        City: loc.City,
        State: loc.State,
        ZipCode: loc.ZipCode ?? "",
        AvailableDates: loc.AvailableDates ?? [],
        CutoffDays: loc.CutoffDays ?? 3,
      })
    )

    return {
      ...defaultFulfillmentConfig,
      ...(checkoutData?.checkout ?? {}),
      MinimumOrderThresholds: {
        ...defaultFulfillmentConfig.MinimumOrderThresholds,
        ...(checkoutData?.checkout?.MinimumOrderThresholds || {}),
      },
      SoutheastPickupLocations:
        seLocations.length > 0
          ? seLocations
          : defaultFulfillmentConfig.SoutheastPickupLocations,
      AtlantaDeliveryZipCodes: atlantaZipConfig
        ? Object.keys(atlantaZipConfig)
        : defaultFulfillmentConfig.AtlantaDeliveryZipCodes,
      AtlantaDeliveryZipDays:
        atlantaZipConfig || defaultFulfillmentConfig.AtlantaDeliveryZipDays,
    }
  } catch (error) {
    reportServerSoftFailure(
      `${CHECKOUT_PAGE_PATH}:getFulfillmentConfig`,
      error,
      { fallback: "defaultFulfillmentConfig" }
    )
    return defaultFulfillmentConfig
  }
}

// #266: the Strapi-editable UPS free-shipping thresholds. Null → the cart /
// checkout free-shipping surfaces fall back to IN_REGION_THRESHOLD /
// NATIONAL_THRESHOLD constants.
type CheckoutShippingSettings = {
  pickupCredit: PickupCreditConfig
  inRegionThreshold: number | null
  nationalThreshold: number | null
}

const defaultCheckoutShippingSettings: CheckoutShippingSettings = {
  pickupCredit: defaultPickupCreditConfig,
  inRegionThreshold: null,
  nationalThreshold: null,
}

// Single Strapi fetch that surfaces BOTH the plant-pickup credit config and
// the UPS free-shipping thresholds, so checkout doesn't issue two requests.
async function getCheckoutShippingSettings(): Promise<CheckoutShippingSettings> {
  try {
    const data = await strapiClient.request<ShippingSettingData>(
      ShippingSettingQuery
    )
    if (data?.shippingSetting) {
      return {
        pickupCredit: {
          threshold:
            data.shippingSetting.PlantPickupDiscountThreshold ??
            defaultPickupCreditConfig.threshold,
          creditAmount:
            data.shippingSetting.PlantPickUpDiscount ??
            defaultPickupCreditConfig.creditAmount,
          promoCode: defaultPickupCreditConfig.promoCode,
        },
        inRegionThreshold: data.shippingSetting.UPSInRegionFreeThreshold ?? null,
        nationalThreshold: data.shippingSetting.UPSNationalFreeThreshold ?? null,
      }
    }
    return defaultCheckoutShippingSettings
  } catch (error) {
    reportServerSoftFailure(
      `${CHECKOUT_PAGE_PATH}:getCheckoutShippingSettings`,
      error,
      { fallback: "defaultCheckoutShippingSettings" }
    )
    return defaultCheckoutShippingSettings
  }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const data = await strapiClient.request<CheckoutPageData>(
      GetCheckoutSEOQuery
    )
    const seo = data?.checkout?.SEO

    return {
      title: seo?.metaTitle || "Checkout | Grillers Pride",
      description:
        seo?.metaDescription ||
        "Complete your order at Grillers Pride. Secure checkout for premium kosher meats delivered fresh to your door.",
      robots: {
        index: false,
        follow: false,
      },
    }
  } catch (error) {
    return {
      title: "Checkout | Grillers Pride",
      description:
        "Complete your order at Grillers Pride. Secure checkout for premium kosher meats.",
      robots: {
        index: false,
        follow: false,
      },
    }
  }
}

type PageProps = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

async function retrieveCheckoutCart() {
  try {
    return await retrieveCart(undefined, {
      fresh: true,
      throwOnFetchError: true,
    })
  } catch (error) {
    reportServerSoftFailure(`${CHECKOUT_PAGE_PATH}:retrieveCart`, error, {
      stage: "initial_checkout_cart_load",
    })
  }

  try {
    return await retrieveCart(undefined, {
      fresh: true,
      throwOnFetchError: true,
    })
  } catch (error) {
    reportServerSoftFailure(`${CHECKOUT_PAGE_PATH}:retrieveCart`, error, {
      stage: "retry_checkout_cart_load",
    })
    throw error
  }
}

export default async function Checkout({ params, searchParams }: PageProps) {
  const { countryCode } = await params
  const resolvedSearchParams = await searchParams
  let cart = await retrieveCheckoutCart()

  if (!cart) {
    redirect(`/${countryCode}/cart`)
  }

  // If cart is empty, redirect to cart page
  if (!cart.items || cart.items.length === 0) {
    redirect(`/${countryCode}/cart`)
  }

  // Reconcile the free-shipping promo against the current cart state. This
  // covers the case where the customer arrives on checkout without mutating
  // the cart (the mutation-hooked sync wouldn't fire). If the promo state
  // changes we re-fetch so the rendered cart reflects the new totals.
  const { syncFreeShippingPromotion } = await import(
    "@lib/data/free-shipping-promo"
  )
  // syncFreeShippingPromotion returns the array of codes now on the cart.
  // Boolean(array) is ALWAYS true, so compare actual free-ship presence before
  // vs after — otherwise a free-ship promo that got REMOVED (e.g. eligible
  // subtotal dropped below threshold once flagged SKUs are excluded) would not
  // trigger a re-fetch and checkout would render stale free shipping/totals.
  const appliedCodes = await syncFreeShippingPromotion(cart)
  const isFreeShipCode = (code: string | null | undefined) =>
    code === "GP_FREESHIP_INREGION" || code === "GP_FREESHIP_NATIONAL"
  const hadFreeShipBefore = (cart.promotions || []).some((p) =>
    isFreeShipCode(p.code)
  )
  const hasFreeShipNow = appliedCodes.some(isFreeShipCode)
  if (hasFreeShipNow !== hadFreeShipBefore) {
    const fresh = await retrieveCart(cart.id)
    if (fresh) cart = fresh
  }

  const customer = await retrieveCustomer()
  const deliveryZip =
    cart.shipping_address?.postal_code ||
    getAddressBookDeliveryZip(customer?.addresses)
  const [
    fulfillmentConfig,
    shippingSettings,
    availableFulfillmentTypes,
    productDetailsMap,
    fulfillmentBlackouts,
  ] = await Promise.all([
    getFulfillmentConfig(),
    getCheckoutShippingSettings(),
    getAvailableFulfillmentTypes(cart.id),
    withTimeout(
      buildCartProductDetailsMap(cart.items),
      1000,
      {},
      "checkout product details"
    ),
    getFulfillmentBlackouts(),
  ])
  const pickupCreditConfig = shippingSettings.pickupCredit

  return (
    <div className="relative min-h-[calc(100vh-8rem)]">
      {/* Two-tone background - only for checkout page */}
      <div
        className="fixed inset-0 hidden small:flex pointer-events-none -z-10"
        aria-hidden="true"
      >
        <div className="w-[58%] bg-gray-50" />
        <div className="w-[42%] bg-Charcoal" />
      </div>

      <div className="small:grid small:grid-cols-[58%_42%]">
        {/* Left column - Form */}
        <div className="px-4 small:px-8 lg:px-16 xl:pl-[max(2rem,calc((100vw-1280px)/2+2rem))] xl:pr-12 py-8 small:py-12">
          <div className="small:max-w-xl">
            <PaymentWrapper cart={cart}>
              <CheckoutForm
                cart={cart}
                customer={customer}
                fulfillmentConfig={fulfillmentConfig}
                availableFulfillmentTypes={availableFulfillmentTypes}
                pickupCreditConfig={pickupCreditConfig}
                fulfillmentBlackouts={fulfillmentBlackouts}
                currentStep={resolvedSearchParams?.step as string | undefined}
              />
            </PaymentWrapper>
          </div>
        </div>
        {/* Right column - Summary (dark background) */}
        <div className="px-4 small:px-8 lg:px-12 xl:pr-[max(2rem,calc((100vw-1280px)/2+2rem))] py-8 small:py-12 bg-Charcoal">
          <CheckoutSummary
            cart={cart}
            atlantaZipConfig={fulfillmentConfig.AtlantaDeliveryZipDays}
            productDetailsMap={productDetailsMap}
            deliveryZip={deliveryZip}
            inRegionThreshold={shippingSettings.inRegionThreshold}
            nationalThreshold={shippingSettings.nationalThreshold}
          />
        </div>
      </div>
    </div>
  )
}
