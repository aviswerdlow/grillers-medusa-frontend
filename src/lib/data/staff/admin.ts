import "server-only"

import type { StaffImpersonationSession } from "./impersonation-types"
import { getAuthHeaders } from "../cookies"

type AnyRecord = Record<string, any>

const MEDUSA_BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
).replace(/\/+$/, "")

export function adminToken(): string {
  const token =
    process.env.MEDUSA_ADMIN_API_TOKEN || process.env.MEDUSA_API_TOKEN || ""

  if (!token) {
    throw new Error(
      "MEDUSA_ADMIN_API_TOKEN missing. Staff impersonation requires Medusa Admin API access."
    )
  }

  return token
}

export function adminHeaders(): HeadersInit {
  const token = adminToken()
  return {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${token}:`).toString("base64")}`,
  }
}

export function queryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return
    if (Array.isArray(value)) {
      value.forEach((item) => search.append(`${key}[]`, String(item)))
      return
    }
    search.set(key, String(value))
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, unknown> } = {}
): Promise<T> {
  // A server key identifies the transport. The original signed customer token
  // is required so the backend can check that person's current capabilities.
  const auth = await getAuthHeaders()
  if (!("authorization" in auth) || !auth.authorization) throw new Error("Sign in again to use staff tools.")
  if (!/^\/admin\//.test(path) || /[\\#?]/.test(path) || path.split("/").some(part => part === "." || part === ".." || /%2e|%2f|%5c/i.test(part))) {
    throw new Error("Invalid staff API path.")
  }
  const headers = new Headers(init.headers)
  headers.set("Content-Type", "application/json")
  headers.set("Authorization", (adminHeaders() as Record<string, string>).Authorization)
  headers.set("x-gp-staff-authorization", auth.authorization)
  const { query, ...request } = init
  const res = await fetch(
    `${MEDUSA_BACKEND_URL}${path}${queryString(query || {})}`,
    {
      ...request,
      headers,
      cache: "no-store",
      redirect: "error",
    }
  )

  const json = (await res.json().catch(() => ({}))) as AnyRecord
  if (!res.ok) {
    throw new Error(json.message || json.error || res.statusText)
  }
  return json as T
}

export function staffAuditFields(
  session: StaffImpersonationSession,
  action: string,
  extra: AnyRecord = {}
): AnyRecord {
  const at = new Date().toISOString()
  return {
    staff_impersonation: true,
    staff_action: action,
    staff_actor_customer_id: session.staffCustomerId,
    staff_actor_email: session.staffEmail,
    staff_actor_name: session.staffName,
    staff_target_customer_id: session.targetCustomerId,
    staff_target_email: session.targetEmail,
    staff_impersonation_started_at: session.startedAt,
    staff_last_action_at: at,
    ...extra,
  }
}

export function appendStaffAuditLog(
  metadata: AnyRecord | null | undefined,
  entry: AnyRecord
): AnyRecord {
  const existing = { ...(metadata || {}) }
  let audit: AnyRecord[] = []

  if (typeof existing.staff_audit_log === "string") {
    try {
      const parsed = JSON.parse(existing.staff_audit_log)
      if (Array.isArray(parsed)) audit = parsed
    } catch {
      audit = []
    }
  } else if (Array.isArray(existing.staff_audit_log)) {
    audit = existing.staff_audit_log
  }

  audit.push({ at: new Date().toISOString(), ...entry })
  return {
    ...existing,
    staff_audit_log: JSON.stringify(audit.slice(-50)),
  }
}

export async function retrieveAdminCustomer(customerId: string): Promise<AnyRecord | null> {
  const { customer } = await adminFetch<{ customer: AnyRecord }>(
    `/admin/customers/${customerId}`,
    {
      query: {
        fields:
          "id,email,first_name,last_name,phone,company_name,metadata,*addresses",
      },
    }
  )

  return customer || null
}
