"use server"

import "server-only"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { canManageOrderSupport } from "@lib/util/staff-access"
import { adminFetch } from "./admin"

export type StaffInstitutionalCollection = {
  status:
    | "disabled"
    | "accepted_on_terms"
    | "invoice_outstanding"
    | "collection_pending"
    | "collection_confirmed"
    | "reconciled"
    | "cancelled"
    | "quarantined"
  reason?: string
  invoiceTxnId?: string | null
  source?: { revision: string; lastSuccess: string }
  collection?: {
    confirmedCollectedCents: number
    confirmedCreditCents: number
    verifiedRemainingCents: number | null
    appliedReceiptCount: number
    quarantineReasons: string[]
  }
}

export async function getStaffInstitutionalCollection(
  orderId: string
): Promise<StaffInstitutionalCollection> {
  if (process.env.GP_INSTITUTIONAL_TERMS_ENABLED !== "true") {
    return { status: "disabled" }
  }
  const staff = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!staff || !canManageOrderSupport(staff)) {
    throw new Error("Order support access required")
  }
  if (!/^order_[A-Za-z0-9_-]+$/.test(orderId)) {
    throw new Error("Select a Medusa order")
  }
  return adminFetch<StaffInstitutionalCollection>(
    `/admin/grillers/orders/${orderId}/institutional-collection`
  )
}
