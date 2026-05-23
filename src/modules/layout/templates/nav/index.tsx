import { listRegions } from "@lib/data/regions"
import { HeaderNavQuery } from "@lib/data/strapi/header"
import type { HeaderNavLink } from "@lib/data/strapi/header"
import type { HttpTypes } from "@medusajs/types"
import strapiClient from "@lib/strapi"
import { withTimeout } from "@lib/util/promise-timeout"
import { augmentHeaderNav } from "@lib/util/header-nav"
import AnnouncementBarProvider from "../../../../components/announcement-bar-provider"
import Header from "./header"
import Menu from "./menu"

type NavProps = {
  customer?: HttpTypes.StoreCustomer | null
}

export default async function Nav({ customer }: NavProps = {}) {
  const [navLinksData, regions] = await Promise.all([
    withTimeout(
      strapiClient.request<any>(HeaderNavQuery).catch(() => null),
      1500,
      null,
      "nav links"
    ),
    withTimeout(
      listRegions().catch(() => []),
      1000,
      [],
      "nav regions"
    ),
  ])
  const navLinks: HeaderNavLink[] = augmentHeaderNav(
    navLinksData?.header?.HeaderNav || []
  )
  const phoneNumber: string | null = navLinksData?.header?.PhoneNumber || null
  const navCounts = {}

  return (
    <>
      <AnnouncementBarProvider />
      <Header
        navLinks={navLinks}
        regions={regions || []}
        phoneNumber={phoneNumber}
        customer={customer}
        navCounts={navCounts}
      />
      <Menu navLinks={navLinks} navCounts={navCounts} />
    </>
  )
}
