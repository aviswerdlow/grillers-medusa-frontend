import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"

import NavMenu from "@modules/layout/templates/nav/menu"
import type { HeaderNavLink } from "@lib/data/strapi/header"

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ fill: _fill, ...props }: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

jest.mock("@modules/common/components/localized-client-link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const navLinks: HeaderNavLink[] = [
  {
    id: "shop",
    slug: "shop",
    title: "Shop",
    sections: [
      {
        title: "Beef",
        items: [{ Text: "Ground Beef", Url: "/collections/beef" }],
      },
    ],
    featured: {
      title: "",
      description: "",
      badge: "",
    },
    bottomBar: {
      certifications: [],
      viewAllText: "",
      viewAllUrl: "",
    },
  },
  {
    id: "learn",
    slug: "learn",
    title: "Learn",
    sections: [
      {
        title: "Guides",
        items: [{ Text: "Butcher Guide", Url: "/learn/butcher-guide" }],
      },
    ],
    featured: {
      title: "",
      description: "",
      badge: "",
    },
    bottomBar: {
      certifications: [],
      viewAllText: "",
      viewAllUrl: "",
    },
  },
]

describe("DesktopNavMenu", () => {
  it("ignores cursor traversal and opens or switches menus only on click", async () => {
    const user = userEvent.setup()
    render(<NavMenu navLinks={navLinks} />)

    const shop = screen.getByRole("button", { name: "Shop" })
    const learn = screen.getByRole("button", { name: "Learn" })

    await user.hover(shop)
    expect(
      screen.queryByRole("navigation", { name: "Shop menu" })
    ).not.toBeInTheDocument()
    expect(shop).toHaveAttribute("aria-expanded", "false")
    expect(shop).not.toHaveAttribute("aria-haspopup")

    await user.click(shop)
    expect(
      screen.getByRole("navigation", { name: "Shop menu" })
    ).toBeInTheDocument()
    expect(shop).toHaveAttribute("aria-expanded", "true")

    await user.hover(learn)
    expect(
      screen.getByRole("navigation", { name: "Shop menu" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("navigation", { name: "Learn menu" })
    ).not.toBeInTheDocument()

    await user.click(learn)
    expect(
      screen.queryByRole("navigation", { name: "Shop menu" })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("navigation", { name: "Learn menu" })
    ).toBeInTheDocument()

    await user.click(learn)
    expect(
      screen.queryByRole("navigation", { name: "Learn menu" })
    ).not.toBeInTheDocument()
  })

  it("supports keyboard activation and Escape returns focus to the trigger", async () => {
    const user = userEvent.setup()
    render(<NavMenu navLinks={navLinks} />)

    const shop = screen.getByRole("button", { name: "Shop" })
    shop.focus()
    await user.keyboard("{Enter}")

    const submenu = screen.getByRole("navigation", { name: "Shop menu" })
    const groundBeef = within(submenu).getByRole("link", {
      name: "Ground Beef",
    })
    groundBeef.focus()
    await user.keyboard("{Escape}")

    expect(
      screen.queryByRole("navigation", { name: "Shop menu" })
    ).not.toBeInTheDocument()
    expect(shop).toHaveFocus()
  })

  it("closes an open menu when the user clicks outside", async () => {
    const user = userEvent.setup()
    render(
      <>
        <NavMenu navLinks={navLinks} />
        <button type="button">Outside navigation</button>
      </>
    )

    await user.click(screen.getByRole("button", { name: "Shop" }))
    expect(
      screen.getByRole("navigation", { name: "Shop menu" })
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Outside navigation" }))
    expect(
      screen.queryByRole("navigation", { name: "Shop menu" })
    ).not.toBeInTheDocument()
  })
})
