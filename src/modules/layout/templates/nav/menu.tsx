"use client"
import React, { Fragment, useState, useRef } from "react"
import { Dialog, DialogPanel, Transition } from "@headlessui/react"
import classNames from "classnames"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Image from "next/image"
import type { HeaderNavLink } from "@lib/data/strapi/header"
import { sectionHref } from "@lib/util/header-nav"
import { Award, Clock, Star } from "lucide-react"

// Icon mapper for bottom bar certifications
const iconMap = {
  award: Award,
  clock: Clock,
  star: Star,
}

// Live count badge — formats as "(N)" right-aligned next to the link
// label. `null` means we couldn't compute a count for that URL (unknown
// shape, or Strapi was unreachable when the page rendered) — render nothing
// rather than a misleading 0.
//
// Gated behind NEXT_PUBLIC_SHOW_NAV_COUNTS so the counts stay off in
// production while remaining a one-flag toggle for catalog QA. The PLP
// filter sidebar lives in a different code path and continues to show
// counts unconditionally — that's the correct surface for them.
type NavCounts = Record<string, number | null>

const SHOW_NAV_COUNTS = process.env.NEXT_PUBLIC_SHOW_NAV_COUNTS === "true"

const formatCount = (n: number | null | undefined): string | null => {
  if (!SHOW_NAV_COUNTS) return null
  if (n == null) return null
  return `(${n.toLocaleString("en-US")})`
}

// Mobile version with sections
export const MobileNavMenu = ({
  navLinks,
  navCounts,
}: {
  navLinks: HeaderNavLink[]
  navCounts?: NavCounts
}) => {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)

  const handleKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setExpandedIndex(expandedIndex === idx ? null : idx)
    } else if (e.key === "Escape" && expandedIndex === idx) {
      setExpandedIndex(null)
    }
  }

  return (
    <>
      <button
        type="button"
        className="md:hidden min-w-[44px] min-h-[44px] inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2 rounded"
        aria-label="Open navigation menu"
        aria-expanded={mobileOpen}
        aria-controls="mobile-menu"
        onClick={() => setMobileOpen(true)}
      >
        <Image
          src={"/images/icons/hamburger.svg"}
          alt=""
          width={24}
          height={24}
          aria-hidden="true"
        />
      </button>

      <Dialog
        as="div"
        className="relative z-50"
        open={mobileOpen}
        onClose={setMobileOpen}
      >
        <Transition
          as={Fragment}
          show={mobileOpen}
          enter="transition-opacity duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        </Transition>

        <DialogPanel
          id="mobile-menu"
          className="fixed inset-y-0 left-0 z-40 w-full max-w-sm bg-white shadow-lg p-6 overflow-y-auto"
        >
          <div className="flex justify-between items-center mb-4">
            <h2
              className="text-lg font-semibold font-maison-neue-mono uppercase"
              id="mobile-menu-title"
            >
              Menu
            </h2>
            <button
              onClick={() => setMobileOpen(false)}
              className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold rounded"
              aria-label="Close navigation menu"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <nav
            className="flex flex-col space-y-2"
            aria-labelledby="mobile-menu-title"
          >
            {navLinks?.map((item, idx) => (
              <div key={item.id} role="none">
                <button
                  onClick={() =>
                    setExpandedIndex(expandedIndex === idx ? null : idx)
                  }
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  className="px-4 py-2 min-h-[44px] w-full flex items-center justify-between text-p-sm-mono font-maison-neue-mono uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold rounded"
                  aria-expanded={expandedIndex === idx}
                  aria-controls={`submenu-${idx}`}
                >
                  <span>{item.title}</span>
                  <Image
                    className={classNames(
                      "ml-1 transform transition-transform duration-200",
                      {
                        "rotate-180": expandedIndex === idx,
                      }
                    )}
                    src="/images/icons/chevron.svg"
                    width={10}
                    height={5}
                    alt=""
                    aria-hidden="true"
                  />
                </button>
                {expandedIndex === idx && (
                  <div
                    id={`submenu-${idx}`}
                    className="ml-4 mt-1"
                    role="group"
                    aria-label={`${item.title} submenu`}
                  >
                    {item.sections.map((section, sectionIdx) => {
                      const headerUrl = sectionHref(section)
                      const headerCountLabel = formatCount(
                        navCounts?.[headerUrl]
                      )
                      return (
                        <div key={sectionIdx} className="mb-3">
                          <button
                            onClick={() =>
                              setExpandedSection(
                                expandedSection === `${idx}-${sectionIdx}`
                                  ? null
                                  : `${idx}-${sectionIdx}`
                              )
                            }
                            className="w-full min-h-[44px] text-left px-4 py-1 text-xs font-semibold text-gray-700 flex items-center justify-between"
                          >
                            <span className="flex items-baseline gap-2">
                              <span>{section.title}</span>
                              {headerCountLabel && (
                                <span className="text-gray-400 text-[11px] font-normal tabular-nums">
                                  {headerCountLabel}
                                </span>
                              )}
                            </span>
                            <Image
                              className={classNames(
                                "ml-1 transform transition-transform duration-200",
                                {
                                  "rotate-180":
                                    expandedSection === `${idx}-${sectionIdx}`,
                                }
                              )}
                              src="/images/icons/chevron.svg"
                              width={8}
                              height={4}
                              alt=""
                              aria-hidden="true"
                            />
                          </button>
                          {expandedSection === `${idx}-${sectionIdx}` && (
                            <div className="mt-1 flex flex-col space-y-1">
                              {section.items.map((navItem, itemIdx) => {
                                const countLabel = formatCount(
                                  navCounts?.[navItem.Url]
                                )
                                return (
                                  <LocalizedClientLink
                                    key={itemIdx}
                                    href={navItem.Url}
                                    className="block min-h-[44px] px-6 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold flex items-center"
                                    onClick={() => setMobileOpen(false)}
                                  >
                                    {navItem.Text}
                                    {countLabel && (
                                      <span className="text-gray-400 text-[11px] tabular-nums ml-1.5">
                                        {countLabel}
                                      </span>
                                    )}
                                  </LocalizedClientLink>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </DialogPanel>
      </Dialog>
    </>
  )
}

// Pack sections into columns. Hard cap at 5 columns. When sections > 5,
// pick the contiguous split into exactly 5 ordered groups that minimizes the
// tallest column height (header + items count). Ties prefer the more
// back-loaded layout so flagship sections on the left stay in their own
// column and small/short sections double up at the end.
const MAX_COLUMNS = 5
type NavSection = HeaderNavLink["sections"][number]
type PackedColumn = NavSection[]

function packSectionsIntoColumns(sections: NavSection[]): PackedColumn[] {
  const N = sections.length
  if (N === 0) return []
  const K = Math.min(N, MAX_COLUMNS)
  if (K === N) return sections.map((s) => [s])

  // Weight = 1 (section header) + number of items rendered under it.
  const weights = sections.map((s) => 1 + s.items.length)

  // Enumerate all contiguous ordered partitions of N into K non-empty groups
  // by choosing K-1 cut positions in [1..N-1]. Number of options is small
  // (C(N-1, K-1)); for N=8,K=5 that's 35.
  const allBounds: number[][] = []
  const gen = (start: number, picks: number[]) => {
    if (picks.length === K - 1) {
      allBounds.push([0, ...picks, N])
      return
    }
    const remaining = K - 1 - picks.length
    for (let i = start; i <= N - remaining - 1; i++) {
      picks.push(i + 1)
      gen(i + 1, picks)
      picks.pop()
    }
  }
  gen(0, [])

  let best: number[] | null = null
  let bestMax = Infinity
  let bestSizes: number[] | null = null

  for (const bounds of allBounds) {
    let maxW = 0
    const sizes: number[] = []
    for (let g = 0; g < K; g++) {
      let w = 0
      for (let j = bounds[g]; j < bounds[g + 1]; j++) w += weights[j]
      if (w > maxW) maxW = w
      sizes.push(bounds[g + 1] - bounds[g])
    }
    if (maxW < bestMax || (maxW === bestMax && lexSmaller(sizes, bestSizes))) {
      bestMax = maxW
      best = bounds
      bestSizes = sizes
    }
  }

  const result: PackedColumn[] = []
  for (let g = 0; g < K; g++) {
    result.push(sections.slice(best![g], best![g + 1]))
  }
  return result
}

// Lex compare: a < b iff at the first differing index, a[i] < b[i]. Used as
// tiebreaker — lex-smaller sizes mean the larger groups land at the end of
// the row (back-loaded), which is what we want for ties.
function lexSmaller(a: number[], b: number[] | null): boolean {
  if (!b) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true
    if (a[i] > b[i]) return false
  }
  return false
}

// Desktop mega menu
const DesktopNavMenu = ({
  navLinks,
  navCounts,
}: {
  navLinks: HeaderNavLink[]
  navCounts?: NavCounts
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = (menuId: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    if (activeMenu !== menuId) {
      setIsAnimating(true)
      setActiveMenu(menuId)
      setTimeout(() => setIsAnimating(false), 50)
    }
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveMenu(null)
      setIsAnimating(false)
    }, 100)
  }

  return (
    <div className="hidden md:block sticky top-0 inset-x-0 z-30">
      {/* Navigation Bar */}
      <nav
        className="bg-Charcoal border-b border-white/10"
        aria-label="Main navigation"
      >
        <ul
          className="flex items-center justify-center space-x-16 py-2 h-12"
          role="list"
        >
          {navLinks.map((item) => (
            <li
              key={item.id}
              className="relative"
              onMouseEnter={() => handleMouseEnter(item.id)}
              onMouseLeave={handleMouseLeave}
            >
              <button
                type="button"
                className="flex items-center text-p-sm-mono font-maison-neue-mono uppercase text-white hover:text-Gold gap-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2 rounded group"
                aria-expanded={activeMenu === item.id}
              >
                {item.title}
                <svg
                  className={classNames(
                    "ml-1 transform transition-transform duration-200 text-Gold",
                    {
                      "rotate-180": activeMenu === item.id,
                    }
                  )}
                  width="10"
                  height="5"
                  viewBox="0 0 10 5"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M0 0L5 5L10 0H0Z" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mega Menu Overlay */}
      {activeMenu && (
        <div
          className="absolute top-full left-0 w-full bg-gray-100 shadow-xl border-t border-gray-300 z-50"
          onMouseEnter={() => handleMouseEnter(activeMenu)}
          onMouseLeave={handleMouseLeave}
        >
          <div
            className={classNames("transition-all duration-300 ease-out", {
              "opacity-0 translate-y-[-10px]": isAnimating,
              "opacity-100 translate-y-0": !isAnimating,
            })}
          >
            {navLinks
              .filter((item) => item.id === activeMenu)
              .map((item) => (
                <div key={item.id} className="container mx-auto px-6 py-6">
                  <div className="grid grid-cols-12 gap-6">
                    {/* Menu Sections - smart column packing */}
                    <nav
                      className={item.featured ? "col-span-8" : "col-span-12"}
                      aria-label={`${item.title} menu`}
                    >
                      <ul className="flex gap-6" role="list">
                        {packSectionsIntoColumns(item.sections).map(
                          (column, colIdx) => (
                            <li
                              key={colIdx}
                              className="flex-1 min-w-0 space-y-6"
                            >
                              {column.map((section, secIdx) => {
                                const headerUrl = sectionHref(section)
                                const headerCountLabel = formatCount(
                                  navCounts?.[headerUrl]
                                )
                                return (
                                  <div key={secIdx} className="space-y-3">
                                    <h3 className="text-sm font-semibold text-gray-900 border-b border-orange-200 pb-2">
                                      <LocalizedClientLink
                                        href={headerUrl}
                                        className="hover:text-orange-600 transition-colors"
                                        onClick={() => setActiveMenu(null)}
                                      >
                                        {section.title}
                                        {headerCountLabel && (
                                          <span className="text-gray-400 text-xs font-normal tabular-nums ml-1.5">
                                            {headerCountLabel}
                                          </span>
                                        )}
                                      </LocalizedClientLink>
                                    </h3>
                                    <ul className="space-y-1 pl-2">
                                      {section.items.map(
                                        (navItem, subIndex) => {
                                          const countLabel = formatCount(
                                            navCounts?.[navItem.Url]
                                          )
                                          return (
                                            <li
                                              key={subIndex}
                                              className="flex items-center gap-2"
                                            >
                                              <span
                                                className="w-1 h-1 rounded-full bg-Gold shrink-0"
                                                aria-hidden="true"
                                              />
                                              <LocalizedClientLink
                                                href={navItem.Url}
                                                className="text-sm text-gray-600 hover:text-orange-600 transition-colors block py-1 hover:translate-x-1 transform duration-200"
                                                onClick={() =>
                                                  setActiveMenu(null)
                                                }
                                              >
                                                {navItem.Text}
                                                {countLabel && (
                                                  <span className="text-gray-400 text-xs tabular-nums ml-1.5">
                                                    {countLabel}
                                                  </span>
                                                )}
                                              </LocalizedClientLink>
                                            </li>
                                          )
                                        }
                                      )}
                                    </ul>
                                  </div>
                                )
                              })}
                            </li>
                          )
                        )}
                      </ul>
                    </nav>

                    {/* Featured Section */}
                    {item.featured && (
                      <div className="col-span-4">
                        <LocalizedClientLink
                          href={item.featured.url || "/collections"}
                          className="block bg-Charcoal rounded-lg p-5 h-full cursor-pointer hover:shadow-lg transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold"
                          onClick={() => setActiveMenu(null)}
                        >
                          {item.featured.badge && (
                            <div className="flex items-start justify-between mb-4">
                              <span className="bg-Gold text-Charcoal px-2 py-1 rounded text-xs font-medium">
                                {item.featured.badge}
                              </span>
                            </div>
                          )}

                          {/* Featured Product Image */}
                          {item.featured.image?.url ? (
                            <div className="bg-white rounded-lg mb-4 h-40 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                              <Image
                                src={item.featured.image.url}
                                alt={item.featured.title || "Featured"}
                                width={400}
                                height={160}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="bg-white rounded-lg mb-4 h-40 flex items-center justify-center shadow-sm hover:shadow-md transition-shadow">
                              <div className="text-center text-gray-400">
                                <div className="w-16 h-16 bg-gray-200 rounded-lg mx-auto mb-2"></div>
                                <span className="text-sm">Product Image</span>
                              </div>
                            </div>
                          )}

                          {item.featured.title && (
                            <h4 className="text-xl font-bold text-white mb-3">
                              {item.featured.title}
                            </h4>
                          )}
                          {item.featured.description && (
                            <p className="text-sm text-gray-300 mb-4">
                              {item.featured.description}
                            </p>
                          )}
                        </LocalizedClientLink>
                      </div>
                    )}
                  </div>

                  {/* Bottom Action Bar */}
                  {item.bottomBar && (
                    <div className="mt-5 pt-4 border-t border-gray-200 flex items-center justify-between">
                      <div className="flex items-center space-x-6 text-xs text-gray-600">
                        {item.bottomBar.certifications?.map((cert, idx) => {
                          const IconComponent =
                            iconMap[cert.icon as keyof typeof iconMap]
                          return (
                            <div key={idx} className="flex items-center">
                              {IconComponent && (
                                <IconComponent className="h-3 w-3 mr-1 text-Gold" />
                              )}
                              {cert.text}
                            </div>
                          )
                        })}
                      </div>
                      <LocalizedClientLink
                        href={item.bottomBar.viewAllUrl}
                        className="text-Gold hover:text-Gold/80 font-medium text-xs flex items-center"
                        onClick={() => setActiveMenu(null)}
                      >
                        {item.bottomBar.viewAllText} →
                      </LocalizedClientLink>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

const NavMenu = ({
  navLinks,
  navCounts,
}: {
  navLinks: HeaderNavLink[]
  navCounts?: NavCounts
}) => (
  <>
    <DesktopNavMenu navLinks={navLinks} navCounts={navCounts} />
  </>
)

export default NavMenu
