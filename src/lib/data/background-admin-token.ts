import "server-only"

/** Keep the deployed cron name during credential separation; never expose tokens. */
export function backgroundAdminToken(): string {
  return process.env.MEDUSA_READ_ONLY_API_TOKEN || process.env.MEDUSA_ADMIN_API_TOKEN || ""
}

/** Review acquisition also persists send markers and needs its limited write class. */
export function communicationsAdminToken(): string {
  return process.env.MEDUSA_COMMUNICATIONS_API_TOKEN || backgroundAdminToken()
}
