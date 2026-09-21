"use server"

import { createHash } from "node:crypto"
import { cookies } from "next/headers"
import { getAuthHeaders } from "./cookies"
import { CONTACT_CONFIRMATION_VERSION } from "@lib/util/customer-contact-state"

const cookieName = "_gp_contact_deferred"
async function sessionMarker(customerId: string) {
  const headers = await getAuthHeaders()
  const authorization =
    "authorization" in headers ? headers.authorization : null
  if (!authorization) return null
  // The deferral belongs to one authenticated session/customer, not the next
  // person using the browser. Never persist the token or a confirmation stamp.
  return createHash("sha256")
    .update(`${customerId}:${CONTACT_CONFIRMATION_VERSION}:${authorization}`)
    .digest("hex")
}
export async function deferContactVerification(customerId: string) {
  const marker = await sessionMarker(customerId)
  if (!marker) throw new Error("Sign in again before continuing.")
  ;(await cookies()).set(cookieName, marker, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
}
export async function isContactVerificationDeferred(customerId: string) {
  const marker = await sessionMarker(customerId)
  return Boolean(marker && (await cookies()).get(cookieName)?.value === marker)
}
