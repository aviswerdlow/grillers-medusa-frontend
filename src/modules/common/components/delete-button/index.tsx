import { deleteLineItem } from "@lib/data/cart"
import { Spinner, Trash } from "@medusajs/icons"
import { clx } from "@medusajs/ui"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { trackRemoveFromCart } from "@lib/gtm"
import { jitsuTrack } from "@lib/jitsu"
import { dispatchCartUpdated } from "@lib/util/cart-events"

type ProductInfo = {
  id: string
  title: string
  price?: number
  quantity: number
  currency?: string
}

const DeleteButton = ({
  id,
  children,
  className,
  productInfo,
  onDeleted,
}: {
  id: string
  children?: React.ReactNode
  className?: string
  productInfo?: ProductInfo
  onDeleted?: () => void
}) => {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (id: string) => {
    if (isDeleting) return
    setIsDeleting(true)

    // Track remove_from_cart event before deletion
    if (productInfo) {
      trackRemoveFromCart({
        id: productInfo.id,
        title: productInfo.title,
        price: productInfo.price,
        quantity: productInfo.quantity,
        currency: productInfo.currency,
      })
      jitsuTrack("product_removed_from_cart", {
        item_id: productInfo.id,
        item_name: productInfo.title,
        price: productInfo.price,
        quantity: productInfo.quantity,
        currency: productInfo.currency || "USD",
      })
    }

    try {
      await deleteLineItem(id)
      onDeleted?.()
      dispatchCartUpdated({ action: "remove", lineId: id })
      router.refresh()
    } catch (err) {
      console.error("[cart] failed to delete line item", err)
      setIsDeleting(false)
    }
  }

  return (
    <div
      className={clx(
        "flex items-center justify-between text-small-regular",
        className
      )}
    >
      <button
        aria-busy={isDeleting}
        className="flex gap-x-1 text-ui-fg-subtle hover:text-ui-fg-base cursor-pointer disabled:cursor-wait disabled:opacity-60"
        disabled={isDeleting}
        onClick={() => handleDelete(id)}
        type="button"
      >
        {isDeleting ? <Spinner className="animate-spin" /> : <Trash />}
        <span>{children}</span>
      </button>
    </div>
  )
}

export default DeleteButton
