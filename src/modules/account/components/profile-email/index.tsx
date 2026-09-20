"use client"
import { useActionState, useEffect, useState } from "react"
import { HttpTypes } from "@medusajs/types"
import { updateReceiptEmail, ReceiptEmailState } from "@lib/data/receipt-email"

export default function ProfileEmail({
  customer,
  receipt,
  canManage = true,
}: {
  customer: HttpTypes.StoreCustomer
  receipt: ReceiptEmailState | null
  canManage?: boolean
}) {
  const [state, action, pending] = useActionState(updateReceiptEmail, {
    receipt,
    error: null,
    notice: null,
  })
  const current =
    state.receipt && (!receipt || state.receipt.revision >= receipt.revision)
      ? state.receipt
      : receipt
  const [requestId, setRequestId] = useState("")
  useEffect(() => {
    setRequestId(crypto.randomUUID())
  }, [current?.revision])
  const inputClass =
    "w-full rounded-md border border-gray-400 px-3 py-2 text-base"
  const buttonClass =
    "min-h-11 rounded-md bg-Charcoal px-4 py-2 text-white disabled:opacity-50"
  return (
    <section
      className="space-y-4"
      data-testid="account-email-editor"
      aria-labelledby="receipt-email-heading"
    >
      <div>
        <h2 id="receipt-email-heading" className="font-semibold">
          Email addresses
        </h2>
        <p className="mt-1 text-sm">
          Sign-in and password reset: <strong>{customer.email}</strong>
        </p>
      </div>
      {!canManage ? (
        <p>Only the signed-in customer can verify a receipt address.</p>
      ) : !current ? (
        <p role="alert">
          Receipt settings are temporarily unavailable. Refresh the page to try
          again.
        </p>
      ) : (
        <>
          <p>
            Future order receipts: <strong>{current.active_email}</strong>
          </p>
          <p className="text-sm">
            Changing your receipt address does not change your sign-in email,
            marketing choices or receipts for existing orders.
          </p>
          {current.active_status === "delivery_problem" && (
            <p role="alert">
              We cannot deliver to your current receipt address. Verify another
              address or use your sign-in email.
            </p>
          )}
          {state.notice && <p role="status">{state.notice}</p>}
          {state.error && <p role="alert">{state.error}</p>}
          <form action={action} className="space-y-2">
            <input
              type="hidden"
              name="expected_revision"
              value={current.revision}
            />
            <input type="hidden" name="request_id" value={requestId} />
            <label
              htmlFor="receipt_email"
              className="block text-sm font-medium"
            >
              Receipt email
            </label>
            <input
              id="receipt_email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              defaultValue={
                current.suggested_email ||
                current.pending?.email ||
                current.active_email
              }
              className={inputClass}
            />
            <button
              className={buttonClass}
              name="action"
              value="request"
              disabled={pending || !requestId}
            >
              {current.pending ? "Send a new code" : "Send verification code"}
            </button>
            <p className="text-sm text-gray-600">
              Codes expire after 15 minutes. Wait at least one minute before
              requesting another.
            </p>
          </form>
          {current.pending && (
            <div className="space-y-2 border-t pt-4">
              <p>
                Pending verification: <strong>{current.pending.email}</strong>
              </p>
              {current.pending.status === "delivery_problem" ? (
                <p role="alert">
                  The verification email could not be delivered. Check the
                  address or contact customer service.
                </p>
              ) : current.pending.status === "expired" ||
                current.pending.status === "locked" ? (
                <p role="alert">
                  This code has expired or reached its attempt limit. Request a
                  new code.
                </p>
              ) : (
                <form action={action} className="space-y-2">
                  <input
                    type="hidden"
                    name="challenge_id"
                    value={current.pending.id}
                  />
                  <label
                    htmlFor="receipt_code"
                    className="block text-sm font-medium"
                  >
                    Verification code
                  </label>
                  <input
                    key={current.pending.id}
                    id="receipt_code"
                    name="code"
                    type="text"
                    autoComplete="one-time-code"
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                    maxLength={32}
                    className={inputClass}
                    aria-describedby="receipt-code-help"
                  />
                  <p id="receipt-code-help" className="text-sm">
                    Paste the code from the email. Hyphens are optional.
                  </p>
                  <button
                    className={buttonClass}
                    name="action"
                    value="verify"
                    disabled={pending}
                  >
                    Verify receipt email
                  </button>
                </form>
              )}
            </div>
          )}
          {(current.pending ||
            current.active_source === "verified_preference") && (
            <form action={action}>
              <input
                type="hidden"
                name="expected_revision"
                value={current.revision}
              />
              <input type="hidden" name="request_id" value={requestId} />
              <button
                name="action"
                value="revoke"
                disabled={pending || !requestId}
                className="min-h-11 underline"
              >
                Use sign-in email and cancel pending changes
              </button>
            </form>
          )}
        </>
      )}
    </section>
  )
}
