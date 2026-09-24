import { listRegions } from "@lib/data/regions"
import { HeaderNavQuery } from "@lib/data/strapi/header"
import { GetFooterQuery, type FooterData } from "@lib/data/strapi/footer"
import type { HeaderNavLink } from "@lib/data/strapi/header"
import { cachedStrapiRequest } from "@lib/strapi"
import { withLayoutDataFallback } from "@lib/layout-ops-alerts"
import { augmentHeaderNav } from "@lib/util/header-nav"
import AnnouncementBarProvider from "../../../../components/announcement-bar-provider"
import Header from "./header"
import Menu from "./menu"

const NAV_LAYOUT_PATH = "src/modules/layout/templates/nav/index.tsx"

export default async function Nav() {
  const [navLinksData, regions, footerData] = await Promise.all([
    withLayoutDataFallback({
      promise: cachedStrapiRequest<any>("header-nav", HeaderNavQuery),
      fallback: null,
      surface: "header_nav",
      stage: "strapi_header_nav",
      path: NAV_LAYOUT_PATH,
      timeoutMs: 1500,
    }),
    withLayoutDataFallback({
      promise: listRegions({ personalizedCacheTag: false }),
      fallback: [],
      surface: "regions",
      stage: "medusa_regions",
      path: NAV_LAYOUT_PATH,
      timeoutMs: 1000,
    }),
    withLayoutDataFallback({
      promise: cachedStrapiRequest<FooterData>("footer", GetFooterQuery),
      fallback: null,
      surface: "footer",
      stage: "strapi_footer",
      path: NAV_LAYOUT_PATH,
      timeoutMs: 1500,
    }),
  ])
  const navLinks: HeaderNavLink[] = augmentHeaderNav(
    navLinksData?.header?.HeaderNav || []
  )
  const phoneNumber: string | null =
    navLinksData?.header?.PhoneNumber || footerData?.footer?.ContactPhone || null
  const navCounts = {}

  return (
    <>
      <AnnouncementBarProvider />
      <Header
        navLinks={navLinks}
        regions={regions || []}
        phoneNumber={phoneNumber}
        navCounts={navCounts}
      />
      <Menu navLinks={navLinks} navCounts={navCounts} />
    </>
  )
}
