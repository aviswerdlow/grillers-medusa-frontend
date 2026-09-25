import "server-only"
import { getStripePublishableKey } from "@lib/util/stripe-key"
import {
  parseStoredAssignments,
  EXPERIMENT_ASSIGNMENTS_COOKIE,
} from "@lib/experiments/cookies"
import { verifiedStoredAssignment } from "@lib/experiments/assignment-evidence"
import { isRehearsalId } from "./rehearsal-id"

type CookieReader = { get(name: string): { value: string } | undefined }
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

/** Current request choice, no new identifier/cookie and no account or email grant. */
export function serverMeasurementHeaders(
  cookies: CookieReader,
  options: { cartActivity?: boolean } = {}
): Record<string, string> {
  try {
    const raw = cookies.get("cookie_consent")?.value
    if (!raw) return {}
    const consent = JSON.parse(decodeURIComponent(raw))
    if (
      (options.cartActivity
        ? typeof consent?.analytics !== "boolean"
        : consent?.analytics !== true) ||
      typeof consent.marketing !== "boolean" ||
      !Number.isSafeInteger(consent.timestamp) ||
      consent.timestamp <= 0 ||
      consent.timestamp > Date.now()
    )
      return {}
    const key = getStripePublishableKey()
    const environment =
      process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT || "production"
    const rehearsalId = process.env.NEXT_PUBLIC_ANALYTICS_REHEARSAL_ID
    const production =
      environment === "production" &&
      key?.startsWith("pk_live_") &&
      !rehearsalId
    const rehearsal =
      environment === "rehearsal" &&
      key?.startsWith("pk_test_") &&
      isRehearsalId(rehearsalId)
    if (!production && !rehearsal) return {}
    if (!consent.analytics) {
      // Cookie analytics choice is not email subscription authority. Carry the
      // choices without reading identifiers/assignments or creating cookies.
      return {
        "x-gp-measurement-context": Buffer.from(
          JSON.stringify({
            analytics_consent: false,
            analytics_consent_at: consent.timestamp,
            marketing_consent: consent.marketing,
            test_event: Boolean(rehearsal),
            analytics_environment: environment,
            ...(rehearsal ? { rehearsal_id: rehearsalId } : {}),
            experiment_context: {},
            experiment_context_status: "unverified",
          })
        ).toString("base64url"),
      }
    }
    const assignmentCookie = cookies.get(EXPERIMENT_ASSIGNMENTS_COOKIE)?.value
    const assignments = parseStoredAssignments(assignmentCookie)
    let complete = false
    if (assignmentCookie) {
      const parsed = JSON.parse(assignmentCookie)
      complete =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Object.keys(parsed).length === Object.keys(assignments).length &&
        Object.entries(assignments).every(([k, v]) =>
          verifiedStoredAssignment(k, v)
        )
    }
    const context = Object.fromEntries(
      Object.entries(assignments).map(([name, v]) => [
        name,
        {
          variant_key: v.variantKey,
          assignment_id: v.assignmentId,
          version: v.version,
          evaluation_version: v.evaluationVersion,
          release_id: v.releaseId,
          version_key_id: v.versionKeyId,
          version_signature: v.versionSignature,
        },
      ])
    )
    const anonymous = cookies.get("_gp_anon_id")?.value
    const session = cookies.get("_gp_session_id")?.value
    const value = {
      analytics_consent: true,
      analytics_consent_at: consent.timestamp,
      marketing_consent: consent.marketing,
      test_event: Boolean(rehearsal),
      analytics_environment: environment,
      ...(rehearsal ? { rehearsal_id: rehearsalId } : {}),
      ...(uuid.test(anonymous || "") ? { anonymous_id: anonymous } : {}),
      ...(uuid.test(session || "") ? { session_id: session } : {}),
      experiment_context: context,
      experiment_context_status: complete ? "complete" : "unverified",
    }
    const encoded = Buffer.from(JSON.stringify(value)).toString("base64url")
    return encoded.length <= 12_000
      ? { "x-gp-measurement-context": encoded }
      : {}
  } catch {
    return {}
  }
}
