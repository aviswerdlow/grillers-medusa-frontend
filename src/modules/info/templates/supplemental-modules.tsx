import { gql } from "graphql-request"
import strapiClient from "@lib/strapi"
import {
  getAtlantaDeliveryZones,
  type AtlantaDeliveryZone,
} from "@lib/data/strapi/fulfillment"
import { isUpcomingDeadlineDate } from "@lib/data/holiday-deadlines"

type HolidayDeadline = {
  documentId: string
  HolidayName: string
  HolidayDate?: string | null
  DeliveryCutoff: string
  UPSShippingCutoff: string
  PlantPickupCutoff: string
  Notes?: string | null
  SortOrder?: number | null
}

type SoutheastPickupLocation = {
  documentId: string
  City: string
  State: string
  Address?: string | null
  ZipCode?: string | null
  AvailableDates?: { Date?: string | null }[] | null
  CutoffDays?: number | null
  Description?: string | null
}

type PalletShipmentCity = {
  documentId: string
  City: string
  State: string
  PickupInfo: string
  OrderDeadline: string
  LocalContact?: string | null
  Notes?: string | null
  SortOrder?: number | null
}

export type InfoSupplementalData = {
  holidayDeadlines?: HolidayDeadline[]
  atlantaDeliveryZones?: AtlantaDeliveryZone[]
  southeastPickupLocations?: SoutheastPickupLocation[]
  palletShipmentCities?: PalletShipmentCity[]
}

const HolidayDeadlinesQuery = gql`
  query InfoHolidayDeadlines {
    holidayDeadlines(
      filters: { IsActive: { eq: true } }
      sort: ["SortOrder:asc", "HolidayDate:asc"]
      pagination: { pageSize: 50 }
    ) {
      documentId
      HolidayName
      HolidayDate
      DeliveryCutoff
      UPSShippingCutoff
      PlantPickupCutoff
      Notes
      SortOrder
    }
  }
`

const SoutheastPickupLocationsQuery = gql`
  query InfoSoutheastPickupLocations {
    southeastPickupLocations(
      filters: { IsActive: { eq: true } }
      pagination: { pageSize: 100 }
    ) {
      documentId
      City
      State
      Address
      ZipCode
      AvailableDates {
        Date
      }
      CutoffDays
      Description
    }
  }
`

const PalletShipmentCitiesQuery = gql`
  query InfoPalletShipmentCities {
    palletShipmentCities(
      filters: { IsActive: { eq: true } }
      sort: ["SortOrder:asc", "City:asc"]
      pagination: { pageSize: 100 }
    ) {
      documentId
      City
      State
      PickupInfo
      OrderDeadline
      LocalContact
      Notes
      SortOrder
    }
  }
`

function sortPickupLocations(locations: SoutheastPickupLocation[]) {
  return [...locations].sort((a, b) => {
    const firstA = a.AvailableDates?.[0]?.Date || ""
    const firstB = b.AvailableDates?.[0]?.Date || ""
    if (firstA !== firstB) return firstA.localeCompare(firstB)
    const stateCompare = a.State.localeCompare(b.State)
    if (stateCompare) return stateCompare
    return a.City.localeCompare(b.City)
  })
}

export async function getInfoSupplementalData(
  pageSlug: string
): Promise<InfoSupplementalData | undefined> {
  try {
    if (pageSlug === "holidays-order-deadlines") {
      const data = await strapiClient.request<{
        holidayDeadlines?: HolidayDeadline[]
      }>(HolidayDeadlinesQuery)
      const now = new Date()
      return {
        holidayDeadlines: (data.holidayDeadlines || []).filter((row) =>
          isUpcomingDeadlineDate(row.HolidayDate, now)
        ),
      }
    }

    if (pageSlug === "shipping-southeast-pickup") {
      const data = await strapiClient.request<{
        southeastPickupLocations?: SoutheastPickupLocation[]
      }>(SoutheastPickupLocationsQuery)
      return {
        southeastPickupLocations: sortPickupLocations(
          data.southeastPickupLocations || []
        ),
      }
    }

    if (pageSlug === "shipping-atlanta") {
      return { atlantaDeliveryZones: await getAtlantaDeliveryZones() }
    }

    if (pageSlug === "shipping-pallet-program") {
      const data = await strapiClient.request<{
        palletShipmentCities?: PalletShipmentCity[]
      }>(PalletShipmentCitiesQuery)
      return { palletShipmentCities: data.palletShipmentCities || [] }
    }
  } catch {
    return undefined
  }

  return undefined
}

function formatDate(date?: string | null) {
  if (!date) return "TBD"
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

function HolidayDeadlineTable({ rows }: { rows: HolidayDeadline[] }) {
  if (!rows.length) return null

  return (
    <div className="not-prose mt-6 overflow-x-auto border-t border-Charcoal/20">
      <table className="min-w-[760px] w-full border-collapse font-maison-neue text-left text-p-sm text-Charcoal">
        <thead>
          <tr className="border-b border-Charcoal/20">
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Holiday
            </th>
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Date
            </th>
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Local Delivery
            </th>
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              UPS Shipping
            </th>
            <th className="py-3 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Plant Pickup
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.documentId} className="border-b border-Charcoal/15">
              <th className="py-4 pr-4 align-top font-semibold text-Charcoal">
                {row.HolidayName}
                {row.Notes && (
                  <p className="mt-2 max-w-xs text-p-ex-sm font-normal leading-[1.55] text-Charcoal/65">
                    {row.Notes}
                  </p>
                )}
              </th>
              <td className="py-4 pr-4 align-top text-Charcoal/80">
                {formatDate(row.HolidayDate)}
              </td>
              <td className="py-4 pr-4 align-top text-Charcoal/80">
                {row.DeliveryCutoff}
              </td>
              <td className="py-4 pr-4 align-top text-Charcoal/80">
                {row.UPSShippingCutoff}
              </td>
              <td className="py-4 align-top text-Charcoal/80">
                {row.PlantPickupCutoff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HolidayReminderSignup() {
  return null
}

function SoutheastPickupSchedule({
  rows,
}: {
  rows: SoutheastPickupLocation[]
}) {
  if (!rows.length) return null

  return (
    <div className="not-prose mt-6 overflow-x-auto border-t border-Charcoal/20">
      <table className="min-w-[640px] w-full border-collapse font-maison-neue text-left text-p-sm text-Charcoal">
        <thead>
          <tr className="border-b border-Charcoal/20">
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              City
            </th>
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Pickup Dates
            </th>
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Cutoff
            </th>
            <th className="py-3 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.documentId} className="border-b border-Charcoal/15">
              <th className="py-4 pr-4 align-top font-semibold text-Charcoal">
                {row.City}, {row.State}
                {(row.Address || row.ZipCode) && (
                  <p className="mt-2 text-p-ex-sm font-normal leading-[1.55] text-Charcoal/65">
                    {[row.Address, row.ZipCode].filter(Boolean).join(" ")}
                  </p>
                )}
              </th>
              <td className="py-4 pr-4 align-top text-Charcoal/80">
                {(row.AvailableDates || [])
                  .map((date) => formatDate(date.Date))
                  .join(", ") || "Call for schedule"}
              </td>
              <td className="py-4 pr-4 align-top text-Charcoal/80">
                {row.CutoffDays || 3} days before pickup
              </td>
              <td className="py-4 align-top text-Charcoal/80">
                {row.Description || "Scheduled pickup location"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatCents(value?: number | null) {
  if (typeof value !== "number") return "-"
  if (value <= 0) return "Free"
  return `$${(value / 100).toFixed(2)}`
}

function AtlantaDeliveryZoneTable({ rows }: { rows: AtlantaDeliveryZone[] }) {
  if (!rows.length) return null

  return (
    <div className="not-prose mt-6 overflow-x-auto border-t border-Charcoal/20">
      <table className="min-w-[760px] w-full border-collapse font-maison-neue text-left text-p-sm text-Charcoal">
        <thead>
          <tr className="border-b border-Charcoal/20">
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              ZIP
            </th>
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Route day
            </th>
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Cutoff
            </th>
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              $250+
            </th>
            <th className="py-3 pr-4 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              $150-$249
            </th>
            <th className="py-3 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              $100-$149
            </th>
            <th className="py-3 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              $50-$99
            </th>
            <th className="py-3 font-maison-neue-mono text-p-ex-sm-mono uppercase tracking-[0.14em] text-RichGold">
              Under $50
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.documentId} className="border-b border-Charcoal/15">
              <th className="py-4 pr-4 align-top font-semibold text-Charcoal">
                {row.ZipCode}
              </th>
              <td className="py-4 pr-4 align-top text-Charcoal/80">
                {row.DeliveryDay}
              </td>
              <td className="py-4 pr-4 align-top text-Charcoal/80">
                Noon before delivery
                {typeof row.CutoffHourLocal === "number" &&
                row.CutoffHourLocal !== 12
                  ? ` (${row.CutoffHourLocal}:00 local)`
                  : ""}
              </td>
              <td className="py-4 pr-4 align-top text-Charcoal/80">
                {formatCents(row.Rate250PlusCents)}
              </td>
              <td className="py-4 pr-4 align-top text-Charcoal/80">
                {formatCents(row.Rate150To249Cents)}
              </td>
              <td className="py-4 align-top text-Charcoal/80">
                {formatCents(row.Rate100To149Cents)}
              </td>
              <td className="py-4 align-top text-Charcoal/80">
                {formatCents(row.Rate50To99Cents)}
              </td>
              <td className="py-4 align-top text-Charcoal/80">
                {formatCents(row.Rate0To49Cents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PalletCityList({ rows }: { rows: PalletShipmentCity[] }) {
  if (!rows.length) return null

  return (
    <div className="not-prose mt-6 border-t border-Charcoal/20">
      {rows.map((row) => (
        <div
          key={row.documentId}
          className="grid gap-4 border-b border-Charcoal/15 py-5 font-maison-neue md:grid-cols-[180px_minmax(0,1fr)]"
        >
          <div>
            <h3 className="font-semibold text-Charcoal">
              {row.City}, {row.State}
            </h3>
            {row.LocalContact && (
              <p className="mt-2 text-p-ex-sm leading-[1.55] text-Charcoal/65">
                {row.LocalContact}
              </p>
            )}
          </div>
          <div className="space-y-3 text-p-sm leading-[1.65] text-Charcoal/80">
            <p>{row.PickupInfo}</p>
            <p>
              <span className="font-semibold text-Charcoal">Order cutoff:</span>{" "}
              {row.OrderDeadline}
            </p>
            {row.Notes && <p>{row.Notes}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function SupplementalInfoModule({
  pageSlug,
  anchorId,
  data,
}: {
  pageSlug: string
  anchorId?: string
  data?: InfoSupplementalData
}) {
  if (
    pageSlug === "holidays-order-deadlines" &&
    anchorId === "upcoming-holiday-deadlines"
  ) {
    return <HolidayDeadlineTable rows={data?.holidayDeadlines || []} />
  }

  if (
    pageSlug === "holidays-order-deadlines" &&
    anchorId === "subscribe-to-holiday-reminders"
  ) {
    return <HolidayReminderSignup />
  }

  if (pageSlug === "shipping-southeast-pickup" && anchorId === "schedule") {
    return (
      <SoutheastPickupSchedule rows={data?.southeastPickupLocations || []} />
    )
  }

  if (
    pageSlug === "shipping-atlanta" &&
    (anchorId === "delivery-zip-codes-and-rates" ||
      anchorId === "zip-codes-and-rates")
  ) {
    return <AtlantaDeliveryZoneTable rows={data?.atlantaDeliveryZones || []} />
  }

  if (
    pageSlug === "shipping-pallet-program" &&
    anchorId === "cities-we-currently-serve"
  ) {
    return <PalletCityList rows={data?.palletShipmentCities || []} />
  }

  return null
}
