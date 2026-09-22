import Image from "next/image"
import { generatedSiteImages } from "@lib/content/generated-site-images"
import HeroCta from "@modules/home/components/hero-cta"
import Link from "next/link"

type HeroProps = {
  data: {
    HeroTitle: string
    BackgroundImage: {
      url: string
    }
    CTAButton?: {
      Text: string
      Url: string
    }
  }
  countryCode?: string
}

const Hero = ({ data, countryCode = "us" }: HeroProps) => {
  // Keep the approved hero image and CMS headline; shopping choices stay visible.
  const heroImage = data?.BackgroundImage?.url || generatedSiteImages.homeHero

  return (
    <section
      className="w-full flex flex-col justify-center items-center relative overflow-hidden"
      aria-labelledby="home-hero-heading"
    >
      <Image
        src={heroImage}
        alt=""
        fill
        priority
        fetchPriority="high"
        sizes="100vw"
        className="absolute inset-0 object-cover"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,27,35,0.62),rgba(0,27,35,0.26))]"
        aria-hidden="true"
      />
      <div className="w-full max-w-5xl text-center px-5 py-8 md:py-12 gap-5 flex flex-col items-center relative z-10">
        <div className="max-w-[820px]">
          <p className="mb-4 font-maison-neue-mono text-p-sm-mono font-bold uppercase tracking-wide text-Gold drop-shadow">
            Premium Kosher Meat, Shipped Frozen to Your Door
          </p>
          <h1
            id="home-hero-heading"
            className="text-white font-gyst text-[30px] md:text-[48px] leading-[1.1] text-balance drop-shadow-lg"
          >
            {data?.HeroTitle}
          </h1>
        </div>
        <nav
          aria-label="Shop by category"
          className="flex flex-wrap justify-center gap-2"
        >
          {[
            ["Beef", "kosher-beef"],
            ["Chicken", "kosher-chicken"],
          ].map(([label, slug]) => (
            <Link
              key={slug}
              href={`/${countryCode}/collections/${slug}`}
              className="inline-flex min-h-[44px] items-center rounded-[5px] bg-Gold px-5 py-3 font-maison-neue font-bold text-Charcoal hover:bg-Gold/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 font-maison-neue text-sm text-white">
          <Link
            href={`/${countryCode}/search`}
            className="inline-flex min-h-[44px] items-center underline underline-offset-4"
          >
            Search all products
          </Link>
          <Link
            href="#delivery-promise"
            className="inline-flex min-h-[44px] items-center underline underline-offset-4"
          >
            Delivery &amp; pickup options
          </Link>
        </div>
        <HeroCta
          countryCode={countryCode}
          editorialText={data?.CTAButton?.Text}
          editorialHref={data?.CTAButton?.Url}
        />
      </div>
    </section>
  )
}

export default Hero
