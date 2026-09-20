"use server"
import { sdk } from "@lib/config"
import { getAuthHeaders, getCacheTag } from "./cookies"
import { getStaffImpersonationSession } from "./staff/impersonation"
import { readStaffImpersonationCookie } from "./staff/session-cookie"
import { revalidateTag } from "next/cache"

export type ReceiptEmailState = {
  revision: number
  login_email: string
  active_email: string
  active_source: string
  active_status: string
  verified_at: string | null
  suggested_email: string | null
  pending: {
    id: string
    email: string
    status: string
    expires_at: string
    retry_at: string | null
  } | null
}
export type ReceiptEmailActionState = {
  receipt: ReceiptEmailState | null
  error: string | null
  notice: string | null
}
async function customerOnly() {
  if (
    (await readStaffImpersonationCookie()) ||
    (await getStaffImpersonationSession())
  )
    throw new Error("Customer sign-in required")
}
export async function retrieveReceiptEmail(): Promise<ReceiptEmailState | null> {
  try {
    await customerOnly()
    const r = await sdk.client.fetch<{ receipt: ReceiptEmailState }>(
      "/store/customers/me/receipt-email",
      {
        method: "GET",
        headers: { ...(await getAuthHeaders()) },
        cache: "no-store",
      }
    )
    return r.receipt
  } catch {
    return null
  }
}
export async function requestReceiptEmailCode(
  email: string,
  requestId: string
) {
  await customerOnly()
  const current = await retrieveReceiptEmail()
  if (!current) throw new Error("Receipt settings unavailable")
  return sdk.client.fetch<{ receipt: ReceiptEmailState }>(
    "/store/customers/me/receipt-email",
    {
      method: "POST",
      headers: { ...(await getAuthHeaders()) },
      body: {
        action: "request",
        email,
        request_id: requestId,
        expected_revision: current.revision,
      },
    }
  )
}
export async function updateReceiptEmail(
  _state: ReceiptEmailActionState,
  form: FormData
): Promise<ReceiptEmailActionState> {
  try {
    await customerOnly()
    const action = String(form.get("action") || "")
    if (!["request", "verify", "revoke"].includes(action))
      throw new Error("Invalid action")
    const body =
      action === "verify"
        ? {
            action,
            challenge_id: form.get("challenge_id"),
            code: form.get("code"),
          }
        : {
            action,
            email: form.get("email"),
            request_id: form.get("request_id"),
            expected_revision: Number(form.get("expected_revision")),
          }
    const result = await sdk.client.fetch<{ receipt: ReceiptEmailState }>(
      "/store/customers/me/receipt-email",
      { method: "POST", headers: { ...(await getAuthHeaders()) }, body }
    )
    revalidateTag(await getCacheTag("customers"))
    return {
      receipt: result.receipt,
      error: null,
      notice:
        action === "request"
          ? "Check the requested mailbox for a code. Your current receipt address stays active until verification."
          : action === "verify"
          ? "Receipt email verified for future orders. Your sign-in email and existing orders stay the same."
          : "Future receipts will use your sign-in email. Existing orders keep their receipt address.",
    }
  } catch (e: any) {
    return {
      receipt: await retrieveReceiptEmail(),
      notice: null,
      error:
        e?.status === 429
          ? "Please wait at least a minute between requests. Up to five codes can be requested per hour."
          : e?.status === 400
          ? "That code or request could not be accepted. Check it or request a new code."
          : e?.status === 409
          ? "Your settings changed or this address cannot be activated. Review the current details; contact customer service if needed."
          : "We could not update your receipt settings. Please try again. Only the signed-in customer can make this change.",
    }
  }
}
