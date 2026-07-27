import { render, screen } from "@testing-library/react"
import { Table } from "@medusajs/ui"
import type { HttpTypes } from "@medusajs/types"

import CartLineItem from "@modules/cart/components/item"

jest.mock("@lib/data/cart", () => ({
  updateLineItem: jest.fn(),
}))

jest.mock("@lib/hooks/use-product-featured-image", () => ({
  useProductFeaturedImageSrc: () => "https://cdn.example.com/brisket.jpg",
}))

jest.mock("@lib/hooks/use-product-metadata", () => ({
  useProductMetadata: () => ({}),
}))

jest.mock("@lib/hooks/use-product-title", () => ({
  useProductTitle: (
    _productId: string,
    fallbackTitle?: string,
    providedTitle?: string
  ) => providedTitle || fallbackTitle || "Product",
}))

jest.mock("@modules/products/components/thumbnail", () => ({
  __esModule: true,
  default: () => <div data-testid="thumbnail" />,
}))

jest.mock("@modules/common/components/delete-button", () => ({
  __esModule: true,
  default: () => <button type="button">Remove</button>,
}))

jest.mock("@modules/cart/components/cart-item-select", () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => (
    <select {...props}>{children}</select>
  ),
}))

jest.mock("@modules/common/components/line-item-options", () => ({
  __esModule: true,
  default: () => <p>Pack</p>,
}))

jest.mock("@modules/common/components/net-weight-pricing", () => ({
  __esModule: true,
  default: () => <div />,
  NetWeightBadge: () => <span>Priced by weight</span>,
}))

jest.mock("@modules/common/components/localized-client-link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const item = {
  id: "line_brisket",
  product_id: "prod_brisket",
  product_title: "First Cut Brisket",
  product_handle: "first-cut-brisket",
  quantity: 3,
  unit_price: 10,
  total: 27,
  original_total: 30,
  thumbnail: null,
  variant: {
    id: "variant_brisket",
    sku: "10-01-01-1",
    title: "Pack",
    manage_inventory: false,
    product: {
      images: [],
    },
  },
} as unknown as HttpTypes.StoreCartLineItem

describe("cart line item price and identity", () => {
  it("shows customer-safe SKU and Medusa's discount-aware extended total", () => {
    render(
      <Table>
        <Table.Body>
          <CartLineItem item={item} currencyCode="usd" />
        </Table.Body>
      </Table>
    )

    expect(screen.getByTestId("product-sku")).toHaveTextContent(
      "SKU 10-01-01-1"
    )
    expect(screen.getByTestId("product-price")).toHaveTextContent("$27.00")
    expect(screen.getByTestId("product-original-price")).toHaveTextContent(
      "$30.00"
    )
    expect(screen.getByTestId("product-unit-price")).toHaveTextContent("$9.00")
  })

  it("falls back to the line-level variant SKU when variant data is sparse", () => {
    const sparseItem = {
      ...item,
      variant_sku: "10-01-01-LEGACY",
      variant: {
        ...item.variant,
        sku: null,
      },
    } as unknown as HttpTypes.StoreCartLineItem

    render(
      <Table>
        <Table.Body>
          <CartLineItem item={sparseItem} currencyCode="usd" />
        </Table.Body>
      </Table>
    )

    expect(screen.getByTestId("product-sku")).toHaveTextContent(
      "SKU 10-01-01-LEGACY"
    )
  })
})
