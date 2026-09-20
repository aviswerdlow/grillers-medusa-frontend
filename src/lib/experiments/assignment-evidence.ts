import "server-only"
import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { ExperimentAssignment, ExperimentDefinition, StoredExperimentAssignment } from "./types"

function key(id: string | undefined): string | null {
  try {
    const value = id && JSON.parse(process.env.GP_EXPERIMENT_EVIDENCE_KEYS || "{}")[id]
    return typeof value === "string" && Buffer.byteLength(value) >= 32 ? value : null
  } catch { return null }
}
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value
const payload = (experimentKey: string, value: { variantKey: string; assignmentId: string; version?: string | null; evaluationVersion?: string; releaseId?: string }) =>
  JSON.stringify(["gp-experiment-evidence-v1", experimentKey, value.variantKey, value.assignmentId, value.version, value.evaluationVersion, value.releaseId])

export function experimentReleaseId(): string | null {
  const value = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GP_EXPERIMENT_RELEASE_SHA
  return value && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null
}

/** Evidence of the server-issued assignment, not proof of browser exposure or
 * an authorization token. No secret or customer information enters the receipt. */
export function withAssignmentEvidence(assignment: ExperimentAssignment, definition: ExperimentDefinition, evaluation: unknown): ExperimentAssignment {
  const releaseId = experimentReleaseId()
  const keyId = process.env.GP_EXPERIMENT_EVIDENCE_KEY_ID
  const secret = key(keyId)
  if (!releaseId || !keyId || !secret || !assignment.isEnabled || assignment.isBlocked)
    return { ...assignment, version: null }
  // Both variants share the experiment revision. Evaluation evidence (including
  // Statsig rule/group/value) has its own fingerprint; it must not split one
  // experiment into a different version for every treatment.
  const version = createHash("sha256").update(JSON.stringify(canonical({ releaseId, definition }))).digest("hex")
  const evaluationVersion = createHash("sha256").update(JSON.stringify(canonical(evaluation))).digest("hex")
  const result = { ...assignment, version, evaluationVersion, releaseId, versionKeyId: keyId }
  return { ...result, versionSignature: createHmac("sha256", secret).update(payload(assignment.experimentKey, result)).digest("hex") }
}

export function verifiedStoredAssignment(experimentKey: string, value: StoredExperimentAssignment): boolean {
  const secret = key(value.versionKeyId)
  if (!secret || !/^[a-f0-9]{64}$/.test(value.version || "") || !/^[a-f0-9]{64}$/.test(value.evaluationVersion || "") || !/^[a-f0-9]{40}$/.test(value.releaseId || "")
    || !/^[a-f0-9]{64}$/.test(value.versionSignature || "")) return false
  const expected = createHmac("sha256", secret).update(payload(experimentKey, value)).digest()
  return timingSafeEqual(expected, Buffer.from(value.versionSignature!, "hex"))
}
