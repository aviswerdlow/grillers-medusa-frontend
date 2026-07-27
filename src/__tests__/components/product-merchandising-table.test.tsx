import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"

import ProductMerchandisingTable from "@modules/staff/components/product-merchandising-table"
import type { ProductMerchandisingTagSummary } from "@lib/data/staff/product-merchandising"

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

function tag(
  displayName: string,
  imageCount: number
): ProductMerchandisingTagSummary {
  return {
    documentId: `L3%3A%20${encodeURIComponent(displayName)}`,
    name: `L3: ${displayName}`,
    displayName,
    description: "",
    seoDescription: "",
    productCount: 2,
    imageCount,
    reviewedImageCount: 1,
    approvedImageCount: 1,
    rejectedImageCount: 0,
    claimedImageCount: 0,
    noImageProductCount: 0,
    metadata: [],
    l2Parents: ["Butcher Counter"],
  }
}

const tags = [
  tag("Zabuton Steak", 4),
  tag("Beef Stew and Bones", 8),
  tag("Applewood Bacon", 3),
]

describe("ProductMerchandisingTable", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("defaults to an accessible alphabetical A-Z category list", () => {
    render(<ProductMerchandisingTable tags={tags} />)

    const mobileList = screen.getByTestId("merchandising-mobile-list")
    const categoryLinks = within(mobileList).getAllByRole("link")
    expect(categoryLinks.map((link) => link.textContent?.trim())).toEqual([
      expect.stringMatching(/^Applewood Bacon/),
      expect.stringMatching(/^Beef Stew and Bones/),
      expect.stringMatching(/^Zabuton Steak/),
    ])
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute(
      "aria-sort",
      "ascending"
    )
    expect(
      screen.getByRole("combobox", { name: "Sort image categories" })
    ).toHaveValue("name")
    expect(
      screen.getByRole("textbox", { name: "Search image categories" })
    ).toBeInTheDocument()
  })

  it("restores the search and sort when staff return during the same session", async () => {
    const user = userEvent.setup()
    const firstRender = render(<ProductMerchandisingTable tags={tags} />)

    await user.type(
      screen.getByRole("textbox", { name: "Search image categories" }),
      "beef"
    )
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort image categories" }),
      "imageCount"
    )

    expect(
      within(screen.getByTestId("merchandising-mobile-list")).getAllByRole(
        "link"
      )
    ).toHaveLength(1)

    firstRender.unmount()
    render(<ProductMerchandisingTable tags={tags} />)

    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: "Search image categories" })
      ).toHaveValue("beef")
      expect(
        screen.getByRole("combobox", { name: "Sort image categories" })
      ).toHaveValue("imageCount")
    })
    expect(
      within(screen.getByTestId("merchandising-mobile-list")).getByRole("link")
    ).toHaveTextContent("Beef Stew and Bones")
  })
})
