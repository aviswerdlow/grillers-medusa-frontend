export type IncomingProduct = { variant_id: string; title: string; sku: string }
export type IncomingBatch = {
  id: string
  variant_id: string
  stock_unit: string
  source_system: string
  source_ref: string
  expected_quantity: number
  confirmed_quantity: number
  committed_quantity: number
  available_quantity: number
  usable_at: string
  status: "draft" | "confirmed" | "cancelled" | "receipt_pending"
  revision: number
}
export type IncomingDemand = {
  product_title?: string
  sku?: string
  id: string
  variant_id: string
  order_id: string | null
  cart_id: string | null
  line_item_id: string
  quantity: number
  remaining_quantity: number
  stock_unit: string
  customer_date: string
  needed_by: string
  exception_reason: string | null
  status: string
}
export type IncomingStockView = {
  batches: IncomingBatch[]
  demands: IncomingDemand[]
  receipts: {
    id: string
    batch_id: string
    quantity: number
    source_ref: string
    status: string
  }[]
  can_manage: boolean
  checkout_enabled: boolean
}
export type IncomingQueue = {
  demands: IncomingDemand[]
  next_cursor: string | null
  can_manage: boolean
}
export type IncomingAction =
  | "create"
  | "confirm"
  | "revise"
  | "cancel"
  | "stage_receipt"
export type IncomingCommand = {
  action: IncomingAction
  request_id: string
  reason: string
  variant_id: string
  batch_id?: string
  expected_revision?: number
  source_system?: string
  source_ref?: string
  stock_unit?: string
  quantity?: number
  usable_local?: string
  timezone?: string
  receipt_final_confirmed?: boolean
}
export type IncomingResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; uncertain?: boolean }
