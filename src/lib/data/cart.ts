"use server"

import { sdk } from "@lib/config"
import { getActiveStaffImpersonation } from "@lib/data/customer"
import { staffAuditFields } from "@lib/data/staff/admin"
import { createStaffCart, staffCartHeaders } from "@lib/data/staff/cart-authority"
import { ATLANTA_DELIVERY_ZIP_DAYS } from "@lib/util/atlanta-delivery-zips"
import { isSameAddressKey } from "@lib/util/compare-addresses"
import { normalizeDeliveryZip } from "@lib/util/delivery-zip"
import medusaError from "@lib/util/medusa-error"
import { stripPhone } from "@lib/util/format-phone"
import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import {
  checkCartInventoryAvailability,
  inventoryCheckoutError,
} from "./inventory-allocation"
import {
  getAuthHeaders,
  getCacheOptions,
  getCacheTag,
  getCartId,
  getStaffImpersonationCartId,
  removeCartId,
  removeStaffImpersonationCartId,
  setCartId,
  setStaffImpersonationCartId,
} from "./cookies"
import { getPaymentContextHeaders } from "./payment"
import { findShippingOptionByType } from "./fulfillment"
import { getRegion } from "./regions"
import { isInternalMedusaProduct } from "@lib/util/internal-products"
import { reportServerSoftFailure } from "@lib/server-soft-failure"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import {
  repairCheckoutAddressForWrite,
  reportCheckoutAddressRepair,
} from "@lib/checkout-address-quality"
import { buildOrderSmsConsentMetadata } from "@lib/util/order-sms-consent"
import { isExpectedNextRedirect } from "@lib/util/next-redirect"
import type { CalendarActionResult, FulfillmentCalendarPage, FulfillmentCalendarDraft } from "@lib/fulfillment-calendar"
import { fulfillmentDateKey } from "@lib/fulfillment-calendar"
import {
  CALENDAR_PATH,
  CALENDAR_REQUIRED_MESSAGE,
  calendarHttpStatus,
  legacyCalendarCart,
  validateCalendarOrLegacy,
} from "@lib/fulfillment-calendar-rollout"
import {
  clearedCheckoutFulfillmentMetadata,
  planCheckoutAddressFulfillmentTransition,
} from "@lib/checkout-fulfillment-state"

type ActiveStaffContext = Awaited<
  ReturnType<typeof getActiveStaffImpersonation>
>

const CART_ACTION_SLOW_ALERT_MS = Number(
  process.env.CART_ACTION_SLOW_ALERT_MS || 5_000
)

function reportSlowCartAction(
  action: string,
  startedAt: number,
  meta: Record<string, unknown>
) {
  const durationMs = Date.now() - startedAt
  if (durationMs < CART_ACTION_SLOW_ALERT_MS) return

  void emitStorefrontOpsAlert({
    alertKind: "revenue_action_slow",
    severity: "warn",
    title: `${action} took ${durationMs}ms`,
    path: `src/lib/data/cart.ts:${action}`,
    source: "medusa-server",
    meta: {
      ...meta,
      action,
      duration_ms: durationMs,
      threshold_ms: CART_ACTION_SLOW_ALERT_MS,
    },
  }).catch(() => {
    // Fail-open: alerting must never add risk to cart mutations.
  })
}

async function getCartStaffContext(): Promise<ActiveStaffContext> {
  return getActiveStaffImpersonation().catch(() => null)
}

async function cartHeadersForStaffContext(active: ActiveStaffContext) {
  const headers = { ...(await getAuthHeaders()) } as Record<string, string>

  if (!active) return headers

  return {
    ...(await staffCartHeaders()),
    "x-gp-staff-target-customer-id": active.session.targetCustomerId,
    "x-gp-staff-actor-customer-id": active.session.staffCustomerId,
  }
}

async function assertPublicVariantCanBeAddedToCart(
  variantId: string,
  headers: Record<string, string>
) {
  const { products } = await sdk.client.fetch<{
    products: HttpTypes.StoreProduct[]
  }>(`/store/products`, {
    method: "GET",
    query: {
      limit: 1,
      fields: "*variants,+metadata",
      "variants[id]": variantId,
    } as HttpTypes.FindParams & HttpTypes.StoreProductParams,
    headers,
    cache: "no-store",
  })

  if (!products?.some(product => product.variants?.some(variant => variant.id === variantId)) ||
      products.some(isInternalMedusaProduct)) {
    throw new Error("This item is not available for online ordering.")
  }
}

async function assertPublicVariantsCanBeAddedToCart(
  variantIds: string[],
  headers: Record<string, string>
) {
  const uniqueVariantIds = Array.from(new Set(variantIds.filter(Boolean)))
  if (!uniqueVariantIds.length) return
  if (uniqueVariantIds.length === 1) {
    await assertPublicVariantCanBeAddedToCart(uniqueVariantIds[0], headers)
    return
  }

  try {
    const { products } = await sdk.client.fetch<{
      products: HttpTypes.StoreProduct[]
    }>(`/store/products`, {
      method: "GET",
      query: {
        limit: uniqueVariantIds.length,
        fields: "*variants,+metadata",
        "variants[id]": uniqueVariantIds,
      } as HttpTypes.FindParams & HttpTypes.StoreProductParams,
      headers,
      cache: "no-store",
    })

    const returnedProducts = products || []
    if (returnedProducts.some(isInternalMedusaProduct)) {
      throw new Error("This item is not available for online ordering.")
    }

    const returnedVariantIds = new Set(
      returnedProducts.flatMap((product) =>
        (product.variants || []).map((variant) => variant.id)
      )
    )
    if (
      uniqueVariantIds.every((variantId) => returnedVariantIds.has(variantId))
    ) {
      return
    }
  } catch (error) {
    if (
      error instanceof Error &&
      /not available for online ordering/i.test(error.message)
    ) {
      throw error
    }
  }

  for (const variantId of uniqueVariantIds) {
    await assertPublicVariantCanBeAddedToCart(variantId, headers)
  }
}

async function getCurrentCartId(active: ActiveStaffContext) {
  return active
    ? await getStaffImpersonationCartId(active.session)
    : await getCartId()
}

async function setCurrentCartId(cartId: string, active: ActiveStaffContext) {
  if (active) {
    await setStaffImpersonationCartId(active.session, cartId)
    return
  }

  await setCartId(cartId)
}

async function removeCurrentCartId(active: ActiveStaffContext) {
  if (active) {
    await removeStaffImpersonationCartId(active.session)
    return
  }

  await removeCartId()
}

async function getActiveAtlantaDeliveryZipCodes(): Promise<string[]> {
  try {
    const { getAtlantaDeliveryZipConfig } = await import(
      "@lib/data/strapi/fulfillment"
    )
    const zipConfig = await getAtlantaDeliveryZipConfig()
    const zipCodes = Object.keys(zipConfig)
    if (zipCodes.length) return zipCodes
  } catch {
    // Fall back to the client-safe route table below.
  }

  return Object.keys(ATLANTA_DELIVERY_ZIP_DAYS)
}

function isStaffImpersonationCart(
  cart: HttpTypes.StoreCart | null | undefined
) {
  const metadata = cart?.metadata || {}
  return Boolean(
    metadata.staff_impersonation ||
      metadata.source === "staff_impersonation" ||
      metadata.staff_target_customer_id
  )
}

function withStaffCartMetadata<T extends Record<string, any>>(
  data: T,
  active: ActiveStaffContext,
  action: string,
  extra: Record<string, unknown> = {}
): T & { metadata?: Record<string, unknown> } {
  if (!active) return data

  return {
    ...data,
    metadata: {
      ...(data.metadata || {}),
      ...staffAuditFields(active.session, action, extra),
      source: "staff_impersonation",
    },
  }
}

/**
 * Retrieves a cart by its ID. If no ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to retrieve.
 * @returns The cart object if found, or null if not found.
 */
export async function retrieveCart(
  cartId?: string,
  options: { fresh?: boolean; throwOnFetchError?: boolean } = {}
) {
  const active = await getCartStaffContext()
  const explicitCartId = Boolean(cartId)
  const id = cartId || (await getCurrentCartId(active))

  if (!id) {
    return null
  }

  const headers = await cartHeadersForStaffContext(active)

  const next = options.fresh
    ? undefined
    : {
        ...(await getCacheOptions("carts")),
      }

  return await sdk.client
    .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${id}`, {
      method: "GET",
      query: {
        fields:
          "*items, *region, *shipping_address, *billing_address, *items.product, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name, +shipping_total, +total, +subtotal, +tax_total, +discount_total, +shipping_subtotal",
      },
      headers,
      next,
      cache: options.fresh ? "no-store" : "force-cache",
    })
    .then(async ({ cart }) => {
      if (!explicitCartId && active) {
        if (
          cart?.metadata?.staff_target_customer_id !==
          active.session.targetCustomerId
        ) {
          await removeCurrentCartId(active)
          return null
        }
      }

      if (!explicitCartId && !active && isStaffImpersonationCart(cart)) {
        await removeCurrentCartId(null)
        return null
      }

      return cart
    })
    .catch(async (e) => {
      if (isCartNotFoundError(e) && !explicitCartId) {
        await removeCurrentCartId(active)
        return null
      }

      // Checkout/order path: a failed cart fetch silently blanks the cart.
      reportServerSoftFailure("src/lib/data/cart.ts:retrieveCart", e, {
        cart_id: id,
      })

      if (options.throwOnFetchError) {
        throw e
      }

      return null
    })
}

function isCartNotFoundError(error: unknown) {
  const maybe = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
    data?: { type?: unknown; message?: unknown }
    message?: unknown
  }
  const status = Number(
    maybe?.status ?? maybe?.statusCode ?? maybe?.response?.status
  )
  if (status === 404) return true

  const type = String(maybe?.data?.type || "").toLowerCase()
  const message = String(
    maybe?.data?.message || maybe?.message || ""
  ).toLowerCase()

  return (
    type.includes("not_found") ||
    message.includes("cart not found") ||
    message.includes("cart was not found")
  )
}

export async function getOrSetCart(countryCode: string) {
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  const active = await getCartStaffContext()
  let cart = await retrieveCart()

  if (
    active &&
    cart &&
    cart.metadata?.staff_target_customer_id !== active.session.targetCustomerId
  ) {
    await removeCurrentCartId(active)
    cart = null
  }

  const headers = await cartHeadersForStaffContext(active)

  if (!cart) {
    const input = withStaffCartMetadata(
      {
        region_id: region.id,
        ...(active ? { email: active.session.targetEmail } : {}),
      },
      active,
      "cart_created"
    )
    const cartResp = active
      ? await createStaffCart(input, "staff_impersonation", active.session.targetCustomerId)
      : await sdk.store.cart.create(input, {}, headers)
    cart = cartResp.cart

    await setCurrentCartId(cart.id, active)

    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)
  }

  if (cart && cart?.region_id !== region.id) {
    await sdk.store.cart.update(
      cart.id,
      withStaffCartMetadata(
        { region_id: region.id },
        active,
        "cart_region_update"
      ),
      {},
      headers
    )
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)
  }

  return cart
}

export async function updateCart(data: HttpTypes.StoreUpdateCart) {
  const active = await getCartStaffContext()
  const cartId = await getCurrentCartId(active)

  if (!cartId) {
    throw new Error("No existing cart found, please create one before updating")
  }

  const headers = await cartHeadersForStaffContext(active)

  return sdk.store.cart
    .update(
      cartId,
      withStaffCartMetadata(data, active, "cart_update"),
      {},
      headers
    )
    .then(async ({ cart }) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)

      return cart
    })
    .catch(medusaError)
}

export async function addToCart({
  variantId,
  quantity,
  countryCode,
  metadata,
}: {
  variantId: string
  quantity: number
  countryCode: string
  metadata?: Record<string, unknown>
}) {
  if (!variantId) {
    throw new Error("Missing variant ID when adding to cart")
  }

  const startedAt = Date.now()
  let completed = false
  let cartId: string | null = null

  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)

  await assertPublicVariantCanBeAddedToCart(variantId, headers)

  const cart = await getOrSetCart(countryCode)

  if (!cart) {
    throw new Error("Error retrieving or creating cart")
  }

  cartId = cart.id

  try {
    await sdk.store.cart.createLineItem(
      cart.id,
      {
        variant_id: variantId,
        quantity,
        metadata: {
          ...(metadata || {}),
          ...(active
            ? staffAuditFields(active.session, "cart_line_add", {
                variantId,
                quantity,
                source: "staff_impersonation",
              })
            : {}),
        },
      },
      {},
      headers
    )
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)

    const fulfillmentCacheTag = await getCacheTag("fulfillment")
    revalidateTag(fulfillmentCacheTag)

    // Subtotal may have crossed a free-shipping threshold.
    try {
      const { syncFreeShippingPromotionByCartId } = await import(
        "./free-shipping-promo"
      )
      await syncFreeShippingPromotionByCartId(cart.id)
    } catch {
      /* logged inside helper */
    }
    completed = true
  } catch (error) {
    medusaError(error)
  } finally {
    reportSlowCartAction("add_to_cart", startedAt, {
      cart_id: cartId,
      variant_id: variantId,
      quantity,
      success: completed,
    })
  }
}

export async function updateLineItem({
  lineId,
  quantity,
}: {
  lineId: string
  quantity: number
}) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when updating line item")
  }

  const active = await getCartStaffContext()
  const cartId = await getCurrentCartId(active)

  if (!cartId) {
    throw new Error("Missing cart ID when updating line item")
  }

  const headers = await cartHeadersForStaffContext(active)

  await sdk.store.cart
    .updateLineItem(
      cartId,
      lineId,
      withStaffCartMetadata({ quantity }, active, "cart_line_quantity_update", {
        lineId,
        quantity,
      }),
      {},
      headers
    )
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)

      try {
        const { syncFreeShippingPromotionByCartId } = await import(
          "./free-shipping-promo"
        )
        await syncFreeShippingPromotionByCartId(cartId)
      } catch {
        /* logged inside helper */
      }
    })
    .catch(medusaError)
}

export type InventoryResolutionAction =
  | "substitute"
  | "remove"
  | "waitlist"
  | "move_order_date"
  | "complete_available_only"

export async function submitInventoryResolution({
  cartId,
  requestedFulfillmentDate,
  resolutions,
}: {
  cartId: string
  requestedFulfillmentDate?: string
  resolutions: Array<{
    originalVariantId: string
    action: InventoryResolutionAction
    replacementVariantId?: string
    quantity?: number
    email?: string
  }>
}) {
  if (!cartId) {
    throw new Error("Missing cart ID when submitting inventory resolution")
  }

  if (!resolutions.length) {
    throw new Error("No inventory resolutions were provided")
  }

  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)
  const result = await sdk.client
    .fetch<{
      ok: boolean
      message?: string
      cart_id?: string
      resolutions?: unknown[]
    }>("/store/gp-inventory/resolution", {
      method: "POST",
      body: {
        cart_id: cartId,
        requested_fulfillment_date: requestedFulfillmentDate,
        resolutions: resolutions.map((resolution) => ({
          original_variant_id: resolution.originalVariantId,
          action: resolution.action,
          replacement_variant_id: resolution.replacementVariantId,
          quantity: resolution.quantity,
          email: resolution.email,
        })),
      },
      headers,
      cache: "no-store",
    })
    .catch(medusaError)

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)

  const fulfillmentCacheTag = await getCacheTag("fulfillment")
  revalidateTag(fulfillmentCacheTag)

  return result
}

export async function deleteLineItem(lineId: string) {
  if (!lineId) {
    throw new Error("Missing lineItem ID when deleting line item")
  }

  const active = await getCartStaffContext()
  const cartId = await getCurrentCartId(active)

  if (!cartId) {
    throw new Error("Missing cart ID when deleting line item")
  }

  const headers = await cartHeadersForStaffContext(active)

  await sdk.store.cart
    .deleteLineItem(cartId, lineId, headers)
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)

      try {
        const { syncFreeShippingPromotionByCartId } = await import(
          "./free-shipping-promo"
        )
        await syncFreeShippingPromotionByCartId(cartId)
      } catch {
        /* logged inside helper */
      }
    })
    .catch(medusaError)
}

/** Legacy scheduling remains available only while the backend has not enabled
 * calendar enforcement and the cart has no existing calendar promise. */
export async function setRequestedDeliveryDate({
  cartId,
  date,
}: {
  cartId: string
  date: string
}) {
  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)
  if (date) {
    const result = await validateCalendarOrLegacy(calendarReaders(cartId, headers))
    if (result.state !== "legacy" || !fulfillmentDateKey(date))
      throw new Error(CALENDAR_REQUIRED_MESSAGE)
    const { cart } = result
    const { isArrivalDateValid, computeQuickBooksDueDateForArrival, normalizeUpsServiceCode } =
      await import("@lib/util/eligible-arrival-dates")
    const { getAtlantaDeliveryZipConfig } = await import("@lib/data/strapi/fulfillment")
    const { getFulfillmentBlackouts } = await import("@lib/data/strapi/checkout")
    const [atlantaZipConfig, blackouts] = await Promise.all([
      getAtlantaDeliveryZipConfig(), getFulfillmentBlackouts(),
    ])
    const destinationZip = cart.shipping_address?.postal_code?.trim() || ""
    const type = cart.metadata?.fulfillmentType
    const service = normalizeUpsServiceCode(cart.shipping_methods?.at(-1)?.name || "")
    const method = type === "plant_pickup" || type === "atlanta_delivery" || type === "southeast_pickup"
      ? type : service === "OVERNIGHT" ? "ups_overnight"
      : service === "2ND_DAY_AIR" ? "ups_2day" : service === "3_DAY_SELECT" ? "ups_3day" : "ups_ground"
    if (method !== "southeast_pickup" && !isArrivalDateValid(date, {
      method, destinationZip, atlantaZipConfig, blackouts,
    })) throw new Error("That arrival date isn't available for the selected shipping method. Please pick a different date.")
    await sdk.store.cart.update(cartId, withStaffCartMetadata({ metadata: {
      requestedDeliveryDate: date,
      qbdDueDate: computeQuickBooksDueDateForArrival(date, { method, destinationZip, blackouts }) || "",
    } }, active, "requested_delivery_date_update"), {}, headers)
    revalidateTag(await getCacheTag("carts"))
    return
  }
  await sdk.store.cart.update(
    cartId,
    withStaffCartMetadata(
      {
        metadata: {
          requestedDeliveryDate: "",
          scheduledDate: "",
          qbdDueDate: "",
          fulfillmentPickDate: "",
          fulfillmentDispatchDate: "",
          fulfillmentWindowLabel: "",
          fulfillmentCalendarTimezone: "",
          fulfillment_calendar_selection_v1: "",
          fulfillment_calendar_accepted_v1: null,
          fulfillmentCalendarQuoteId: "",
          scheduledTimeWindow: "",
        },
      },
      active,
      "requested_delivery_date_clear"
    ),
    {},
    headers
  )
  revalidateTag(await getCacheTag("carts"))
}

function calendarErrorMessage(error: unknown) {
  const e = error as {
    status?: number
    statusCode?: number
    response?: { status?: number }
    message?: string
  }
  const status = Number(e?.status ?? e?.statusCode ?? e?.response?.status)
  return status === 409
    ? "Your order or the available dates changed. Refresh dates and choose again."
    : "We couldn’t confirm available dates. Please refresh dates or choose another fulfillment option."
}

function calendarReaders(cartId: string, headers: Record<string, string>) {
  return {
    cartId,
    readCart: () => retrieveCart(cartId, { fresh: true, throwOnFetchError: true }),
    readCapability: () => sdk.client.fetch(CALENDAR_PATH, {
      method: "GET", cache: "no-store", headers,
    }),
    validate: () => sdk.client.fetch<{ state?: unknown; summary?: unknown }>(CALENDAR_PATH, {
      method: "POST", cache: "no-store", headers,
      body: { action: "validate", cart_id: cartId },
    }),
  }
}

export async function getCheckoutCalendar(input: {
  cartId: string
  fulfillmentType: FulfillmentType
  shippingOptionId?: string
  routeId?: string
}): Promise<CalendarActionResult<FulfillmentCalendarPage>> {
  try {
    const active = await getCartStaffContext()
    const optionId =
      input.shippingOptionId ??
      (await findShippingOptionByType(input.cartId, input.fulfillmentType))?.id
    if (!optionId)
      return {
        ok: false,
        error:
          "This fulfillment option is unavailable. Please choose another option.",
      }
    const headers = await cartHeadersForStaffContext(active)
    const data = await sdk.client.fetch<
      Omit<FulfillmentCalendarPage, "shippingOptionId">
    >("/store/grillers/checkout/fulfillment-calendar", {
      method: "POST",
      cache: "no-store",
      headers,
      body: {
        action: "list",
        cart_id: input.cartId,
        shipping_option_id: optionId,
        ...(input.routeId ? { route_id: input.routeId } : {}),
      },
    }).catch(async (error) => {
      if (await legacyCalendarCart({
        ...calendarReaders(input.cartId, headers),
        observation: calendarHttpStatus(error),
      })) return null
      throw error
    })
    if (!data) return { ok: false, legacy: true, error: "Use the available scheduling options below." }
    return { ok: true, data: { ...data, shippingOptionId: optionId } }
  } catch (error) {
    return { ok: false, error: calendarErrorMessage(error) }
  }
}

export async function saveCheckoutCalendar(input: {
  cartId: string
  choice: FulfillmentCalendarDraft
  pickupLocation?: { name?: string; city?: string; state?: string }
}): Promise<
  CalendarActionResult<
    | { state: "selected" }
    | { state: "changed"; page: FulfillmentCalendarPage; message: string }
  >
> {
  try {
    const active = await getCartStaffContext()
    const headers = await cartHeadersForStaffContext(active)
    const { choice } = input
    const data = await sdk.client.fetch<{
      state: "selected" | "changed"
      metadata: Record<string, unknown>
      calendar: FulfillmentCalendarPage["calendar"]
      contextRevision: string
      replacementQuote?: string
      message?: string
    }>("/store/grillers/checkout/fulfillment-calendar", {
      method: "POST",
      cache: "no-store",
      headers,
      body: {
        action: "select",
        cart_id: input.cartId,
        shipping_option_id: choice.shippingOptionId,
        arrival_date: choice.arrivalDate,
        context_revision: choice.contextRevision,
        ...(choice.windowId ? { window_id: choice.windowId } : {}),
        ...(choice.routeId ? { route_id: choice.routeId } : {}),
        ...(choice.replacementQuote
          ? { replacement_quote: choice.replacementQuote }
          : {}),
      },
    })
    if (data.state === "changed")
      return {
        ok: true,
        data: {
          state: "changed",
          message:
            "The carrier returned a different arrival estimate. Please choose and confirm the updated date.",
          page: {
            calendar: data.calendar,
            contextRevision: data.contextRevision,
            shippingOptionId: choice.shippingOptionId,
            replacementQuote: data.replacementQuote,
          },
        },
      }
    if (
      data.state !== "selected" ||
      !data.metadata?.fulfillment_calendar_selection_v1
    )
      throw new Error("Missing confirmed date")
    await sdk.store.cart.update(
      input.cartId,
      withStaffCartMetadata(
        {
          metadata: {
            ...data.metadata,
            fulfillment_calendar_accepted_v1: null,
            pickupLocationName: input.pickupLocation?.name || "",
            pickupLocationCity: input.pickupLocation?.city || "",
            pickupLocationState: input.pickupLocation?.state || "",
            fulfillmentSelectionStatus: "pending",
          },
        },
        active,
        "fulfillment_calendar_select"
      ),
      {},
      headers
    )
    // Refresh the persisted package/rate snapshot for this exact dated choice,
    // even when the customer keeps the same shipping service.
    await setShippingMethod({
      cartId: input.cartId,
      shippingMethodId: choice.shippingOptionId,
    })
    revalidateTag(await getCacheTag("carts"))
    revalidateTag(await getCacheTag("fulfillment"))
    return { ok: true, data: { state: "selected" } }
  } catch (error) {
    revalidateTag(await getCacheTag("carts"))
    return { ok: false, error: calendarErrorMessage(error) }
  }
}

export async function verifyCartCalendarForCheckout(cartId: string) {
  const active = await getCartStaffContext()
  await validateCalendarOrLegacy(calendarReaders(cartId, await cartHeadersForStaffContext(active)))
}

/**
 * Fulfillment type options for checkout
 */
export type FulfillmentType =
  | "plant_pickup"
  | "atlanta_delivery"
  | "ups_shipping"
  | "southeast_pickup"

/**
 * Sets fulfillment details on the cart metadata.
 * This data flows to the order when cart.complete() is called.
 */
export async function setFulfillmentDetails({
  cartId,
  fulfillmentType,
  fulfillmentZip,
  scheduledDate,
  scheduledTimeWindow,
  pickupLocationId,
  pickupLocationName,
  pickupLocationCity,
  pickupLocationState,
}: {
  cartId: string
  fulfillmentType: FulfillmentType
  fulfillmentZip: string
  scheduledDate: string
  scheduledTimeWindow?: string
  pickupLocationId?: string
  pickupLocationName?: string
  pickupLocationCity?: string
  pickupLocationState?: string
}) {
  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)
  let legacyDate = false
  let qbdDueDate = ""
  if (scheduledDate || scheduledTimeWindow) {
    const result = await validateCalendarOrLegacy(calendarReaders(cartId, headers))
    if (result.state !== "legacy" || !fulfillmentDateKey(scheduledDate))
      throw new Error(CALENDAR_REQUIRED_MESSAGE)
    legacyDate = true
    if (fulfillmentType !== "ups_shipping") {
      const { computeQuickBooksDueDateForArrival } = await import("@lib/util/eligible-arrival-dates")
      qbdDueDate = computeQuickBooksDueDateForArrival(scheduledDate, {
        method: fulfillmentType, destinationZip: fulfillmentZip,
      }) || ""
    }
  }
  const metadata = {
    ...(legacyDate ? {
      scheduledDate: fulfillmentType === "ups_shipping" ? "" : scheduledDate,
      scheduledTimeWindow: scheduledTimeWindow || "",
      qbdDueDate,
    } : clearedCheckoutFulfillmentMetadata()),
    fulfillmentType,
    fulfillmentZip,
    pickupLocationId: pickupLocationId || "",
    pickupLocationName: pickupLocationName || "",
    pickupLocationCity: pickupLocationCity || "",
    pickupLocationState: pickupLocationState || "",
    fulfillmentSelectionStatus: "pending",
  }

  return sdk.store.cart
    .update(
      cartId,
      withStaffCartMetadata({ metadata }, active, "fulfillment_details_update"),
      {},
      headers
    )
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      // Fulfillment choice changes which threshold rule (in-region vs national)
      // applies, so re-sync the free-shipping promo immediately.
      try {
        const { syncFreeShippingPromotionByCartId } = await import(
          "./free-shipping-promo"
        )
        await syncFreeShippingPromotionByCartId(cartId)
      } catch {
        /* logged inside helper */
      }
    })
    .catch(medusaError)
}

/**
 * Saves customer order notes to cart metadata.
 */
export async function setOrderNotes({
  cartId,
  notes,
}: {
  cartId: string
  notes: string
}) {
  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)

  return sdk.store.cart
    .update(
      cartId,
      withStaffCartMetadata(
        { metadata: { orderNotes: notes } },
        active,
        "order_notes_update"
      ),
      {},
      headers
    )
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
    })
    .catch(medusaError)
}

/**
 * Stores the customer's order-scoped pickup/delivery SMS choice on the cart.
 *
 * The phone is read from the fresh server-side cart rather than accepted from
 * the browser. Revocation replaces the object with a deliberately sparse
 * record so an earlier phone, timestamp, or disclosure cannot survive.
 */
export async function setOrderSmsConsent({
  cartId,
  granted,
}: {
  cartId: string
  granted: boolean
}) {
  const active = await getCartStaffContext()
  if (active) {
    throw new Error(
      "Order text consent must be collected directly from the customer."
    )
  }

  const currentCartId = await getCurrentCartId(active)
  if (!currentCartId || currentCartId !== cartId) {
    throw new Error("The active cart changed. Refresh checkout and try again.")
  }

  const cart = await retrieveCart(cartId, {
    fresh: true,
    throwOnFetchError: true,
  })
  if (!cart) {
    throw new Error("The active cart could not be found.")
  }

  const consent = buildOrderSmsConsentMetadata({
    granted,
    phone: cart.shipping_address?.phone,
  })
  const headers = await cartHeadersForStaffContext(active)

  return sdk.store.cart
    .update(
      cartId,
      { metadata: { order_sms_consent: consent } },
      {},
      headers
    )
    .then(async ({ cart: updatedCart }) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return updatedCart
    })
    .catch(medusaError)
}

/**
 * Clears fulfillment details from cart metadata (for when user wants to change selection)
 */
export async function clearFulfillmentDetails(cartId: string) {
  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)

  return sdk.store.cart
    .update(
      cartId,
      withStaffCartMetadata(
        {
          metadata: clearedCheckoutFulfillmentMetadata(),
        },
        active,
        "fulfillment_details_clear"
      ),
      {},
      headers
    )
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
    })
    .catch(medusaError)
}

export async function verifyCartInventoryForCheckout(cartId?: string) {
  const cart = await retrieveCart(cartId)

  if (!cart) {
    throw new Error("No existing cart found when checking inventory")
  }

  const availability = await checkCartInventoryAvailability(cart)
  const error = inventoryCheckoutError(availability.lines)
  if (error) {
    throw new Error(error)
  }

  return availability
}

export async function getCartInventoryReview(cartId?: string) {
  const cart = await retrieveCart(cartId)
  if (!cart) return { ok: true, lines: [], error: null }

  try {
    const availability = await checkCartInventoryAvailability(cart)
    return {
      ...availability,
      error: inventoryCheckoutError(availability.lines),
    }
  } catch (err: any) {
    // Checkout path: inventory availability degraded — surface to ops so a
    // backend availability outage is visible before it silently blocks orders.
    reportServerSoftFailure(
      "src/lib/data/inventory-allocation.ts:getCartInventoryReview",
      err,
      { cart_id: cart?.id }
    )
    return {
      ok: false,
      lines: [],
      error:
        err?.message ||
        "Inventory availability could not be checked. Please try again.",
    }
  }
}

export async function setShippingMethod({
  cartId,
  shippingMethodId,
  shippingPriceToken,
}: {
  cartId: string
  shippingMethodId: string
  shippingPriceToken?: string
}) {
  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)

  if (active) {
    await sdk.store.cart.update(
      cartId,
      withStaffCartMetadata({}, active, "shipping_method_update", {
        shippingMethodId,
      }),
      {},
      headers
    )
  }

  // The visible quote wins. Automatic/staff method selection also gets a
  // server-issued quote; never construct an amount or pricing policy here.
  let priceToken = shippingPriceToken
  if (!priceToken) {
    const { calculatePriceForShippingOption } = await import("./fulfillment")
    const priced = await calculatePriceForShippingOption(shippingMethodId, cartId)
    priceToken = (priced as any)?.calculated_price?.shipping_price_quote_v1
  }
  return sdk.store.cart
    .addShippingMethod(cartId, { option_id: shippingMethodId, ...(priceToken ? { data: { shipping_price_quote_v1: priceToken } } : {}) }, {}, headers)
    .then(async (result) => {
      // Mark the two-step selection complete only after Medusa accepted the
      // shipping method. A failed attachment must remain visibly pending.
      await sdk.store.cart.update(
        cartId,
        withStaffCartMetadata(
          { metadata: { fulfillmentSelectionStatus: "settled" } },
          active,
          "shipping_method_settled",
          { shippingMethodId }
        ),
        {},
        headers
      )

      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      // Recompute free-shipping promo after a new method is attached so the
      // qualifying line gets the 100%-off-shipping discount immediately.
      try {
        const { syncFreeShippingPromotionByCartId } = await import(
          "./free-shipping-promo"
        )
        await syncFreeShippingPromotionByCartId(cartId)
      } catch {
        /* logged inside helper */
      }
      return result
    })
    .catch((err) => {
      throw medusaError(err)
    })
}

export async function initiatePaymentSession(
  cart: HttpTypes.StoreCart,
  data: HttpTypes.StoreInitializePaymentSession
) {
  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)

  if (active) {
    await sdk.store.cart.update(
      cart.id,
      withStaffCartMetadata({}, active, "payment_session_initiate", {
        provider_id: data.provider_id,
      }),
      {},
      headers
    )
  }

  return sdk.store.payment
    .initiatePaymentSession(cart, data, {}, headers)
    .then(async (resp) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return resp
    })
    .catch(medusaError)
}

export async function applyPromotions(codes: string[]) {
  const active = await getCartStaffContext()
  const cartId = await getCurrentCartId(active)

  if (!cartId) {
    throw new Error("No existing cart found")
  }

  const headers = await cartHeadersForStaffContext(active)

  return sdk.store.cart
    .update(
      cartId,
      withStaffCartMetadata(
        { promo_codes: codes },
        active,
        "cart_promotions_update",
        { codes }
      ),
      {},
      headers
    )
    .then(async () => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)
    })
    .catch(medusaError)
}

export async function applyGiftCard(code: string) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, { gift_cards: [{ code }] }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function removeDiscount(code: string) {
  // const cartId = getCartId()
  // if (!cartId) return "No cartId cookie found"
  // try {
  //   await deleteDiscount(cartId, code)
  //   revalidateTag("cart")
  // } catch (error: any) {
  //   throw error
  // }
}

export async function removeGiftCard(
  codeToRemove: string,
  giftCards: any[]
  // giftCards: GiftCard[]
) {
  //   const cartId = getCartId()
  //   if (!cartId) return "No cartId cookie found"
  //   try {
  //     await updateCart(cartId, {
  //       gift_cards: [...giftCards]
  //         .filter((gc) => gc.code !== codeToRemove)
  //         .map((gc) => ({ code: gc.code })),
  //     }).then(() => {
  //       revalidateTag("cart")
  //     })
  //   } catch (error: any) {
  //     throw error
  //   }
}

export async function submitPromotionForm(
  currentState: unknown,
  formData: FormData
) {
  const code = formData.get("code") as string
  try {
    await applyPromotions([code])
  } catch (e: any) {
    return e.message
  }
}

// TODO: Pass a POJO instead of a form entity here
export async function setAddresses(currentState: unknown, formData: FormData) {
  let fulfillmentWasReset = false

  try {
    if (!formData) {
      throw new Error("No form data found when setting addresses")
    }
    const active = await getCartStaffContext()
    const cartId = await getCurrentCartId(active)
    if (!cartId) {
      throw new Error("No existing cart found when setting addresses")
    }

    const shippingPhone =
      (formData.get("shipping_address.phone") as string) || ""
    const billingPhone = (formData.get("billing_address.phone") as string) || ""
    const data = {
      shipping_address: {
        first_name: formData.get("shipping_address.first_name"),
        last_name: formData.get("shipping_address.last_name"),
        address_1: formData.get("shipping_address.address_1"),
        address_2: "",
        company: formData.get("shipping_address.company"),
        postal_code: formData.get("shipping_address.postal_code"),
        city: formData.get("shipping_address.city"),
        country_code: formData.get("shipping_address.country_code"),
        province: formData.get("shipping_address.province"),
        // Persist digits-only so the cart phone matches the customer address
        // book and downstream order summaries (#68).
        phone: shippingPhone ? stripPhone(shippingPhone) : "",
      },
      email: formData.get("email"),
    } as any

    const sameAsBilling = formData.get("same_as_billing")
    const shippingRepair = repairCheckoutAddressForWrite(data.shipping_address)
    data.shipping_address = shippingRepair.address
    reportCheckoutAddressRepair({
      surface: "checkout_submit_shipping",
      path: "src/lib/data/cart.ts:setAddresses",
      result: shippingRepair,
      cartId,
      staffContext: Boolean(active),
      targetCustomerId: active?.session.targetCustomerId || null,
    })

    if (sameAsBilling === "on") data.billing_address = data.shipping_address

    if (sameAsBilling !== "on") {
      data.billing_address = {
        first_name: formData.get("billing_address.first_name"),
        last_name: formData.get("billing_address.last_name"),
        address_1: formData.get("billing_address.address_1"),
        address_2: "",
        company: formData.get("billing_address.company"),
        postal_code: formData.get("billing_address.postal_code"),
        city: formData.get("billing_address.city"),
        country_code: formData.get("billing_address.country_code"),
        province: formData.get("billing_address.province"),
        phone: billingPhone ? stripPhone(billingPhone) : "",
      }
      const billingRepair = repairCheckoutAddressForWrite(data.billing_address)
      data.billing_address = billingRepair.address
      reportCheckoutAddressRepair({
        surface: "checkout_submit_billing",
        path: "src/lib/data/cart.ts:setAddresses",
        result: billingRepair,
        cartId,
        staffContext: Boolean(active),
        targetCustomerId: active?.session.targetCustomerId || null,
      })
    }

    const postalCode = normalizeDeliveryZip(
      data.shipping_address.postal_code as string
    )

    // Decide whether the new address retires the old fulfillment choice before
    // validating that choice. An Atlanta -> non-Atlanta address edit is a valid
    // transition: the address and cleared fulfillment metadata are persisted in
    // one cart update, then the customer reselects a service for the new region.
    const currentCart = await retrieveCart(cartId, {
      fresh: true,
      throwOnFetchError: true,
    })
    if (!currentCart) {
      throw new Error(
        "The active cart could not be loaded. Refresh checkout and try again."
      )
    }
    const fulfillmentTransition = planCheckoutAddressFulfillmentTransition(
      currentCart,
      data.shipping_address
    )
    fulfillmentWasReset = fulfillmentTransition.reset
    if (fulfillmentTransition.metadata) {
      data.metadata = fulfillmentTransition.metadata
    }

    // Only validate a selection that will survive this address write. This
    // remains a fail-closed guard for an already-invalid retained Atlanta cart.
    if (
      !fulfillmentWasReset &&
      fulfillmentTransition.retainedFulfillmentType === "atlanta_delivery"
    ) {
      const atlantaZipCodes = await getActiveAtlantaDeliveryZipCodes()
      if (postalCode.length !== 5 || !atlantaZipCodes.includes(postalCode)) {
        throw new Error(
          "Atlanta Metro Delivery is only available for eligible Atlanta-area ZIP codes. Please update your address or select a different delivery method."
        )
      }
    }

    await updateCart(data)

    // Save address to customer account for future orders.
    // Note: this only runs for customers who are already authenticated when
    // setAddresses fires. The register-during-checkout case is handled by
    // saveCartAddressesToAccount in customer.ts (Path A) and
    // persistOrderShippingAddressToAccount below in placeOrder (Path B).
    // See issue #74.
    try {
      if (active) {
        const { adminFetch, appendStaffAuditLog, retrieveAdminCustomer } =
          await import("@lib/data/staff/admin")
        const current = await retrieveAdminCustomer(
          active.session.targetCustomerId
        )
        const existingAddresses: any[] = current?.addresses || []
        if (
          data.shipping_address.address_1 &&
          !existingAddresses.some((a) =>
            isSameAddressKey(a, data.shipping_address)
          )
        ) {
          await adminFetch(
            `/admin/customers/${active.session.targetCustomerId}/addresses`,
            {
              method: "POST",
              body: JSON.stringify({
                first_name: data.shipping_address.first_name as string,
                last_name: data.shipping_address.last_name as string,
                address_1: data.shipping_address.address_1 as string,
                address_2: "",
                company: (data.shipping_address.company as string) || "",
                city: data.shipping_address.city as string,
                postal_code: data.shipping_address.postal_code as string,
                province: (data.shipping_address.province as string) || "",
                country_code: data.shipping_address.country_code as string,
                phone: data.shipping_address.phone
                  ? stripPhone(data.shipping_address.phone as string)
                  : "",
                is_default_shipping: existingAddresses.length === 0,
                is_default_billing: existingAddresses.length === 0,
              }),
            }
          )
          await adminFetch(
            `/admin/customers/${active.session.targetCustomerId}`,
            {
              method: "POST",
              body: JSON.stringify({
                metadata: {
                  ...appendStaffAuditLog(current?.metadata, {
                    type: "staff_checkout_address_create",
                    staffCustomerId: active.session.staffCustomerId,
                    staffEmail: active.session.staffEmail,
                    targetCustomerId: active.session.targetCustomerId,
                  }),
                  ...staffAuditFields(
                    active.session,
                    "checkout_address_create"
                  ),
                },
              }),
            }
          )
          const customerCacheTag = await getCacheTag("customers")
          revalidateTag(customerCacheTag)
        }
      } else {
        const headers = { ...(await getAuthHeaders()) }
        if ("authorization" in headers && (headers as any).authorization) {
          const { customer } = await sdk.store.customer.retrieve({}, headers)
          const existingAddresses: any[] = customer?.addresses || []
          if (
            data.shipping_address.address_1 &&
            !existingAddresses.some((a) =>
              isSameAddressKey(a, data.shipping_address)
            )
          ) {
            await sdk.store.customer.createAddress(
              {
                first_name: data.shipping_address.first_name as string,
                last_name: data.shipping_address.last_name as string,
                address_1: data.shipping_address.address_1 as string,
                address_2: "",
                company: (data.shipping_address.company as string) || "",
                city: data.shipping_address.city as string,
                postal_code: data.shipping_address.postal_code as string,
                province: (data.shipping_address.province as string) || "",
                country_code: data.shipping_address.country_code as string,
                // data.shipping_address.phone is already digits-only above; the
                // explicit stripPhone here is belt-and-suspenders in case this
                // path ever inherits a different shape.
                phone: data.shipping_address.phone
                  ? stripPhone(data.shipping_address.phone as string)
                  : "",
                is_default_shipping: existingAddresses.length === 0,
                is_default_billing: existingAddresses.length === 0,
              },
              {},
              headers
            )
            const customerCacheTag = await getCacheTag("customers")
            revalidateTag(customerCacheTag)
          }
        }
      }
    } catch {
      // Non-critical — don't block checkout if saving to account fails
    }

    // Now that the address is saved, attach the shipping method
    // Medusa requires an address on the cart before a shipping method can be validated
    const retainedFulfillmentType =
      fulfillmentTransition.retainedFulfillmentType
    if (retainedFulfillmentType) {
      const shippingOption = await findShippingOptionByType(
        cartId,
        retainedFulfillmentType
      )
      if (shippingOption) {
        await setShippingMethod({ cartId, shippingMethodId: shippingOption.id })
      }
    }
  } catch (e: any) {
    if (e.message?.includes("unknown error")) {
      return "Unable to save your address. Please verify all fields are filled correctly and try again."
    }
    return e.message
  }

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)

  const countryCode = formData.get("shipping_address.country_code") || "us"
  return `__SUCCESS__:${countryCode}${
    fulfillmentWasReset ? ":fulfillment_reset" : ""
  }`
}

/**
 * Places an order for a cart. If no cart ID is provided, it will use the cart ID from the cookies.
 * @param cartId - optional - The ID of the cart to place an order for.
 * @returns The cart object if the order was successful, or null if not.
 */
export async function placeOrder(cartId?: string) {
  const active = await getCartStaffContext()
  const id = cartId || (await getCurrentCartId(active))

  if (!id) {
    throw new Error("No existing cart found when placing an order")
  }

  const headers = await cartHeadersForStaffContext(active)

  await verifyCartInventoryForCheckout(id)

  if (active) {
    await sdk.store.cart.update(
      id,
      withStaffCartMetadata({}, active, "order_submit"),
      {},
      headers
    )
  }

  const cartRes = await sdk.store.cart
    .complete(id, {}, headers)
    .then(async (cartRes) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return cartRes
    })
    .catch((err) => {
      throw medusaError(err)
    })

  if (cartRes?.type === "order") {
    const countryCode =
      cartRes.order.shipping_address?.country_code?.toLowerCase()

    const orderCacheTag = await getCacheTag("orders")
    revalidateTag(orderCacheTag)

    // Issue #74 — Path B (belt-and-suspenders): if the customer is logged in
    // (e.g. registered earlier in this checkout flow, or partway through),
    // make sure the order's shipping address ends up in their address book.
    // Idempotent — skips when an equivalent address already exists.
    await persistOrderShippingAddressToAccount(cartRes.order)

    await removeCurrentCartId(active)
    redirect(`/${countryCode}/order/${cartRes?.order.id}/confirmed`)
  }

  return cartRes.cart
}

export async function placeOrderWithSavedPaymentMethod({
  cartId,
  paymentMethodId,
  setupIntentId,
  consentVersion,
  consentText,
}: {
  cartId?: string
  paymentMethodId: string
  setupIntentId?: string | null
  consentVersion: string
  consentText: string
}) {
  const active = await getCartStaffContext()
  const id = cartId || (await getCurrentCartId(active))

  if (!id) {
    throw new Error("No existing cart found when placing an order")
  }

  const headers = await cartHeadersForStaffContext(active)
  const checkoutHeaders = active ? await getPaymentContextHeaders() : headers

  await verifyCartInventoryForCheckout(id)

  if (active) {
    await sdk.store.cart.update(
      id,
      withStaffCartMetadata({}, active, "order_submit_final_charge_setup", {
        paymentMethodId,
      }),
      {},
      headers
    )
  }

  const cartRes = await sdk.client
    .fetch<{
      type: "order" | "cart"
      order?: HttpTypes.StoreOrder
      cart?: HttpTypes.StoreCart
      error?: { message?: string }
    }>("/store/grillers/checkout/place-order", {
      method: "POST",
      headers: checkoutHeaders,
      body: {
        cart_id: id,
        payment_method_id: paymentMethodId,
        setup_intent_id: setupIntentId || null,
        consent_version: consentVersion,
        consent_text: consentText,
      },
    })
    .then(async (result) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return result
    })
    .catch((err) => {
      const error = medusaError(err) as unknown
      return {
        type: "cart" as const,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Could not place the order. Please try again.",
        },
      }
    })

  if (cartRes?.type === "order" && cartRes.order) {
    const countryCode =
      cartRes.order.shipping_address?.country_code?.toLowerCase() || "us"

    const orderCacheTag = await getCacheTag("orders")
    revalidateTag(orderCacheTag)

    await persistOrderShippingAddressToAccount(cartRes.order)
    await removeCurrentCartId(active)
    redirect(`/${countryCode}/order/${cartRes.order.id}/confirmed`)
  }

  if (cartRes?.error?.message) {
    return { error: cartRes.error.message }
  }

  return "cart" in cartRes ? cartRes.cart : null
}

export async function submitOrderWithSavedPaymentMethod(
  input: Parameters<typeof placeOrderWithSavedPaymentMethod>[0]
) {
  try {
    const result = await placeOrderWithSavedPaymentMethod(input)
    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
    ) {
      return { error: result.error }
    }
    return { error: null }
  } catch (err: any) {
    if (isExpectedNextRedirect(err)) {
      throw err
    }

    return {
      error:
        err?.message ||
        "Could not place the order. Please verify your payment details and try again.",
    }
  }
}

/**
 * #283 — place a no-card "pay by invoice" order for an approved B2B account. Mirrors
 * placeOrderWithSavedPaymentMethod but sends `payment_method: "invoice"` and no card / consent.
 * The backend route fails closed (403) if the customer is not approved.
 */
export async function placeOrderByInvoice({
  cartId,
}: { cartId?: string } = {}) {
  const active = await getCartStaffContext()
  const id = cartId || (await getCurrentCartId(active))

  if (!id) {
    throw new Error("No existing cart found when placing an order")
  }

  const headers = await cartHeadersForStaffContext(active)
  const checkoutHeaders = active ? await getPaymentContextHeaders() : headers

  await verifyCartInventoryForCheckout(id)

  const cartRes = await sdk.client
    .fetch<{
      type: "order" | "cart"
      order?: HttpTypes.StoreOrder
      cart?: HttpTypes.StoreCart
      error?: { message?: string }
    }>("/store/grillers/checkout/place-order", {
      method: "POST",
      headers: checkoutHeaders,
      body: {
        cart_id: id,
        payment_method: "invoice",
      },
    })
    .then(async (result) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return result
    })
    .catch((err) => {
      const error = medusaError(err) as unknown
      return {
        type: "cart" as const,
        error: {
          message:
            error instanceof Error
              ? error.message
              : "Could not place the order. Please try again.",
        },
      }
    })

  if (cartRes?.type === "order" && cartRes.order) {
    const countryCode =
      cartRes.order.shipping_address?.country_code?.toLowerCase() || "us"

    const orderCacheTag = await getCacheTag("orders")
    revalidateTag(orderCacheTag)

    await persistOrderShippingAddressToAccount(cartRes.order)
    await removeCurrentCartId(active)
    redirect(`/${countryCode}/order/${cartRes.order.id}/confirmed`)
  }

  if (cartRes?.error?.message) {
    return { error: cartRes.error.message }
  }

  return "cart" in cartRes ? cartRes.cart : null
}

export async function submitOrderByInvoice(
  input: Parameters<typeof placeOrderByInvoice>[0] = {}
) {
  try {
    const result = await placeOrderByInvoice(input)
    if (
      result &&
      typeof result === "object" &&
      "error" in result &&
      typeof result.error === "string"
    ) {
      return { error: result.error }
    }
    return { error: null }
  } catch (err: any) {
    if (isExpectedNextRedirect(err)) {
      throw err
    }

    return {
      error: err?.message || "Could not place the order. Please try again.",
    }
  }
}

/**
 * Issue #74 — best-effort: copy the just-completed order's shipping address
 * into the logged-in customer's address book if it's not already there.
 * Silent on every failure mode (guest checkout, no-auth, network blip, etc.)
 * so it can never block the order-confirmation redirect.
 */
async function persistOrderShippingAddressToAccount(
  order: HttpTypes.StoreOrder
): Promise<void> {
  try {
    const active = await getCartStaffContext()
    if (active) {
      const { adminFetch, appendStaffAuditLog, retrieveAdminCustomer } =
        await import("@lib/data/staff/admin")
      const current = await retrieveAdminCustomer(
        active.session.targetCustomerId
      )
      const existing: any[] = current?.addresses || []
      const shipping = order?.shipping_address
      if (
        !shipping?.address_1 ||
        existing.some((a) => isSameAddressKey(a, shipping))
      ) {
        return
      }

      await adminFetch(
        `/admin/customers/${active.session.targetCustomerId}/addresses`,
        {
          method: "POST",
          body: JSON.stringify({
            first_name: shipping.first_name || "",
            last_name: shipping.last_name || "",
            address_1: shipping.address_1 || "",
            address_2: shipping.address_2 || "",
            company: shipping.company || "",
            city: shipping.city || "",
            postal_code: shipping.postal_code || "",
            province: shipping.province || "",
            country_code: shipping.country_code || "",
            phone: shipping.phone || "",
            is_default_shipping: existing.length === 0,
            is_default_billing: existing.length === 0,
          }),
        }
      )
      await adminFetch(`/admin/customers/${active.session.targetCustomerId}`, {
        method: "POST",
        body: JSON.stringify({
          metadata: {
            ...appendStaffAuditLog(current?.metadata, {
              type: "staff_order_address_create",
              staffCustomerId: active.session.staffCustomerId,
              staffEmail: active.session.staffEmail,
              targetCustomerId: active.session.targetCustomerId,
              orderId: order.id,
            }),
            ...staffAuditFields(active.session, "order_address_create"),
          },
        }),
      })

      const customerCacheTag = await getCacheTag("customers")
      revalidateTag(customerCacheTag)
      return
    }

    const headers = { ...(await getAuthHeaders()) }
    if (!("authorization" in headers) || !(headers as any).authorization) {
      return
    }

    const shipping = order?.shipping_address
    if (!shipping?.address_1) return

    const { customer } = await sdk.store.customer.retrieve({}, headers)
    if (!customer) return

    const existing: any[] = customer.addresses || []
    if (existing.some((a) => isSameAddressKey(a, shipping))) return

    await sdk.store.customer.createAddress(
      {
        first_name: shipping.first_name || "",
        last_name: shipping.last_name || "",
        address_1: shipping.address_1 || "",
        address_2: shipping.address_2 || "",
        company: shipping.company || "",
        city: shipping.city || "",
        postal_code: shipping.postal_code || "",
        province: shipping.province || "",
        country_code: shipping.country_code || "",
        phone: shipping.phone || "",
        // Only mark default if the address book was previously empty.
        is_default_shipping: existing.length === 0,
        is_default_billing: existing.length === 0,
      },
      {},
      headers
    )

    const customerCacheTag = await getCacheTag("customers")
    revalidateTag(customerCacheTag)
  } catch {
    // Non-critical — never block the order-confirmation redirect.
  }
}

/**
 * Updates the countrycode param and revalidates the regions cache
 * @param regionId
 * @param countryCode
 */
export async function updateRegion(countryCode: string, currentPath: string) {
  const active = await getCartStaffContext()
  const cartId = await getCurrentCartId(active)
  const region = await getRegion(countryCode)

  if (!region) {
    throw new Error(`Region not found for country code: ${countryCode}`)
  }

  if (cartId) {
    await updateCart({ region_id: region.id })
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)
  }

  const regionCacheTag = await getCacheTag("regions")
  revalidateTag(regionCacheTag)

  const productsCacheTag = await getCacheTag("products")
  revalidateTag(productsCacheTag)

  redirect(`/${countryCode}${currentPath}`)
}

export async function listCartOptions(options: { fresh?: boolean } = {}) {
  const active = await getCartStaffContext()
  const cartId = await getCurrentCartId(active)
  const headers = await cartHeadersForStaffContext(active)
  const next = options.fresh
    ? undefined
    : {
        ...(await getCacheOptions("shippingOptions")),
      }

  return await sdk.client.fetch<{
    shipping_options: HttpTypes.StoreCartShippingOption[]
  }>("/store/shipping-options", {
    query: { cart_id: cartId },
    next,
    headers,
    cache: options.fresh ? "no-store" : "force-cache",
  })
}

/**
 * Add multiple items to the cart sequentially.
 * Returns the count of successfully added items.
 */
export async function addMultipleToCart(
  items: Array<{
    variantId: string
    quantity: number
    countryCode: string
    metadata?: Record<string, unknown>
  }>
): Promise<{ added: number; failed: number; addedQuantity: number }> {
  const startedAt = Date.now()
  const validItems = items.filter((item) => item.variantId && item.quantity > 0)
  if (!validItems.length) {
    return { added: 0, failed: items.length, addedQuantity: 0 }
  }

  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)

  await assertPublicVariantsCanBeAddedToCart(
    validItems.map((item) => item.variantId),
    headers
  )

  const cart = await getOrSetCart(validItems[0].countryCode)
  if (!cart) {
    return { added: 0, failed: validItems.length, addedQuantity: 0 }
  }

  let added = 0
  let addedQuantity = 0
  let failed = items.length - validItems.length
  const batchId = `cart-batch-${Date.now().toString(36)}`

  for (const item of validItems) {
    try {
      await sdk.store.cart.createLineItem(
        cart.id,
        {
          variant_id: item.variantId,
          quantity: item.quantity,
          metadata: {
            ...(item.metadata || {}),
            ...(active
              ? staffAuditFields(active.session, "cart_line_add", {
                  variantId: item.variantId,
                  quantity: item.quantity,
                  source: "staff_impersonation",
                  batch: true,
                  batchId,
                })
              : {}),
          },
        },
        {},
        headers
      )
      added++
      addedQuantity += item.quantity
    } catch {
      failed++
    }
  }

  if (added > 0) {
    const cartCacheTag = await getCacheTag("carts")
    revalidateTag(cartCacheTag)

    const fulfillmentCacheTag = await getCacheTag("fulfillment")
    revalidateTag(fulfillmentCacheTag)

    try {
      const { syncFreeShippingPromotionByCartId } = await import(
        "./free-shipping-promo"
      )
      await syncFreeShippingPromotionByCartId(cart.id)
    } catch {
      /* logged inside helper */
    }
  }

  reportSlowCartAction("add_multiple_to_cart", startedAt, {
    cart_id: cart.id,
    sku_count_requested: validItems.length,
    sku_count_added: added,
    sku_count_failed: failed,
    quantity_requested: validItems.reduce(
      (sum, item) => sum + item.quantity,
      0
    ),
    quantity_added: addedQuantity,
  })

  return { added, failed, addedQuantity }
}
