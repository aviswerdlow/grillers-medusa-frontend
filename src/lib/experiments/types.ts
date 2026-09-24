export type ExperimentSurface =
  | "homepage"
  | "pdp"
  | "navigation"
  | "plp"
  | "search"
  | "recipes"
  | "learn"
  | "collections"
  | "cart"
  | "pdp_recommendations"
  | "newsletter"
  | "seo_geo"
  | "reviews"

export type ExperimentImpact = "revenue" | "non_revenue"

export type ExperimentStatus = "draft" | "active" | "paused" | "archived"

export type ExperimentAssignmentSource =
  | "statsig"
  | "sticky-cookie"
  | "env-override"
  | "registry-default"
  | "kill-switch"
  | "guardrail"
  | "error"

export type CustomerType = "guest" | "registered" | "staff" | "unknown"

export type ExperimentVariantDefinition = {
  key: string
  label: string
  description?: string
}

export type ExperimentDefinition = {
  key: string
  surface: ExperimentSurface
  impact: ExperimentImpact
  status: ExperimentStatus
  defaultVariant: string
  variants: ExperimentVariantDefinition[]
  statsigExperiment?: string
  description?: string
}

export type ExperimentRequestContext = {
  routeMarket?: string
  customerType?: CustomerType
  userId?: string
  path?: string
}

export type ExperimentAssignment = {
  version?: string | null
  evaluationVersion?: string
  releaseId?: string
  versionKeyId?: string
  versionSignature?: string
  experimentKey: string
  variantKey: string
  assignmentId: string
  surface: ExperimentSurface
  impact: ExperimentImpact
  source: ExperimentAssignmentSource
  isEnabled: boolean
  isBlocked: boolean
  blockReason?: string
  statsigExperiment?: string
  routeMarket?: string
  customerType?: CustomerType
}

export type StoredExperimentAssignment = {
  version?: string | null
  evaluationVersion?: string
  releaseId?: string
  versionKeyId?: string
  versionSignature?: string
  variantKey: string
  assignmentId: string
  assignedAt: string
  surface?: ExperimentSurface
  impact?: ExperimentImpact
  routeMarket?: string
  customerType?: CustomerType
  source?: ExperimentAssignmentSource
}

export type StoredExperimentAssignments = Record<
  string,
  StoredExperimentAssignment
>
