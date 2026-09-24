const {
  canonicalOrigin,
  publicOrigin,
  isIndexableDeployment,
} = require("./site-policy.cjs")

export const CANONICAL_PRODUCTION_URL: string = canonicalOrigin()
export const LEGACY_PRODUCTION_HOST = "grillerspride.com"

/** Application and SEO origin share the configured canonical origin in production.
 * Preview URLs stay local to their deployment and always carry noindex headers. */
export const getBaseURL = (): string => publicOrigin()
export const isProductionHost = (): boolean => isIndexableDeployment()
