"use server"

import { sdk } from "@lib/config"
import { getActiveStaffImpersonation } from "@lib/data/customer"
import { staffAuditFields } from "@lib/data/staff/admin"
import { isSameAddressKey } from "@lib/util/compare-addresses"
import medusaError from "@lib/util/medusa-error"
import { stripPhone } from "@lib/util/format-phone"
import { HttpTypes } from "@medusajs/types"
import { revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
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
import { findShippingOptionByType } from "./fulfillment"
import { getRegion } from "./regions"

type ActiveStaffContext = Awaited<
  ReturnType<typeof getActiveStaffImpersonation>
>

async function getCartStaffContext(): Promise<ActiveStaffContext> {
  return getActiveStaffImpersonation().catch(() => null)
}

async function cartHeadersForStaffContext(active: ActiveStaffContext) {
  return active ? {} : { ...(await getAuthHeaders()) }
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
export async function retrieveCart(cartId?: string) {
  const active = await getCartStaffContext()
  const explicitCartId = Boolean(cartId)
  const id = cartId || (await getCurrentCartId(active))

  if (!id) {
    return null
  }

  const headers = await cartHeadersForStaffContext(active)

  const next = {
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
      cache: "force-cache",
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
    .catch(() => null)
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
    const cartResp = await sdk.store.cart.create(
      withStaffCartMetadata(
        {
          region_id: region.id,
          ...(active ? { email: active.session.targetEmail } : {}),
        },
        active,
        "cart_created"
      ),
      {},
      headers
    )
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

  const cart = await getOrSetCart(countryCode)

  if (!cart) {
    throw new Error("Error retrieving or creating cart")
  }

  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)

  await sdk.store.cart
    .createLineItem(
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
    .then(async () => {
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
    })
    .catch(medusaError)
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

export async function setRequestedDeliveryDate({
  cartId,
  date,
}: {
  cartId: string
  date: string
}) {
  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)

  // Server-side eligibility check — defends against #36 / #72 in case the UI
  // ever lets a customer click an impossible date. An empty string is allowed
  // (used to clear the selection when method/zip change makes the prior date invalid).
  if (date) {
    try {
      const { isArrivalDateValid } = await import(
        "@lib/util/eligible-arrival-dates"
      )
      const { getAtlantaDeliveryZipConfig } = await import(
        "@lib/data/strapi/fulfillment"
      )
      const atlantaZipConfig = await getAtlantaDeliveryZipConfig()
      const cart = await retrieveCart(cartId)
      const fulfillmentType = cart?.metadata?.fulfillmentType as
        | string
        | undefined
      const destZip = (cart?.shipping_address?.postal_code || "").trim()
      const selectedShippingName =
        cart?.shipping_methods?.at(-1)?.name?.toLowerCase() || ""
      let method: any = "ups_ground"
      if (fulfillmentType === "atlanta_delivery") method = "atlanta_delivery"
      else if (fulfillmentType === "southeast_pickup")
        method = "southeast_pickup"
      else if (fulfillmentType === "plant_pickup") method = "plant_pickup"
      else if (selectedShippingName.includes("overnight"))
        method = "ups_overnight"
      else if (
        selectedShippingName.includes("2nd day") ||
        selectedShippingName.includes("second day") ||
        selectedShippingName.includes("two day")
      ) {
        method = "ups_2day"
      }

      // For southeast_pickup we don't have the date list here cheaply; skip server
      // validation in that case (the UI source-of-truth is Strapi-backed already).
      if (method !== "southeast_pickup") {
        const ok = isArrivalDateValid(date, {
          method,
          destinationZip: destZip,
          atlantaZipConfig,
        })
        if (!ok) {
          throw new Error(
            "That arrival date isn't available for the selected shipping method. Please pick a different date."
          )
        }
      }
    } catch (err: any) {
      // If validation itself errors (e.g., import failure), surface only real
      // validation errors. Pass-through unexpected errors as 500.
      if (err?.message?.includes("isn't available")) {
        throw err
      }
      // Non-validation errors fall through to the cart update — we don't want
      // a transient validation hiccup to block legitimate orders.
    }
  }

  return sdk.store.cart
    .update(
      cartId,
      withStaffCartMetadata(
        { metadata: { requestedDeliveryDate: date } },
        active,
        "requested_delivery_date_update",
        { requestedDeliveryDate: date }
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
}: {
  cartId: string
  fulfillmentType: FulfillmentType
  fulfillmentZip: string
  scheduledDate: string
  scheduledTimeWindow?: string
  pickupLocationId?: string
}) {
  const active = await getCartStaffContext()
  const headers = await cartHeadersForStaffContext(active)

  const metadata: Record<string, string | undefined> = {
    fulfillmentType,
    fulfillmentZip,
    scheduledDate,
  }

  // Only include optional fields if provided
  if (scheduledTimeWindow) {
    metadata.scheduledTimeWindow = scheduledTimeWindow
  }
  if (pickupLocationId) {
    metadata.pickupLocationId = pickupLocationId
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
          metadata: {
            fulfillmentType: "",
            fulfillmentZip: "",
            scheduledDate: "",
            scheduledTimeWindow: "",
            pickupLocationId: "",
          },
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

export async function setShippingMethod({
  cartId,
  shippingMethodId,
}: {
  cartId: string
  shippingMethodId: string
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

  return sdk.store.cart
    .addShippingMethod(cartId, { option_id: shippingMethodId }, {}, headers)
    .then(async (result) => {
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
    if (sameAsBilling === "on") data.billing_address = data.shipping_address

    if (sameAsBilling !== "on")
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

    // Validate address matches the selected fulfillment type
    const selectedFulfillment = formData.get("fulfillmentType") as string
    const postalCode = data.shipping_address.postal_code as string

    if (selectedFulfillment === "atlanta_delivery" && postalCode) {
      if (!postalCode.startsWith("30")) {
        throw new Error(
          "Atlanta Metro Delivery is only available for addresses in the Atlanta metro area (ZIP codes starting with 30). Please update your address or select a different delivery method."
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
    if (selectedFulfillment) {
      const shippingOption = await findShippingOptionByType(
        cartId,
        selectedFulfillment as FulfillmentType
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
  return `__SUCCESS__:${countryCode}`
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

export async function listCartOptions() {
  const active = await getCartStaffContext()
  const cartId = await getCurrentCartId(active)
  const headers = await cartHeadersForStaffContext(active)
  const next = {
    ...(await getCacheOptions("shippingOptions")),
  }

  return await sdk.client.fetch<{
    shipping_options: HttpTypes.StoreCartShippingOption[]
  }>("/store/shipping-options", {
    query: { cart_id: cartId },
    next,
    headers,
    cache: "force-cache",
  })
}

/**
 * Add multiple items to the cart sequentially.
 * Returns the count of successfully added items.
 */
export async function addMultipleToCart(
  items: Array<{ variantId: string; quantity: number; countryCode: string }>
): Promise<{ added: number; failed: number }> {
  let added = 0
  let failed = 0

  for (const item of items) {
    try {
      await addToCart(item)
      added++
    } catch {
      failed++
    }
  }

  return { added, failed }
}
