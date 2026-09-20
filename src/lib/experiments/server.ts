import "server-only"

import { cookies, headers } from "next/headers"

import {
  EXPERIMENT_ASSIGNMENTS_COOKIE,
  EXPERIMENT_ID_COOKIE,
  parseStoredAssignments,
} from "./cookies"
import { evaluateExperimentGuardrails } from "./guardrails"
import { getExperimentDefinition, isKnownVariant } from "./registry"
import { getStatsigEvaluation } from "./statsig-server"
import { experimentReleaseId, verifiedStoredAssignment, withAssignmentEvidence } from "./assignment-evidence"
import type {
  ExperimentAssignment,
  ExperimentAssignmentSource,
  ExperimentDefinition,
  ExperimentRequestContext,
  ExperimentStatus,
} from "./types"

function fallbackStableId(experimentKey: string) {
  return `fallback:${experimentKey}`
}

function assignmentId(experimentKey: string, variantKey: string, stableId: string) {
  return `${experimentKey}:${variantKey}:${stableId}`
}

function forceEnvKey(experimentKey: string) {
  return `EXPERIMENT_FORCE_${experimentKey
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")}`
}

function statusEnvKey(experimentKey: string) {
  return `EXPERIMENT_STATUS_${experimentKey
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")}`
}

function runtimeDefinition(definition: ExperimentDefinition) {
  const status = process.env[statusEnvKey(definition.key)] as
    | ExperimentStatus
    | undefined

  if (
    status === "draft" ||
    status === "active" ||
    status === "paused" ||
    status === "archived"
  ) {
    return { ...definition, status }
  }

  return definition
}

function assignment(
  definition: ExperimentDefinition,
  variantKey: string,
  stableId: string,
  context: ExperimentRequestContext,
  source: ExperimentAssignmentSource,
  overrides?: Partial<ExperimentAssignment>,
  evaluation: unknown = { source }
): ExperimentAssignment {
  return withAssignmentEvidence({
    experimentKey: definition.key,
    variantKey,
    assignmentId: assignmentId(definition.key, variantKey, stableId),
    surface: definition.surface,
    impact: definition.impact,
    source,
    isEnabled: definition.status === "active" && !overrides?.isBlocked,
    isBlocked: false,
    statsigExperiment: definition.statsigExperiment,
    routeMarket: context.routeMarket,
    customerType: context.customerType,
    ...overrides,
  }, definition, evaluation)
}

export async function getExperimentAssignment(
  experimentKey: string,
  context: ExperimentRequestContext = {}
): Promise<ExperimentAssignment | null> {
  const definition = getExperimentDefinition(experimentKey)
  if (!definition) return null
  const effectiveDefinition = runtimeDefinition(definition)

  const requestContext: ExperimentRequestContext = {
    routeMarket: context.routeMarket || "unknown",
    customerType: context.customerType || "unknown",
    userId: context.userId,
    path: context.path,
  }

  const guardrail = evaluateExperimentGuardrails(effectiveDefinition)
  if (!guardrail.allowed) {
    return assignment(
      effectiveDefinition,
      effectiveDefinition.defaultVariant,
      fallbackStableId(experimentKey),
      requestContext,
      guardrail.reason?.includes("kill switch") ? "kill-switch" : "guardrail",
      {
        isEnabled: false,
        isBlocked: true,
        blockReason: guardrail.reason,
      }
    )
  }

  const forcedVariant = process.env[forceEnvKey(experimentKey)]

  if (isKnownVariant(effectiveDefinition, forcedVariant)) {
    const cookieStore = await cookies()
    const stableId =
      cookieStore.get(EXPERIMENT_ID_COOKIE)?.value ||
      cookieStore.get("_gp_anon_id")?.value ||
      fallbackStableId(experimentKey)

    return assignment(
      effectiveDefinition,
      forcedVariant!,
      stableId,
      requestContext,
      "env-override",
      { isEnabled: true }
    )
  }

  if (effectiveDefinition.status !== "active") {
    return assignment(
      effectiveDefinition,
      effectiveDefinition.defaultVariant,
      fallbackStableId(experimentKey),
      requestContext,
      "registry-default",
      { isEnabled: false }
    )
  }

  const cookieStore = await cookies()
  const headerStore = await headers()
  const stableId =
    cookieStore.get(EXPERIMENT_ID_COOKIE)?.value ||
    cookieStore.get("_gp_anon_id")?.value ||
    fallbackStableId(experimentKey)
  requestContext.path =
    requestContext.path || headerStore.get("x-pathname") || undefined

  const stored = parseStoredAssignments(
    cookieStore.get(EXPERIMENT_ASSIGNMENTS_COOKIE)?.value
  )[experimentKey]

  if (stored && isKnownVariant(effectiveDefinition, stored.variantKey) && verifiedStoredAssignment(experimentKey, stored)) {
    const current = assignment(
        effectiveDefinition,
        stored.variantKey,
        stableId,
        requestContext,
        "sticky-cookie",
        { assignmentId: stored.assignmentId },
        { source: "sticky-cookie", prior_version: stored.version }
      )
    // Reuse the original assignment revision within one code release. Across
    // releases issue new evidence for the UI now rendered; old cart evidence stays old.
    return stored.releaseId === experimentReleaseId() ? { ...current,
      version: stored.version, releaseId: stored.releaseId,
      evaluationVersion: stored.evaluationVersion,
      versionKeyId: stored.versionKeyId, versionSignature: stored.versionSignature,
    } : current
  }

  const statsig = await getStatsigEvaluation(
    effectiveDefinition,
    stableId,
    requestContext
  )
  if (isKnownVariant(effectiveDefinition, statsig?.variant)) {
    return assignment(
      effectiveDefinition,
      statsig!.variant,
      stableId,
      requestContext,
      "statsig",
      undefined,
      { source: "statsig", ...statsig!.evidence }
    )
  }

  return assignment(
    effectiveDefinition,
    effectiveDefinition.defaultVariant,
    stableId,
    requestContext,
    "registry-default"
  )
}
