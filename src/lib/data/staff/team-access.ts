"use server"

import "server-only"

import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import {
  canChargeFinalOrders,
  canRoleReceiveFinalChargeAccess,
  isBootstrapStaffCustomer,
  isSuperAdminCustomer,
  staffAccessRole,
  staffRoleConfirmation,
  type StaffAccessRole,
} from "@lib/util/staff-access"
import { revalidateTag } from "next/cache"
import { getCacheTag } from "../cookies"
import { adminFetch } from "./admin"
import { parseStaffAuditLog, type StaffAuditEntry } from "./exception-types"

type AnyRecord = Record<string, any>

export type StaffTeamUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  phone: string
  company: string
  role: StaffAccessRole
  finalChargeEnabled: boolean
  isBootstrapSuperAdmin: boolean
  latestStaffAccessEvent?: StaffAuditEntry
  recentStaffAccessEvents: StaffAuditEntry[]
}

export type StaffRoleUpdateInput = {
  customerId: string
  role: StaffAccessRole
  finalChargeEnabled?: boolean
  reason: string
  confirmation: string
}

export type StaffTeamSearchResult = {
  ok: boolean
  users: StaffTeamUser[]
  error?: string
}

const VALID_ROLES = new Set<StaffAccessRole>([
  "customer",
  "staff",
  "office",
  "driver",
  "picker",
  "packer",
  "manager",
  "merchandising_reviewer",
  "super_admin",
])
async function requireSuperAdmin() {
  const customer = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!customer || !isSuperAdminCustomer(customer)) {
    throw new Error("Super admin access required.")
  }
  return customer
}

function formatCustomerName(customer: AnyRecord): string {
  return (
    [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() ||
    customer.email ||
    "Customer"
  )
}

function staffAccessEvents(metadata: AnyRecord | null | undefined) {
  return parseStaffAuditLog(metadata)
    .filter((entry) => entry.action === "staff_role_change")
    .slice(-5)
    .reverse()
}

function summarizeCustomer(customer: AnyRecord): StaffTeamUser {
  const events = staffAccessEvents(customer.metadata)

  return {
    id: customer.id,
    email: customer.email || "",
    firstName: customer.first_name || "",
    lastName: customer.last_name || "",
    phone: customer.phone || "",
    company: customer.company_name || "",
    role: staffAccessRole(customer),
    finalChargeEnabled: canChargeFinalOrders(customer),
    isBootstrapSuperAdmin: isBootstrapStaffCustomer(customer),
    latestStaffAccessEvent: events[0],
    recentStaffAccessEvents: events,
  }
}

function requiredConfirmation(role: StaffAccessRole): string {
  return staffRoleConfirmation(role)
}

function teamAccessErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

async function emitTeamAccessSearchFailureAlert(query: string, error: unknown) {
  await emitStorefrontOpsAlert({
    alertKind: "staff_team_access_search_failed",
    severity: "warn",
    title: "Staff team access customer search failed",
    path: "src/lib/data/staff/team-access.ts",
    source: "medusa-server",
    fingerprint: "staff_team_access:search_failed",
    meta: {
      staff_module: "team_access",
      query_length: query.trim().length,
      query_has_at: query.includes("@"),
      query_has_plus: query.includes("+"),
      error_message: teamAccessErrorMessage(error).slice(0, 300),
    },
  })
}

async function emitTeamAccessUpdateFailureAlert(
  input: {
    actorId: string
    targetCustomerId: string
    previousRole: StaffAccessRole
    requestedRole: StaffAccessRole
    finalChargeEnabled: boolean
  },
  error: unknown
) {
  await emitStorefrontOpsAlert({
    alertKind: "staff_team_access_update_failed",
    severity: "page",
    title: "Staff team access update failed",
    path: "src/lib/data/staff/team-access.ts",
    source: "medusa-server",
    fingerprint: "staff_team_access:update_failed",
    meta: {
      staff_module: "team_access",
      staff_actor_customer_id: input.actorId,
      target_customer_id: input.targetCustomerId,
      previous_role: input.previousRole,
      requested_role: input.requestedRole,
      final_charge_enabled: input.finalChargeEnabled,
      error_message: teamAccessErrorMessage(error).slice(0, 300),
    },
  })
}

export async function searchStaffTeamUsers(
  query: string
): Promise<StaffTeamSearchResult> {
  try {
    await requireSuperAdmin()

    const q = query.trim()
    if (q.length < 2) return { ok: true, users: [] }

    const attempts: Array<Record<string, string | number>> = [{ q }]
    if (q.includes("@")) attempts.push({ email: q })
    if (q.includes("+")) attempts.push({ q: q.split("+")[0] })

    const seen = new Set<string>()
    const users: StaffTeamUser[] = []
    let lastError: unknown = null

    for (const attempt of attempts) {
      try {
        const { customers } = await adminFetch<{ customers: AnyRecord[] }>(
          "/admin/customers",
          {
            query: {
              ...attempt,
              limit: 20,
              fields: "id,email,first_name,last_name,phone,company_name,metadata",
            },
          }
        )

        ;(customers || []).forEach((customer) => {
          if (!customer?.id || seen.has(customer.id)) return
          seen.add(customer.id)
          users.push(summarizeCustomer(customer))
        })
      } catch (err) {
        lastError = err
      }
    }

    if (!users.length && lastError) {
      throw lastError
    }

    return { ok: true, users }
  } catch (err) {
    console.error("[staff-team-access] customer search failed", err)
    await emitTeamAccessSearchFailureAlert(query, err)
    return {
      ok: false,
      users: [],
      error:
        "Customer lookup failed. Try searching by name or the email before the plus sign, then try again.",
    }
  }
}

export async function updateStaffTeamRole(
  input: StaffRoleUpdateInput
): Promise<{ ok: boolean; user?: StaffTeamUser; error?: string }> {
  try {
    const actor = await requireSuperAdmin()
    const role = input.role
    if (!VALID_ROLES.has(role)) {
      throw new Error("Choose a valid staff role.")
    }
    if (role === "driver" && process.env.GP_LOCAL_MILESTONES_ENABLED !== "true") {
      throw new Error("The local delivery driver role is not enabled.")
    }

    const reason = input.reason.trim()
    if (reason.length < 8) {
      throw new Error("Add a short reason before changing staff access.")
    }

    const required = requiredConfirmation(role)
    if (input.confirmation.trim().toUpperCase() !== required) {
      throw new Error(`Type ${required} to confirm this staff access change.`)
    }

    const { customer } = await adminFetch<{ customer: AnyRecord }>(
      `/admin/customers/${input.customerId}`,
      {
        query: {
          fields: "id,email,first_name,last_name,phone,company_name,metadata",
        },
      }
    )

    if (!customer?.id) {
      throw new Error("Customer not found.")
    }

    const previousRole = staffAccessRole(customer)
    if (customer.id === actor.id && role !== "super_admin") {
      throw new Error("You cannot remove your own super admin access.")
    }

    const nextFinalChargeEnabled =
      role === "super_admin" ||
      (canRoleReceiveFinalChargeAccess(role) &&
        Boolean(input.finalChargeEnabled))
    let updated: { customer: AnyRecord }

    try {
      updated = await adminFetch<{ customer: AnyRecord }>(`/admin/grillers/staff-access/customers/${customer.id}`, {
        method: "POST",
        body: JSON.stringify({ role, final_charge_enabled: Boolean(input.finalChargeEnabled), reason,
          confirmation: input.confirmation, expected_version: Number(customer.metadata?.staff_access_version || 0) }),
      })

      const customersTag = await getCacheTag("customers")
      revalidateTag(customersTag)

    } catch (err) {
      await emitTeamAccessUpdateFailureAlert(
        {
          actorId: actor.id,
          targetCustomerId: customer.id,
          previousRole,
          requestedRole: role,
          finalChargeEnabled: nextFinalChargeEnabled,
        },
        err
      )
      throw err
    }

    return { ok: true, user: summarizeCustomer(updated.customer) }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Could not update staff access.",
    }
  }
}
