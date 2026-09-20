import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { getAuthHeaders } from "../cookies"
import { adminFetch } from "./admin"

export async function staffCartHeaders(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders()
  if (!("authorization" in headers) || !headers.authorization) throw new Error("Sign in again before preparing a staff order.")
  // Keep the staff JWT separate: native cart/payment handlers must not assign
  // the staff account as the buyer or as the customer's payment account holder.
  return { "x-gp-staff-authorization": headers.authorization }
}

export async function createStaffCart(input: Record<string, unknown>, source: "staff_phone_order" | "staff_impersonation", customerId?: string) {
  return adminFetch<{ cart: HttpTypes.StoreCart }>("/admin/grillers/staff-carts", {
    method: "POST", body: JSON.stringify({ ...input, source, customer_id: customerId || undefined }),
  })
}
