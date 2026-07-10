"use client"

import { useState, useMemo, useEffect, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { setFulfillmentDetails, setShippingMethod, clearFulfillmentDetails, type FulfillmentType } from "@lib/data/cart"
import { saveAddressToProfileAndCart } from "@lib/data/customer"
import { findShippingOptionByType } from "@lib/data/fulfillment"
import { convertToLocale } from "@lib/util/money"
import {
  isAtlantaZip as sharedIsAtlantaZip,
  isFulfillmentTypeRegionValid,
} from "@lib/util/fulfillment-eligibility"
import {
  formatFulfillmentAddressLine,
  fulfillmentAddressesMatch,
  getActiveFulfillmentAddress,
  hasCompleteFulfillmentAddress,
  normalizeFulfillmentAddress,
} from "@lib/util/fulfillment-address"
import { ATLANTA_DELIVERY_ZIP_DAYS } from "@lib/util/atlanta-delivery-zips"
import {
  SE_PICKUP_CREDIT_AMOUNT,
  SE_PICKUP_CREDIT_THRESHOLD,
} from "@lib/util/free-shipping-codes"
import { getFreeDeliveryEligibleSubtotal } from "@lib/util/free-delivery-eligibility"
import type { FulfillmentConfigData, PickupCreditConfig } from "@lib/data/strapi/checkout"
import {
  hasRegionalPickupForAddress,
  regionalPickupPresentation,
} from "@lib/util/southeast-pickup"
import { useFulfillmentEdit } from "@modules/checkout/context/fulfillment-edit-context"
import PlantPickupScheduling from "@modules/checkout/components/fulfillment-selector/scheduling/plant-pickup"
import SoutheastPickupScheduling from "@modules/checkout/components/fulfillment-selector/scheduling/southeast-pickup"
import AtlantaDeliveryScheduling from "@modules/checkout/components/fulfillment-selector/scheduling/atlanta-delivery"
import AddressForm, { type DeliveryAddress } from "@modules/checkout/components/fulfillment-selector/address-form"

type FulfillmentStepProps = {
  cart: HttpTypes.StoreCart
  customer: HttpTypes.StoreCustomer | null
  config: FulfillmentConfigData["checkout"]
  availableFulfillmentTypes: FulfillmentType[]
  pickupCreditConfig: PickupCreditConfig
}

const TruckIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
)

const DeliveryIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
)

const PlantIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
)

const MapPinIcon = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

const CheckCircleIcon = () => (
  <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
)

const CalendarIcon = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
)

const fulfillmentLabels: Record<FulfillmentType, { label: string; description: string }> = {
  ups_shipping: {
    label: "UPS Shipping",
    description: "Nationwide delivery via UPS. Packed in insulated containers to ensure freshness.",
  },
  atlanta_delivery: {
    label: "Local Delivery",
    description: "Fresh delivery to your door within the Atlanta metro area.",
  },
  plant_pickup: {
    label: "Plant Pickup",
    description: "Pick up at our Atlanta facility. Please bring a valid ID.",
  },
  southeast_pickup: {
    label: "Regional Pickup",
    description: "Collect from a partner pickup location in the Southeast.",
  },
}

type SubStep =
  | "select"
  | "atlanta_delivery"
  | "plant_date"
  | "southeast_pickup"
  | "save_address"
  | "switch_address"
type AddressFormIntent = "add" | "edit"

function getPreferredAddress(customer: HttpTypes.StoreCustomer | null) {
  const addresses = customer?.addresses || []
  if (!addresses.length) return null
  return (
    addresses.find((address) => address.is_default_shipping) ||
    addresses.find((address) => address.is_default_billing) ||
    addresses[0]
  )
}

function addressMatchesSavedAddress(
  address:
    | HttpTypes.StoreCartAddress
    | HttpTypes.StoreCustomerAddress
    | null
    | undefined,
  savedAddress: HttpTypes.StoreCustomerAddress
) {
  return fulfillmentAddressesMatch(address, savedAddress)
}

function friendlyFulfillmentError(message?: string) {
  if (!message) {
    return "We could not save that fulfillment method. Please try another option."
  }
  if (/server components render|digest|failed to fetch|unknown error/i.test(message)) {
    return "We could not save that fulfillment method for this address. Please try another option or update your address."
  }
  return message
}

export default function FulfillmentStep({ cart, customer, config, availableFulfillmentTypes, pickupCreditConfig }: FulfillmentStepProps) {
  const router = useRouter()
  const { setIsEditingFulfillment } = useFulfillmentEdit()
  const [isEditing, setIsEditing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subStep, setSubStep] = useState<SubStep>("select")
  const [pendingAtlantaDate, setPendingAtlantaDate] = useState("")
  const [pendingAtlantaTimeWindow, setPendingAtlantaTimeWindow] = useState("")
  const [pendingPickupDate, setPendingPickupDate] = useState("")
  const [pendingSELocationId, setPendingSELocationId] = useState("")
  const [pendingSEDate, setPendingSEDate] = useState("")
  const [savingAddress, setSavingAddress] = useState(false)
  const [saveAddressError, setSaveAddressError] = useState<string | null>(null)
  const [addressFormIntent, setAddressFormIntent] =
    useState<AddressFormIntent>("add")
  const [addressFormAddressId, setAddressFormAddressId] = useState<
    string | null
  >(null)
  // Explains why the selector auto-reopened after an address change made the
  // saved fulfillment method invalid (e.g. UPS chosen for an LA address, then
  // the cart address switched to an Atlanta ZIP where we only do local
  // delivery / pickup). Set by the region-mismatch effect below.
  const [regionResetNotice, setRegionResetNotice] = useState<string | null>(
    null
  )
  // useTransition lets us treat router.refresh() as an awaitable pending
  // state — `isRefreshing` stays true until the new server-rendered tree
  // is committed, so we can hold a loading overlay across the entire
  // save-address → refresh → re-render cycle and the user never sees the
  // intermediate "old cart" flash.
  const [isRefreshing, startTransition] = useTransition()
  // Covers the awaited clearFulfillmentDetails round-trip in the region-mismatch
  // reset (below), so the loading overlay is up the whole time and the user
  // can't click a card mid-clear (which would race the select vs the clear).
  const [isResettingFulfillment, setIsResettingFulfillment] = useState(false)
  const isBusy =
    savingAddress || isSubmitting || isRefreshing || isResettingFulfillment

  const attachShippingMethod = async (type: FulfillmentType) => {
    if (type === "ups_shipping") return
    // Wrap so a Medusa rejection (e.g., no matching shipping option) surfaces inline
    // instead of bubbling out and crashing the Server Components render boundary.
    try {
      const option = await findShippingOptionByType(cart.id, type)
      if (option) {
        await setShippingMethod({ cartId: cart.id, shippingMethodId: option.id })
      } else {
        throw new Error(`No shipping option available for ${type.replace(/_/g, " ")}. Please choose a different fulfillment method.`)
      }
    } catch (err: any) {
      throw new Error(err?.message || "Could not attach shipping method")
    }
  }

  const rawFulfillmentType = cart.metadata?.fulfillmentType as string | undefined
  const fulfillmentType = rawFulfillmentType && rawFulfillmentType.length > 0 ? rawFulfillmentType as FulfillmentType : undefined
  const scheduledDate = cart.metadata?.scheduledDate as string | undefined
  const requestedDeliveryDate = cart.metadata?.requestedDeliveryDate as
    | string
    | undefined
  const displayDate =
    fulfillmentType === "ups_shipping" ? requestedDeliveryDate : scheduledDate
  const hasFulfillment = Boolean(fulfillmentType)

  const showSelection = !hasFulfillment || isEditing

  useEffect(() => {
    setIsEditingFulfillment(showSelection)
  }, [showSelection, setIsEditingFulfillment])

  const cartTotal = cart.total || 0
  // #265: the plant-pickup and Southeast-pickup credits gate off the
  // FREE-DELIVERY ELIGIBLE subtotal (excludes SKUs flagged
  // `free_delivery_eligible = false`), matching FulfillmentProgress and the
  // authoritative promo gate in syncFreeShippingPromotion. Using the raw
  // cart subtotal here would let excluded bulk items push a customer over
  // the credit threshold in the copy while the actual promo never applies.
  const cartSubtotal = getFreeDeliveryEligibleSubtotal(cart.items)

  const normalizeMinimum = (value: number | undefined, defaultValue: number): number => {
    if (value === undefined || value === null) return defaultValue
    // Strapi MinimumOrderThresholds stores values in dollars (not cents).
    // The old > 500 ? / 100 heuristic incorrectly halved any threshold above $500.
    return value
  }

  const minimums = useMemo(() => ({
    upsShipping: normalizeMinimum(config?.MinimumOrderThresholds?.UPSShipping, 40),
    atlantaDelivery: normalizeMinimum(config?.MinimumOrderThresholds?.AtlantaDelivery, 100),
    plantPickup: normalizeMinimum(config?.MinimumOrderThresholds?.PlantPickup, 0),
    southeastPickup: normalizeMinimum(config?.MinimumOrderThresholds?.SoutheastPickup, 0),
  }), [config])

  // Pull active shipping address from cart when it is actually usable, then
  // fall back to the customer's saved address. Medusa can return an empty or
  // ZIP-only cart address during staff/customer handoff; that should not mask
  // a complete address that exists in the profile.
  const preferredCustomerAddress = getPreferredAddress(customer)
  const activeAddress = getActiveFulfillmentAddress(
    cart.shipping_address,
    preferredCustomerAddress
  )
  const shipZip = (activeAddress?.postal_code || "").trim()
  const shipCity = (activeAddress?.city || "").trim()
  const shipState = (activeAddress?.province || "").trim()
  const savedAddresses = customer?.addresses || []
  const canSwitchAddress = savedAddresses.length > 1
  const activeAddressId = (() => {
    const directId =
      (activeAddress as HttpTypes.StoreCustomerAddress | null | undefined)
        ?.id || null
    if (directId) return directId

    return (
      savedAddresses.find((address) =>
        addressMatchesSavedAddress(activeAddress, address)
      )?.id || null
    )
  })()
  const activeSavedAddress =
    savedAddresses.find((address) => address.id === activeAddressId) || null

  // Mirror the Addresses component's fallback exactly: when the Strapi-owned
  // list is absent OR present-but-empty, use the static table. This guarantees
  // both components classify the same ZIPs as Atlanta, so one can never clear
  // UPS while the other keeps offering it (a bounce-loop class).
  const atlantaZipCodes = config?.AtlantaDeliveryZipCodes?.length
    ? config.AtlantaDeliveryZipCodes
    : Object.keys(ATLANTA_DELIVERY_ZIP_DAYS)
  const isAtlantaZip = (zip: string) =>
    sharedIsAtlantaZip(zip, atlantaZipCodes)

  const isSoutheastPickupAddress = (
    zip: string,
    city: string,
    state: string
  ) =>
    hasRegionalPickupForAddress(config?.SoutheastPickupLocations, {
      zip,
      city,
      state,
    })

  const availability = useMemo(() => {
    const inAtlanta = isAtlantaZip(shipZip)
    const nearSoutheastPickup = isSoutheastPickupAddress(
      shipZip,
      shipCity,
      shipState
    )
    const haveAddress = Boolean(shipZip)

    return {
      // UPS targets out-of-region delivery. If we know the address is in Atlanta, hide it.
      upsShipping: cartTotal >= minimums.upsShipping && (!haveAddress || !inAtlanta),
      upsAmountAway: Math.max(0, minimums.upsShipping - cartTotal),
      upsReason: haveAddress && inAtlanta
        ? "Available for addresses outside our local delivery region"
        : null,

      atlantaDelivery: cartTotal >= minimums.atlantaDelivery && haveAddress && inAtlanta,
      atlantaDeliveryAmountAway: Math.max(0, minimums.atlantaDelivery - cartTotal),
      atlantaDeliveryReason: !haveAddress
        ? "Add an Atlanta-area address to enable"
        : !inAtlanta
          ? "Available for Atlanta-area addresses only"
          : null,

      // Plant pickup is always eligible — anyone can drive to the plant.
      plantPickup: cartTotal >= minimums.plantPickup,
      plantPickupAmountAway: Math.max(0, minimums.plantPickup - cartTotal),
      plantPickupReason: null as string | null,

      southeastPickup: cartTotal >= minimums.southeastPickup && haveAddress && nearSoutheastPickup,
      southeastAmountAway: Math.max(0, minimums.southeastPickup - cartTotal),
      southeastReason: !haveAddress
        ? "Add a shipping address to check pickup availability"
        : !nearSoutheastPickup
          ? "Available near Southeast partner cities only"
          : null,
    }
  }, [cartTotal, minimums, shipZip, shipCity, shipState, config])

  // Re-validate the SAVED fulfillment method against the cart's CURRENT
  // address. A customer can choose UPS for an out-of-region address, then edit
  // the cart to an Atlanta ZIP (where UPS isn't offered) via Step 2's "Edit",
  // a saved-address switch, or staff handoff. Nothing else re-checks the
  // already-chosen method, so without this it stays "UPS Shipping" and the
  // delivery/payment steps proceed with a method that doesn't apply. When the
  // saved method is no longer region-valid we clear it (server) + refresh,
  // which drops `hasFulfillment` and collapses the form back to this selector.
  const savedTypeRegionValid = isFulfillmentTypeRegionValid(
    fulfillmentType,
    shipZip,
    { atlantaZipCodes }
  )
  const savedRegionalPickupValid =
    fulfillmentType !== "southeast_pickup" ||
    isSoutheastPickupAddress(shipZip, shipCity, shipState)
  const regionMismatch =
    hasFulfillment &&
    Boolean(shipZip) &&
    (!savedTypeRegionValid || !savedRegionalPickupValid)
  // Guard so the clear fires at most once per (type, ZIP) — after the refresh
  // `fulfillmentType` is blank so the condition is false anyway, but this also
  // protects against a re-render race re-triggering the server mutation.
  const mismatchResetRef = useRef<string | null>(null)
  useEffect(() => {
    if (!regionMismatch) return
    const key = `${fulfillmentType}:${shipZip}`
    if (mismatchResetRef.current === key) return
    mismatchResetRef.current = key

    const label = fulfillmentType
      ? fulfillmentLabels[fulfillmentType].label
      : "your previous method"
    const where = shipCity || `ZIP ${shipZip}`
    setRegionResetNotice(
      `Your delivery address changed to ${where}, where ${label} isn't available. Please choose how you'd like to receive your order.`
    )
    setError(null)
    setIsEditing(true)
    setSubStep("select")
    setIsResettingFulfillment(true)
    ;(async () => {
      try {
        await clearFulfillmentDetails(cart.id)
      } catch {
        /* best-effort — the collapsed selector still forces a re-pick */
      }
      // Hand the overlay off from isResettingFulfillment to isRefreshing in one
      // commit so it never drops between the clear and the refresh.
      startTransition(() => router.refresh())
      setIsResettingFulfillment(false)
    })()
  }, [regionMismatch, fulfillmentType, shipZip, shipCity, cart.id, router])

  const regionalPickup = regionalPickupPresentation(shipState)

  const pickupCreditQualifies = cartSubtotal >= pickupCreditConfig.threshold
  const pickupCreditAmountAway = Math.max(0, pickupCreditConfig.threshold - cartSubtotal)

  const southeastCreditQualifies = cartSubtotal >= SE_PICKUP_CREDIT_THRESHOLD
  const southeastCreditAmountAway = Math.max(
    0,
    SE_PICKUP_CREDIT_THRESHOLD - cartSubtotal
  )

  const allOptions = [
    {
      id: "ups_shipping" as FulfillmentType,
      title: "Ship to Me",
      subtitle: "Continental US via UPS",
      icon: <TruckIcon />,
      available: availability.upsShipping,
      amountAway: availability.upsAmountAway,
      minimum: minimums.upsShipping,
      reason: availability.upsReason,
    },
    {
      id: "atlanta_delivery" as FulfillmentType,
      title: "Atlanta Delivery",
      subtitle: "Local to your door",
      icon: <DeliveryIcon />,
      available: availability.atlantaDelivery,
      amountAway: availability.atlantaDeliveryAmountAway,
      minimum: minimums.atlantaDelivery,
      reason: availability.atlantaDeliveryReason,
    },
    {
      id: "plant_pickup" as FulfillmentType,
      title: "Plant Pickup",
      subtitle: config?.PlantPickupCity ? `${config.PlantPickupCity}, ${config.PlantPickupState}` : "Atlanta, GA",
      icon: <PlantIcon />,
      available: availability.plantPickup,
      amountAway: availability.plantPickupAmountAway,
      minimum: minimums.plantPickup,
      reason: availability.plantPickupReason,
    },
    {
      id: "southeast_pickup" as FulfillmentType,
      title: regionalPickup.title,
      subtitle: regionalPickup.subtitle,
      icon: <MapPinIcon />,
      available: availability.southeastPickup,
      amountAway: availability.southeastAmountAway,
      minimum: minimums.southeastPickup,
      reason: availability.southeastReason,
    },
  ]

  // Always render all 4 fulfillment cards. The static `availability` logic
  // already knows whether each one fits the cart's address + subtotal; we
  // trust it over the Medusa-region `availableFulfillmentTypes` allow-list
  // (which can be misconfigured and accidentally hide UPS Ground for US
  // addresses that absolutely DO ship). If a type is configured at the
  // region level we don't need to do anything; if it isn't, `attachShippingMethod`
  // surfaces a friendly error.
  const options = allOptions

  const hasSavedAddress = Boolean(activeAddress?.postal_code)
  // Show the address CTA when:
  //   1. logged-in customer with no address on file at all, OR
  //   2. they have an address but it doesn't qualify for any local option
  //      (Atlanta delivery, Southeast pickup) — they may want to switch to a
  //      different address (e.g. office vs home) before falling back to UPS.
  const addressUnlocksNothing =
    hasSavedAddress &&
    !availability.atlantaDelivery &&
    !availability.southeastPickup &&
    !availability.atlantaDeliveryReason?.startsWith("Add") &&
    !availability.southeastReason?.startsWith("Add")
  const showAddressCTA = Boolean(customer) && (!hasSavedAddress || addressUnlocksNothing)

  const blankFormAddress: DeliveryAddress | null = customer
    ? {
        firstName: customer.first_name || "",
        lastName: customer.last_name || "",
        address: "",
        city: "",
        state: "GA",
        zip: "",
        phone: customer.phone || "",
      }
    : null
  const addressBeingEdited =
    savedAddresses.find((address) => address.id === addressFormAddressId) ||
    null
  const editableAddress = normalizeFulfillmentAddress(
    addressBeingEdited || activeSavedAddress || activeAddress
  )
  const editableFormAddress: DeliveryAddress | null = editableAddress
    ? {
        firstName: editableAddress.first_name || customer?.first_name || "",
        lastName: editableAddress.last_name || customer?.last_name || "",
        address: editableAddress.address_1 || "",
        city: editableAddress.city || "",
        state: editableAddress.province || "",
        zip: editableAddress.postal_code || "",
        phone: editableAddress.phone || customer?.phone || "",
      }
    : null
  const isEditingSavedAddress =
    addressFormIntent === "edit" && Boolean(addressFormAddressId)
  const initialFormAddress =
    addressFormIntent === "edit"
      ? editableFormAddress || blankFormAddress
      : blankFormAddress

  const openAddressForm = (
    intent: AddressFormIntent,
    addressId: string | null = null
  ) => {
    setSaveAddressError(null)
    setAddressFormIntent(intent)
    setAddressFormAddressId(intent === "edit" ? addressId : null)
    setSubStep("save_address")
  }

  const openAddressSelector = () => {
    setSaveAddressError(null)
    if (canSwitchAddress) {
      setSubStep("switch_address")
      return
    }
    openAddressForm(
      hasSavedAddress && activeAddressId ? "edit" : "add",
      activeAddressId
    )
  }

  const handleSaveAddress = async (addr: DeliveryAddress) => {
    setSavingAddress(true)
    setSaveAddressError(null)
    const res = await saveAddressToProfileAndCart({
      address_id: isEditingSavedAddress
        ? addressFormAddressId || undefined
        : undefined,
      first_name: addr.firstName,
      last_name: addr.lastName,
      address_1: addr.address,
      city: addr.city,
      province: addr.state,
      postal_code: addr.zip,
      phone: addr.phone,
    })
    if (!res.success) {
      setSavingAddress(false)
      setSaveAddressError(res.error || "Could not save your address.")
      return
    }
    // Keep the loading overlay up across the server refresh so the cards
    // never flash with the old address state.
    startTransition(() => {
      setSubStep("select")
      router.refresh()
      setSavingAddress(false)
    })
  }

  const handlePickSavedAddress = async (address: HttpTypes.StoreCustomerAddress) => {
    if (isBusy) return
    const fixedAddress = normalizeFulfillmentAddress(address)
    if (!hasCompleteFulfillmentAddress(fixedAddress)) {
      setSaveAddressError(
        "Please edit this saved address before using it at checkout. City, state, and ZIP are required."
      )
      return
    }

    setSavingAddress(true)
    setSaveAddressError(null)
    const res = await saveAddressToProfileAndCart({
      first_name: fixedAddress.first_name || customer?.first_name || "",
      last_name: fixedAddress.last_name || customer?.last_name || "",
      address_1: fixedAddress.address_1 || "",
      city: fixedAddress.city || "",
      province: fixedAddress.province || "",
      postal_code: fixedAddress.postal_code || "",
      phone: fixedAddress.phone || customer?.phone || "",
      country_code: fixedAddress.country_code || undefined,
    })
    if (!res.success) {
      setSavingAddress(false)
      setSaveAddressError(res.error || "Could not switch to that address.")
      return
    }
    startTransition(() => {
      setSubStep("select")
      router.refresh()
      setSavingAddress(false)
    })
  }

  const handleSelectOption = async (option: FulfillmentType) => {
    if (isSubmitting) return
    // The customer is actively re-picking; retire any address-change notice.
    setRegionResetNotice(null)

    if (option === "plant_pickup") {
      setPendingPickupDate("")
      setSubStep("plant_date")
      return
    }

    if (option === "southeast_pickup") {
      setPendingSELocationId("")
      setPendingSEDate("")
      setSubStep("southeast_pickup")
      return
    }

    if (option === "atlanta_delivery") {
      setPendingAtlantaDate("")
      setPendingAtlantaTimeWindow("")
      setSubStep("atlanta_delivery")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await setFulfillmentDetails({
        cartId: cart.id,
        fulfillmentType: option,
        fulfillmentZip: "00000",
        scheduledDate: "",
      })

      await attachShippingMethod(option)

      setIsEditing(false)
      setSubStep("select")
      router.refresh()
    } catch (err: any) {
      setError(friendlyFulfillmentError(err.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmPickupDate = async () => {
    if (isSubmitting || !pendingPickupDate) return

    setIsSubmitting(true)
    setError(null)

    try {
      await setFulfillmentDetails({
        cartId: cart.id,
        fulfillmentType: "plant_pickup",
        fulfillmentZip: "00000",
        scheduledDate: pendingPickupDate,
      })

      await attachShippingMethod("plant_pickup")

      setIsEditing(false)
      setSubStep("select")
      router.refresh()
    } catch (err: any) {
      setError(friendlyFulfillmentError(err.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmAtlantaDelivery = async () => {
    if (isSubmitting || !pendingAtlantaDate || !pendingAtlantaTimeWindow) return

    setIsSubmitting(true)
    setError(null)

    try {
      await setFulfillmentDetails({
        cartId: cart.id,
        fulfillmentType: "atlanta_delivery",
        fulfillmentZip: shipZip,
        scheduledDate: pendingAtlantaDate,
        scheduledTimeWindow: pendingAtlantaTimeWindow,
      })

      await attachShippingMethod("atlanta_delivery")

      setIsEditing(false)
      setSubStep("select")
      router.refresh()
    } catch (err: any) {
      setError(friendlyFulfillmentError(err.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmSoutheastPickup = async () => {
    if (isSubmitting || !pendingSELocationId || !pendingSEDate) return

    setIsSubmitting(true)
    setError(null)

    try {
      const location = config.SoutheastPickupLocations?.find(
        (loc) => loc.id === pendingSELocationId
      )

      await setFulfillmentDetails({
        cartId: cart.id,
        fulfillmentType: "southeast_pickup",
        fulfillmentZip: "00000",
        scheduledDate: pendingSEDate,
        pickupLocationId: pendingSELocationId,
        pickupLocationName: location?.Name,
        pickupLocationCity: location?.City,
        pickupLocationState: location?.State,
      })

      await attachShippingMethod("southeast_pickup")

      setIsEditing(false)
      setSubStep("select")
      router.refresh()
    } catch (err: any) {
      setError(friendlyFulfillmentError(err.message))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleChange = () => {
    if (isEditing) {
      setIsEditing(false)
      setSubStep("select")
    } else {
      setError(null)
      setIsEditing(true)
      setSubStep("select")
    }
  }

  return (
    <div
      className={`relative rounded-2xl p-5 shadow-sm border transition-colors ${
        showSelection
          ? "bg-white border-gray-200"
          : "bg-gradient-to-br from-Gold/[0.12] via-Gold/[0.06] to-transparent border-Gold/20"
      }`}
      aria-busy={isBusy || undefined}
    >
      {/* Loading overlay — held across the server refresh so the cards never
          flash with stale state while the address/fulfillment swap propagates. */}
      {isBusy && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 rounded-full bg-white shadow-md border border-gray-200 px-4 py-2">
            <svg className="animate-spin h-4 w-4 text-Gold" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm font-semibold text-Charcoal">Updating…</span>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-Gold text-white text-sm font-semibold shadow-sm">
            1
          </span>
          <h2 className="text-lg font-semibold text-gray-900">Fulfillment Method</h2>
          {hasFulfillment && !isEditing && <CheckCircleIcon />}
        </div>
        {hasFulfillment && (
          <button
            type="button"
            onClick={handleChange}
            disabled={isSubmitting}
            className="flex items-center gap-1 text-sm text-Gold hover:text-Gold/80 font-semibold transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-1.5">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : isEditing ? "Cancel" : "Change"}
            {!isEditing && (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Selection Mode */}
      <div className={`transition-all duration-300 ease-out ${showSelection && subStep === "select" ? "opacity-100" : showSelection ? "hidden" : "hidden"}`}>
        <h2 className="text-lg font-semibold text-Charcoal mb-0.5">
          How would you like to receive your order?
        </h2>
        <p className="text-sm text-Charcoal/60 mb-4">
          Select your preferred fulfillment method.
        </p>

        {/* Address-change reset notice — explains why the selector reopened
            after the saved method became invalid for the new address. */}
        {regionResetNotice && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2">
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
            <p className="text-sm text-amber-800">{regionResetNotice}</p>
          </div>
        )}

        {/* CTA: address gate. Two flavors:
            (a) no address on file → invite the customer to add one
            (b) address on file but doesn't unlock Atlanta or Southeast →
                show their current address with an "Edit" CTA so they can
                try a different one (e.g. work vs home) before falling back
                to UPS. Both save to BOTH the customer profile and the cart. */}
        {/* Qualifying-address summary: tells customer which saved address we're
            using to compute fulfillment availability and gives them a way to
            switch without going all the way into Step 2. */}
        {!showAddressCTA && hasSavedAddress && Boolean(customer) && (
          <div className="mb-4 flex items-center justify-between gap-3 p-3 rounded-xl bg-white/70 border border-Gold/20">
            <div className="flex items-start gap-2 min-w-0">
              <svg className="w-4 h-4 text-Gold flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-xs text-Charcoal/70 leading-snug min-w-0 truncate">
                <span className="font-semibold text-Charcoal">Shipping to:</span>{" "}
                {formatFulfillmentAddressLine(activeAddress)}
              </p>
            </div>
            <button
              type="button"
              onClick={openAddressSelector}
              className="flex-shrink-0 text-xs font-semibold text-Gold hover:text-Gold/80 transition-colors"
            >
              Change
            </button>
          </div>
        )}

        {showAddressCTA && (
          <div className="mb-4 p-4 rounded-xl border border-Gold/30 bg-Gold/[0.07]">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-Gold flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="flex-1 min-w-0">
                {hasSavedAddress ? (
                  <>
                    <p className="text-sm font-semibold text-Charcoal leading-tight">
                      Local delivery and pickup aren't available for this address
                    </p>
                    <p className="text-xs text-Charcoal/65 mt-1 leading-snug">
                      Currently using <span className="font-medium">{formatFulfillmentAddressLine(activeAddress)}</span>. Try a different address to see more options.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-Charcoal leading-tight">
                      We don't have your delivery address yet
                    </p>
                    <p className="text-xs text-Charcoal/65 mt-1 leading-snug">
                      Add one to unlock Atlanta delivery and Southeast pickup. We'll save it to your profile.
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={openAddressSelector}
                className="flex-shrink-0 h-9 px-3 text-xs font-semibold text-white bg-Gold rounded-lg hover:bg-Gold/90 transition-colors"
              >
                {hasSavedAddress ? (canSwitchAddress ? "Change Address" : "Edit Address") : "Add Address"}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {options.map((option) => {
            // A disabled card is "addressable" only when the customer has NO
            // saved address at all. Once an address is on file, a card that
            // doesn't qualify (e.g. Atlanta Delivery for a Cincinnati ZIP)
            // shouldn't pretend it can be unlocked by "adding an address" —
            // the Change Address banner above already covers that case.
            const blockedByMissingAddress =
              !option.available &&
              !hasSavedAddress &&
              showAddressCTA &&
              cartTotal >= option.minimum &&
              (option.id === "atlanta_delivery" || option.id === "southeast_pickup")
            const clickable = (option.available || blockedByMissingAddress) && !isSubmitting
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  if (option.available) handleSelectOption(option.id)
                  else if (blockedByMissingAddress) {
                    openAddressForm("add")
                  }
                }}
                disabled={!clickable}
                className={`
                  relative p-4 rounded-xl border-2 text-left transition-all duration-200 bg-white
                  ${option.available && !isSubmitting
                    ? "border-gray-200 hover:border-Gold hover:shadow-md cursor-pointer active:scale-[0.98]"
                    : blockedByMissingAddress
                      ? "border-gray-200 hover:border-Gold hover:shadow-md cursor-pointer opacity-90"
                      : "border-gray-100 bg-gray-50/80 cursor-not-allowed opacity-50"
                  }
                `}
              >
                <div className="flex flex-col">
                  <div className={`mb-2.5 ${clickable ? "text-Charcoal/80" : "text-gray-400"}`}>
                    {option.icon}
                  </div>
                  <h3 className={`font-semibold text-sm leading-tight ${clickable ? "text-Charcoal" : "text-gray-500"}`}>
                    {option.title}
                  </h3>
                  <p className={`text-xs mt-0.5 leading-snug ${clickable ? "text-Charcoal/50" : "text-gray-400"}`}>
                    {option.subtitle}
                  </p>

                  {option.id === "plant_pickup" && option.available && (
                    <p className="text-xs text-green-600 mt-2.5 font-semibold leading-tight">
                      {pickupCreditQualifies
                        ? `${convertToLocale({ amount: pickupCreditConfig.creditAmount, currency_code: cart.currency_code })} pickup credit!`
                        : `Add ${convertToLocale({ amount: pickupCreditAmountAway, currency_code: cart.currency_code })} for a ${convertToLocale({ amount: pickupCreditConfig.creditAmount, currency_code: cart.currency_code })} credit`
                      }
                    </p>
                  )}

                  {option.id === "southeast_pickup" && option.available && (
                    <p className="text-xs text-green-600 mt-2.5 font-semibold leading-tight">
                      {southeastCreditQualifies
                        ? `Save ${convertToLocale({ amount: SE_PICKUP_CREDIT_AMOUNT, currency_code: cart.currency_code })} with Southeast Pickup`
                        : `Add ${convertToLocale({ amount: southeastCreditAmountAway, currency_code: cart.currency_code })} to save ${convertToLocale({ amount: SE_PICKUP_CREDIT_AMOUNT, currency_code: cart.currency_code })}`
                      }
                    </p>
                  )}

                  {!option.available && option.minimum > 0 && cartTotal < option.minimum && (
                    <p className="text-xs text-amber-600 mt-2.5 font-semibold">
                      Add {convertToLocale({ amount: option.amountAway, currency_code: cart.currency_code })} more
                    </p>
                  )}
                  {!option.available && option.reason && cartTotal >= option.minimum && (
                    <p className={`text-xs mt-2.5 font-medium leading-tight ${blockedByMissingAddress ? "text-Gold" : "text-Charcoal/60"}`}>
                      {blockedByMissingAddress ? "Add address to enable" : option.reason}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200/80 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Save Address sub-step */}
      {showSelection && subStep === "save_address" && (
        <div>
          <AddressForm
            initialAddress={initialFormAddress}
            onSubmit={handleSaveAddress}
            onBack={() => { setSaveAddressError(null); setSubStep("select") }}
            atlantaZipCodes={[]}
            isSubmitting={savingAddress}
            mode="general"
            intent={isEditingSavedAddress ? "edit" : "add"}
          />
          {saveAddressError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200/80 rounded-xl text-red-700 text-sm">
              {saveAddressError}
            </div>
          )}
        </div>
      )}

      {/* Switch Address sub-step — pick from saved customer addresses */}
      {showSelection && subStep === "switch_address" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-Charcoal">Choose a shipping address</h3>
            <button
              type="button"
              onClick={() => { setSaveAddressError(null); setSubStep("select") }}
              className="text-xs font-semibold text-Charcoal/60 hover:text-Charcoal"
              disabled={savingAddress}
            >
              Cancel
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {savedAddresses.map((address) => {
              const isActive = activeAddressId === address.id
              const formattedAddress = formatFulfillmentAddressLine(address)
              const addressComplete = hasCompleteFulfillmentAddress(address)
              return (
                <div
                  key={address.id}
                  className={`p-3 rounded-xl border-2 transition-all bg-white ${
                    isActive
                      ? "border-Gold shadow-sm"
                      : "border-gray-200 hover:border-Gold/60"
                  } ${savingAddress ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-Charcoal truncate">
                        {[address.first_name, address.last_name].filter(Boolean).join(" ") || "Saved address"}
                      </p>
                      <p className="text-xs text-Charcoal/65 mt-0.5 leading-snug">
                        {formattedAddress}
                      </p>
                      {!addressComplete && (
                        <p className="text-[11px] text-amber-700 mt-1 leading-snug">
                          Missing city, state, or ZIP. Edit before using.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {isActive && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-Gold bg-Gold/10 px-2 py-0.5 rounded-full">
                          Current
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => openAddressForm("edit", address.id)}
                        disabled={savingAddress}
                        className="text-xs font-semibold text-Charcoal/60 hover:text-Charcoal disabled:cursor-wait"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePickSavedAddress(address)}
                        disabled={savingAddress || isActive || !addressComplete}
                        aria-label={
                          addressComplete
                            ? `Use ${formattedAddress || "saved address"}`
                            : `Edit ${formattedAddress || "saved address"} before using`
                        }
                        className="text-xs font-semibold text-Gold hover:text-Gold/80 disabled:text-Charcoal/35 disabled:cursor-default"
                      >
                        {addressComplete ? "Use" : "Edit first"}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => openAddressForm("add")}
            disabled={savingAddress}
            className="mt-3 w-full text-center text-sm font-semibold text-Gold hover:text-Gold/80 transition-colors py-2 border border-dashed border-Gold/30 rounded-xl"
          >
            + Add a new address
          </button>
          {saveAddressError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200/80 rounded-xl text-red-700 text-sm">
              {saveAddressError}
            </div>
          )}
        </div>
      )}

      {/* Atlanta Delivery Date Selection */}
      {showSelection && subStep === "atlanta_delivery" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSubStep("select")}
              className="text-sm text-Gold hover:text-Gold/80 font-medium flex items-center gap-1 transition-colors"
            >
              <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Back
            </button>
          </div>
          <AtlantaDeliveryScheduling
            config={config}
            selectedDate={pendingAtlantaDate}
            selectedTimeWindow={pendingAtlantaTimeWindow}
            onDateChange={setPendingAtlantaDate}
            onTimeWindowChange={setPendingAtlantaTimeWindow}
            destinationZip={shipZip}
            atlantaZipConfig={config.AtlantaDeliveryZipDays}
          />
          <button
            type="button"
            onClick={handleConfirmAtlantaDelivery}
            disabled={!pendingAtlantaDate || !pendingAtlantaTimeWindow || isSubmitting}
            className={`
              w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200
              ${pendingAtlantaDate && pendingAtlantaTimeWindow && !isSubmitting
                ? "bg-Gold text-white hover:bg-Gold/90 shadow-md hover:shadow-lg active:scale-[0.99]"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }
            `}
          >
            {isSubmitting ? "Confirming..." : "Confirm Delivery Date"}
          </button>
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200/80 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Plant Pickup Date Selection */}
      {showSelection && subStep === "plant_date" && (
        <PlantPickupScheduling
          config={config}
          selectedDate={pendingPickupDate}
          onDateChange={setPendingPickupDate}
          onConfirm={handleConfirmPickupDate}
          onBack={() => setSubStep("select")}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Southeast Pickup Location/Date Selection */}
      {showSelection && subStep === "southeast_pickup" && (
        <SoutheastPickupScheduling
          locations={config.SoutheastPickupLocations?.map((loc) => ({
            ...loc,
            IsActive: true,
          })) || []}
          preferredState={shipState}
          selectedLocationId={pendingSELocationId}
          selectedDate={pendingSEDate}
          onLocationChange={setPendingSELocationId}
          onDateChange={setPendingSEDate}
          onConfirm={handleConfirmSoutheastPickup}
          onBack={() => setSubStep("select")}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Summary Mode */}
      {!showSelection && fulfillmentType && (
        <div className="flex items-start gap-4">
          <div className="p-3 bg-Gold rounded-xl text-white shadow-md shrink-0">
            {options.find(o => o.id === fulfillmentType)?.icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-Charcoal mb-1 tracking-tight">
              {fulfillmentType === "southeast_pickup"
                ? regionalPickup.title
                : fulfillmentLabels[fulfillmentType].label}
            </h3>
            
            {displayDate && (
              <div className="flex items-center gap-1.5 text-sm text-Charcoal/70 mb-1.5">
                <CalendarIcon />
                <span className="font-medium">{displayDate}</span>
              </div>
            )}
            
            <p className="text-sm text-Charcoal/55 leading-relaxed">
              {fulfillmentType === "southeast_pickup"
                ? regionalPickup.summary
                : fulfillmentLabels[fulfillmentType].description}
            </p>

            {fulfillmentType === "southeast_pickup" && Boolean(cart.metadata?.pickupLocationId) && (() => {
              const pickupLocationId = String(cart.metadata?.pickupLocationId)
              const locationName =
                config.SoutheastPickupLocations?.find((l) => l.id === pickupLocationId)?.Name ||
                pickupLocationId
              return (
                <div className="mt-2 flex items-center gap-1.5 text-sm text-Charcoal/70">
                  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-medium">{locationName}</span>
                </div>
              )
            })()}

            {fulfillmentType === "plant_pickup" && pickupCreditQualifies && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {convertToLocale({ amount: pickupCreditConfig.creditAmount, currency_code: cart.currency_code })} pickup credit applied
              </div>
            )}

            {fulfillmentType === "southeast_pickup" && southeastCreditQualifies && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                {convertToLocale({ amount: SE_PICKUP_CREDIT_AMOUNT, currency_code: cart.currency_code })} pickup credit applied
              </div>
            )}

            {fulfillmentType === "plant_pickup" && config.PlantPickupPostOrderNote && (
              <div className="mt-3 bg-Gold/5 border border-Gold/15 rounded-xl p-3">
                <p className="text-xs text-Charcoal/55 leading-relaxed">
                  {config.PlantPickupPostOrderNote}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
