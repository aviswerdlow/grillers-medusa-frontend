"use client"

import type { ExperimentAssignment } from "./types"
import {
  EXPERIMENT_ASSIGNMENTS_COOKIE,
  EXPERIMENT_COOKIE_MAX_AGE,
  parseStoredAssignments,
  serializeStoredAssignments,
  updateStoredAssignment,
} from "./cookies"
import { getJitsuContextSnapshot } from "@lib/jitsu"

export type ActiveExperimentContext = Record<
  string,
  {
    variant_key: string
    assignment_id: string
    version: string | null
    evaluation_version?: string
    surface?: string
    impact?: string
    route_market?: string
    customer_type?: string
    source?: string
    anonymous_id?: string
    session_id?: string
    user_id?: string
  }
>
const INCOMPLETE_COOKIE = "_gp_exp_context_incomplete"

function cookieValue(name: string) {
  if (typeof document === "undefined") return null

  try {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"))
    return match ? decodeURIComponent(match[2]) : null
  } catch {
    return null
  }
}

function setCookie(name: string, value: string, maxAgeSec: number) {
  if (typeof document === "undefined") return

  try {
    const secure =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? ";Secure"
        : ""
    document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAgeSec};SameSite=Lax${secure}`
  } catch {
    // Experiment storage must never affect shopping UX.
  }
}

export function rememberExperimentAssignment(assignment: ExperimentAssignment) {
  if (!assignment.isEnabled || assignment.isBlocked) return

  const stored = parseStoredAssignments(cookieValue(EXPERIMENT_ASSIGNMENTS_COOKIE))
  const next = updateStoredAssignment(stored, assignment.experimentKey, {
    variantKey: assignment.variantKey,
    assignmentId: assignment.assignmentId,
    version: assignment.version,
    evaluationVersion: assignment.evaluationVersion,
    releaseId: assignment.releaseId,
    versionKeyId: assignment.versionKeyId,
    versionSignature: assignment.versionSignature,
    surface: assignment.surface,
    impact: assignment.impact,
    routeMarket: assignment.routeMarket,
    customerType: assignment.customerType,
    source: assignment.source,
  })
  const serialized = serializeStoredAssignments(next)
  // A rejected/oversized cookie must not silently erase a new exposure. Keep a
  // small persistent marker so checkout can preserve the uncertainty.
  if (encodeURIComponent(serialized).length > 3800) {
    setCookie(INCOMPLETE_COOKIE, "1", EXPERIMENT_COOKIE_MAX_AGE)
    return
  }
  setCookie(
    EXPERIMENT_ASSIGNMENTS_COOKIE,
    serialized,
    EXPERIMENT_COOKIE_MAX_AGE
  )
  if (cookieValue(EXPERIMENT_ASSIGNMENTS_COOKIE) !== serialized)
    setCookie(INCOMPLETE_COOKIE, "1", EXPERIMENT_COOKIE_MAX_AGE)
}

export function getActiveExperimentContext(): ActiveExperimentContext {
  const stored = parseStoredAssignments(cookieValue(EXPERIMENT_ASSIGNMENTS_COOKIE))
  const context: ActiveExperimentContext = {}
  const jitsuContext = getJitsuContextSnapshot()

  for (const [experimentKey, assignment] of Object.entries(stored)) {
    context[experimentKey] = {
      variant_key: assignment.variantKey,
      assignment_id: assignment.assignmentId,
      version: assignment.version || null,
      ...(assignment.evaluationVersion ? { evaluation_version: assignment.evaluationVersion } : {}),
      ...(assignment.surface ? { surface: assignment.surface } : {}),
      ...(assignment.impact ? { impact: assignment.impact } : {}),
      ...(assignment.routeMarket
        ? { route_market: assignment.routeMarket }
        : jitsuContext.route_market
        ? { route_market: jitsuContext.route_market }
        : {}),
      ...(assignment.customerType
        ? { customer_type: assignment.customerType }
        : jitsuContext.customer_type
        ? { customer_type: jitsuContext.customer_type }
        : {}),
      ...(assignment.source ? { source: assignment.source } : {}),
      anonymous_id: jitsuContext.anonymous_id,
      session_id: jitsuContext.session_id,
      ...(jitsuContext.user_id ? { user_id: jitsuContext.user_id } : {}),
    }
  }

  return context
}

export function experimentCartMetadata() {
  const experimentContext = getActiveExperimentContext()
  const raw = cookieValue(EXPERIMENT_ASSIGNMENTS_COOKIE)
  const stored = parseStoredAssignments(raw)
  let complete = !cookieValue(INCOMPLETE_COOKIE)
  try {
    const parsed = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
      || Object.keys(parsed).length !== Object.keys(stored).length) complete = false
  } catch { complete = false }
  return {
    experiment_context_status: complete ? "complete" : "unverified",
    experiment_context: Object.fromEntries(Object.entries(experimentContext).map(([id, value]) => [id, {
      ...value,
      release_id: stored[id]?.releaseId,
      version_key_id: stored[id]?.versionKeyId,
      version_signature: stored[id]?.versionSignature,
    }])),
  }
}
