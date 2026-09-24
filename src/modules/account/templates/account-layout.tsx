import React from "react"
import AccountNav from "../components/account-nav"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import type { StaffImpersonationSession } from "@lib/data/staff/impersonation-types"

interface AccountLayoutProps {
  customer: HttpTypes.StoreCustomer | null
  staffCustomer?: HttpTypes.StoreCustomer | null
  staffImpersonation?: StaffImpersonationSession | null
  children: React.ReactNode
}

const AccountLayout: React.FC<AccountLayoutProps> = ({
  customer,
  staffCustomer,
  staffImpersonation,
  children,
}) => {
  const layoutCustomer = customer || staffCustomer

  return (
    <div
      className="bg-gray-50 min-h-[calc(100vh-4rem)]"
      data-testid="account-page"
    >
      <div className="content-container mx-auto max-w-[1600px] py-6 small:py-10">
        {layoutCustomer && (
          <div className="flex flex-col gap-6 small:flex-row large:gap-8">
            <aside className="small:w-[240px] large:w-[260px] shrink-0 small:sticky small:top-24 small:self-start">
              <AccountNav
                customer={layoutCustomer}
                staffCustomer={staffCustomer}
                staffImpersonation={staffImpersonation}
                institutionalTermsEnabled={
                  process.env.GP_INSTITUTIONAL_TERMS_ENABLED === "true"
                }
              />
            </aside>
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        )}

        {!layoutCustomer && <div className="max-w-lg mx-auto">{children}</div>}

        <div className="mt-16 pt-8 border-t border-gray-200">
          <div className="flex flex-col small:flex-row items-start small:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-gyst font-bold text-Charcoal mb-1">
                Got questions?
              </h3>
              <p className="text-sm font-maison-neue text-Charcoal/60">
                Find answers on our customer service page.
              </p>
            </div>
            <LocalizedClientLink
              href="/customer-service"
              className="min-h-[44px] inline-flex items-center gap-2 text-sm font-maison-neue font-semibold text-Gold hover:text-Gold/80 transition-colors"
            >
              Customer Service
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </LocalizedClientLink>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AccountLayout
