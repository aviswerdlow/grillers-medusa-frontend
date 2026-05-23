export type StaffCartCookieSession = {
  staffCustomerId: string
  targetCustomerId: string
}

export const STAFF_IMPERSONATION_CART_COOKIE_PREFIX = "_gp_staff_cart_"

function cookieNameFragment(value: string) {
  return String(value || "unknown")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 72)
}

export function staffImpersonationCartCookieName(
  session: StaffCartCookieSession
) {
  return `${STAFF_IMPERSONATION_CART_COOKIE_PREFIX}${cookieNameFragment(
    session.staffCustomerId
  )}_${cookieNameFragment(session.targetCustomerId)}`
}
