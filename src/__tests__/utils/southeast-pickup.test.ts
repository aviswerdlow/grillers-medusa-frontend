import {
  hasRegionalPickupForAddress,
  pickupLocationsForState,
  regionalPickupPresentation,
} from "@lib/util/southeast-pickup"

const locations = [
  { City: "Memphis", State: "TN", ZipCode: "38120" },
  { City: "Nashville", State: "TN", ZipCode: "37205" },
  { City: "Dallas", State: "TX", ZipCode: "75230" },
]

describe("regional pickup eligibility — issue #296", () => {
  it("offers every Tennessee stop to a Memphis delivery address", () => {
    expect(
      hasRegionalPickupForAddress(locations, {
        city: "Memphis",
        state: "Tennessee",
        zip: "38120-1234",
      })
    ).toBe(true)

    expect(pickupLocationsForState(locations, "TN")).toEqual([
      locations[0],
      locations[1],
    ])
  })

  it("offers Dallas consolidated shipping for a Texas address", () => {
    expect(
      hasRegionalPickupForAddress(locations, {
        city: "Austin",
        state: "TX",
        zip: "78701",
      })
    ).toBe(true)
    expect(pickupLocationsForState(locations, "Texas")).toEqual([
      locations[2],
    ])
    expect(regionalPickupPresentation("TX").title).toBe(
      "Dallas Consolidated Shipping"
    )
  })

  it("does not offer a regional route in a state with no active stop", () => {
    expect(
      hasRegionalPickupForAddress(locations, {
        city: "Boston",
        state: "MA",
        zip: "02108",
      })
    ).toBe(false)
  })
})
