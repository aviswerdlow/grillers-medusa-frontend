import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { canCorrectLocalMilestones, canUseLocalMilestones } from "@lib/util/staff-access"
import LocalMilestonesPhone from "@modules/staff/components/local-milestones-phone"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Local milestones | Griller's Pride",
  description: "Staff pickup and local delivery milestones.",
  robots: { index: false, follow: false },
}

export default async function LocalMilestonesPage({ params }: {
  params: Promise<{ countryCode: string }>
}) {
  if (process.env.GP_LOCAL_MILESTONES_ENABLED !== "true") notFound()
  const { countryCode } = await params
  const customer = await retrieveAuthenticatedCustomerForStaffAccess()
  if (!customer) redirect(`/${countryCode}/account`)
  if (!canUseLocalMilestones(customer)) notFound()
  return <LocalMilestonesPhone office={canCorrectLocalMilestones(customer)} />
}
