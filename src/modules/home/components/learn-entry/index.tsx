import Image from "next/image"
import {
  ArrowRight,
  BookOpen,
  ChefHat,
  Clock3,
  Flame,
  Search,
  Sparkles,
} from "lucide-react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { generatedSiteImages } from "@lib/content/generated-site-images"

const recipePaths = [
  {
    title: "Shabbos table",
    href: "/recipes?bucket=shabbos-table#recipes-results",
    icon: Sparkles,
  },
  {
    title: "Weeknight dinner",
    href: "/recipes?bucket=weeknight-dinner#recipes-results",
    icon: Clock3,
  },
  {
    title: "Steaks & chops",
    href: "/recipes?bucket=steaks-chops#recipes-results",
    icon: Flame,
  },
  {
    title: "Whole birds",
    href: "/recipes?bucket=whole-birds#recipes-results",
    icon: ChefHat,
  },
]

const learningLinks = [
  {
    title: "Cut library",
    description: "Choose the right roast, chop, steak, or poultry cut.",
    href: "/learn/cuts",
    image: "/images/learn/cut-library-hero.jpg",
  },
  {
    title: "Cold-chain planning",
    description: "Understand delivery, packing, and freezer timing.",
    href: "/learn/cold-chain",
    image: "/images/learn/cold-chain.jpg",
  },
]

function RecipePathRail() {
  return (
    <div className="-mx-4.5 min-w-0 overflow-x-auto px-4.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0">
      <div className="flex w-max snap-x gap-2 pr-14 md:gap-3 md:pr-0">
        {recipePaths.map((path) => {
          const Icon = path.icon
          return (
            <LocalizedClientLink
              key={path.href}
              href={path.href}
              className="group inline-flex min-h-[48px] shrink-0 snap-start items-center justify-center gap-2.5 rounded-full border border-Charcoal/15 bg-white px-3.5 font-maison-neue text-sm font-semibold text-Charcoal transition-colors hover:border-Charcoal md:gap-3 md:px-4"
            >
              <Icon
                className="h-4 w-4 text-Charcoal/60 group-hover:text-Gold"
                aria-hidden="true"
              />
              {path.title}
            </LocalizedClientLink>
          )
        })}
      </div>
    </div>
  )
}

export default function LearnEntrySection() {
  return (
    <section className="bg-white py-14 md:py-24">
      <div className="mx-auto max-w-7xl px-4.5">
        <div className="mb-8 max-w-4xl">
          <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-VibrantRed">
            Learn & cook
          </p>
          <h2 className="mt-3 font-gyst text-h2-mobile leading-none text-Charcoal md:text-h2">
            Know what to buy, then know what to make.
          </h2>
          <p className="mt-4 max-w-2xl font-maison-neue text-p-lg leading-relaxed text-Charcoal/70">
            Butcher guides, cold-chain planning, and recipe paths for the way
            kosher families actually shop, cook, freeze, and serve.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <LocalizedClientLink
            href="/learn"
            className="group relative grid min-h-[430px] overflow-hidden bg-Charcoal text-white md:min-h-[520px]"
          >
            <Image
              src="/images/learn/butcher-guide-hero.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 52vw, 100vw"
              className="object-cover opacity-65 transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-Charcoal via-Charcoal/60 to-Charcoal/20" />
            <div className="relative flex h-full flex-col justify-between p-6 md:p-8">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-Charcoal">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-Gold">
                  Butcher education
                </p>
                <h3 className="mt-3 max-w-2xl font-gyst text-h2-mobile leading-none md:text-h2">
                  Learn the counter before you fill the cart
                </h3>
                <p className="mt-4 max-w-xl font-maison-neue text-p-lg leading-relaxed text-white/78">
                  Start with cuts, pack sizes, freezer planning, delivery, and
                  the tradeoffs that matter when you are feeding a family.
                </p>
                <span className="mt-7 inline-flex min-h-[44px] w-fit items-center gap-2 rounded-[5px] bg-Gold px-5 font-rexton text-xs font-bold uppercase tracking-wide text-Charcoal">
                  Open learning hub
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </div>
          </LocalizedClientLink>

          <div className="grid gap-5">
            <LocalizedClientLink
              href="/recipes"
              className="group grid min-h-[240px] overflow-hidden border border-Charcoal/10 bg-Scroll md:grid-cols-[0.9fr_1.1fr]"
            >
              <figure className="relative min-h-[220px]">
                <Image
                  src={generatedSiteImages.recipeDiscovery}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 22vw, 100vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </figure>
              <div className="flex min-w-0 flex-col justify-between p-5 md:p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-Charcoal text-Charcoal">
                  <Search className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="mt-8">
                  <p className="font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-VibrantRed">
                    Recipe discovery
                  </p>
                  <h3 className="mt-2 font-gyst text-h3-mobile leading-tight text-Charcoal md:text-h3">
                    Find meals by table, cut, and cooking window
                  </h3>
                  <p className="mt-3 font-maison-neue text-sm leading-relaxed text-Charcoal/65">
                    Search the recipe hub by Shabbos, weeknight, steaks, chops,
                    whole birds, and holiday cooking.
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 font-rexton text-[11px] font-bold uppercase tracking-wide text-Charcoal">
                    Open recipe hub
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </LocalizedClientLink>

            <RecipePathRail />

            <div className="grid gap-3 sm:grid-cols-2">
              {learningLinks.map((link) => (
                <LocalizedClientLink
                  key={link.href}
                  href={link.href}
                  className="group grid min-h-[190px] overflow-hidden border border-Charcoal/10 bg-white"
                >
                  <figure className="relative min-h-[118px]">
                    <Image
                      src={link.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 24vw, 50vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  </figure>
                  <div className="p-4">
                    <p className="font-maison-neue text-sm font-semibold text-Charcoal">
                      {link.title}
                    </p>
                    <p className="mt-1 font-maison-neue text-xs leading-relaxed text-Charcoal/60">
                      {link.description}
                    </p>
                  </div>
                </LocalizedClientLink>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
