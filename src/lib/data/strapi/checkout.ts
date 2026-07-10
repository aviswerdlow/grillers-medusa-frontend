import { cache } from "react"
import { gql } from "graphql-request"
import strapiClient from "@lib/strapi"
import type { StrapiSEO } from "./seo"
import type {
  AtlantaZipDayConfig,
  FulfillmentBlackouts,
} from "@lib/util/eligible-arrival-dates"
export { ATLANTA_DELIVERY_ZIP_DAYS } from "@lib/util/atlanta-delivery-zips"

// ============================================
// Atlanta Delivery zip → weekday + cutoff
// ============================================
//
// TODO: move to Strapi when the schema lands. For now this is re-exported
// from a client-safe TS map so the calendar eligibility logic (#36, #72)
// and PDP/cart progress can ship without a Strapi migration.
//
// Weekdays: 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat.
// cutoffHour is 24-hour EST on the day BEFORE delivery (default = 12 = noon).
// If the cutoff isn't met, the *next* occurrence of that weekday is offered instead.
//
// Source: Atlanta zip-rate policy + footer-pages-copy-2026-04-27.md.
// If a zip isn't listed here, the calendar falls back to Tue/Wed/Thu @ noon-prior cutoff.
//
// ============================================
// Fulfillment Configuration Types
// ============================================

export type SoutheastPickupLocation = {
  id: string
  Name: string
  Address: string
  City: string
  State: string
  ZipCode: string
  AvailableDates: { Date: string }[]
  CutoffDays: number // Days before pickup to stop accepting orders
}

export type AtlantaDeliveryTimeWindow = {
  id: string
  Label: string // e.g., "Evening (6pm - 9pm)"
  StartTime: string // e.g., "18:00"
  EndTime: string // e.g., "21:00"
}

export type MinimumOrderThresholds = {
  PlantPickup: number
  AtlantaDelivery: number
  AtlantaDeliveryFree: number // Order total for free delivery
  UPSShipping: number
  SoutheastPickup: number
}

export type FulfillmentConfigData = {
  checkout: {
    // Zip codes that qualify for Atlanta delivery
    AtlantaDeliveryZipCodes: string[]
    // Zip-code-specific Atlanta delivery weekdays and cutoff hour
    AtlantaDeliveryZipDays?: Record<string, AtlantaZipDayConfig>
    // Zip code prefixes for Southeast region (e.g., "30", "31" for Georgia)
    SoutheastZipPrefixes: string[]
    // Pickup locations for Southeast
    SoutheastPickupLocations: SoutheastPickupLocation[]
    // Time windows for Atlanta delivery
    AtlantaDeliveryTimeWindows: AtlantaDeliveryTimeWindow[]
    // Minimum order thresholds
    MinimumOrderThresholds: MinimumOrderThresholds
    // Plant pickup info
    PlantPickupAddress: string
    PlantPickupCity: string
    PlantPickupState: string
    PlantPickupZip: string
    PlantPickupHours: string
    // Atlanta delivery fee
    AtlantaDeliveryFee: number
    // Plant pickup scheduling (Strapi-driven)
    PlantPickupAvailableDays: string[]
    PlantPickupAdditionalDates: { Date: string }[]
    PlantPickupBlackoutDates: { Date: string }[]
    PlantPickupPostOrderNote: string
    PlantPickupCutoffHours: number
  }
}

export type ShippingSettingData = {
  shippingSetting: {
    PlantPickupDiscountThreshold: number | null
    PlantPickUpDiscount: number | null
    // #266: editable UPS free-shipping thresholds. Null until the Strapi
    // fields are deployed/populated — callers must fall back to the
    // hardcoded IN_REGION_THRESHOLD / NATIONAL_THRESHOLD constants.
    UPSInRegionFreeThreshold: number | null
    UPSNationalFreeThreshold: number | null
  } | null
}

export type PickupCreditConfig = {
  threshold: number
  creditAmount: number
  promoCode: string
}

/**
 * Fetches checkout-level config from the Checkout singleton.
 * Only includes fields that actually exist on the Checkout content type.
 * Southeast Pickup Locations are fetched separately via SoutheastPickupLocationsQuery.
 */
export const FulfillmentConfigQuery = gql`
  query FulfillmentConfig {
    checkout {
      PlantPickupAvailableDays
      PlantPickupAdditionalDates {
        Date
      }
      PlantPickupBlackoutDates {
        Date
      }
      PlantPickupPostOrderNote
      PlantPickupCutoffHours
    }
  }
`

export type SoutheastPickupLocationsData = {
  southeastPickupLocations: {
    documentId: string
    City: string
    State: string
    Address: string | null
    ZipCode: string | null
    IsActive: boolean
    AvailableDates: { Date: string }[]
    CutoffDays: number
    Description: string | null
  }[]
}

export const SoutheastPickupLocationsQuery = gql`
  query SoutheastPickupLocations {
    southeastPickupLocations(
      filters: { IsActive: { eq: true } }
      pagination: { pageSize: 100 }
    ) {
      documentId
      City
      State
      Address
      ZipCode
      IsActive
      AvailableDates {
        Date
      }
      CutoffDays
      Description
    }
  }
`

export const ShippingSettingQuery = gql`
  query ShippingSetting {
    shippingSetting {
      PlantPickupDiscountThreshold
      PlantPickUpDiscount
      UPSInRegionFreeThreshold
      UPSNationalFreeThreshold
    }
  }
`

/**
 * #266: the Strapi-editable UPS free-shipping thresholds. `null` means the
 * field isn't populated (or the whole Strapi fetch failed) — every consumer
 * MUST treat `null` as "use the hardcoded IN_REGION_THRESHOLD /
 * NATIONAL_THRESHOLD default". This is intentionally a small, server-side
 * fetch (callers invoke it once per request and prop-drill the result); it is
 * NOT meant to run on every client render.
 */
export type FreeShippingThresholds = {
  inRegionThreshold: number | null
  nationalThreshold: number | null
}

export const getFreeShippingThresholds = cache(
  async (): Promise<FreeShippingThresholds> => {
    try {
      const data = await strapiClient.request<ShippingSettingData>(
        ShippingSettingQuery
      )
      return {
        inRegionThreshold:
          data?.shippingSetting?.UPSInRegionFreeThreshold ?? null,
        nationalThreshold:
          data?.shippingSetting?.UPSNationalFreeThreshold ?? null,
      }
    } catch {
      // Strapi unavailable or fields not yet deployed → fall back to constants.
      return { inRegionThreshold: null, nationalThreshold: null }
    }
  }
)

// ============================================
// Existing Checkout Types
// ============================================

export type CheckoutShippingBlackoutData = {
  checkout: {
    ShippingBlackoutDaysOfWeek: string[]
    ShippingBlackoutDates: { BlackoutDate: string }[]
    DeliveryLeadTime?: number
    UPSSameDayCutoffTime?: string
    LocalPickupSameDayText?: string
    SEO?: StrapiSEO
  }
}

export const CheckoutShippingBlackoutQuery = gql`
  query CheckoutShippingBlackout {
    checkout {
      ShippingBlackoutDaysOfWeek
      ShippingBlackoutDates {
        BlackoutDate
      }
      DeliveryLeadTime
      UPSSameDayCutoffTime
      LocalPickupSameDayText
    }
  }
`

export type FulfillmentBlackoutRow = {
  Date: string
  Label: string
  BlocksOperations: boolean
  BlocksUPSPickup: boolean
  BlocksUPSDelivery: boolean
}

export type FulfillmentBlackoutData = {
  checkout: {
    FulfillmentBlackoutDates: FulfillmentBlackoutRow[]
    /** Legacy undifferentiated UPS blackout rows. */
    ShippingBlackoutDates: { BlackoutDate: string }[]
  } | null
}

/**
 * Kept separate from FulfillmentConfigQuery so the storefront can deploy
 * safely before the Strapi schema. Until the new field exists, this query
 * fails closed to the static annual lists in eligible-arrival-dates.ts.
 */
export const FulfillmentBlackoutQuery = gql`
  query FulfillmentBlackouts {
    checkout {
      FulfillmentBlackoutDates {
        Date
        Label
        BlocksOperations
        BlocksUPSPickup
        BlocksUPSDelivery
      }
      ShippingBlackoutDates {
        BlackoutDate
      }
    }
  }
`

function uniqueIso(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[])).sort()
}

export function toFulfillmentBlackouts(
  data: FulfillmentBlackoutData | null | undefined
): FulfillmentBlackouts {
  const rows = data?.checkout?.FulfillmentBlackoutDates || []
  const legacyUps =
    data?.checkout?.ShippingBlackoutDates?.map((row) => row.BlackoutDate) || []

  return {
    operationsIso: uniqueIso(
      rows.filter((row) => row.BlocksOperations).map((row) => row.Date)
    ),
    upsPickupIso: uniqueIso([
      ...legacyUps,
      ...rows.filter((row) => row.BlocksUPSPickup).map((row) => row.Date),
    ]),
    upsDeliveryIso: uniqueIso([
      ...legacyUps,
      ...rows.filter((row) => row.BlocksUPSDelivery).map((row) => row.Date),
    ]),
  }
}

export const getFulfillmentBlackouts = cache(
  async (): Promise<FulfillmentBlackouts> => {
    try {
      const data = await strapiClient.request<FulfillmentBlackoutData>(
        FulfillmentBlackoutQuery
      )
      return toFulfillmentBlackouts(data)
    } catch {
      return { operationsIso: [], upsPickupIso: [], upsDeliveryIso: [] }
    }
  }
)

export type CheckoutPageData = {
  checkout: {
    SEO?: StrapiSEO
  }
}

export const GetCheckoutSEOQuery = gql`
  query CheckoutSEO {
    checkout {
      SEO {
        metaTitle
        metaDescription
        keywords
        canonicalUrl
      }
    }
  }
`
