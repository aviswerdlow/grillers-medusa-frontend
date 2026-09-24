import type {
  StoredExperimentAssignment,
  StoredExperimentAssignments,
} from "./types"

export const EXPERIMENT_ID_COOKIE = "_gp_exp_id"
export const EXPERIMENT_ASSIGNMENTS_COOKIE = "_gp_exp_assignments"
export const EXPERIMENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function parseStoredAssignments(
  value: string | null | undefined
): StoredExperimentAssignments {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }

    const assignments: StoredExperimentAssignments = {}

    for (const [experimentKey, assignment] of Object.entries(parsed)) {
      if (
        !assignment ||
        typeof assignment !== "object" ||
        Array.isArray(assignment)
      ) {
        continue
      }

      const candidate = assignment as Partial<StoredExperimentAssignment>
      if (
        typeof candidate.variantKey !== "string" ||
        typeof candidate.assignmentId !== "string" ||
        typeof candidate.assignedAt !== "string"
      ) {
        continue
      }

      assignments[experimentKey] = {
        variantKey: candidate.variantKey,
        assignmentId: candidate.assignmentId,
        assignedAt: candidate.assignedAt,
        ...(typeof candidate.version === "string" ? { version: candidate.version } : {}),
        ...(typeof candidate.evaluationVersion === "string" ? { evaluationVersion: candidate.evaluationVersion } : {}),
        ...(typeof candidate.releaseId === "string" ? { releaseId: candidate.releaseId } : {}),
        ...(typeof candidate.versionKeyId === "string" ? { versionKeyId: candidate.versionKeyId } : {}),
        ...(typeof candidate.versionSignature === "string" ? { versionSignature: candidate.versionSignature } : {}),
        ...(typeof candidate.surface === "string"
          ? { surface: candidate.surface }
          : {}),
        ...(typeof candidate.impact === "string"
          ? { impact: candidate.impact }
          : {}),
        ...(typeof candidate.routeMarket === "string"
          ? { routeMarket: candidate.routeMarket }
          : {}),
        ...(typeof candidate.customerType === "string"
          ? { customerType: candidate.customerType }
          : {}),
        ...(typeof candidate.source === "string"
          ? { source: candidate.source }
          : {}),
      }
    }

    return assignments
  } catch {
    return {}
  }
}

export function serializeStoredAssignments(
  assignments: StoredExperimentAssignments
) {
  return JSON.stringify(assignments)
}

export function updateStoredAssignment(
  assignments: StoredExperimentAssignments,
  experimentKey: string,
  assignment: Omit<StoredExperimentAssignment, "assignedAt">
) {
  return {
    ...assignments,
    [experimentKey]: {
      ...assignment,
      assignedAt: new Date().toISOString(),
    },
  }
}
