import "server-only"

import type {
  ExperimentDefinition,
  ExperimentRequestContext,
} from "./types"

type StatsigModule = typeof import("@statsig/statsig-node-core")
type StatsigInstance = InstanceType<StatsigModule["Statsig"]>

let statsigPromise: Promise<StatsigInstance | null> | null = null

async function loadStatsig() {
  if (!process.env.STATSIG_SERVER_SECRET) {
    return null
  }

  if (!statsigPromise) {
    statsigPromise = (async () => {
      try {
        const { Statsig } = await import("@statsig/statsig-node-core")
        const statsig = new Statsig(process.env.STATSIG_SERVER_SECRET!, {
          outputLogLevel:
            process.env.NODE_ENV === "development" ? "warn" : "error",
          serviceName: "grillers-medusa-frontend",
        })
        const result = await statsig.initialize()
        return result.isSuccess ? statsig : null
      } catch {
        return null
      }
    })()
  }

  return statsigPromise
}

export async function getStatsigEvaluation(
  definition: ExperimentDefinition,
  stableId: string,
  context: ExperimentRequestContext
) {
  const statsig = await loadStatsig()
  if (!statsig) return null

  try {
    const { StatsigUser } = await import("@statsig/statsig-node-core")
    const user = new StatsigUser({
      customIDs: {
        experiment_id: stableId,
      },
      userID: context.userId,
      country: context.routeMarket,
      custom: {
        route_market: context.routeMarket || "unknown",
        customer_type: context.customerType || "unknown",
        surface: definition.surface,
      },
    })

    const experiment = statsig.getExperiment(
      user,
      definition.statsigExperiment || definition.key,
      { disableExposureLogging: true }
    )

    const configuredVariant = experiment.get("variant", definition.defaultVariant)
    const groupName = experiment.getGroupName()
    const variant = typeof configuredVariant === "string" ? configuredVariant : groupName
    return typeof variant === "string" ? {
      variant,
      evidence: { rule_id: experiment.getRuleId(), group_name: groupName, value: experiment.value },
    } : null
  } catch {
    return null
  }
}
