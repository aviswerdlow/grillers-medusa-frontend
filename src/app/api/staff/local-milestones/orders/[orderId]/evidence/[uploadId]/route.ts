import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { adminHeaders } from "@lib/data/staff/admin"
import { canUseLocalMilestones } from "@lib/util/staff-access"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

// Vercel Functions have a 4.5 MB request limit. Keep this proxy below it; the
// backend still enforces its own 10 MiB upper bound for other controlled callers.
const MAX_PHONE_PHOTO_BYTES = 4 * 1024 * 1024
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"])
const token = (value: string) => /^[a-zA-Z0-9_:-]{8,128}$/.test(value)
const orderToken = (value: string) => /^order_[a-zA-Z0-9_:-]{4,128}$/.test(value)

function result(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } })
}

async function readBoundedPhoto(request: NextRequest, declaredSize: number) {
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_PHONE_PHOTO_BYTES || size > declaredSize) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return size === declaredSize ? Buffer.concat(chunks) : null
}

export async function PUT(request: NextRequest, context: {
  params: Promise<{ orderId: string; uploadId: string }>
}) {
  if (process.env.GP_LOCAL_MILESTONES_ENABLED !== "true")
    return result("local_milestones_disabled", 404)
  const { orderId, uploadId } = await context.params
  if (!orderToken(orderId) || !token(uploadId)) return result("invalid_evidence_upload", 422)
  const contentType = request.headers.get("content-type") || ""
  const declaredSize = Number(request.headers.get("x-gp-evidence-size"))
  const sha256 = request.headers.get("x-gp-evidence-sha256") || ""
  if (!allowedTypes.has(contentType) || !Number.isSafeInteger(declaredSize) ||
    declaredSize < 1 || declaredSize > MAX_PHONE_PHOTO_BYTES ||
    !/^[a-f0-9]{64}$/.test(sha256)) return result("invalid_evidence_upload", 422)
  const length = request.headers.get("content-length")
  if (length && Number(length) !== declaredSize) return result("evidence_content_mismatch", 422)
  try {
    const auth = await getAuthHeaders()
    if (!("authorization" in auth) || !auth.authorization) return result("Sign in to use staff tools.", 401)
    const customer = await retrieveAuthenticatedCustomerForStaffAccess()
    if (!customer || !canUseLocalMilestones(customer)) return result("Staff photo access denied.", 403)
    const bytes = await readBoundedPhoto(request, declaredSize)
    if (!bytes) return result("evidence_content_mismatch", 422)
    const backend = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/+$/, "")
    const response = await fetch(`${backend}/admin/grillers/local-milestones/orders/${orderId}/evidence/${uploadId}`, {
      method: "PUT", cache: "no-store", redirect: "error", body: bytes,
      headers: {
        Authorization: (adminHeaders() as Record<string, string>).Authorization,
        "x-gp-staff-authorization": auth.authorization,
        "Content-Type": contentType,
        "x-gp-evidence-size": String(bytes.length),
        "x-gp-evidence-sha256": sha256,
      },
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) return result(String(body.message || "Photo storage is unavailable."), response.status)
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return result("Photo upload was interrupted. Retry the same photo to check its status.", 503)
  }
}
