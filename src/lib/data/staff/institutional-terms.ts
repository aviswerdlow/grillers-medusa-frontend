"use server"

import "server-only"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { canUseOfficeConsole } from "@lib/util/staff-access"
import { adminFetch } from "./admin"

export type StaffInstitutionalTerms = {
  status: "disabled" | "approved" | "held" | "denied"
  reason: string | null
  source: { revision: string; lastSuccess: string } | null
  account: {
    customerListId: string
    approvalField: string
    approvalValue: string | null
    onHold: boolean | null
    termsName: string | null
    creditLimitCents: number | null
    openInvoiceCents: number
  } | null
}

export async function getStaffInstitutionalTerms(customerId: string): Promise<StaffInstitutionalTerms> {
  if (process.env.GP_INSTITUTIONAL_TERMS_ENABLED !== "true") {
    return { status: "disabled", reason: "feature_disabled", source: null, account: null }
  }
  const staff = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!staff || !canUseOfficeConsole(staff)) throw new Error("Customer account access required")
  if (!/^cus_[A-Za-z0-9_-]+$/.test(customerId)) {
    throw new Error("Select a Medusa customer account")
  }
  return adminFetch<StaffInstitutionalTerms>(
    `/admin/grillers/customers/${customerId}/institutional-terms`
  )
}
