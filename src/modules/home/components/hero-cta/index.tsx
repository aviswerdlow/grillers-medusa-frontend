"use client"

import Link from "next/link"
import { useHomePersonalization } from "@modules/home/components/home-personalization/use-home-personalization"

export default function HeroCta({
  countryCode,
  editorialText,
  editorialHref,
}: {
  countryCode: string
  editorialText?: string | null
  editorialHref?: string | null
}) {
  const { isLoggedIn, hasOrders } = useHomePersonalization()
  const fallbackCta =
    isLoggedIn && hasOrders
      ? {
          text: "Reorder your favorites",
          href: `/${countryCode}/account/reorder`,
        }
      : {
          text: "Shop Kosher Beef",
          href: `/${countryCode}/collections/kosher-beef`,
        }
  const ctaText = editorialText || fallbackCta.text
  const ctaHref = editorialHref || fallbackCta.href

  if (!ctaText || !ctaHref) {
    return null
  }

  return (
    <Link
      href={ctaHref}
      className="inline-flex min-h-[44px] items-center text-white font-maison-neue font-bold text-sm px-5 py-2 rounded-[5px] border border-white/60 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      {ctaText}
    </Link>
  )
}
