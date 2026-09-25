"use server"

import "server-only"

import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import {
  canCorrectLocalMilestones,
  canUseLocalMilestones,
} from "@lib/util/staff-access"
import { adminFetch, StaffApiError } from "./admin"

export type LocalMilestone =
  | "packed"
  | "pickup_ready"
  | "pickup_collected"
  | "local_dispatched"
  | "local_delivered"
  | "local_failed"
  | "local_returned"

export type LocalMilestoneState = {
  order_id: string
  fulfillment_id: string | null
  mode: "pickup" | "local_delivery"
  milestone: LocalMilestone
  version: number
  current_event_id: string | null
  driver_customer_id: string | null
  updated_at: string
  summary: {
    display_id: number | null
    recipient: string | null
    address_1: string | null
    address_2: string | null
    city: string | null
    province: string | null
    postal_code: string | null
    phone: string | null
  }
}

export type LocalMilestoneEvent = {
  event_id: string
  version: number
  kind: "record" | "correction"
  milestone: LocalMilestone
  previous_milestone: LocalMilestone
  correction_of_event_id: string | null
  reason: string | null
  note: string | null
  actor_role: string
  occurred_at: string
  recorded_at: string
}

export type LocalEvidenceRecord = {
  evidenceId: string
  uploadId: string
  orderId: string
  status: "pending" | "stored_private"
  contentType: string
  sizeBytes: number
  sha256: string
  storedAt: string | null
  retainUntil: string | null
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const messages: Record<string, string> = {
  local_milestones_disabled: "Local milestones are not enabled.",
  local_milestone_access_denied: "Your staff role cannot use this action.",
  local_milestone_order_not_assigned: "This order is not assigned to you.",
  local_milestone_version_changed: "This order changed. Refresh it before trying again.",
  local_milestone_order_not_found: "No local milestone record was found for this order.",
  order_release_held: "This order is on hold. Ask the office to review its release.",
  order_not_finalized_for_release: "The order has not passed final review and release.",
  payment_not_complete: "The final payment has not succeeded.",
  invoice_release_not_complete: "The invoice order has not been released.",
  payment_workflow_unverified: "The payment workflow needs office review.",
  invalid_local_milestone_transition: "This step is out of order. Refresh the order.",
  milestone_reason_required: "Enter a reason for this exception or correction.",
  approved_driver_not_found: "The driver must have an active driver staff role.",
  local_milestone_unavailable: "The milestone service is temporarily unavailable.",
  evidence_access_denied: "This photo is not available to your staff account.",
  evidence_upload_id_conflict: "This upload ID was used for different photo content. Select the photo again.",
  invalid_evidence_upload: "Choose a JPEG, PNG, WebP or HEIC photo within the size limit.",
  evidence_content_mismatch: "The photo changed during upload. Select it again.",
  unsupported_evidence_bytes: "The selected file is not a supported photo.",
  private_evidence_provider_unconfigured: "Private photo storage is not ready. Ask the office to check setup.",
}

function errorText(error: unknown): string {
  if (error instanceof StaffApiError) return messages[error.message] || error.message
  return error instanceof Error ? error.message : "The action could not be completed."
}

async function requireAccess(office = false) {
  if (process.env.GP_LOCAL_MILESTONES_ENABLED !== "true") throw new Error(messages.local_milestones_disabled)
  const customer = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!customer || !(office ? canCorrectLocalMilestones(customer) : canUseLocalMilestones(customer))) {
    throw new Error(messages.local_milestone_access_denied)
  }
}

async function run<T>(office: boolean, action: () => Promise<T>): Promise<Result<T>> {
  try {
    await requireAccess(office)
    return { ok: true, data: await action() }
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }
}

function safeId(value: string): string {
  if (!/^[a-zA-Z0-9_:-]{8,128}$/.test(value)) throw new Error("Enter a valid order or fulfillment ID.")
  return value
}

export async function listLocalMilestones(exceptions = false): Promise<Result<LocalMilestoneState[]>> {
  return run(exceptions, async () => {
    const path = exceptions ? "/admin/grillers/local-milestones/exceptions" : "/admin/grillers/local-milestones/orders"
    const result = await adminFetch<{ orders: LocalMilestoneState[] }>(path)
    return result.orders
  })
}

export async function getLocalMilestoneOrder(orderId: string): Promise<Result<{
  state: LocalMilestoneState
  events: LocalMilestoneEvent[]
}>> {
  return run(false, () => adminFetch(`/admin/grillers/local-milestones/orders/${safeId(orderId)}`))
}

export async function recordLocalMilestone(input: {
  orderId: string
  fulfillmentId?: string | null
  eventId: string
  expectedVersion: number
  milestone: Exclude<LocalMilestone, "packed">
  reason?: string
  note?: string
  correctionOfEventId?: string
}): Promise<Result<{ duplicate: boolean }>> {
  return run(Boolean(input.correctionOfEventId), async () => {
    const path = `/admin/grillers/local-milestones/orders/${safeId(input.orderId)}/${input.correctionOfEventId ? "corrections" : "events"}`
    return adminFetch(path, {
      method: "POST",
      body: JSON.stringify({
        event_id: safeId(input.eventId),
        ...(input.fulfillmentId ? { fulfillment_id: safeId(input.fulfillmentId) } : {}),
        expected_version: input.expectedVersion,
        milestone: input.milestone,
        reason: input.reason?.trim() || null,
        note: input.note?.trim() || null,
        ...(input.correctionOfEventId ? { correction_of_event_id: safeId(input.correctionOfEventId) } : {}),
      }),
    })
  })
}

export async function assignLocalMilestoneDriver(input: {
  orderId: string
  fulfillmentId: string
  driverCustomerId: string
  assignmentId: string
}): Promise<Result<{ duplicate: boolean }>> {
  return run(true, () => adminFetch(`/admin/grillers/local-milestones/orders/${safeId(input.orderId)}/assign`, {
    method: "POST",
    body: JSON.stringify({
      assignment_id: safeId(input.assignmentId),
      fulfillment_id: safeId(input.fulfillmentId),
      driver_customer_id: safeId(input.driverCustomerId),
    }),
  }))
}

export async function listLocalEvidence(orderId: string): Promise<Result<LocalEvidenceRecord[]>> {
  return run(false, async () => {
    const result = await adminFetch<{ evidence: LocalEvidenceRecord[] }>(
      `/admin/grillers/local-milestones/orders/${safeId(orderId)}/evidence`
    )
    return result.evidence
  })
}

export async function signLocalEvidence(orderId: string, uploadId: string): Promise<Result<{
  url: string
  expiresAt: string
}>> {
  return run(false, () => adminFetch(
    `/admin/grillers/local-milestones/orders/${safeId(orderId)}/evidence/${safeId(uploadId)}`
  ))
}
