export type RegionalPickupLocation = {
  City?: string | null
  State?: string | null
  ZipCode?: string | null
}

const STATE_ALIASES: Record<string, string> = {
  alabama: "AL",
  florida: "FL",
  georgia: "GA",
  "north carolina": "NC",
  "south carolina": "SC",
  tennessee: "TN",
  texas: "TX",
}

export function normalizePickupState(
  state: string | null | undefined
): string {
  const normalized = String(state || "").trim()
  if (!normalized) return ""
  if (/^[a-z]{2}$/i.test(normalized)) return normalized.toUpperCase()
  return STATE_ALIASES[normalized.toLowerCase()] || normalized.toUpperCase()
}

function normalizeZip(zip: string | null | undefined): string {
  return String(zip || "").trim().slice(0, 5)
}

function normalizeCity(city: string | null | undefined): string {
  return String(city || "").trim().toLowerCase()
}

/**
 * A regional route is offered state-wide, not only when the customer's city
 * exactly matches one pickup city. Peter's #296 example is a Memphis address:
 * it must unlock every active Tennessee stop (Memphis, Nashville, etc.).
 */
export function hasRegionalPickupForAddress(
  locations: RegionalPickupLocation[] | null | undefined,
  address: {
    city?: string | null
    state?: string | null
    zip?: string | null
  }
): boolean {
  if (!locations?.length) return false

  const state = normalizePickupState(address.state)
  const city = normalizeCity(address.city)
  const zip = normalizeZip(address.zip)

  return locations.some((location) => {
    const locationState = normalizePickupState(location.State)
    if (state && locationState === state) return true
    if (zip && normalizeZip(location.ZipCode) === zip) return true
    return Boolean(city && normalizeCity(location.City) === city)
  })
}

/**
 * Once a regional route is chosen, show every stop in the customer's state.
 * Fall back to the full list only when state is absent or no configured row
 * matches, so existing carts created before state-aware routing still recover.
 */
export function pickupLocationsForState<T extends RegionalPickupLocation>(
  locations: T[],
  state: string | null | undefined
): T[] {
  const normalizedState = normalizePickupState(state)
  if (!normalizedState) return locations
  const matches = locations.filter(
    (location) => normalizePickupState(location.State) === normalizedState
  )
  return matches.length > 0 ? matches : locations
}

export function regionalPickupPresentation(
  state: string | null | undefined
): { title: string; subtitle: string; summary: string } {
  if (normalizePickupState(state) === "TX") {
    return {
      title: "Dallas Consolidated Shipping",
      subtitle: "Dallas-area consolidated route",
      summary: "Collect from the Dallas consolidated route pickup point.",
    }
  }

  return {
    title: "Southeast Pickup",
    subtitle: "Regional route pickup",
    summary: "Collect from a partner pickup location in your state.",
  }
}
