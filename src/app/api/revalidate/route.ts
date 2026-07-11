import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"
import {
  LEGACY_STRAPI_CACHE_TAG,
  strapiCacheTagsForWebhook,
} from "@lib/strapi/cache-tags"

/**
 * Strapi → Next.js revalidation webhook.
 *
 * Configure in Strapi admin: Settings → Webhooks → Create new webhook.
 *   - URL: https://grillers-medusa-frontend.vercel.app/api/revalidate
 *   - Headers: Authorization → `Bearer <REVALIDATE_SECRET>`
 *   - Events: entry.publish, entry.unpublish, entry.update, entry.delete,
 *             media.create, media.update, media.delete
 *
 * Set REVALIDATE_SECRET in Vercel env vars (Production + Preview).
 * Pick a long random value; rotate if leaked.
 *
 * When the webhook fires, this route maps the Strapi model to the cache tags
 * that consume it. A product publish refreshes product-backed surfaces without
 * cold-starting header, footer, homepage, and every other Strapi query.
 */

export async function POST(request: Request) {
  const expected = process.env.REVALIDATE_SECRET

  if (!expected) {
    return NextResponse.json(
      {
        error:
          "REVALIDATE_SECRET is not configured on this deployment. " +
          "Set it in Vercel project settings and redeploy.",
      },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const provided = authHeader.replace(/^Bearer\s+/i, "").trim()

  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let event: string | null = null
  let model: string | null = null
  try {
    const body = await request.json()
    event = typeof body?.event === "string" ? body.event : null
    model = typeof body?.model === "string" ? body.model : null
  } catch {
    // Strapi may POST an empty body for some events. The tag mapper preserves
    // the old fail-safe global behavior for that exceptional payload.
  }

  const tags = [
    ...strapiCacheTagsForWebhook({ event, model }),
    LEGACY_STRAPI_CACHE_TAG,
  ]
  for (const tag of Array.from(new Set(tags))) {
    revalidateTag(tag)
  }

  return NextResponse.json({
    revalidated: true,
    tags,
    event,
    model,
    timestamp: Date.now(),
  })
}

// GET handler is useful as a smoke test — confirms the route exists and
// REVALIDATE_SECRET is set without performing any action.
export async function GET() {
  const configured = Boolean(process.env.REVALIDATE_SECRET)
  return NextResponse.json({
    route: "/api/revalidate",
    method: "POST",
    secretConfigured: configured,
    note: configured
      ? "Ready. POST with Authorization: Bearer <REVALIDATE_SECRET> to revalidate."
      : "REVALIDATE_SECRET is NOT set on this deployment — webhook will return 500.",
  })
}
