"use client"

import React, { useRef } from "react"
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Swiper, SwiperSlide } from "swiper/react"
import type { Swiper as SwiperType } from "swiper"
import "swiper/css"

import { ProductCard } from "@modules/collections/components/strapi-product-grid"
import type { StrapiCollectionProduct } from "@lib/data/strapi/collections"

type Props = {
  products: StrapiCollectionProduct[]
  countryCode: string
  tagByHandle: Record<string, string>
}

export default function SpecialtySwiper({
  products,
  countryCode,
  tagByHandle,
}: Props) {
  const swiperRef = useRef<SwiperType | null>(null)

  if (!products?.length) return null

  return (
    <div className="content-container">
      <div className="flex justify-between items-end mb-12 gap-6">
        <div className="min-w-0">
          <p className="text-p-sm-mono font-maison-neue-mono uppercase tracking-widest text-RichGold mb-3">
            Specialty · Hard to Find
          </p>
          <h2
            id="specialty-row-heading"
            className="text-h2-mobile md:text-h2 font-gyst text-Charcoal"
          >
            Cuts you can&apos;t get from your supermarket.
          </h2>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => swiperRef.current?.slidePrev()}
            className="size-[44px] border border-Charcoal rounded-full flex justify-center items-center hover:bg-Charcoal hover:text-white transition-colors group"
            aria-label="Previous specialty cut"
          >
            <Image
              src="/images/icons/arrow-right.svg"
              width={21}
              height={12}
              alt=""
              className="rotate-180 group-hover:invert transition-all"
            />
          </button>
          <button
            type="button"
            onClick={() => swiperRef.current?.slideNext()}
            className="size-[44px] border border-Charcoal rounded-full flex justify-center items-center hover:bg-Charcoal hover:text-white transition-colors group"
            aria-label="Next specialty cut"
          >
            <Image
              src="/images/icons/arrow-right.svg"
              width={21}
              height={12}
              alt=""
              className="group-hover:invert transition-all"
            />
          </button>
          <LocalizedClientLink
            href="/page/specialty"
            className="hidden sm:inline-flex h-[44px] px-5 items-center text-p-sm-mono font-rexton uppercase font-bold text-Charcoal hover:text-Gold"
          >
            See all
          </LocalizedClientLink>
        </div>
      </div>

      <Swiper
        onSwiper={(s) => {
          swiperRef.current = s
        }}
        spaceBetween={28}
        // Keep a sliver of the next card visible at every breakpoint so
        // the row reads as a carousel, not a static three-card grid.
        slidesPerView={1.15}
        breakpoints={{
          520: { slidesPerView: 2.15 },
          900: { slidesPerView: 3.15 },
        }}
        className="swiper-visible"
      >
        {products.map((product) => {
          const handle = product?.MedusaProduct?.Handle || ""
          const tag = tagByHandle[handle]
          return (
            <SwiperSlide key={product.documentId} className="!h-auto pb-4">
              <div className="relative">
                {tag && (
                  <span className="absolute top-3 left-3 z-10 inline-block bg-Charcoal text-Scroll text-p-ex-sm-mono font-maison-neue-mono uppercase tracking-widest px-2.5 py-1 rounded-sm pointer-events-none">
                    {tag}
                  </span>
                )}
                <ProductCard
                  product={product}
                  countryCode={countryCode}
                  viewMode="grid"
                  imageSizes="(max-width: 519px) 87vw, (max-width: 899px) 46vw, 31vw"
                />
              </div>
            </SwiperSlide>
          )
        })}
      </Swiper>
    </div>
  )
}
