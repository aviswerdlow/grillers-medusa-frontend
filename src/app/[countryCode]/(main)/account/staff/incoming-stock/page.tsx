import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { getIncomingExceptions } from "@lib/data/staff/incoming-stock"
import { canReviewIncomingStock } from "@lib/util/incoming-stock"
import IncomingStockConsole from "@modules/staff/components/incoming-stock-console"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Incoming stock | Griller's Pride",
  robots: { index: false, follow: false },
}
export default async function IncomingStockPage({
  params,
}: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const customer = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!customer) redirect(`/${countryCode}/account`)
  if (!canReviewIncomingStock(customer)) notFound()
  return (
    <main className="content-container py-8">
      <LocalizedClientLink
        className="inline-flex min-h-11 items-center text-sm underline focus-visible:outline focus-visible:outline-2"
        href="/account/staff/orders"
      >
        Back to staff console
      </LocalizedClientLink>
      <IncomingStockConsole
        actorId={customer.id}
        initialQueue={await getIncomingExceptions()}
      />
    </main>
  )
}
