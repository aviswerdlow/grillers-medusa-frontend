"use server"
import "server-only"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import {
  canReviewIncomingStock,
  receivingInstant,
} from "@lib/util/incoming-stock"
import { adminFetch } from "./admin"
import type {
  IncomingCommand,
  IncomingProduct,
  IncomingQueue,
  IncomingResult,
  IncomingStockView,
} from "./incoming-stock-types"

async function requireInventoryReader() {
  const customer = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!customer || !canReviewIncomingStock(customer))
    throw new Error("Sign in with inventory access to use receiving.")
}
const failure = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Receiving could not be loaded. Refresh before continuing."

export async function searchIncomingProducts(
  search: string
): Promise<IncomingResult<IncomingProduct[]>> {
  try {
    await requireInventoryReader()
    const q = String(search || "").trim()
    if (q.length < 2 || q.length > 100) return { ok: true, data: [] }
    const result = await adminFetch<{ products: any[] }>("/admin/products", {
      query: {
        q,
        limit: 12,
        fields:
          "id,title,metadata,variants.id,variants.title,variants.sku,variants.metadata",
      },
    })
    return {
      ok: true,
      data: result.products.flatMap((product) =>
        (product.variants || [])
          .filter(
            (variant: any) =>
              !String(variant.sku || "")
                .toUpperCase()
                .startsWith("RM-")
          )
          .map((variant: any) => ({
            variant_id: variant.id,
            title:
              String(
                variant.metadata?.strapi_title ||
                  product.metadata?.strapi_title ||
                  product.title ||
                  "Untitled product"
              ) +
              (variant.title &&
              variant.title !== "Default" &&
              variant.title !== "Default Variant"
                ? ` — ${variant.title}`
                : ""),
            sku: String(variant.sku || ""),
          }))
      ),
    }
  } catch (error) {
    return { ok: false, error: failure(error) }
  }
}
export async function getIncomingStock(
  variantId: string
): Promise<IncomingResult<IncomingStockView>> {
  try {
    await requireInventoryReader()
    return {
      ok: true,
      data: await adminFetch<IncomingStockView>(
        "/admin/grillers/inventory/incoming",
        { query: { variant_id: variantId } }
      ),
    }
  } catch (error) {
    return { ok: false, error: failure(error) }
  }
}
export async function getIncomingExceptions(
  after?: string
): Promise<IncomingResult<IncomingQueue>> {
  try {
    await requireInventoryReader()
    return {
      ok: true,
      data: await adminFetch<IncomingQueue>(
        "/admin/grillers/inventory/incoming",
        { query: { view: "exceptions", after } }
      ),
    }
  } catch (error) {
    return { ok: false, error: failure(error) }
  }
}
export async function saveIncomingStock(
  input: IncomingCommand
): Promise<
  IncomingResult<{ receipt_pending: boolean; affected_count: number }>
> {
  let sent = false
  try {
    await requireInventoryReader()
    if (
      !["create", "confirm", "revise", "cancel", "stage_receipt"].includes(
        input.action
      ) ||
      !input.request_id ||
      !input.reason?.trim()
    )
      throw new Error("Choose a receiving action and record the reason.")
    // Explicit allowlist: never forward browser-supplied actor, ListID, grants or stock effects.
    const body: Record<string, unknown> = {
      action: input.action,
      request_id: input.request_id,
      reason: input.reason.trim(),
    }
    if (input.action === "create")
      Object.assign(body, {
        variant_id: input.variant_id,
        stock_unit: input.stock_unit,
        source_system: input.source_system,
        source_ref: input.source_ref,
        expected_quantity: input.quantity,
      })
    else
      Object.assign(body, {
        batch_id: input.batch_id,
        expected_revision: input.expected_revision,
      })
    if (input.action === "confirm" || input.action === "revise")
      body.confirmed_quantity = input.quantity
    if (input.action === "stage_receipt")
      Object.assign(body, {
        source_system: input.source_system,
        source_ref: input.source_ref,
        quantity: input.quantity,
        receipt_final_confirmed: input.receipt_final_confirmed === true,
      })
    if (input.action !== "cancel")
      body.usable_at = receivingInstant(
        input.usable_local || "",
        input.timezone || ""
      )
    sent = true
    const result = await adminFetch<{
      inventory_applied?: boolean
      affected_demand_ids?: string[]
    }>("/admin/grillers/inventory/incoming", {
      method: "POST",
      body: JSON.stringify(body),
    })
    return {
      ok: true,
      data: {
        receipt_pending: input.action === "stage_receipt",
        affected_count: result.affected_demand_ids?.length || 0,
      },
    }
  } catch (error) {
    const status = (error as any)?.status
    return {
      ok: false,
      error: failure(error),
      uncertain:
        sent && !(typeof status === "number" && status >= 400 && status < 500),
    }
  }
}
