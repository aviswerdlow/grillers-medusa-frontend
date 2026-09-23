import { retrieveSmsMarketingStatus } from "@lib/data/sms-marketing"
import { Metadata } from "next"
import { redirect } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import { getStaffImpersonationSession } from "@lib/data/staff/impersonation"
import ContactVerification from "@modules/account/components/contact-verification"
import {
  collectPhoneCandidates,
  hasCompletedContactVerification,
  isMigratedCustomer,
} from "@lib/util/contact-verification"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Confirm your details | Griller's Pride",
  description: "Confirm your mobile number, email, and shipping address.",
  robots: { index: false, follow: false },
}

export default async function VerifyContactPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params

  const customer = await retrieveCustomer().catch(() => null)
  if (!customer) {
    redirect(`/${countryCode}/account`)
  }

  // Staff browsing a customer's account must never record consent on
  // their behalf — staff-assisted opt-in lives in the phone-order copilot.
  const impersonation = await getStaffImpersonationSession().catch(() => null)
  if (impersonation) {
    redirect(`/${countryCode}/account`)
  }

  // Already confirmed — nothing to do here. (Deliberately reachable for
  // customers who previously skipped: the account banner links back.)
  if (hasCompletedContactVerification(customer)) {
    redirect(`/${countryCode}/account`)
  }

  // Migrated customers only: post-launch signups already provided and
  // consented to everything at registration — the "long-time customer"
  // flow isn't for them (the server action enforces the same scope).
  if (!isMigratedCustomer(customer)) {
    redirect(`/${countryCode}/account`)
  }

  return (
    <ContactVerification
      marketingStatus={await retrieveSmsMarketingStatus()}
      customer={customer}
      phoneCandidates={collectPhoneCandidates(customer)}
      countryCode={countryCode}
    />
  )
}
