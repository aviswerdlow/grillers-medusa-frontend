import { ArrowUpRightMini } from "@medusajs/icons"
import { Text } from "@medusajs/ui"
import LocalizedClientLink from "../localized-client-link"

type InteractiveLinkProps = {
  href: string
  children?: React.ReactNode
  onClick?: () => void
}

const InteractiveLink = ({
  href,
  children,
  onClick,
  ...props
}: InteractiveLinkProps) => {
  return (
    <LocalizedClientLink
      className="min-h-[44px] inline-flex gap-x-1 items-center group text-RichGold hover:text-RichGold/80"
      href={href}
      onClick={onClick}
      {...props}
    >
      <Text className="text-current">{children}</Text>
      <ArrowUpRightMini
        className="text-current group-hover:rotate-45 ease-in-out duration-150"
        color="currentColor"
      />
    </LocalizedClientLink>
  )
}

export default InteractiveLink
