import { retrieveReceiptEmail } from "@lib/data/receipt-email"
export const dynamic = "force-dynamic"

import ProfileName from "@modules/account/components/profile-name"
import ProfileEmail from "@modules/account/components/profile-email"
import ProfilePhone from "@modules/account/components/profile-phone"
import ProfileSmsMarketing from "@modules/account/components/profile-sms-marketing"
import ProfilePassword from "@modules/account/components/profile-password"
import ProfileBillingAddress from "@modules/account/components/profile-billing-address"
import { notFound } from "next/navigation"
import { retrieveCustomer } from "@lib/data/customer"
import { getStaffImpersonationSession } from "@lib/data/staff/impersonation"
import { readStaffImpersonationCookie } from "@lib/data/staff/session-cookie"
import { retrieveSmsMarketingStatus } from "@lib/data/sms-marketing"
import { listRegions } from "@lib/data/regions"
import { Metadata } from "next"

export const metadata: Metadata = {
  title: "Profile | Grillers Pride",
  description: "Manage your account profile information.",
}

export default async function Profile() {
  const customer = await retrieveCustomer()
  const staffCookieContext = await readStaffImpersonationCookie()
    .then((session) => ({ checked: true, session }))
    .catch(() => ({ checked: false, session: null }))
  const staffContext = await getStaffImpersonationSession()
    .then((session) => ({ checked: true, session }))
    .catch(() => ({ checked: false, session: null }))
  const staffImpersonation = staffContext.session
  // The verified helper intentionally returns null when its staff lookup fails,
  // which is indistinguishable from "no session." For this consent surface,
  // also require a successful direct read of the signed cookie and no raw
  // session so a transient verification failure can never reveal the form.
  const canManageSmsMarketing =
    staffCookieContext.checked &&
    !staffCookieContext.session &&
    staffContext.checked &&
    !staffImpersonation
  const smsMarketingStatus =
    canManageSmsMarketing ? await retrieveSmsMarketingStatus() : null
  const receiptEmail = canManageSmsMarketing ? await retrieveReceiptEmail() : null
  const regions = await listRegions()

  if (!customer || !regions) {
    notFound()
  }

  return (
    <div className="space-y-6" data-testid="profile-page-wrapper">
      <div>
        <h1 className="text-h3 font-gyst font-bold text-Charcoal">
          My Profile
        </h1>
        <p className="text-sm font-maison-neue text-Charcoal/50 mt-1">
          Manage your account information
        </p>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <ProfileName customer={customer} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <ProfileEmail customer={customer} receipt={receiptEmail} canManage={canManageSmsMarketing} />
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <ProfilePhone customer={customer} marketingStatus={smsMarketingStatus} />
        </div>
        {canManageSmsMarketing && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <ProfileSmsMarketing
              customer={customer}
              marketingStatus={smsMarketingStatus}
            />
          </div>
        )}
        {!staffImpersonation && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <ProfilePassword customer={customer} />
          </div>
        )}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <ProfileBillingAddress customer={customer} regions={regions} />
        </div>
      </div>
    </div>
  )
}
