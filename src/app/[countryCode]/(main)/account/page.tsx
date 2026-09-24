import { isContactVerificationDeferred } from "@lib/data/contact-verification-deferral"
import Link from "next/link"
import { redirect } from "next/navigation"
import Overview from "@modules/account/components/overview"
import LoginTemplate from "@modules/account/templates/login-template"
import { retrieveCustomer } from "@lib/data/customer"
import { getStaffImpersonationSession } from "@lib/data/staff/impersonation"
import { listAllOrders, listLegacyCustomerOrders } from "@lib/data/orders"
import { emitOrderHistoryDataFailureAlert } from "@lib/order-history-ops-alerts"
import { needsContactVerification } from "@lib/util/contact-verification"

// /us/account branches on session: signed-in customers see the account
// overview, everyone else sees the sign-in form. Previously this was a
// parallel-routes setup (@login + @dashboard slots picked by the
// layout), but Next.js 15's bug with parallel routes nested inside a
// dynamic segment (#76148) emits broken client-reference manifests for
// every slot page → every /us/account/* route 500s in production. A
// plain branching page.tsx avoids the parallel-routes path entirely.
export const dynamic = "force-dynamic"

export default async function AccountPage(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const customer = await retrieveCustomer().catch(() => null)

  if (!customer) {
    return <LoginTemplate />
  }

  // Migrated (pre-launch) customers confirm their contact details on first
  // login: primary mobile + SMS opt-in, email, default shipping address.
  // Customers can defer within this login session; staff
  // impersonation never triggers it (consent must come from the customer).
  const confirmationNeeded = needsContactVerification(customer)
  const deferred =
    confirmationNeeded && (await isContactVerificationDeferred(customer.id))
  if (confirmationNeeded && !deferred) {
    const impersonation = await getStaffImpersonationSession().catch(() => null)
    if (!impersonation) {
      redirect(`/${countryCode}/account/verify-contact`)
    }
  }

  const [orders, legacyOrderHistory] = await Promise.all([
    listAllOrders().catch((error) => {
      void emitOrderHistoryDataFailureAlert({
        stage: "account_recent_orders",
        mode: "customer",
        error,
      }).catch(() => {
        // Fail open: the overview already renders without recent orders.
      })
      return null
    }),
    listLegacyCustomerOrders(5, 0).catch(() => ({ orders: [], count: 0 })),
  ])

  return (
    <>
      {deferred && (
        <p className="mb-6 text-sm leading-6">
          Your contact details still need confirmation.{" "}
          <Link
            className="underline"
            href={`/${countryCode}/account/verify-contact`}
          >
            Confirm your details
          </Link>{" "}
          when you are ready.
        </p>
      )}
      <Overview
        customer={customer}
        orders={orders || null}
        legacyOrders={legacyOrderHistory.orders || []}
        legacyOrderCount={legacyOrderHistory.count || 0}
      />
    </>
  )
}
