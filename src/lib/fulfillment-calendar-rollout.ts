import { hasCalendarPromise } from "./fulfillment-calendar"

export const CALENDAR_PATH = "/store/grillers/checkout/fulfillment-calendar"
export const CALENDAR_REQUIRED_MESSAGE =
  "Please return to fulfillment and confirm an available date before placing your order."

export function calendarHttpStatus(error: unknown): number {
  const e = error as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
  }
  return Number(e?.status ?? e?.statusCode ?? e?.response?.status)
}

type CalendarCart = {
  id: string
  metadata?: Record<string, unknown> | null
  completed_at?: unknown
}

/** A missing endpoint is compatible with the old backend. A 503 is compatible
 * only when the backend explicitly reports enforcement off. Never downgrade a
 * signed promise, an authentication failure, or an unknown outage. Readers must
 * use fresh, authorized server requests; no browser flags authorize this path. */
export async function legacyCalendarCart<T extends CalendarCart>(input: {
  cartId: string
  observation: number | "legacy"
  readCart: () => Promise<T | null>
  readCapability: () => Promise<unknown>
}): Promise<T | null> {
  if (![404, 503, "legacy"].includes(input.observation)) return null
  try {
    const cart = await input.readCart()
    if (
      !cart ||
      cart.id !== input.cartId ||
      cart.completed_at ||
      hasCalendarPromise(cart.metadata)
    )
      return null
    try {
      const capability = (await input.readCapability()) as {
        enforcement?: unknown
      } | null
      return capability?.enforcement === "off" ? cart : null
    } catch (error) {
      return input.observation === 404 && calendarHttpStatus(error) === 404
        ? cart
        : null
    }
  } catch {
    return null
  }
}

/** Payment and legacy date writes recheck rollout state even if the form was
 * displayed before enforcement changed. A valid signed response is never a
 * license to overwrite its dates through the legacy form. */
export async function validateCalendarOrLegacy<T extends CalendarCart>(input: {
  cartId: string
  validate: () => Promise<{ state?: unknown; summary?: unknown }>
  readCart: () => Promise<T | null>
  readCapability: () => Promise<unknown>
  preserveValidationError?: boolean
}): Promise<{ state: "valid" } | { state: "legacy"; cart: T }> {
  let observation: number | "legacy"
  let validationError: unknown
  try {
    const result = await input.validate()
    if (result.state === "valid" && result.summary) return { state: "valid" }
    observation = result.state === "legacy" ? "legacy" : 0
  } catch (error) {
    validationError = error
    observation = calendarHttpStatus(error)
  }
  const cart = await legacyCalendarCart({ ...input, observation })
  if (cart) return { state: "legacy", cart }
  if (input.preserveValidationError && validationError instanceof Error)
    throw validationError
  throw new Error(CALENDAR_REQUIRED_MESSAGE)
}
