import { backgroundAdminToken } from "@lib/data/background-admin-token"
import { NextResponse } from "next/server"
import { runBackInStockTrigger } from "@lib/data/back-in-stock-trigger"
import {
  emitCronAlert,
  planBackInStockAlert,
  planHeartbeat,
  planMisconfiguredAlert,
} from "@lib/cron-ops-alerts"

const ALERT_PATH =
  "src/app/api/cron/back-in-stock-trigger/route.ts"

/**
 * Required env for the restock fan-out. Missing any of these makes the cron a
 * silent no-op (e.g. `fetchPendingRequests` returns [] when Strapi env is
 * absent), so we page rather than let it look "green" for days.
 */
function missingBackInStockEnv(): string[] {
  const required = [
    "STRAPI_ENDPOINT",
    "STRAPI_API_TOKEN",
    "MEDUSA_BACKEND_URL",
    "POSTMARK_SERVER_TOKEN",
  ]
  return [...required.filter((name) => !process.env[name]), ...(!backgroundAdminToken() ? ["MEDUSA_READ_ONLY_API_TOKEN or MEDUSA_ADMIN_API_TOKEN"] : [])]
}

/**
 * Cron entry point for #102 back-in-stock notification fan-out.
 *
 * Schedule: every 15 min via `vercel.json` cron config. The handler is
 * idempotent — repeated runs while a SKU is in stock and has pending
 * subscribers keep marking subscribers as notified (one per fire). A
 * 7-day cooldown inside `runBackInStockTrigger` prevents thrash storms
 * on SKUs that oscillate in/out of stock.
 *
 * Auth: gated by `CRON_SECRET` header (Vercel sets `Authorization:
 * Bearer ${CRON_SECRET}` automatically). Manual triggers must include
 * the same header.
 */

const CRON_SECRET = process.env.CRON_SECRET

async function handle(request: Request) {
  if (CRON_SECRET) {
    const auth = request.headers.get("authorization") || ""
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
    }
  }

  // Misconfiguration guard: a missing env makes the cron silently no-op.
  const missingEnv = missingBackInStockEnv()
  if (missingEnv.length > 0) {
    await emitCronAlert(
      planMisconfiguredAlert("back-in-stock-trigger", missingEnv),
      ALERT_PATH
    )
    // Preserve HTTP behavior: still return so Vercel's cron sees a response.
    return NextResponse.json(
      { ok: false, error: "misconfigured", missingEnv },
      { status: 200 }
    )
  }

  const summary = await runBackInStockTrigger()

  // Emit a failure alert (warn, or page on total failure) when the summary
  // carries errors/failed sends, then a success heartbeat for silence
  // detection. Both fire before returning and never alter the HTTP response.
  await emitCronAlert(planBackInStockAlert(summary), ALERT_PATH)
  await emitCronAlert(
    planHeartbeat("back-in-stock-trigger", {
      products_back_in_stock: summary.productsBackInStock,
      subscribers_notified: summary.subscribersNotified,
    }),
    ALERT_PATH
  )

  return NextResponse.json(summary, {
    status: summary.ok ? 200 : 500,
  })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
