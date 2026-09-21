import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { getAuthHeaders } from "../cookies"
import { sdk } from "@lib/config"
import { canUseOfficeConsole } from "@lib/util/staff-access"
import { adminFetch, StaffApiError } from "./admin"

export async function staffCartHeaders(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers) || !headers.authorization) throw new Error("Sign in again before preparing a staff order.")
  // Keep the staff JWT separate: native cart/payment handlers must not assign
  // the staff account as the buyer or as the customer's payment account holder.
  return { "x-gp-staff-authorization": headers.authorization }
}

export async function createStaffCart(input: Record<string, unknown>, source: "staff_phone_order" | "staff_impersonation", customerId?: string) {
  try {
    return await adminFetch<{ cart: HttpTypes.StoreCart }>("/admin/grillers/staff-carts", {
      method: "POST", body: JSON.stringify({ ...input, source, customer_id: customerId || undefined }),
    })
  } catch (error) {
    if (!(error instanceof StaffApiError) || error.status !== 404) throw error
    // Only the absent endpoint or explicit log mode may use current-main cart
    // creation. Auth failures and uncertain outages never permit a downgrade.
    const customer = await (await import("../customer")).retrieveCustomer()
    if (!canUseOfficeConsole(customer) || (customer as any)?.staff_access) throw new Error("Current Office access is required before preparing a staff cart.")
    try {
      const capability = await adminFetch<{ staff_boundary_mode?: string }>("/admin/grillers/staff-access")
      if (capability.staff_boundary_mode !== "log") throw new Error("Staff cart receipts are required. Refresh before preparing the order.")
    } catch (capabilityError) {
      if (!(capabilityError instanceof StaffApiError) || capabilityError.status !== 404) throw capabilityError
    }
    return sdk.store.cart.create({ ...input, customer_id: customerId || undefined } as any, {}, {})
  }
}
