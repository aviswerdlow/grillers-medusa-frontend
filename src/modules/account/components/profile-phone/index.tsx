"use client"

import { HttpTypes } from "@medusajs/types"
import { useEffect, useState, useActionState } from "react"
import Input from "@modules/common/components/input"
import AccountInfo from "../account-info"
import { formatPhone, stripPhone } from "@lib/util/format-phone"
import { contactRevision } from "@lib/util/customer-contact-state"
import {
  hasCurrentSmsSubscription,
  SMS_MARKETING_DISCLOSURE,
  SMS_MARKETING_OPT_IN_LABEL,
} from "@lib/util/sms-consent"
import { updatePrimaryContact } from "@lib/data/primary-contact"

import type { SmsMarketingStatusResponse } from "@lib/data/sms-marketing"

type Props = { customer: HttpTypes.StoreCustomer; marketingStatus?: SmsMarketingStatusResponse | null }

export default function ProfilePhone({ customer, marketingStatus = null }: Props) {
  const [smsOptIn, setSmsOptIn] = useState(hasCurrentSmsSubscription(marketingStatus, customer.phone))
  useEffect(() => { setSmsOptIn(hasCurrentSmsSubscription(marketingStatus, customer.phone)) },
    [customer.phone, marketingStatus?.status, marketingStatus?.phone])
  const [successState, setSuccessState] = useState(false)
  const [requestId, setRequestId] = useState("")
  useEffect(() => {
    setRequestId(crypto.randomUUID())
  }, [])
  const [state, formAction] = useActionState(updatePrimaryContact, {
    error: null,
    success: false,
  })
  useEffect(() => {
    setSuccessState(state.success)
  }, [state])
  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="sms_marketing_choice_unavailable" value={String(!marketingStatus)} />
      <input
        type="hidden"
        name="contact_revision"
        value={contactRevision(customer.metadata)}
      />
      <input type="hidden" name="contact_request_id" value={requestId} />
      <AccountInfo
        label="Primary mobile"
        currentInfo={
          customer.phone ? formatPhone(stripPhone(customer.phone)) : ""
        }
        isSuccess={successState}
        isError={!!state.error}
        errorMessage={state.error || undefined}
        clearState={() => {
          setSuccessState(false)
          setRequestId(crypto.randomUUID())
        }}
        data-testid="account-phone-editor"
      >
        <div className="grid grid-cols-1 gap-y-3">
          {"notice" in state && state.notice && (
            <p role="status" className="text-sm">
              {state.notice}
            </p>
          )}
          <Input
            label="Primary mobile"
            name="phone"
            id="phone"
            type="tel"
            autoComplete="tel"
            required
            defaultValue={
              customer.phone ? formatPhone(stripPhone(customer.phone)) : ""
            }
            onChange={() => setSmsOptIn(false)}
            data-testid="phone-input"
          />
          <p className="text-small-regular text-ui-fg-subtle">
            Save one primary mobile. This does not verify ownership by text.
            Past orders keep their recorded contact details; contact the office
            if an existing order needs a change.
          </p>
          <label className="flex items-start gap-3 text-small-regular">
            <input
              type="checkbox"
              name="sms_marketing_opt_in"
              checked={smsOptIn}
              disabled={!marketingStatus}
              onChange={(event) => setSmsOptIn(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0"
            />
            <span>
              {SMS_MARKETING_OPT_IN_LABEL}
              <span className="mt-1 block text-xs">
                {SMS_MARKETING_DISCLOSURE}
              </span>
            </span>
          </label>
          {!marketingStatus && <p role="status" className="text-xs">Text preferences are unavailable. Your existing choice will be kept for an unchanged number.</p>}
          <p className="text-xs text-ui-fg-subtle">
            Leave this unchecked to stop marketing texts. Order-update texts
            have their own optional choice at checkout. Past orders are not
            redirected to a new number.
          </p>
        </div>
      </AccountInfo>
    </form>
  )
}
