import LocalizedClientLink from "@modules/common/components/localized-client-link"
import AccountButton from "@modules/layout/components/account-button"
import CartButton from "@modules/layout/components/cart-button"
import HeaderCountrySelect from "@modules/layout/components/header-country-select"
import Image from "next/image"
import type { HeaderNavLink } from "@lib/data/strapi/header"
import type { HttpTypes } from "@medusajs/types"
import { MobileNavMenu } from "./menu"
import SearchBar from "./search-bar"
import MobileSearch from "./mobile-search"
import { ShieldCheck } from "lucide-react"

type HeaderProps = {
  navLinks: HeaderNavLink[]
  regions: HttpTypes.StoreRegion[]
  phoneNumber?: string | null
  navCounts?: Record<string, number | null>
}

const Header = ({ navLinks, regions, phoneNumber, navCounts }: HeaderProps) => {
  return (
    <header className="relative inset-x-0 z-40 bg-white border-b border-[#000/25]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-black focus:border focus:border-black focus:rounded"
      >
        Skip to main content
      </a>
      <nav className="flex items-center justify-between w-full h-[106px] px-3 lg:px-8 gap-2">
        <MobileNavMenu navLinks={navLinks} navCounts={navCounts} />

        <div className="flex items-center gap-4">
          <LocalizedClientLink
            href="/"
            data-testid="nav-store-link"
            aria-label="Griller's Pride home"
            className="min-h-[44px] flex items-center gap-2"
          >
            <Image
              src={"/images/logos/logo-mobile.svg"}
              alt=""
              width={82}
              height={36}
              quality={100}
              priority
              aria-hidden="true"
              className="h-[36px] w-[82px]"
            />
            <span className="hidden md:inline text-xl font-rexton font-bold text-[#2D479D] uppercase tracking-wider">
              Griller&apos;s <span className="text-Gold">&#9733;</span> Pride
            </span>
          </LocalizedClientLink>
        </div>

        {/* Search Bar */}
        <div className="hidden md:block w-1/2 max-w-[558px] h-[50px] mx-4">
          <SearchBar />
          {/* <input
            type="search"
            placeholder="Search..."
            className="w-full h-full border rounded-[5px] border-Charcoal px-5 py-3 focus:outline-none focus:border-gray-500 text-p-md text-Pewter"
          /> */}
        </div>

        <div className="flex items-center gap-8">
          {/* Country Selector - Desktop */}
          <div className="hidden md:block">
            <HeaderCountrySelect regions={regions} />
          </div>

          {phoneNumber && (
            <a
              href={`tel:${phoneNumber.replace(/\D/g, "")}`}
              className="hidden md:inline-block text-p-md font-maison-neue text-Charcoal hover:underline"
            >
              {phoneNumber}
            </a>
          )}

          <div className="flex items-center gap-1 sm:gap-4">
            {/* Mobile Phone (tap-to-call) */}
            {phoneNumber && (
              <a
                href={`tel:${phoneNumber.replace(/\D/g, "")}`}
                className="md:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center text-Charcoal hover:text-Gold focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold rounded"
                aria-label={`Call Griller's Pride at ${phoneNumber}`}
              >
                <svg
                  className="w-6 h-6 fill-current"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                </svg>
              </a>
            )}

            {/* Mobile Search */}
            <MobileSearch />

            <div className="h-full flex items-center">
              <AccountButton />
            </div>
            <CartButton />
          </div>
        </div>
      </nav>
      <div className="hidden md:flex items-center justify-center gap-2 border-t border-Charcoal/10 bg-Scroll/70 px-4 py-2 font-maison-neue text-[12px] text-Charcoal">
        <ShieldCheck
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-Charcoal"
          strokeWidth={1.75}
        />
        <span className="font-semibold">Kosher supervision shown by item</span>
        {[
          "OU",
          "Chassidish",
          "CHK",
          "AgriStar / Weismandl",
          "AgriStar Lubavich",
        ].map((cert) => (
          <LocalizedClientLink
            key={cert}
            href="/kashruth/hechsherim"
            prefetch={false}
            className="inline-flex h-6 min-w-10 items-center justify-center rounded-full border border-Charcoal/20 bg-white px-2 font-maison-neue-mono text-[11px] font-semibold tracking-wide transition-colors hover:border-Gold hover:text-Gold focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold"
          >
            {cert}
          </LocalizedClientLink>
        ))}
        <LocalizedClientLink
          href="/kashruth/hechsherim"
          prefetch={false}
          className="ml-1 font-maison-neue-mono text-[11px] font-semibold uppercase tracking-wide underline underline-offset-4 transition-colors hover:text-Gold focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold"
        >
          Supervision details
        </LocalizedClientLink>
      </div>
    </header>
  )
}

export default Header
