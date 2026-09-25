"use client"

import { useActionState } from "react"
import { submitInvoiceApplication } from "@lib/data/invoice-applications"
import { Text, Input, Label, Textarea } from "@medusajs/ui"
import { SubmitButton } from "@modules/checkout/components/submit-button"
import { CheckCircleMiniSolid } from "@medusajs/icons"

export default function InvoiceTermsForm() {
  const [state, formAction] = useActionState(submitInvoiceApplication, {
    success: false,
    error: null,
  })

  if (state.success) {
    return (
      <div className="flex gap-x-2 items-center p-4 bg-neutral-50 shadow-borders-base">
        <CheckCircleMiniSolid className="w-5 h-5 text-emerald-500 shrink-0" />
        <div className="flex flex-col">
          <Text className="text-Charcoal">Application submitted</Text>
          <Text className="text-Charcoal/60 text-sm">
            We&apos;ll review your request and email you once it&apos;s approved.
          </Text>
        </div>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-y-1">
          <Label size="small" weight="plus">
            Business name *
          </Label>
          <Input name="business_name" placeholder="Acme Catering" required />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label size="small" weight="plus">
            Tax ID / EIN
          </Label>
          <Input name="tax_id" placeholder="58-1234567" />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label size="small" weight="plus">
            Contact name *
          </Label>
          <Input name="contact_name" required />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label size="small" weight="plus">
            Contact email *
          </Label>
          <Input name="contact_email" type="email" required />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label size="small" weight="plus">
            Contact phone
          </Label>
          <Input name="contact_phone" placeholder="404-555-0143" />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label size="small" weight="plus">
            Requested credit limit (USD)
          </Label>
          <Input
            name="requested_credit_limit"
            inputMode="numeric"
            placeholder="2500"
          />
        </div>
      </div>

      <div className="flex flex-col gap-y-1">
        <Label size="small" weight="plus">
          Anything else?
        </Label>
        <Textarea
          name="notes"
          placeholder="Typical order volume, frequency, anything we should know."
        />
      </div>

      {state.error ? (
        <Text className="text-rose-500 text-sm">{state.error}</Text>
      ) : null}

      <SubmitButton className="w-fit">Submit application</SubmitButton>
    </form>
  )
}
