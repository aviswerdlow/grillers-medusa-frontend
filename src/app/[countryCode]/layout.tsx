import { notFound } from "next/navigation"

import { getRegion } from "@lib/data/regions"

export default async function CountryLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await params
  const normalizedCode = countryCode.toLowerCase()

  // Dotted legacy paths bypass middleware. They must not render the homepage
  // under a bogus country segment with an indexable self-canonical.
  if (!/^[a-z]{2}$/.test(normalizedCode)) {
    notFound()
  }

  const defaultRegion = (process.env.NEXT_PUBLIC_DEFAULT_REGION || "us").toLowerCase()
  if (normalizedCode !== defaultRegion && !(await getRegion(normalizedCode))) {
    notFound()
  }

  return children
}
