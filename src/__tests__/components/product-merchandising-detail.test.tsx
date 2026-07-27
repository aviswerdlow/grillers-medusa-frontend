import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"

import ProductMerchandisingDetailView from "@modules/staff/components/product-merchandising-detail"
import {
  reviewMerchandisingImage,
  type MerchandisingImageReview,
  type MerchandisingReviewAuditEntry,
  type ProductMerchandisingDetail,
} from "@lib/data/staff/product-merchandising"

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    fill: _fill,
    unoptimized: _unoptimized,
    priority: _priority,
    ...props
  }: any) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />
  },
}))

jest.mock("@lib/data/staff/product-merchandising", () => ({
  claimMerchandisingImage: jest.fn(),
  releaseMerchandisingImageClaim: jest.fn(),
  reviewMerchandisingImage: jest.fn(),
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

const reviewMerchandisingImageMock =
  reviewMerchandisingImage as jest.MockedFunction<
    typeof reviewMerchandisingImage
  >

const reviewedAt = "2026-06-28T14:00:00.000Z"

const detail: ProductMerchandisingDetail = {
  documentId: "tag_beef",
  name: "L3: Beef",
  displayName: "Beef",
  description: "",
  seoDescription: "",
  productCount: 1,
  imageCount: 2,
  reviewedImageCount: 1,
  approvedImageCount: 1,
  rejectedImageCount: 0,
  claimedImageCount: 0,
  noImageProductCount: 0,
  metadata: [],
  l2Parents: ["Butcher Counter"],
  products: [
    {
      documentId: "product_ground_beef",
      title: "Ground Beef",
      description: "Fresh ground beef.",
      handle: "ground-beef",
      sku: "1-00-11-1",
      metadata: ["Pack size: 1 lb"],
      l2Tags: ["L2: Butcher Counter"],
      l3Tags: ["L3: Beef"],
      images: [
        {
          id: 101,
          documentId: "img_hero",
          role: "featured" as const,
          name: "Ground beef hero",
          url: "https://cdn.example.com/ground-beef.jpg",
          displayUrl: "https://cdn.example.com/ground-beef.jpg",
          thumbnailUrl: "https://cdn.example.com/ground-beef-thumb.jpg",
          alternativeText: "Ground beef on butcher paper",
          caption: null,
          review: {
            status: "approved" as const,
            reviewerName: "Miriam Reviewer",
            reviewerEmail: "miriam@example.com",
            reviewedAt,
            note: "Looks accurate and customer-safe.",
          },
          auditHistory: [
            {
              action: "reviewed" as const,
              at: reviewedAt,
              staffName: "Miriam Reviewer",
              staffEmail: "miriam@example.com",
              review: {
                status: "approved" as const,
                reviewerName: "Miriam Reviewer",
                reviewerEmail: "miriam@example.com",
                reviewedAt,
                note: "Looks accurate and customer-safe.",
              },
            },
          ],
        },
        {
          id: 102,
          documentId: "img_open",
          role: "gallery" as const,
          name: "Ground beef alternate",
          url: "https://cdn.example.com/ground-beef-alt.jpg",
          displayUrl: "https://cdn.example.com/ground-beef-alt.jpg",
          thumbnailUrl: "https://cdn.example.com/ground-beef-alt-thumb.jpg",
          alternativeText: "Ground beef alternate",
          caption: null,
          review: {
            status: "unreviewed" as const,
          },
          auditHistory: [],
        },
      ],
    },
  ],
}

function withFirstImageReview(
  review: MerchandisingImageReview,
  auditHistory: MerchandisingReviewAuditEntry[]
): ProductMerchandisingDetail {
  return {
    ...detail,
    products: detail.products.map((product, productIndex) =>
      productIndex
        ? product
        : {
            ...product,
            images: product.images.map((image, imageIndex) =>
              imageIndex ? image : { ...image, auditHistory, review }
            ),
          }
    ),
  }
}

describe("ProductMerchandisingDetailView", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("shows reviewed status with reviewer and opens image comments", async () => {
    const user = userEvent.setup()

    render(
      <ProductMerchandisingDetailView
        countryCode="us"
        detail={detail}
        staffEmail="avi@example.com"
        staffName="Avi Swerdlow"
      />
    )

    expect(screen.getAllByText("Reviewed").length).toBeGreaterThan(0)
    expect(screen.getByText("Approved by Miriam Reviewer")).toBeInTheDocument()
    expect(
      screen.getByText("Comment: Looks accurate and customer-safe.")
    ).toBeInTheDocument()
    expect(screen.getByText("Needs review")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Reserve while reviewing" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Claim" })
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "Open review details for Ground beef hero",
      })
    )

    const dialog = screen.getByRole("dialog", {
      name: "Ground beef hero",
    })
    expect(dialog).toHaveClass("overflow-y-auto")
    expect(dialog).toHaveClass("large:overflow-hidden")
    expect(
      within(dialog).getByRole("heading", { name: "Ground beef hero" })
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Miriam Reviewer")).toBeInTheDocument()
    expect(
      within(dialog).getAllByText("Looks accurate and customer-safe.").length
    ).toBeGreaterThan(0)
    expect(within(dialog).getByText("Reviewed: Approved")).toBeInTheDocument()
  })

  it("closes the review-change dialog with Escape and restores trigger focus", async () => {
    const user = userEvent.setup()

    render(
      <ProductMerchandisingDetailView
        countryCode="us"
        detail={detail}
        staffEmail="avi@example.com"
        staffName="Avi Swerdlow"
      />
    )

    const changeReview = screen.getByRole("button", { name: "Change review" })
    await user.click(changeReview)
    expect(
      screen.getByRole("dialog", {
        name: "Change review for Ground beef hero",
      })
    ).toBeInTheDocument()

    await user.keyboard("{Escape}")

    expect(
      screen.queryByRole("dialog", {
        name: "Change review for Ground beef hero",
      })
    ).not.toBeInTheDocument()
    expect(changeReview).toHaveFocus()
  })

  it("keeps a submitted Other rejection visible on the image card", async () => {
    const user = userEvent.setup()
    const rejectedAt = "2026-06-29T13:45:00.000Z"

    reviewMerchandisingImageMock.mockResolvedValueOnce({
      ok: true,
      caption: "GP_IMAGE_REVIEW_V1:rejected",
      review: {
        status: "rejected",
        reason: "other",
        note: "Options note",
        reviewerName: "Avi Swerdlow",
        reviewerEmail: "avi@example.com",
        reviewedAt: rejectedAt,
      },
      auditHistory: [
        {
          action: "reviewed",
          at: rejectedAt,
          staffName: "Avi Swerdlow",
          staffEmail: "avi@example.com",
          review: {
            status: "rejected",
            reason: "other",
            note: "Options note",
            reviewerName: "Avi Swerdlow",
            reviewerEmail: "avi@example.com",
            reviewedAt: rejectedAt,
          },
        },
      ],
    })

    render(
      <ProductMerchandisingDetailView
        countryCode="us"
        detail={detail}
        staffEmail="avi@example.com"
        staffName="Avi Swerdlow"
      />
    )

    await user.click(screen.getByRole("button", { name: "Reject" }))
    await user.click(screen.getByRole("button", { name: "Other" }))
    await user.type(
      screen.getByRole("textbox", { name: "Optional note" }),
      "Options note"
    )
    await user.click(screen.getByRole("button", { name: "Submit rejection" }))

    expect(reviewMerchandisingImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        imageId: 102,
        imageDocumentId: "img_open",
        countryCode: "us",
        status: "rejected",
        reason: "other",
        note: "Options note",
        currentCaption: null,
      })
    )
    expect(
      await screen.findByText("Ground beef alternate marked rejected.")
    ).toBeInTheDocument()
    expect(screen.getByText("Rejected by Avi Swerdlow")).toBeInTheDocument()
    expect(screen.getByText(/Other · by Avi Swerdlow/)).toBeInTheDocument()
    expect(screen.getByText("Options note")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Submit rejection" })
    ).not.toBeInTheDocument()
  })

  it("keeps the latest rejection note visible after a later approval", async () => {
    const user = userEvent.setup()
    const rejectedAt = "2026-06-27T12:00:00.000Z"
    const approvedAt = "2026-06-28T14:00:00.000Z"
    const approvedAfterRejection = withFirstImageReview(
      {
        status: "approved",
        note: "Peter confirmed this cut is accurate.",
        reviewerName: "Peter Swerdlow",
        reviewerEmail: "peter@example.com",
        reviewedAt: approvedAt,
      },
      [
        {
          action: "reviewed",
          at: rejectedAt,
          staffName: "Red Reviewer",
          staffEmail: "red@example.com",
          review: {
            status: "rejected",
            reason: "other",
            note: "The trim looks too heavy.",
            reviewerName: "Red Reviewer",
            reviewerEmail: "red@example.com",
            reviewedAt: rejectedAt,
          },
        },
        {
          action: "overwritten_review",
          at: approvedAt,
          staffName: "Peter Swerdlow",
          staffEmail: "peter@example.com",
          previousReview: {
            status: "rejected",
            reason: "other",
            note: "The trim looks too heavy.",
            reviewerName: "Red Reviewer",
            reviewerEmail: "red@example.com",
            reviewedAt: rejectedAt,
          },
          review: {
            status: "approved",
            note: "Peter confirmed this cut is accurate.",
            reviewerName: "Peter Swerdlow",
            reviewerEmail: "peter@example.com",
            reviewedAt: approvedAt,
          },
        },
      ]
    )

    render(
      <ProductMerchandisingDetailView
        countryCode="us"
        detail={approvedAfterRejection}
        staffEmail="avi@example.com"
        staffName="Avi Swerdlow"
      />
    )

    expect(screen.getByText("Latest rejection note")).toBeInTheDocument()
    expect(screen.getByText("The trim looks too heavy.")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "View audit history (2)" })
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "Open review details for Ground beef hero",
      })
    )

    const dialog = screen.getByRole("dialog", {
      name: "Ground beef hero",
    })
    expect(
      within(dialog).getByText("Latest rejection note")
    ).toBeInTheDocument()
    expect(
      within(dialog).getAllByText("The trim looks too heavy.").length
    ).toBeGreaterThan(0)
    expect(within(dialog).getByText("Previous decision")).toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: "Change review" })
    ).toBeInTheDocument()
  })

  it("requires confirmation before approving a rejected image and preserves overwrite intent", async () => {
    const user = userEvent.setup()
    const rejectedAt = "2026-06-29T13:45:00.000Z"
    const approvedAt = "2026-06-30T10:00:00.000Z"
    const rejectedDetail = withFirstImageReview(
      {
        status: "rejected",
        reason: "other",
        note: "The cut looked mislabeled.",
        reviewerName: "Red Reviewer",
        reviewerEmail: "red@example.com",
        reviewedAt: rejectedAt,
      },
      [
        {
          action: "reviewed",
          at: rejectedAt,
          staffName: "Red Reviewer",
          staffEmail: "red@example.com",
          review: {
            status: "rejected",
            reason: "other",
            note: "The cut looked mislabeled.",
            reviewerName: "Red Reviewer",
            reviewerEmail: "red@example.com",
            reviewedAt: rejectedAt,
          },
        },
      ]
    )

    reviewMerchandisingImageMock.mockResolvedValueOnce({
      ok: true,
      caption: "GP_IMAGE_REVIEW_V1:approved",
      review: {
        status: "approved",
        note: "Peter verified the image.",
        reviewerName: "Avi Swerdlow",
        reviewerEmail: "avi@example.com",
        reviewedAt: approvedAt,
      },
      auditHistory: [
        ...rejectedDetail.products[0].images[0].auditHistory,
        {
          action: "overwritten_review",
          at: approvedAt,
          staffName: "Avi Swerdlow",
          staffEmail: "avi@example.com",
          previousReview: rejectedDetail.products[0].images[0].review,
          review: {
            status: "approved",
            note: "Peter verified the image.",
            reviewerName: "Avi Swerdlow",
            reviewerEmail: "avi@example.com",
            reviewedAt: approvedAt,
          },
        },
      ],
    })

    render(
      <ProductMerchandisingDetailView
        countryCode="us"
        detail={rejectedDetail}
        staffEmail="avi@example.com"
        staffName="Avi Swerdlow"
      />
    )

    await user.click(screen.getByRole("button", { name: "Change review" }))
    const changeDialog = screen.getByRole("dialog", {
      name: "Change review for Ground beef hero",
    })
    expect(changeDialog).toBeInTheDocument()
    expect(
      within(changeDialog).getAllByText("The cut looked mislabeled.").length
    ).toBeGreaterThan(0)

    await user.click(
      within(changeDialog).getByRole("button", { name: "Approve" })
    )
    await user.type(
      within(changeDialog).getByRole("textbox", {
        name: "Optional new review note",
      }),
      "Peter verified the image."
    )
    await user.click(
      within(changeDialog).getByRole("button", {
        name: "Continue to confirmation",
      })
    )

    const confirmation = screen.getByRole("alertdialog", {
      name: "Confirm this review change",
    })
    expect(within(confirmation).getByText("Current")).toBeInTheDocument()
    expect(within(confirmation).getByText("New")).toBeInTheDocument()
    expect(within(confirmation).getByText("Rejected")).toBeInTheDocument()
    expect(within(confirmation).getByText("Approved")).toBeInTheDocument()
    expect(reviewMerchandisingImageMock).not.toHaveBeenCalled()

    await user.click(
      within(confirmation).getByRole("button", {
        name: "Confirm review change",
      })
    )

    expect(reviewMerchandisingImageMock).toHaveBeenCalledWith({
      imageId: 101,
      imageDocumentId: "img_hero",
      countryCode: "us",
      status: "approved",
      reason: undefined,
      note: "Peter verified the image.",
      currentCaption: null,
      overwriteExistingReview: true,
    })
    expect(
      await screen.findByText("Ground beef hero marked approved.")
    ).toBeInTheDocument()
    expect(screen.getByText("Approved by Avi Swerdlow")).toBeInTheDocument()
    expect(screen.getByText("The cut looked mislabeled.")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "View audit history (2)" })
    ).toBeInTheDocument()
  })

  it("shows a newer review for comparison instead of silently overwriting it", async () => {
    const user = userEvent.setup()
    const rejectedAt = "2026-06-29T13:45:00.000Z"
    const newerAt = "2026-06-30T09:00:00.000Z"
    const loadedDetail = withFirstImageReview(
      {
        status: "rejected",
        reason: "other",
        note: "The loaded rejection.",
        reviewerName: "Red Reviewer",
        reviewerEmail: "red@example.com",
        reviewedAt: rejectedAt,
      },
      []
    )
    loadedDetail.products[0].images[0].caption = "loaded-review-caption"

    reviewMerchandisingImageMock.mockResolvedValueOnce({
      ok: false,
      conflict: true,
      canOverwrite: true,
      error: "Peter already approved this image.",
      caption: "newer-review-caption",
      latestReview: {
        status: "approved",
        note: "Peter made a newer decision.",
        reviewerName: "Peter Swerdlow",
        reviewerEmail: "peter@example.com",
        reviewedAt: newerAt,
      },
      review: {
        status: "approved",
        note: "Peter made a newer decision.",
        reviewerName: "Peter Swerdlow",
        reviewerEmail: "peter@example.com",
        reviewedAt: newerAt,
      },
      auditHistory: [],
    })

    render(
      <ProductMerchandisingDetailView
        countryCode="us"
        detail={loadedDetail}
        staffEmail="avi@example.com"
        staffName="Avi Swerdlow"
      />
    )

    await user.click(screen.getByRole("button", { name: "Change review" }))
    const changeDialog = screen.getByRole("dialog", {
      name: "Change review for Ground beef hero",
    })
    await user.click(
      within(changeDialog).getByRole("button", {
        name: "Approve",
      })
    )
    await user.click(
      within(changeDialog).getByRole("button", {
        name: "Continue to confirmation",
      })
    )
    await user.click(
      screen.getByRole("button", {
        name: "Confirm review change",
      })
    )

    expect(
      await screen.findByText("Peter made a newer decision.")
    ).toBeInTheDocument()
    const refreshedConfirmation = screen.getByRole("alertdialog", {
      name: "Confirm this review change",
    })
    expect(
      within(refreshedConfirmation).getByText("Peter Swerdlow")
    ).toBeInTheDocument()
    expect(reviewMerchandisingImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        currentCaption: "loaded-review-caption",
        overwriteExistingReview: true,
      })
    )
    expect(reviewMerchandisingImageMock).toHaveBeenCalledTimes(1)
  })
})
