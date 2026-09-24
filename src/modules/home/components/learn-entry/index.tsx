import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { generatedSiteImages } from "@lib/content/generated-site-images"

const links = [
  {
    title: "Recipes",
    description: "Find a meal by cut or occasion.",
    href: "/recipes",
    image: generatedSiteImages.recipeDiscovery,
  },
  {
    title: "Cut library",
    description: "Compare roasts, steaks, chops, and poultry.",
    href: "/learn/cuts",
    image: "/images/learn/cut-library-hero.jpg",
  },
  {
    title: "Storage & thawing",
    description: "Store your order and plan safe thawing.",
    href: "/learn/guides/thawing-frozen-kosher-meat",
    image: "/images/learn/cold-chain.jpg",
  },
]

export default function LearnEntrySection() {
  return (
    <section
      aria-labelledby="home-learn-heading"
      className="bg-white py-10 md:py-14"
    >
      <div className="mx-auto max-w-7xl px-4.5">
        <h2
          id="home-learn-heading"
          className="font-gyst text-h2-mobile text-Charcoal md:text-h2"
        >
          Cook with confidence
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {links.map((link) => (
            <LocalizedClientLink
              key={link.href}
              href={link.href}
              className="group grid grid-cols-[100px_minmax(0,1fr)] items-center gap-4 md:block focus-visible:outline focus-visible:outline-2 focus-visible:outline-Gold"
            >
              <figure className="relative aspect-square overflow-hidden md:aspect-[3/2]">
                <Image
                  src={link.image}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 33vw, 100px"
                  className="object-cover"
                />
              </figure>
              <div className="md:pt-4">
                <h3 className="font-gyst text-xl text-Charcoal group-hover:underline">
                  {link.title}
                </h3>
                <p className="mt-1 font-maison-neue text-sm leading-relaxed text-Charcoal/75">
                  {link.description}
                </p>
              </div>
            </LocalizedClientLink>
          ))}
        </div>
      </div>
    </section>
  )
}
