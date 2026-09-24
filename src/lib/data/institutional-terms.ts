import "server-only"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"

export type CustomerInstitutionalTerms = {
  status: "disabled" | "approved" | "held" | "denied"
  reason: string | null
  terms: { name: string; creditLimitCents: number; openInvoiceCents: number } | null
  source: { revision: string; lastSuccess: string } | null
}

const disabled: CustomerInstitutionalTerms = {
  status: "disabled", reason: "feature_disabled", terms: null, source: null,
}
const unavailable: CustomerInstitutionalTerms = {
  status: "held", reason: "source_unavailable", terms: null, source: null,
}

export function parseCustomerInstitutionalTerms(value: unknown): CustomerInstitutionalTerms {
  if (!value || typeof value !== "object") return unavailable
  const body = value as Record<string, any>
  if (body.status === "approved") {
    const terms = body.terms
    if (typeof terms?.name !== "string" || !terms.name.trim() ||
        !Number.isSafeInteger(terms.creditLimitCents) || terms.creditLimitCents <= 0 ||
        !Number.isSafeInteger(terms.openInvoiceCents) || terms.openInvoiceCents < 0 ||
        typeof body.source?.revision !== "string" || !body.source.revision ||
        typeof body.source?.lastSuccess !== "string" || !body.source.lastSuccess) {
      return unavailable
    }
    return {
      status: "approved", reason: null,
      terms: {
        name: terms.name.trim(),
        creditLimitCents: terms.creditLimitCents,
        openInvoiceCents: terms.openInvoiceCents,
      },
      source: { revision: body.source.revision, lastSuccess: body.source.lastSuccess },
    }
  }
  if (["disabled", "held", "denied"].includes(body.status)) {
    return {
      status: body.status,
      reason: typeof body.reason === "string" ? body.reason : null,
      terms: null,
      source: null,
    }
  }
  return unavailable
}

export async function getCustomerInstitutionalTerms(): Promise<CustomerInstitutionalTerms> {
  if (process.env.GP_INSTITUTIONAL_TERMS_ENABLED !== "true") return disabled
  try {
    const headers = await getAuthHeaders()
    if (!("authorization" in headers) || !headers.authorization) return unavailable
    const result = await sdk.client.fetch<unknown>(
      "/store/customers/me/institutional-terms",
      { method: "GET", headers, cache: "no-store" }
    )
    return parseCustomerInstitutionalTerms(result)
  } catch {
    return unavailable
  }
}
