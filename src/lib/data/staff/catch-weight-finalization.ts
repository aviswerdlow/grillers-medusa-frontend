"use server"

import "server-only"

import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import {
  activeFulfillments,
  buildCatchWeightFulfillmentItems,
  catchWeightReadyForFulfillment,
} from "@lib/util/catch-weight-fulfillment"
import {
  canChargeFinalOrders,
  canPackCatchWeightOrders,
  canPickCatchWeightOrders,
  isSuperAdminCustomer,
  staffDisplayName,
} from "@lib/util/staff-access"
import { revalidatePath } from "next/cache"
import { adminFetch } from "./admin"

type AnyRecord = Record<string, any>
type StaffAuditCustomer = Parameters<typeof staffDisplayName>[0] & AnyRecord

export type StaffCatchWeightFinalizationSummary = {
  id: string
  order_id: string
  display_id?: string | null
  customer_email?: string | null
  order_email?: string | null
  customer_id?: string | null
  currency_code: string
  status: string
  fulfillment_type?: string | null
  fulfillment_date?: string | null
  fulfillment_date_key?: string | null
  arrival_date?: string | null
  pick_date?: string | null
  dispatch_date?: string | null
  estimated_order_total?: number | string | null
  final_order_total?: number | string | null
  delta_total?: number | string | null
  blocked_reason?: string | null
  qbd_posting_status?: string | null
  created_at?: string
  updated_at?: string
}

export type StaffCatchWeightLine = {
  id: string
  line_item_id: string
  customer_title?: string | null
  title_snapshot?: string | null
  sku?: string | null
  qbd_list_id?: string | null
  pricing_mode: string
  ordered_quantity?: number | string | null
  estimated_weight_total?: number | string | null
  actual_quantity?: number | string | null
  actual_piece_count?: number | string | null
  actual_weight_total?: number | string | null
  metadata?: Record<string, any> | null
  actual_unit_price?: number | string | null
  final_line_total?: number | string | null
  delta_line_total?: number | string | null
  status: string
  replacement_variant_id?: string | null
  replacement_qbd_list_id?: string | null
  replacement_reason?: string | null
  short_reason?: string | null
  note?: string | null
  errors?: Array<{ message?: string } | string>
  warnings?: Array<{ message?: string } | string>
}

export type StaffFinalizationPackage = {
  id?: string | null
  package_type?: string | null
  shipper_qbd_list_id?: string | null
  count?: number | string | null
  packed_weight_lb?: number | string | null
  dry_ice_lb?: number | string | null
  note?: string | null
}

export type StaffCatchWeightFinalizationDetail = {
  order: AnyRecord
  finalization: StaffCatchWeightFinalizationSummary & AnyRecord
  lines: StaffCatchWeightLine[]
  package_capture_required?: boolean
  packages?: StaffFinalizationPackage[]
  payment_setup?: AnyRecord | null
  charge_attempts?: AnyRecord[]
  errors?: Array<{ line_item_id?: string; message: string } | string>
  warnings?: Array<{ line_item_id?: string; message: string } | string>
  totals?: AnyRecord
}

const STAFF_ORDERS_PATH = "/us/account/staff/orders"
const ORDER_FULFILLMENT_FIELDS =
  "id,display_id,email,fulfillment_status,+metadata,*items,*items.detail,*fulfillments"

function revalidateStaffOrders() {
  revalidatePath(STAFF_ORDERS_PATH)
}

async function requireStaffOperator() {
  const staff = await retrieveAuthenticatedCustomerForStaffAccess()
  // Pick/pack & finalize is a warehouse-operator capability — excludes office,
  // merchandising reviewers, and any non-operational staff.
  if (
    !staff ||
    (!canPickCatchWeightOrders(staff) && !canPackCatchWeightOrders(staff))
  ) {
    throw new Error("Pick or pack access required.")
  }
  return staff
}

function staffAuditPayload(staff: StaffAuditCustomer) {
  return {
    staff_actor_customer_id: staff.id,
    staff_actor_email: staff.email || null,
    staff_actor_name: staffDisplayName(staff),
  }
}

function detailForStaff(
  detail: StaffCatchWeightFinalizationDetail,
  staff: StaffAuditCustomer
) {
  if (isSuperAdminCustomer(staff)) return detail

  const metadata = { ...(detail.order?.metadata || {}) }
  delete metadata.staff_audit_log

  return {
    ...detail,
    order: {
      ...detail.order,
      metadata,
    },
  }
}

export async function listCatchWeightFinalizationQueue(input?: {
  status?: string
  limit?: number
  query?: string
  fulfillmentType?: string
  dateFrom?: string
  dateTo?: string
}) {
  const data = await adminFetch<{
    finalizations: StaffCatchWeightFinalizationSummary[]
    count: number
  }>("/admin/grillers/finalization/queue", {
    method: "GET",
    query: {
      status: input?.status,
      limit: input?.limit || 75,
      q: input?.query || undefined,
      fulfillment_type: input?.fulfillmentType || undefined,
      date_from: input?.dateFrom || undefined,
      date_to: input?.dateTo || undefined,
    },
  })

  return data.finalizations || []
}

export async function getCatchWeightFinalizationDetail(orderId: string) {
  const staff = await requireStaffOperator()
  const detail = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${orderId}/finalization`,
    { method: "GET" }
  )
  return detailForStaff(detail, staff)
}

export async function startCatchWeightFinalization(
  orderId: string,
  phase: "pick" | "pack" = "pick"
) {
  const staff = await requireStaffOperator()
  const result = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${orderId}/finalization/start`,
    {
      method: "POST",
      body: JSON.stringify({ phase, ...staffAuditPayload(staff) }),
    }
  )
  revalidateStaffOrders()
  return detailForStaff(result, staff)
}

export async function markCatchWeightReadyForPacking(orderId: string) {
  const staff = await requireStaffOperator()
  const result = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${orderId}/finalization/ready-for-packing`,
    { method: "POST", body: JSON.stringify(staffAuditPayload(staff)) }
  )
  revalidateStaffOrders()
  return detailForStaff(result, staff)
}

export async function unclaimCatchWeightPick(input: {
  orderId: string
  reason?: string
}) {
  const staff = await requireStaffOperator()
  const result = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${input.orderId}/finalization/unclaim-pick`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: input.reason || null,
        ...staffAuditPayload(staff),
      }),
    }
  )
  revalidateStaffOrders()
  return detailForStaff(result, staff)
}

export async function updateCatchWeightFinalizationLine(input: {
  orderId: string
  lineItemId: string
  actual_weight_total?: string
  actual_unit_weights?: string[]
  actual_piece_count?: string
  actual_quantity?: string
  actual_unit_price?: string
  status?: string
  replacement_variant_id?: string
  replacement_qbd_list_id?: string
  replacement_reason?: string
  short_reason?: string
  note?: string
  metadata?: AnyRecord
}) {
  const staff = await requireStaffOperator()
  const result = await adminFetch<{ line: StaffCatchWeightLine }>(
    `/admin/grillers/orders/${input.orderId}/finalization/lines/${input.lineItemId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        actual_weight_total: input.actual_weight_total || null,
        actual_unit_weights: input.actual_unit_weights || null,
        actual_piece_count: input.actual_piece_count || null,
        actual_quantity: input.actual_quantity || null,
        actual_unit_price: input.actual_unit_price || null,
        status: input.status || null,
        replacement_variant_id: input.replacement_variant_id || null,
        replacement_qbd_list_id: input.replacement_qbd_list_id || null,
        replacement_reason: input.replacement_reason || null,
        short_reason: input.short_reason || null,
        note: input.note || null,
        metadata: input.metadata || null,
        ...staffAuditPayload(staff),
      }),
    }
  )
  revalidateStaffOrders()
  return result.line
}

export async function returnCatchWeightOrderToPicking(input: {
  orderId: string
  reason?: string
}) {
  const staff = await requireStaffOperator()
  const result = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${input.orderId}/finalization/return-to-picking`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: input.reason || null,
        ...staffAuditPayload(staff),
      }),
    }
  )
  revalidateStaffOrders()
  return detailForStaff(result, staff)
}

export async function returnCatchWeightOrderToPacking(input: {
  orderId: string
  reason?: string
}) {
  const staff = await requireStaffOperator()
  const result = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${input.orderId}/finalization/return-to-packing`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: input.reason || null,
        ...staffAuditPayload(staff),
      }),
    }
  )
  revalidateStaffOrders()
  return detailForStaff(result, staff)
}

export async function addCatchWeightFinalizationLine(input: {
  orderId: string
  product_id?: string
  variant_id: string
  sku?: string
  qbd_list_id?: string
  title: string
  customer_title?: string
  pricing_mode?: string
  actual_unit_price?: string
  actual_quantity?: string
  actual_piece_count?: string
  actual_weight_total?: string
  actual_unit_weights?: string[]
  note?: string
}) {
  const staff = await requireStaffOperator()
  const result = await adminFetch<{ line: StaffCatchWeightLine }>(
    `/admin/grillers/orders/${input.orderId}/finalization/lines`,
    {
      method: "POST",
      body: JSON.stringify({
        product_id: input.product_id || null,
        variant_id: input.variant_id,
        sku: input.sku || null,
        qbd_list_id: input.qbd_list_id || null,
        title: input.title,
        customer_title: input.customer_title || input.title,
        pricing_mode: input.pricing_mode || null,
        actual_unit_price: input.actual_unit_price || null,
        actual_quantity: input.actual_quantity || null,
        actual_piece_count: input.actual_piece_count || null,
        actual_weight_total: input.actual_weight_total || null,
        actual_unit_weights: input.actual_unit_weights || null,
        note: input.note || null,
        ...staffAuditPayload(staff),
      }),
    }
  )
  revalidateStaffOrders()
  return result.line
}

export async function updateCatchWeightFinalizationPackages(input: {
  orderId: string
  packages: StaffFinalizationPackage[]
}) {
  const staff = await requireStaffOperator()
  const result = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${input.orderId}/finalization/packages`,
    {
      method: "POST",
      body: JSON.stringify({
        packages: input.packages,
        ...staffAuditPayload(staff),
      }),
    }
  )
  revalidateStaffOrders()
  return detailForStaff(result, staff)
}

export async function previewCatchWeightFinalization(orderId: string) {
  const staff = await requireStaffOperator()
  const detail = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${orderId}/finalization/preview`,
    {
      method: "POST",
      body: JSON.stringify({ persist: true, ...staffAuditPayload(staff) }),
    }
  )
  return detailForStaff(detail, staff)
}

export async function approveCatchWeightFinalization(orderId: string) {
  const staff = await requireStaffOperator()
  const result = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${orderId}/finalization/approve`,
    { method: "POST", body: JSON.stringify(staffAuditPayload(staff)) }
  )
  revalidateStaffOrders()
  return detailForStaff(result, staff)
}

export async function chargeAndReleaseCatchWeightOrder(orderId: string) {
  const staff = await requireStaffOperator()
  if (!canChargeFinalOrders(staff)) {
    throw new Error("This staff account is not allowed to charge final orders.")
  }

  const result = await adminFetch<StaffCatchWeightFinalizationDetail>(
    `/admin/grillers/orders/${orderId}/finalization/charge-and-release`,
    {
      method: "POST",
      body: JSON.stringify({
        idempotency_key: `staff-final-charge:${orderId}:${Date.now()}`,
        ...staffAuditPayload(staff),
      }),
    }
  )
  revalidateStaffOrders()
  return detailForStaff(result, staff)
}

export async function fulfillReleasedCatchWeightOrder(orderId: string) {
  const staff = await requireStaffOperator()
  const detail = await getCatchWeightFinalizationDetail(orderId)

  if (!catchWeightReadyForFulfillment(detail)) {
    throw new Error(
      "Charge and release this catch-weight order before fulfillment."
    )
  }

  const { order } = await adminFetch<{ order: AnyRecord }>(
    `/admin/orders/${orderId}`,
    {
      query: { fields: ORDER_FULFILLMENT_FIELDS },
    }
  )

  const existingFulfillments = activeFulfillments(order)
  if (existingFulfillments.length) {
    return getCatchWeightFinalizationDetail(orderId)
  }

  const items = buildCatchWeightFulfillmentItems(order, detail.lines)
  if (!items.length) {
    throw new Error("No fulfillable order lines are available.")
  }

  const idempotencyKey = `staff-fulfill:${orderId}:${Date.now()}`
  await adminFetch<{
    fulfillment?: AnyRecord
    order?: AnyRecord
  }>(`/admin/orders/${orderId}/fulfillments`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      items,
      no_notification: false,
      metadata: {
        source: "staff_catch_weight_console",
        finalization_id: detail.finalization.id,
        staff_actor_customer_id: staff.id,
        staff_actor_email: staff.email || null,
        staff_actor_name: staffDisplayName(staff),
      },
    }),
  })
  // The native fulfillment is the receipt. Backend guards and finalization
  // own release state; the browser must not rewrite payment/release metadata.

  revalidateStaffOrders()
  return getCatchWeightFinalizationDetail(orderId)
}
