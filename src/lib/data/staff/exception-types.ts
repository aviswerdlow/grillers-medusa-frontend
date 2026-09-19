type AnyRecord = Record<string, any>

export const STAFF_EXCEPTION_ACTIONS = [
  {
    value: "record_note",
    label: "Add internal note",
    moneyMovement: false,
    requiresConsent: false,
    visibleInOrderSupport: true,
  },
  {
    value: "refund_payment",
    label: "Refund card through Stripe",
    moneyMovement: true,
    requiresConsent: true,
    visibleInOrderSupport: true,
  },
  {
    value: "capture_payment",
    label: "Capture authorized payment",
    moneyMovement: true,
    requiresConsent: true,
    visibleInOrderSupport: true,
  },
  {
    value: "record_offline_payment",
    label: "Record offline payment",
    moneyMovement: true,
    requiresConsent: true,
    visibleInOrderSupport: false,
  },
  {
    value: "shipping_override",
    label: "Shipping override",
    moneyMovement: false,
    requiresConsent: true,
    visibleInOrderSupport: true,
  },
  {
    value: "edit_order_items",
    label: "Edit order items",
    moneyMovement: false,
    requiresConsent: true,
    visibleInOrderSupport: true,
  },
  {
    value: "credit_memo",
    label: "Issue account credit",
    moneyMovement: true,
    requiresConsent: true,
    visibleInOrderSupport: false,
  },
  {
    value: "record_check_refund",
    label: "Record pending check refund",
    moneyMovement: true,
    requiresConsent: true,
    visibleInOrderSupport: false,
  },
  {
    value: "retry_qbd_posting",
    label: "Retry QuickBooks posting",
    moneyMovement: false,
    requiresConsent: false,
    visibleInOrderSupport: true,
  },
  {
    value: "cancel_order",
    label: "Cancel order",
    moneyMovement: false,
    requiresConsent: true,
    visibleInOrderSupport: true,
  },
] as const

export type StaffExceptionActionType =
  (typeof STAFF_EXCEPTION_ACTIONS)[number]["value"]

export const VISIBLE_STAFF_EXCEPTION_ACTIONS =
  STAFF_EXCEPTION_ACTIONS.filter((action) => action.visibleInOrderSupport)

export const STAFF_EXCEPTION_REASON_CODES = [
  { value: "customer_request", label: "Customer request" },
  { value: "staff_entry_error", label: "Staff entry error" },
  { value: "fulfillment_constraint", label: "Fulfillment constraint" },
  { value: "product_unavailable", label: "Product unavailable" },
  { value: "payment_reconciliation", label: "Payment reconciliation" },
  { value: "goodwill", label: "Goodwill" },
  { value: "other", label: "Other" },
] as const

export type StaffExceptionReasonCode =
  (typeof STAFF_EXCEPTION_REASON_CODES)[number]["value"]

export type StaffConsentMethod =
  | "phone"
  | "email"
  | "sms"
  | "in_person"
  | "not_applicable"

export type StaffOrderOperationalState =
  | "canceled"
  | "completed_or_shipped"
  | "fulfillment_locked"
  | "confirmed"
  | "open"

export type StaffOrderPickPackPhase =
  | "canceled"
  | "fulfilled"
  | "fulfillment_locked"
  | "pre_pick"
  | "picking"
  | "packing"
  | "ready_to_charge"
  | "charge_hold"
  | "ready_to_ship"
  | "released_to_fulfillment"

export type StaffOrderSupportRole =
  | "customer"
  | "staff"
  | "office"
  | "picker"
  | "packer"
  | "manager"
  | "super_admin"
  | string

export type StaffOrderSupportActionAvailability = {
  available: boolean
  phase: StaffOrderPickPackPhase
  reason: string
}

export type StaffOrderItemEditEligibility = {
  canEdit: boolean
  status: string
  label: string
  reason: string
}

export type StaffAuditEntry = {
  at?: string
  action?: string
  staff_actor_customer_id?: string
  staff_actor_email?: string
  staff_actor_name?: string
  status?: string
  reason_code?: string
  staff_note?: string
  customer_visible_note?: string
  [key: string]: any
}

export function parseStaffAuditLog(
  metadata: AnyRecord | null | undefined
): StaffAuditEntry[] {
  const raw = metadata?.staff_audit_log

  if (Array.isArray(raw)) {
    return raw.filter((entry) => entry && typeof entry === "object")
  }

  if (typeof raw !== "string" || !raw.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry === "object")
      : []
  } catch {
    return []
  }
}

export function staffOrderOperationalState(
  order: AnyRecord | null | undefined
): StaffOrderOperationalState {
  if (!order) return "open"

  const status = String(order.status || "").toLowerCase()
  if (order.canceled_at || status === "canceled") {
    return "canceled"
  }

  const fulfillmentStatus = String(order.fulfillment_status || "").toLowerCase()
  const fulfillments = Array.isArray(order.fulfillments)
    ? order.fulfillments
    : []
  const hasShipment = fulfillments.some(
    (fulfillment: AnyRecord) =>
      fulfillment?.shipped_at ||
      fulfillment?.delivered_at ||
      Array.isArray(fulfillment?.labels)
  )

  if (
    hasShipment ||
    fulfillmentStatus.includes("shipped") ||
    fulfillmentStatus.includes("delivered")
  ) {
    return "completed_or_shipped"
  }

  if (
    fulfillments.length > 0 ||
    fulfillmentStatus === "fulfilled" ||
    fulfillmentStatus.includes("partially")
  ) {
    return "fulfillment_locked"
  }

  if (
    ["pending", "authorized", "captured", "partially_refunded"].includes(
      String(order.payment_status || "").toLowerCase()
    )
  ) {
    return "confirmed"
  }

  return "open"
}

export function staffOrderPickPackStatus(
  order: AnyRecord | null | undefined
): string {
  const metadata = order?.metadata || {}
  return String(
    metadata.finalization_status ||
      metadata.catch_weight_status ||
      metadata.pick_pack_status ||
      ""
  )
    .trim()
    .toLowerCase()
}

export function staffOrderUsesCatchWeightFinalCharge(
  order: AnyRecord | null | undefined
): boolean {
  const metadata = order?.metadata || {}
  const status = staffOrderPickPackStatus(order)

  return Boolean(
    status ||
      metadata.finalization_id ||
      metadata.catch_weight_status ||
      metadata.pick_pack_status ||
      metadata.payment_workflow === "setup_then_final_charge"
  )
}

export function staffOrderPickPackPhase(
  order: AnyRecord | null | undefined
): StaffOrderPickPackPhase {
  const operationalState = staffOrderOperationalState(order)

  if (operationalState === "canceled") return "canceled"
  if (operationalState === "completed_or_shipped") return "fulfilled"
  if (operationalState === "fulfillment_locked") return "fulfillment_locked"

  const status = staffOrderPickPackStatus(order)
  if (!status || status === "pending_pick" || status === "pending_pack") {
    return "pre_pick"
  }
  if (status === "picking") return "picking"
  if (
    status === "ready_for_packing" ||
    status === "packing" ||
    status === "packed_pending_review"
  ) {
    return "packing"
  }
  if (status === "packed_pending_charge") return "ready_to_charge"
  if (status === "charge_failed_hold") return "charge_hold"
  if (status === "charged_ready_to_ship") return "ready_to_ship"
  if (status === "released_to_fulfillment") return "released_to_fulfillment"

  return "pre_pick"
}

export function staffOrderItemEditEligibility(
  order: AnyRecord | null | undefined
): StaffOrderItemEditEligibility {
  if (!order) {
    return {
      canEdit: false,
      status: "unknown",
      label: "No order",
      reason: "Choose an order before editing items.",
    }
  }

  const operationalState = staffOrderOperationalState(order)
  if (operationalState === "canceled") {
    return {
      canEdit: false,
      status: "canceled",
      label: "Canceled",
      reason: "Canceled orders cannot be edited from Order Support.",
    }
  }
  if (
    operationalState === "completed_or_shipped" ||
    operationalState === "fulfillment_locked"
  ) {
    return {
      canEdit: false,
      status: operationalState,
      label: "Fulfillment locked",
      reason:
        "Order items cannot be edited after fulfillment has started. Use a note, refund, credit, or cancellation workflow instead.",
    }
  }

  const status = staffOrderPickPackStatus(order)
  if (!status || status === "pending_pick" || status === "pending_pack") {
    return {
      canEdit: true,
      status: status || "not_started",
      label: status ? status.replace(/_/g, " ") : "Not started",
      reason:
        "This order has not been claimed by a picker, or the picker put it back.",
    }
  }

  if (status === "picking") {
    return {
      canEdit: false,
      status,
      label: "Picker claimed",
      reason:
        "A picker has claimed this order. Ask the picker to put the pick back before changing items.",
    }
  }

  return {
    canEdit: false,
    status,
    label: status.replace(/_/g, " "),
    reason:
      "This order is already in packing, charging, shipping, or release. Item edits must happen before picking starts.",
  }
}

const managerEscalationRoles = new Set(["manager", "super_admin"])

function canEscalateAfterPick(role: StaffOrderSupportRole | undefined): boolean {
  return managerEscalationRoles.has(String(role || "").trim().toLowerCase())
}

export function staffOrderSupportActionAvailability(
  action: StaffExceptionActionType,
  order: AnyRecord | null | undefined,
  options: {
    staffRole?: StaffOrderSupportRole
    offlineMoneyActionsEnabled?: boolean
  } = {}
): StaffOrderSupportActionAvailability {
  const phase = staffOrderPickPackPhase(order)
  const role = options.staffRole

  if (action === "record_note") {
    return { available: true, phase, reason: "" }
  }

  if (action === "retry_qbd_posting") {
    return order?.metadata?.qbd_posting_status === "failed"
      || order?.accountingActions?.some((row: AnyRecord) => ["failed", "blocked"].includes(row.status))
      ? { available: true, phase, reason: "" }
      : {
          available: false,
          phase,
          reason:
            "QuickBooks retry is available only after a failed QBD posting.",
        }
  }

  if (phase === "canceled") {
    return action === "refund_payment" || action === "credit_memo"
      ? { available: true, phase, reason: "" }
      : {
          available: false,
          phase,
          reason:
            "Canceled orders only allow notes, payment follow-up, credits, or QBD retry.",
        }
  }

  if (action === "record_check_refund") {
    return {
      available: false,
      phase,
      reason: "Pending check refunds are hidden from Order Support for launch.",
    }
  }

  if (action === "record_offline_payment") {
    if (!options.offlineMoneyActionsEnabled) {
      return {
        available: false,
        phase,
        reason:
          "Offline payments are disabled for launch. Use Stripe card flows or record an internal note.",
      }
    }
    return canEscalateAfterPick(role)
      ? { available: true, phase, reason: "" }
      : {
          available: false,
          phase,
          reason: "Offline payment recording is limited to manager escalation.",
        }
  }

  if (action === "capture_payment" && staffOrderUsesCatchWeightFinalCharge(order)) {
    return {
      available: false,
      phase,
      reason:
        "Catch-weight orders must be charged from Pack & Finalize after final weights are reviewed.",
    }
  }

  if (action === "edit_order_items") {
    const eligibility = staffOrderItemEditEligibility(order)
    return eligibility.canEdit
      ? { available: true, phase, reason: "" }
      : { available: false, phase, reason: eligibility.reason }
  }

  if (action === "shipping_override") {
    return phase === "pre_pick"
      ? { available: true, phase, reason: "" }
      : {
          available: false,
          phase,
          reason:
            "Shipping or date changes must happen before picking starts. Put the pick back or send the order back through Pack & Finalize first.",
        }
  }

  if (action === "cancel_order") {
    if (phase === "pre_pick") {
      return { available: true, phase, reason: "" }
    }
    if (phase === "ready_to_ship" || phase === "released_to_fulfillment") {
      return {
        available: false,
        phase,
        reason:
          "This order has already been charged for release. Use refund, credit, fulfillment, or QBD follow-up instead.",
      }
    }
    return canEscalateAfterPick(role)
      ? { available: true, phase, reason: "" }
      : {
          available: false,
          phase,
          reason:
            "Picking or packing has started. Cancellation now requires manager escalation.",
        }
  }

  if (action === "credit_memo") {
    return phase === "ready_to_ship" ||
      phase === "released_to_fulfillment" ||
      phase === "fulfilled" ||
      phase === "fulfillment_locked"
      ? { available: true, phase, reason: "" }
      : {
          available: false,
          phase,
          reason:
            "Account credits are post-charge customer-service exceptions. Use notes, item edits, or Pack & Finalize before charge.",
        }
  }

  return { available: true, phase, reason: "" }
}

export function staffExceptionActionConfig(action: StaffExceptionActionType) {
  return STAFF_EXCEPTION_ACTIONS.find((item) => item.value === action)
}

export function actionRequiresCustomerConsent(
  action: StaffExceptionActionType
): boolean {
  return staffExceptionActionConfig(action)?.requiresConsent ?? false
}

export function actionMovesMoney(action: StaffExceptionActionType): boolean {
  return staffExceptionActionConfig(action)?.moneyMovement ?? false
}

export function actionRequiredConfirmation(
  action: StaffExceptionActionType
): string | null {
  switch (action) {
    case "refund_payment":
      return "REFUND"
    case "capture_payment":
      return "CAPTURE"
    case "cancel_order":
      return "CANCEL"
    default:
      return null
  }
}

export function actionMutatesMedusa(action: StaffExceptionActionType): boolean {
  return (
    action === "refund_payment" ||
    action === "capture_payment" ||
    action === "edit_order_items" ||
    action === "cancel_order"
  )
}

export function actionRequiresQuickBooksPosting(
  action: StaffExceptionActionType
): boolean {
  return (
    action === "record_note" ||
    action === "edit_order_items" ||
    action === "cancel_order" ||
    action === "record_offline_payment" ||
    action === "credit_memo" ||
    action === "record_check_refund" ||
    action === "refund_payment" ||
    action === "capture_payment"
  )
}

export function actionIsAuditOnly(action: StaffExceptionActionType): boolean {
  return !actionMutatesMedusa(action)
}

export function actionIsBlockedByOperationalState(
  action: StaffExceptionActionType,
  state: StaffOrderOperationalState
): boolean {
  if (state === "canceled") {
    return ![
      "record_note",
      "refund_payment",
      "credit_memo",
      "retry_qbd_posting",
    ].includes(action)
  }

  if (state === "completed_or_shipped") {
    return (
      action === "cancel_order" ||
      action === "capture_payment" ||
      action === "edit_order_items" ||
      action === "shipping_override" ||
      action === "record_offline_payment"
    )
  }

  if (state === "fulfillment_locked") {
    return (
      action === "cancel_order" ||
      action === "capture_payment" ||
      action === "edit_order_items" ||
      action === "shipping_override" ||
      action === "record_offline_payment"
    )
  }

  return false
}
