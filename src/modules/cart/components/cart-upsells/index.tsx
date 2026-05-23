"use client"

import { useState, type MouseEvent } from "react"
import Image from "next/image"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { toast } from "@medusajs/ui"
import { addToCart } from "@lib/data/cart"
import { trackSelectItem } from "@lib/gtm"
import { jitsuTrack } from "@lib/jitsu"
import type { CartUpsellProduct } from "./types"

type CartUpsellsProps = {
  surface: "cart_page" | "side_cart"
  products: CartUpsellProduct[]
  countryCode?: string
  compact?: boolean
  excludeProductIds?: Array<string | null | undefined>
  className?: string
}

export default function CartUpsells({
  surface,
  products: rawProducts,
  countryCode = "us",
  compact = false,
  excludeProductIds = [],
  className = "",
}: CartUpsellsProps) {
  const [addingId, setAddingId] = useState<string | null>(null)
  const excluded = new Set(excludeProductIds.filter(Boolean))
  const products = rawProducts
    .filter((product) => !excluded.has(product.id))
    .slice(0, compact ? 2 : 3)

  if (!products.length) return null

  const listId = `cart_upsells_${surface}`
  const listName = surface === "side_cart" ? "Side Cart Upsells" : "Cart Page Upsells"

  const handleClick = (product: CartUpsellProduct, index: number) => {
    trackSelectItem({
      listId,
      listName,
      product: {
        id: product.id,
        title: product.title,
        price: product.price,
        position: index,
      },
    })
    jitsuTrack("cart_upsell_clicked", {
      surface,
      product_id: product.id,
      product_name: product.title,
      product_handle: product.handle,
      position: index,
    })
  }

  const handleAdd = async (
    event: MouseEvent<HTMLButtonElement>,
    product: CartUpsellProduct,
    index: number
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (addingId) return

    setAddingId(product.id)
    try {
      await addToCart({
        variantId: product.variantId,
        quantity: 1,
        countryCode,
      })
      toast.success("Added to cart", { description: product.title })
      jitsuTrack("cart_upsell_added", {
        surface,
        product_id: product.id,
        product_name: product.title,
        product_handle: product.handle,
        position: index,
      })
    } catch (error) {
      console.error("Failed to add cart upsell:", error)
      toast.error("Couldn't add to cart", {
        description: "Please try again in a moment.",
      })
    } finally {
      setAddingId(null)
    }
  }

  return (
    <section className={className} aria-label="Recommended additions">
      <div className={compact ? "mb-2" : "mb-4"}>
        <h2 className="text-sm font-maison-neue-mono uppercase tracking-wider text-Charcoal/60">
          Add to your order
        </h2>
      </div>
      <div className={compact ? "space-y-2" : "grid grid-cols-1 small:grid-cols-3 gap-3"}>
        {products.map((product, index) => (
          <div
            key={product.id}
            className={
              compact
                ? "min-h-[72px] flex items-center gap-3 rounded-lg border border-Charcoal/10 bg-white p-2 hover:border-Gold/70 transition-colors"
                : "min-h-[44px] rounded-lg border border-Charcoal/10 bg-white p-3 hover:border-Gold/70 transition-colors"
            }
          >
            <LocalizedClientLink
              href={`/products/${product.handle}`}
              onClick={() => handleClick(product, index)}
              className={
                compact
                  ? "flex min-w-0 flex-1 items-center gap-3"
                  : "block"
              }
            >
              <div
                className={
                  compact
                    ? "relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-gray-50"
                    : "relative aspect-square w-full overflow-hidden rounded-md bg-gray-50"
                }
              >
                <Image
                  src={product.image}
                  alt={product.title}
                  fill
                  sizes={compact ? "56px" : "(max-width: 768px) 100vw, 180px"}
                  className="object-cover"
                />
              </div>
              <div className={compact ? "min-w-0 flex-1" : "mt-3"}>
                <p className="text-sm font-maison-neue font-semibold text-Charcoal leading-snug line-clamp-2">
                  {product.title}
                </p>
                {product.price != null && (
                  <p className="mt-1 text-xs font-maison-neue text-Charcoal/60">
                    From ${product.price.toFixed(2)}
                  </p>
                )}
              </div>
            </LocalizedClientLink>
            <button
              type="button"
              onClick={(event) => handleAdd(event, product, index)}
              disabled={addingId === product.id}
              className={
                compact
                  ? "min-h-[36px] shrink-0 rounded-[5px] border border-Charcoal bg-Gold px-3 text-[10px] font-rexton font-bold uppercase tracking-wide text-Charcoal transition-opacity hover:opacity-90 disabled:opacity-60"
                  : "mt-3 min-h-[36px] w-full rounded-[5px] border border-Charcoal bg-Gold px-3 text-[10px] font-rexton font-bold uppercase tracking-wide text-Charcoal transition-opacity hover:opacity-90 disabled:opacity-60"
              }
            >
              {addingId === product.id ? "Adding" : "+ Add"}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
