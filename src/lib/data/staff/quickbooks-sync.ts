"use server"

import "server-only"

import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { canManageOrderSupport, staffDisplayName } from "@lib/util/staff-access"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { adminFetch } from "./admin"
import type { QuickBooksSessionHealth } from "@lib/util/quickbooks-session-health"

async function requireOrderSupportStaff() {
  const staff = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!staff || !canManageOrderSupport(staff)) {
    throw new Error("Order support access required.")
  }
  return staff
}

function quickBooksSyncErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

async function emitQuickBooksSyncStatusFailureAlert(input: {
  status: StaffQuickBooksSyncStatusFilter
  search?: string
  page: number
  perPage: number
  error: unknown
}) {
  await emitStorefrontOpsAlert({
    alertKind: "staff_quickbooks_sync_status_failed",
    severity: "warn",
    title: "Staff QuickBooks sync status load failed",
    path: "src/lib/data/staff/quickbooks-sync.ts",
    source: "medusa-server",
    fingerprint: "staff_quickbooks_sync:status:failed",
    meta: {
      staff_module: "quickbooks_sync",
      action: "load_status",
      status_filter: input.status,
      search_present: Boolean(input.search?.trim()),
      page: input.page,
      per_page: input.perPage,
      error_message: quickBooksSyncErrorMessage(input.error).slice(0, 300),
    },
  })
}

async function emitQuickBooksSyncRequeueFailureAlert(input: {
  orderId: number
  error: unknown
}) {
  await emitStorefrontOpsAlert({
    alertKind: "staff_quickbooks_sync_requeue_failed",
    severity: "warn",
    title: "Staff QuickBooks sync requeue failed",
    path: "src/lib/data/staff/quickbooks-sync.ts",
    source: "medusa-server",
    fingerprint: "staff_quickbooks_sync:requeue:failed",
    meta: {
      staff_module: "quickbooks_sync",
      action: "requeue_order",
      sync_order_id: input.orderId,
      error_message: quickBooksSyncErrorMessage(input.error).slice(0, 300),
    },
  })
}

export type StaffQuickBooksSyncStatusFilter =
  | "open"
  | "stuck"
  | "waiting"
  | "pending"
  | "blocked"
  | "error"
  | "warning"
  | "skipped"
  | "synced"
  | "all"

export type StaffQuickBooksSyncOrder = {
  id: number
  display_id?: number | string | null
  medusa_id?: string | null
  qb_id?: string | null
  qb_txn_id?: string | null
  qb_txn_number?: string | null
  status: string
  error?: string | null
  blocked_at?: string | null
  medusa_synced_at?: string | null
  store_synced_at?: string | null
  qb_synced_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  customer_name?: string | null
  email?: string | null
  total?: number | string | null
  currency_code?: string | null
  item_count?: number
  item_titles?: string[]
  fulfillment_type?: string | null
  scheduled_date?: string | null
  fulfillment_zip?: string | null
  qbd_tax_item_full_name?: string | null
  qbd_tax_item_list_id?: string | null
  qbd_tax_rate?: number | string | null
  qbd_tax_county?: string | null
}

export type StaffQuickBooksSyncRecentLog = {
  id: number
  session_ticket?: string | null
  action: string
  entity_type?: string | null
  status: string
  records_processed?: number | null
  details?: Record<string, any> | null
  created_at?: string | null
}

export type StaffQuickBooksSyncStatus = {
  summary: {
    total_orders: number
    open: number
    waiting: number
    stale_pending: number
    blocked: number
    error: number
    warning: number
    skipped: number
    synced: number
  }
  sync_status: {
    active: boolean
    health: QuickBooksSessionHealth
    started_at?: string | null
    current_step?: string | null
    last_web_connector_session_at?: string | null
    last_web_connector_status?: string | null
    qbwc_configuration?: {
      configured: boolean
      username_configured: boolean
      password_configured: boolean
      username?: string | null
      warnings?: string[]
    }
  }
  orders: {
    data: StaffQuickBooksSyncOrder[]
    current_page: number
    per_page: number
    total: number
    last_page: number
    has_more_pages: boolean
  }
  recent_logs: StaffQuickBooksSyncRecentLog[]
}

export async function getStaffQuickBooksSyncStatus(input?: {
  status?: StaffQuickBooksSyncStatusFilter
  search?: string
  page?: number
  perPage?: number
}) {
  await requireOrderSupportStaff()
  const query = {
    status: input?.status || "open",
    search: input?.search?.trim() || undefined,
    page: input?.page || 1,
    per_page: input?.perPage || 25,
  }

  try {
    return await adminFetch<StaffQuickBooksSyncStatus>(
      "/admin/grillers/quickbooks-sync/status",
      {
        method: "GET",
        query,
      }
    )
  } catch (error) {
    await emitQuickBooksSyncStatusFailureAlert({
      status: query.status,
      search: query.search,
      page: query.page,
      perPage: query.per_page,
      error,
    })
    throw error
  }
}

export async function requeueStaffQuickBooksSyncOrder(
  orderId: number,
  reason = "Staff retry from Synchronization Status."
) {
  const staff = await requireOrderSupportStaff()

  const actor = `${staffDisplayName(staff)}${
    staff.email ? ` (${staff.email})` : ""
  }`
  try {
    return await adminFetch<{ order: StaffQuickBooksSyncOrder }>(
      `/admin/grillers/quickbooks-sync/orders/${orderId}/requeue`,
      {
        method: "POST",
        body: JSON.stringify({
          reason: `${reason} Staff: ${actor}`,
        }),
      }
    )
  } catch (error) {
    await emitQuickBooksSyncRequeueFailureAlert({
      orderId,
      error,
    })
    throw error
  }
}
