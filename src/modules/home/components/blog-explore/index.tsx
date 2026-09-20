"use client"

import React from "react"
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// This recipe entry owns its destination. Strapi supplies the presentation;
// its legacy Button.Url may still be "/" and must not send shoppers back home.
export default function BlogExploreSection({
  data,
}: {
  data: {
    CategoryLabel: string
    BlogExploreTitle: string
    Button: {
      Text: string
    }
    QuoteDecorImage: {
      url: string
    }
    MainImage: {
      url: string
    }
  }
}) {
  return (
    <section className="overflow-hidden bg-RichGold py-10 md:py-16">
      <div className="content-container">
        <div className="grid overflow-hidden bg-Gold md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:items-stretch">
          <div className="p-6 md:px-10 md:py-12 lg:px-14">
            <p className="text-h6 font-rexton font-bold uppercase text-Scroll mb-3">
              {data?.CategoryLabel}
            </p>
            <div className="mb-5 h-px w-full max-w-[473px] bg-Scroll" />
            <h2 className="mb-8 max-w-[10ch] font-gyst text-h2-mobile leading-tight text-Charcoal md:text-h2">
              {data?.BlogExploreTitle}
            </h2>
            {data?.Button?.Text && (
              <div>
                <LocalizedClientLink
                  href="/recipes"
                  className="btn-outline"
                >
                  <span>{data.Button.Text}</span>
                  <Image
                    src="/images/icons/arrow-right.svg"
                    width={21}
                    height={12}
                    alt=""
                    aria-hidden="true"
                  />
                </LocalizedClientLink>
              </div>
            )}
          </div>

          <figure className="relative min-h-[280px] overflow-hidden bg-Gold md:min-h-[420px] lg:min-h-[460px]">
            {data?.QuoteDecorImage?.url && (
              <Image
                className="pointer-events-none absolute right-4 top-4 z-10 hidden h-28 w-auto opacity-25 xl:block"
                src={data.QuoteDecorImage.url}
                alt=""
                width={72}
                height={180}
                aria-hidden="true"
              />
            )}
            {data?.MainImage?.url && (
              <Image
                src={data.MainImage.url}
                alt="Delicious potatoes and steak"
                className="object-cover object-[62%_50%]"
                fill
                sizes="(min-width: 1280px) 620px, (min-width: 768px) 52vw, 100vw"
              />
            )}
          </figure>
        </div>
      </div>
    </section>
  )
}
