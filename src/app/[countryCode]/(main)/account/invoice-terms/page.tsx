export const dynamic = "force-dynamic"

import { Metadata } from "next"
import { notFound } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import InvoiceTermsForm from "@modules/account/components/invoice-terms-form"
import { canShowInvoiceCheckout } from "@lib/util/institutional-terms"

export const metadata: Metadata = {
  title: "Invoice terms | Grillers Pride",
  description: "Request invoice terms for your business orders.",
}

export default async function InvoiceTerms() {
  const customer = await retrieveCustomer().catch(() => null)

  if (!customer) {
    notFound()
  }

  const meta = (customer.metadata ?? {}) as Record<string, unknown>
  const approved = meta.gp_offline_payment_approved === true
  const invoiceCheckoutEnabled = canShowInvoiceCheckout(approved)
  const status =
    typeof meta.gp_invoice_application_status === "string"
      ? meta.gp_invoice_application_status
      : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h3 font-gyst font-bold text-Charcoal">
          Invoice terms
        </h1>
        <p className="text-sm font-maison-neue text-Charcoal/50 mt-1">
          Request invoice terms for your business orders.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {approved ? (
          <p className="text-Charcoal font-maison-neue">
            {invoiceCheckoutEnabled ? (
              <>
                Your account is approved for invoice terms. Choose &quot;Pay by
                invoice&quot; at checkout when available.
              </>
            ) : (
              <>
                Your invoice terms application is approved. Invoice payment is
                not available at checkout yet; please use a card for current
                orders.
              </>
            )}
          </p>
        ) : status === "pending" ? (
          <p className="text-Charcoal font-maison-neue">
            Your application is under review. We&apos;ll email you once it&apos;s
            approved.
          </p>
        ) : (
          <>
            {status === "declined" ? (
              <p className="text-Charcoal/70 font-maison-neue mb-4">
                A previous application wasn&apos;t approved. You&apos;re welcome
                to apply again below.
              </p>
            ) : null}
            <InvoiceTermsForm />
          </>
        )}
      </div>
    </div>
  )
}
