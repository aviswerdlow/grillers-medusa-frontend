"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Image from "next/image"
import {
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  History,
  ImageOff,
  Loader2,
  MessageSquareWarning,
  PencilLine,
  ShieldCheck,
  Sparkles,
  UserRoundX,
  XCircle,
} from "lucide-react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import {
  claimMerchandisingImage,
  releaseMerchandisingImageClaim,
  reviewMerchandisingImage,
  type MerchandisingImageActionResult,
  type MerchandisingImageReview,
  type MerchandisingProductImage,
  type MerchandisingRejectReason,
  type ProductMerchandisingDetail,
  type ProductMerchandisingProduct,
} from "@lib/data/staff/product-merchandising"

type Props = {
  countryCode: string
  detail: ProductMerchandisingDetail
  staffEmail: string
  staffName: string
}

type RejectDraft = {
  image: MerchandisingProductImage
  reason: MerchandisingRejectReason
  note: string
} | null

type ChangeReviewDraft = {
  image: MerchandisingProductImage
  status: "approved" | "rejected"
  reason: MerchandisingRejectReason
  note: string
} | null

type OverwriteDraft = {
  image: MerchandisingProductImage
  status: "approved" | "rejected"
  reason?: MerchandisingRejectReason
  note?: string
  latestReview?: MerchandisingImageReview
} | null

const rejectOptions: Array<{
  value: MerchandisingRejectReason
  label: string
  icon: typeof Sparkles
}> = [
  {
    value: "looks_ai_or_synthetic",
    label: "Looks like AI or synthetic",
    icon: Sparkles,
  },
  {
    value: "human_in_image",
    label: "Human in the image",
    icon: UserRoundX,
  },
  {
    value: "other",
    label: "Other",
    icon: MessageSquareWarning,
  },
]

function shortDate(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString()
}

function reviewLabel(review: MerchandisingImageReview) {
  if (review.status === "approved" || review.status === "rejected") {
    return "Reviewed"
  }
  return "Needs review"
}

function decisionLabel(review: MerchandisingImageReview) {
  if (review.status === "approved") return "Approved"
  if (review.status === "rejected") return "Rejected"
  return "Not reviewed"
}

function reviewClass(review: MerchandisingImageReview) {
  if (review.status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800"
  }
  if (review.status === "rejected") {
    return "border-red-200 bg-red-50 text-red-800"
  }
  return "border-amber-200 bg-amber-50 text-amber-800"
}

function reasonLabel(reason?: MerchandisingRejectReason) {
  return rejectOptions.find((option) => option.value === reason)?.label || ""
}

function normalizedEmail(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
}

function claimOwner(image: MerchandisingProductImage) {
  return image.claim?.staffName || image.claim?.staffEmail || ""
}

function reviewerName(review: MerchandisingImageReview) {
  return review.reviewerName || review.reviewerEmail || ""
}

function reviewedByLabel(review: MerchandisingImageReview) {
  const reviewer = reviewerName(review)
  if (!reviewer) return decisionLabel(review)
  return `${decisionLabel(review)} by ${reviewer}`
}

function claimIsMine(image: MerchandisingProductImage, staffEmail: string) {
  return (
    Boolean(image.claim?.staffEmail) &&
    normalizedEmail(image.claim?.staffEmail) === normalizedEmail(staffEmail)
  )
}

function auditActionLabel(action: string) {
  if (action === "claimed") return "Reserved"
  if (action === "released_claim") return "Released reservation"
  if (action === "overwritten_review") return "Replaced review"
  if (action === "reviewed") return "Reviewed"
  return action
}

function latestRejection(image: MerchandisingProductImage) {
  if (image.review.status === "rejected") {
    return {
      at: image.review.reviewedAt,
      review: image.review,
    }
  }

  for (let index = image.auditHistory.length - 1; index >= 0; index -= 1) {
    const entry = image.auditHistory[index]
    if (entry.review?.status === "rejected") {
      return {
        at: entry.review.reviewedAt || entry.at,
        review: entry.review,
      }
    }
    if (entry.previousReview?.status === "rejected") {
      return {
        at: entry.previousReview.reviewedAt || entry.at,
        review: entry.previousReview,
      }
    }
  }

  return null
}

function LatestRejectionNote({
  image,
  compact = false,
}: {
  image: MerchandisingProductImage
  compact?: boolean
}) {
  const rejection = latestRejection(image)
  if (!rejection) return null

  const reviewer = reviewerName(rejection.review)
  const reason = reasonLabel(rejection.review.reason)

  return (
    <div
      className={`rounded-md border border-red-200 bg-red-50 text-red-900 ${
        compact ? "p-2.5" : "p-4"
      }`}
    >
      <p className="text-[11px] font-maison-neue-mono uppercase text-red-700">
        Latest rejection note
      </p>
      {(reason || reviewer || rejection.at) && (
        <p className="mt-1 text-xs font-maison-neue text-red-800">
          {[reason, reviewer ? `by ${reviewer}` : "", shortDate(rejection.at)]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p
        className={`mt-2 whitespace-pre-wrap break-words font-maison-neue ${
          compact ? "text-xs leading-5" : "text-sm leading-6"
        }`}
      >
        {rejection.review.note || "No rejection comment was recorded."}
      </p>
    </div>
  )
}

function resultImagePatch(result: MerchandisingImageActionResult) {
  if (!("caption" in result)) return null
  return {
    ...(result.review ? { review: result.review } : {}),
    claim: result.claim,
    ...(result.auditHistory ? { auditHistory: result.auditHistory } : {}),
    caption: result.caption || null,
  }
}

function productProgress(product: ProductMerchandisingProduct) {
  const total = product.images.length
  const reviewed = product.images.filter(
    (image) => image.review.status !== "unreviewed"
  ).length
  const approved = product.images.filter(
    (image) => image.review.status === "approved"
  ).length
  const rejected = product.images.filter(
    (image) => image.review.status === "rejected"
  ).length

  return {
    total,
    reviewed,
    approved,
    rejected,
    percent: total ? Math.round((reviewed / total) * 100) : 0,
  }
}

function ProductReviewRail({
  product,
}: {
  product: ProductMerchandisingProduct
}) {
  const progress = productProgress(product)

  return (
    <div className="border-t border-gray-100 bg-Scroll/35 px-4 py-3">
      <div className="flex flex-col gap-2 small:flex-row small:items-center small:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative h-7 min-w-[160px] flex-1">
            <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-Charcoal/15" />
            <div
              className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-Gold"
              style={{ width: `${progress.percent}%` }}
            />
            <div
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-Gold bg-white shadow-sm"
              style={{ left: `calc(${progress.percent}% - 8px)` }}
            />
          </div>
          <span className="whitespace-nowrap text-xs font-maison-neue-mono uppercase text-Charcoal/55">
            {progress.reviewed}/{progress.total} reviewed
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-maison-neue-mono uppercase ${
            progress.rejected
              ? "border-red-200 bg-red-50 text-red-800"
              : progress.percent === 100 && progress.total
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {progress.rejected
            ? `${progress.rejected} rejected`
            : progress.percent === 100 && progress.total
            ? "Complete"
            : "In review"}
        </span>
      </div>
    </div>
  )
}

function NoImagePlaceholder() {
  return (
    <div className="flex min-h-[180px] items-center justify-center rounded-md border border-dashed border-gray-300 bg-Scroll/60">
      <div className="text-center">
        <ImageOff className="mx-auto h-9 w-9 text-Charcoal/30" aria-hidden />
        <p className="mt-2 text-sm font-maison-neue text-Charcoal/45">
          No image
        </p>
      </div>
    </div>
  )
}

function FilterToggle({
  active,
  label,
  count,
  onToggle,
}: {
  active: boolean
  label: string
  count: number
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={`inline-flex min-h-[38px] items-center gap-2 rounded-md border px-3 text-xs font-maison-neue-mono uppercase transition ${
        active
          ? "border-Charcoal bg-Charcoal text-white"
          : "border-gray-200 bg-white text-Charcoal/60 hover:border-Gold hover:text-Charcoal"
      }`}
    >
      <EyeOff className="h-4 w-4" aria-hidden />
      {label}
      <span
        className={`rounded-full px-2 py-0.5 ${
          active ? "bg-white/15 text-white" : "bg-Scroll text-Charcoal/55"
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function CollapsedProductRow({
  product,
}: {
  product: ProductMerchandisingProduct
}) {
  const progress = productProgress(product)
  const isComplete = progress.total > 0 && progress.approved === progress.total
  const hasRejected = progress.rejected > 0

  return (
    <article className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 small:flex-row small:items-center small:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-base font-gyst font-bold text-Charcoal">
            {product.title}
          </h2>
          <p className="mt-1 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
            SKU {product.sku} / {progress.reviewed}/{progress.total} reviewed
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-maison-neue-mono uppercase ${
              isComplete
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : hasRejected
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-gray-200 bg-Scroll text-Charcoal/55"
            }`}
          >
            {isComplete ? "Complete" : "Hidden by filters"}
          </span>
          {isComplete && (
            <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden />
          )}
          {!isComplete && hasRejected && (
            <XCircle className="h-6 w-6 text-red-600" aria-hidden />
          )}
        </div>
      </div>
    </article>
  )
}

function ImageCard({
  image,
  isPending,
  staffEmail,
  onOpen,
  onApprove,
  onReject,
  onChangeReview,
  onClaim,
  onReleaseClaim,
}: {
  image: MerchandisingProductImage
  isPending: boolean
  staffEmail: string
  onOpen: (image: MerchandisingProductImage) => void
  onApprove: (image: MerchandisingProductImage) => void
  onReject: (image: MerchandisingProductImage) => void
  onChangeReview: (image: MerchandisingProductImage) => void
  onClaim: (image: MerchandisingProductImage) => void
  onReleaseClaim: (image: MerchandisingProductImage) => void
}) {
  const Icon =
    image.review.status === "approved"
      ? CheckCircle2
      : image.review.status === "rejected"
      ? XCircle
      : ShieldCheck
  const claimedByMe = claimIsMine(image, staffEmail)
  const claimedByOther = Boolean(image.claim && !claimedByMe)
  const reviewDisabled = isPending || claimedByOther
  const reviewed = image.review.status !== "unreviewed"

  return (
    <div
      className={`group overflow-hidden rounded-md border bg-white ${
        claimedByOther ? "border-amber-300" : "border-gray-200"
      }`}
    >
      <div className="relative aspect-square bg-Scroll">
        <button
          type="button"
          onClick={() => onOpen(image)}
          className="relative block h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
          aria-label={`Open review details for ${image.name}`}
        >
          {/*
            Load Strapi's large/medium derivative directly (unoptimized) instead
            of through Vercel's image optimizer. The optimizer reliably failed to
            render these heavier sources for an image-heavy review page (~36 at
            once) — the cards came up blank. The derivative is already ~750-1000px
            (crisp at this ~600px display) and ~150KB, so it loads straight from
            Strapi's CDN with no optimizer bottleneck.
          */}
          <Image
            src={image.displayUrl}
            alt={image.alternativeText || image.name}
            fill
            unoptimized
            sizes="(min-width: 1024px) 600px, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        </button>
        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-maison-neue-mono uppercase text-Charcoal/65 shadow-sm">
          {image.role}
        </span>
        {image.claim && (
          <span
            className={`absolute right-2 top-2 max-w-[calc(100%-5rem)] truncate rounded-full px-2 py-1 text-[10px] font-maison-neue-mono uppercase shadow-sm ${
              claimedByMe
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-800"
            }`}
            title={`Reserved by ${claimOwner(image)}`}
          >
            {claimedByMe
              ? "Your reservation"
              : `Reserved: ${claimOwner(image)}`}
          </span>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-maison-neue-mono uppercase ${reviewClass(
            image.review
          )}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {reviewLabel(image.review)}
        </div>
        {reviewed && (
          <p className="break-words text-xs font-maison-neue text-Charcoal/55">
            {reviewedByLabel(image.review)}
          </p>
        )}
        {image.review.note && image.review.status !== "rejected" && (
          <p className="line-clamp-2 text-xs font-maison-neue text-Charcoal/65">
            Comment: {image.review.note}
          </p>
        )}
        <LatestRejectionNote image={image} compact />
        {image.review.reviewedAt && (
          <p className="text-[11px] font-maison-neue-mono uppercase text-Charcoal/35">
            {shortDate(image.review.reviewedAt)}
          </p>
        )}
        {image.claim && (
          <p className="text-xs font-maison-neue text-amber-800">
            Reserved by {claimOwner(image)}
            {image.claim.expiresAt
              ? ` until ${shortDate(image.claim.expiresAt)}`
              : ""}
          </p>
        )}
        {image.auditHistory.length > 0 && (
          <button
            type="button"
            onClick={() => onOpen(image)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md text-left text-[11px] font-maison-neue-mono uppercase text-Charcoal/55 underline decoration-Charcoal/20 underline-offset-4 transition hover:text-Charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            View audit history ({image.auditHistory.length})
          </button>
        )}
        {reviewed && (
          <button
            type="button"
            disabled={reviewDisabled}
            onClick={() => onChangeReview(image)}
            className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border border-Charcoal px-3 text-xs font-rexton font-bold uppercase text-Charcoal transition hover:bg-Charcoal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PencilLine className="h-4 w-4" aria-hidden />
            Change review
          </button>
        )}
        {image.review.status === "unreviewed" && (
          <div className="space-y-2 pt-1">
            <div className="grid gap-2 small:grid-cols-2">
              <button
                type="button"
                disabled={reviewDisabled}
                onClick={() => onApprove(image)}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-rexton font-bold uppercase text-emerald-800 transition hover:border-emerald-400 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Approve
              </button>
              <button
                type="button"
                disabled={reviewDisabled}
                onClick={() => onReject(image)}
                className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-rexton font-bold uppercase text-red-800 transition hover:border-red-400 disabled:opacity-50"
              >
                <XCircle className="h-4 w-4" aria-hidden />
                Reject
              </button>
            </div>
            {claimedByMe ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => onReleaseClaim(image)}
                className="min-h-[34px] w-full rounded-md border border-gray-200 px-2 text-[11px] font-rexton font-bold uppercase text-Charcoal transition hover:border-Charcoal disabled:opacity-50"
              >
                Release reservation
              </button>
            ) : (
              <button
                type="button"
                disabled={isPending || claimedByOther}
                onClick={() => onClaim(image)}
                className="min-h-[34px] w-full rounded-md border border-gray-200 px-2 text-[11px] font-rexton font-bold uppercase text-Charcoal transition hover:border-Charcoal disabled:opacity-50"
              >
                Reserve while reviewing
              </button>
            )}
            <p className="text-[11px] font-maison-neue text-Charcoal/45">
              Reserving is optional. Approve or Reject is what marks the image
              reviewed.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ImageReviewDetailsModal({
  image,
  isPending,
  staffEmail,
  onChangeReview,
  onClose,
}: {
  image: MerchandisingProductImage
  isPending: boolean
  staffEmail: string
  onChangeReview: (image: MerchandisingProductImage) => void
  onClose: () => void
}) {
  const reviewed = image.review.status !== "unreviewed"
  const reviewer = reviewerName(image.review)
  const rejectionReason = reasonLabel(image.review.reason)
  const claimedByOther = Boolean(image.claim && !claimIsMine(image, staffEmail))

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-Charcoal/60 p-4 small:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-review-details-title"
        data-merchandising-dialog
        tabIndex={-1}
        className="grid max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-xl large:h-[92vh] large:grid-cols-[minmax(0,1.2fr)_420px] large:overflow-hidden"
      >
        <div className="h-[36vh] min-h-[220px] bg-Charcoal p-3 small:min-h-[280px] large:h-full large:min-h-0">
          <div className="relative h-full min-h-0 overflow-hidden rounded-md bg-Charcoal">
            <Image
              src={image.displayUrl}
              alt={image.alternativeText || image.name}
              fill
              unoptimized
              sizes="(min-width: 1024px) 720px, 100vw"
              className="object-contain"
            />
          </div>
        </div>

        <div className="p-5 large:max-h-[92vh] large:overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                Image review details
              </p>
              <h2
                id="image-review-details-title"
                className="mt-2 break-words text-2xl font-gyst font-bold text-Charcoal"
              >
                {image.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-Charcoal/45 transition hover:bg-gray-100 hover:text-Charcoal"
              aria-label="Close image review details"
            >
              <XCircle className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-md border border-gray-200 p-4">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-maison-neue-mono uppercase ${reviewClass(
                  image.review
                )}`}
              >
                {reviewed ? (
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                )}
                {reviewLabel(image.review)}
              </div>

              {reviewed ? (
                <dl className="mt-4 grid gap-3 text-sm font-maison-neue">
                  <div>
                    <dt className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                      Decision
                    </dt>
                    <dd className="mt-1 text-Charcoal">
                      {decisionLabel(image.review)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                      Reviewer
                    </dt>
                    <dd className="mt-1 break-words text-Charcoal">
                      {reviewer || "Reviewer not recorded"}
                    </dd>
                  </div>
                  {image.review.reviewedAt && (
                    <div>
                      <dt className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                        Reviewed
                      </dt>
                      <dd className="mt-1 text-Charcoal">
                        {shortDate(image.review.reviewedAt)}
                      </dd>
                    </div>
                  )}
                  {rejectionReason && (
                    <div>
                      <dt className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                        Reason
                      </dt>
                      <dd className="mt-1 text-red-700">{rejectionReason}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="mt-4 text-sm font-maison-neue text-Charcoal/60">
                  This image has not been reviewed yet.
                </p>
              )}
            </div>

            {image.review.status !== "rejected" && (
              <div className="rounded-md border border-gray-200 p-4">
                <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                  Latest review comment
                </p>
                {image.review.note ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm font-maison-neue leading-6 text-Charcoal">
                    {image.review.note}
                  </p>
                ) : (
                  <p className="mt-2 text-sm font-maison-neue text-Charcoal/55">
                    No comments recorded for the latest review.
                  </p>
                )}
              </div>
            )}

            <LatestRejectionNote image={image} />

            {image.claim && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-maison-neue text-amber-900">
                <p className="font-semibold">Currently reserved</p>
                <p className="mt-1">
                  {claimOwner(image) || "Another staff member"}
                  {image.claim.expiresAt
                    ? ` until ${shortDate(image.claim.expiresAt)}`
                    : ""}
                </p>
              </div>
            )}

            <div className="rounded-md border border-gray-200 p-4">
              <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                Audit history
              </p>
              {image.auditHistory.length ? (
                <div className="mt-3 space-y-3">
                  {image.auditHistory
                    .slice()
                    .reverse()
                    .map((entry, index) => (
                      <div
                        key={`${entry.at}-${index}`}
                        className="rounded-md border border-gray-100 bg-Scroll/35 p-3 text-sm font-maison-neue text-Charcoal/70"
                      >
                        <p className="font-semibold text-Charcoal">
                          {auditActionLabel(entry.action)}
                          {entry.review
                            ? `: ${decisionLabel(entry.review)}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs font-maison-neue-mono uppercase text-Charcoal/40">
                          {shortDate(entry.at)}
                          {entry.staffName || entry.staffEmail
                            ? ` by ${entry.staffName || entry.staffEmail}`
                            : ""}
                        </p>
                        {entry.review?.note && (
                          <p className="mt-2 whitespace-pre-wrap">
                            {entry.review.note}
                          </p>
                        )}
                        {entry.previousReview && (
                          <div className="mt-3 border-t border-gray-200 pt-3">
                            <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                              Previous decision
                            </p>
                            <p className="mt-1 font-semibold text-Charcoal">
                              {decisionLabel(entry.previousReview)}
                              {reasonLabel(entry.previousReview.reason)
                                ? ` · ${reasonLabel(
                                    entry.previousReview.reason
                                  )}`
                                : ""}
                            </p>
                            {entry.previousReview.note && (
                              <p className="mt-2 whitespace-pre-wrap">
                                {entry.previousReview.note}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ) : (
                <p className="mt-2 text-sm font-maison-neue text-Charcoal/55">
                  No audit entries recorded yet.
                </p>
              )}
            </div>

            {reviewed && (
              <button
                type="button"
                disabled={isPending || claimedByOther}
                onClick={() => onChangeReview(image)}
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border border-Charcoal bg-white px-4 text-xs font-rexton font-bold uppercase text-Charcoal transition hover:bg-Charcoal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PencilLine className="h-4 w-4" aria-hidden />
                Change review
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProductMerchandisingDetailView({
  countryCode,
  detail,
  staffEmail,
  staffName,
}: Props) {
  const [products, setProducts] = useState(detail.products)
  const [rejectDraft, setRejectDraft] = useState<RejectDraft>(null)
  const [changeReviewDraft, setChangeReviewDraft] =
    useState<ChangeReviewDraft>(null)
  const [overwriteDraft, setOverwriteDraft] = useState<OverwriteDraft>(null)
  const [detailsImageId, setDetailsImageId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingImageId, setPendingImageId] = useState<number | null>(null)
  const [hideApproved, setHideApproved] = useState(false)
  const [hideRejected, setHideRejected] = useState(false)
  const [isPending, startTransition] = useTransition()

  const stats = useMemo(
    () =>
      products.reduce(
        (acc, product) => {
          acc.products += 1
          acc.images += product.images.length
          acc.reviewed += product.images.filter(
            (image) => image.review.status !== "unreviewed"
          ).length
          acc.approved += product.images.filter(
            (image) => image.review.status === "approved"
          ).length
          acc.rejected += product.images.filter(
            (image) => image.review.status === "rejected"
          ).length
          acc.claimed += product.images.filter(
            (image) => image.claim && image.review.status === "unreviewed"
          ).length
          return acc
        },
        {
          products: 0,
          images: 0,
          reviewed: 0,
          approved: 0,
          rejected: 0,
          claimed: 0,
        }
      ),
    [products]
  )

  const detailsImage = useMemo(() => {
    if (detailsImageId === null) return null

    for (const product of products) {
      const image = product.images.find((item) => item.id === detailsImageId)
      if (image) return image
    }

    return null
  }, [detailsImageId, products])

  const activeModal = overwriteDraft
    ? "overwrite"
    : changeReviewDraft
    ? "change"
    : rejectDraft
    ? "reject"
    : detailsImage
    ? "details"
    : null

  useEffect(() => {
    if (!activeModal) return

    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const dialog = document.querySelector<HTMLElement>(
      "[data-merchandising-dialog]"
    )
    if (!dialog) return
    const activeDialog = dialog

    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "textarea:not([disabled])",
      "select:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",")
    const focusable = Array.from(
      activeDialog.querySelectorAll<HTMLElement>(focusableSelector)
    )
    const initialFocus =
      activeDialog.querySelector<HTMLElement>("[data-autofocus]") ||
      focusable[0] ||
      activeDialog
    initialFocus.focus()

    function closeActiveModal() {
      if (activeModal === "overwrite") setOverwriteDraft(null)
      if (activeModal === "change") setChangeReviewDraft(null)
      if (activeModal === "reject") setRejectDraft(null)
      if (activeModal === "details") setDetailsImageId(null)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        closeActiveModal()
        return
      }

      if (event.key !== "Tab") return
      const available = Array.from(
        activeDialog.querySelectorAll<HTMLElement>(focusableSelector)
      )
      if (!available.length) {
        event.preventDefault()
        activeDialog.focus()
        return
      }

      const first = available[0]
      const last = available[available.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [activeModal])

  function openChangeReview(image: MerchandisingProductImage) {
    if (image.review.status === "unreviewed") return
    setError(null)
    setFeedback(null)
    setDetailsImageId(null)
    setChangeReviewDraft({
      image,
      status: image.review.status,
      reason: image.review.reason || "looks_ai_or_synthetic",
      note: image.review.note || "",
    })
  }

  function chooseChangedStatus(status: "approved" | "rejected") {
    setChangeReviewDraft((current) => {
      if (!current || current.status === status) return current
      return {
        ...current,
        status,
        reason:
          status === "rejected"
            ? current.image.review.reason || "looks_ai_or_synthetic"
            : current.reason,
        note: "",
      }
    })
  }

  function continueReviewChange() {
    if (!changeReviewDraft) return
    setOverwriteDraft({
      image: changeReviewDraft.image,
      status: changeReviewDraft.status,
      reason:
        changeReviewDraft.status === "rejected"
          ? changeReviewDraft.reason
          : undefined,
      note: changeReviewDraft.note,
      latestReview: changeReviewDraft.image.review,
    })
    setChangeReviewDraft(null)
  }

  function patchLocalImage(
    imageId: number,
    patch: Partial<MerchandisingProductImage>
  ) {
    setProducts((current) =>
      current.map((product) => ({
        ...product,
        images: product.images.map((image) =>
          image.id === imageId
            ? {
                ...image,
                ...patch,
              }
            : image
        ),
      }))
    )
  }

  function imageWithResult(
    image: MerchandisingProductImage,
    result: MerchandisingImageActionResult
  ) {
    const patch = resultImagePatch(result)
    return patch ? { ...image, ...patch } : image
  }

  function applyActionResult(
    image: MerchandisingProductImage,
    result: MerchandisingImageActionResult
  ) {
    const patch = resultImagePatch(result)
    if (patch) patchLocalImage(image.id, patch)
  }

  function handleActionFailure(
    image: MerchandisingProductImage,
    result: MerchandisingImageActionResult,
    attempted: {
      status: "approved" | "rejected"
      reason?: MerchandisingRejectReason
      note?: string
    }
  ) {
    applyActionResult(image, result)
    if (result.canOverwrite && result.latestReview) {
      setRejectDraft(null)
      setChangeReviewDraft(null)
      setOverwriteDraft({
        image: imageWithResult(image, result),
        status: attempted.status,
        reason: attempted.reason,
        note: attempted.note,
        latestReview: result.latestReview,
      })
    }
    setError(result.error || "Could not save review.")
  }

  function submitReview(
    image: MerchandisingProductImage,
    status: "approved" | "rejected",
    reason?: MerchandisingRejectReason,
    note?: string,
    overwriteExistingReview = false
  ) {
    setError(null)
    setFeedback(null)
    setOverwriteDraft(null)
    setPendingImageId(image.id)
    startTransition(async () => {
      const result = await reviewMerchandisingImage({
        imageId: image.id,
        imageDocumentId: image.documentId,
        countryCode,
        status,
        reason,
        note,
        currentCaption: image.caption,
        overwriteExistingReview,
      })

      setPendingImageId(null)
      if (!result.ok || !result.review) {
        handleActionFailure(image, result, { status, reason, note })
        return
      }

      applyActionResult(image, result)
      setRejectDraft(null)
      setFeedback(
        `${image.name} marked ${
          status === "approved" ? "approved" : "rejected"
        }.`
      )
    })
  }

  function claimImage(image: MerchandisingProductImage) {
    setError(null)
    setFeedback(null)
    setPendingImageId(image.id)
    startTransition(async () => {
      const result = await claimMerchandisingImage({
        imageId: image.id,
        imageDocumentId: image.documentId,
        countryCode,
        tagId: detail.documentId,
        tagName: detail.name,
        currentCaption: image.caption,
      })

      setPendingImageId(null)
      applyActionResult(image, result)
      if (!result.ok) {
        setError(result.error || "Could not reserve image.")
        return
      }

      setFeedback(`${image.name} reserved for ${staffName || staffEmail}.`)
    })
  }

  function releaseClaim(image: MerchandisingProductImage) {
    setError(null)
    setFeedback(null)
    setPendingImageId(image.id)
    startTransition(async () => {
      const result = await releaseMerchandisingImageClaim({
        imageId: image.id,
        imageDocumentId: image.documentId,
        countryCode,
        tagId: detail.documentId,
        tagName: detail.name,
        currentCaption: image.caption,
      })

      setPendingImageId(null)
      applyActionResult(image, result)
      if (!result.ok) {
        setError(result.error || "Could not release reservation.")
        return
      }

      setFeedback(`${image.name} reservation released.`)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 large:flex-row large:items-start large:justify-between">
        <div>
          <LocalizedClientLink
            href="/account/staff/orders?workspace=merchandising"
            className="inline-flex items-center gap-1.5 text-sm font-maison-neue font-semibold text-Charcoal/55 transition hover:text-Gold"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Product merchandising
          </LocalizedClientLink>
          <p className="mt-5 text-xs font-maison-neue-mono uppercase text-Gold">
            L3 image review
          </p>
          <h1 className="mt-2 text-h3 font-gyst font-bold text-Charcoal">
            {detail.displayName}
          </h1>
          <p className="mt-2 max-w-3xl text-sm font-maison-neue text-Charcoal/60">
            Review every Strapi product image in this L3 group. Approvals,
            rejections, optional reservations, and audit history are stored on
            the Strapi media record with staff attribution.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 small:min-w-[420px]">
          <div className="rounded-md border border-gray-200 bg-white p-3">
            <p className="text-[11px] font-maison-neue-mono uppercase text-Charcoal/45">
              Products
            </p>
            <p className="mt-1 text-2xl font-gyst font-bold text-Charcoal">
              {stats.products}
            </p>
          </div>
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-800">
            <p className="text-[11px] font-maison-neue-mono uppercase opacity-70">
              Images
            </p>
            <p className="mt-1 text-2xl font-gyst font-bold">{stats.images}</p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
            <p className="text-[11px] font-maison-neue-mono uppercase opacity-70">
              Reviewed
            </p>
            <p className="mt-1 text-2xl font-gyst font-bold">
              {stats.reviewed}
            </p>
          </div>
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
            <p className="text-[11px] font-maison-neue-mono uppercase opacity-70">
              Rejected
            </p>
            <p className="mt-1 text-2xl font-gyst font-bold">
              {stats.rejected}
            </p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <p className="text-[11px] font-maison-neue-mono uppercase opacity-70">
              Reserved
            </p>
            <p className="mt-1 text-2xl font-gyst font-bold">{stats.claimed}</p>
          </div>
        </div>
      </div>

      {(feedback || error) && (
        <div
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
          className={`rounded-md border px-4 py-3 text-sm font-maison-neue ${
            error
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || feedback}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 large:flex-row large:items-center large:justify-between">
        <div>
          <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
            Image filters
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterToggle
            active={hideApproved}
            label="Hide approved"
            count={stats.approved}
            onToggle={() => setHideApproved((current) => !current)}
          />
          <FilterToggle
            active={hideRejected}
            label="Hide rejected"
            count={stats.rejected}
            onToggle={() => setHideRejected((current) => !current)}
          />
        </div>
      </div>

      <div className="space-y-4">
        {products.map((product) => {
          const visibleImages = product.images.filter((image) => {
            if (hideApproved && image.review.status === "approved") {
              return false
            }
            if (hideRejected && image.review.status === "rejected") {
              return false
            }
            return true
          })
          const shouldCollapse =
            product.images.length > 0 && !visibleImages.length

          if (shouldCollapse) {
            return (
              <CollapsedProductRow key={product.documentId} product={product} />
            )
          }

          return (
            <article
              key={product.documentId}
              className="overflow-hidden rounded-lg border border-gray-200 bg-white"
            >
              <div className="p-4 large:p-5">
                <div className="grid gap-5 large:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] large:items-start">
                  <div className="min-w-0 space-y-4">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-xl font-gyst font-bold text-Charcoal">
                          {product.title}
                        </h2>
                        {product.handle && (
                          <LocalizedClientLink
                            href={`/products/${product.handle}`}
                            className="inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-md border border-Charcoal px-3 text-xs font-rexton font-bold uppercase text-Charcoal transition hover:bg-Charcoal hover:text-white"
                          >
                            PDP
                          </LocalizedClientLink>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-maison-neue leading-6 text-Charcoal/65">
                        {product.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-Charcoal/15 bg-Charcoal/5 px-2.5 py-1 text-xs font-maison-neue-mono uppercase text-Charcoal/65">
                        SKU {product.sku}
                      </span>
                      {product.metadata.slice(0, 5).map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-maison-neue text-Charcoal/60"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 small:grid-cols-2">
                    {product.images.length ? (
                      visibleImages.map((image) => (
                        <ImageCard
                          key={image.id}
                          image={image}
                          isPending={isPending && pendingImageId === image.id}
                          staffEmail={staffEmail}
                          onOpen={(item) => setDetailsImageId(item.id)}
                          onApprove={(item) => submitReview(item, "approved")}
                          onReject={(item) =>
                            setRejectDraft({
                              image: item,
                              reason: "looks_ai_or_synthetic",
                              note: "",
                            })
                          }
                          onChangeReview={openChangeReview}
                          onClaim={claimImage}
                          onReleaseClaim={releaseClaim}
                        />
                      ))
                    ) : (
                      <NoImagePlaceholder />
                    )}
                  </div>
                </div>
              </div>
              <ProductReviewRail product={product} />
            </article>
          )
        })}
      </div>

      {detailsImage && (
        <ImageReviewDetailsModal
          image={detailsImage}
          isPending={isPending && pendingImageId === detailsImage.id}
          staffEmail={staffEmail}
          onChangeReview={openChangeReview}
          onClose={() => setDetailsImageId(null)}
        />
      )}

      {rejectDraft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-Charcoal/55 p-4 small:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-image-title"
            data-merchandising-dialog
            tabIndex={-1}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                  Reject image
                </p>
                <h2
                  id="reject-image-title"
                  className="mt-2 text-2xl font-gyst font-bold text-Charcoal"
                >
                  What needs fixing?
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRejectDraft(null)}
                className="rounded-md p-2 text-Charcoal/45 transition hover:bg-gray-100 hover:text-Charcoal"
                aria-label="Close rejection form"
              >
                <XCircle className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="mt-5 grid gap-2">
              {rejectOptions.map((option) => {
                const Icon = option.icon
                const active = rejectDraft.reason === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setRejectDraft((current) =>
                        current ? { ...current, reason: option.value } : current
                      )
                    }
                    className={`flex min-h-[46px] items-center gap-3 rounded-md border px-3 text-left text-sm font-maison-neue transition ${
                      active
                        ? "border-Gold bg-Gold/10 text-Charcoal"
                        : "border-gray-200 bg-white text-Charcoal/65 hover:border-Gold/50"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {option.label}
                  </button>
                )
              })}
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-maison-neue-mono uppercase text-Charcoal/55">
                Optional note
              </span>
              <textarea
                value={rejectDraft.note}
                onChange={(event) =>
                  setRejectDraft((current) =>
                    current ? { ...current, note: event.target.value } : current
                  )
                }
                rows={4}
                className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-maison-neue text-Charcoal outline-none transition focus:border-Gold focus:ring-2 focus:ring-Gold/15"
                placeholder="Add detail for the image replacement pass."
              />
            </label>

            <div className="mt-5 flex flex-col-reverse gap-2 small:flex-row small:justify-end">
              <button
                type="button"
                onClick={() => setRejectDraft(null)}
                className="min-h-[42px] rounded-md border border-gray-200 px-4 text-xs font-rexton font-bold uppercase text-Charcoal"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  submitReview(
                    rejectDraft.image,
                    "rejected",
                    rejectDraft.reason,
                    rejectDraft.note
                  )
                }
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-md bg-Charcoal px-4 text-xs font-rexton font-bold uppercase text-white disabled:opacity-50"
              >
                {isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                Submit rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {changeReviewDraft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-Charcoal/55 p-4 small:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-review-title"
            data-merchandising-dialog
            tabIndex={-1}
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-maison-neue-mono uppercase text-Gold">
                  Deliberate review change
                </p>
                <h2
                  id="change-review-title"
                  className="mt-2 text-2xl font-gyst font-bold text-Charcoal"
                >
                  Change review for {changeReviewDraft.image.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setChangeReviewDraft(null)}
                className="rounded-md p-2 text-Charcoal/45 transition hover:bg-gray-100 hover:text-Charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
                aria-label="Close review change"
              >
                <XCircle className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="mt-5 rounded-md border border-gray-200 bg-Scroll/35 p-4">
              <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                Current decision
              </p>
              <p className="mt-2 font-maison-neue font-semibold text-Charcoal">
                {decisionLabel(changeReviewDraft.image.review)}
                {reviewerName(changeReviewDraft.image.review)
                  ? ` by ${reviewerName(changeReviewDraft.image.review)}`
                  : ""}
              </p>
              {changeReviewDraft.image.review.reviewedAt && (
                <p className="mt-1 text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                  {shortDate(changeReviewDraft.image.review.reviewedAt)}
                </p>
              )}
              {changeReviewDraft.image.review.status === "rejected" && (
                <div className="mt-3">
                  <LatestRejectionNote
                    image={changeReviewDraft.image}
                    compact
                  />
                </div>
              )}
            </div>

            <fieldset className="mt-5">
              <legend className="text-xs font-maison-neue-mono uppercase text-Charcoal/55">
                New decision
              </legend>
              <div className="mt-2 grid gap-2 small:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={changeReviewDraft.status === "approved"}
                  onClick={() => chooseChangedStatus("approved")}
                  className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border px-4 text-sm font-rexton font-bold uppercase transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2 ${
                    changeReviewDraft.status === "approved"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                      : "border-gray-200 bg-white text-Charcoal/65 hover:border-emerald-300"
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Approve
                </button>
                <button
                  type="button"
                  aria-pressed={changeReviewDraft.status === "rejected"}
                  onClick={() => chooseChangedStatus("rejected")}
                  className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-md border px-4 text-sm font-rexton font-bold uppercase transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2 ${
                    changeReviewDraft.status === "rejected"
                      ? "border-red-500 bg-red-50 text-red-800"
                      : "border-gray-200 bg-white text-Charcoal/65 hover:border-red-300"
                  }`}
                >
                  <XCircle className="h-4 w-4" aria-hidden />
                  Reject
                </button>
              </div>
            </fieldset>

            {changeReviewDraft.status === "rejected" && (
              <fieldset className="mt-5">
                <legend className="text-xs font-maison-neue-mono uppercase text-Charcoal/55">
                  Rejection reason
                </legend>
                <div className="mt-2 grid gap-2">
                  {rejectOptions.map((option) => {
                    const Icon = option.icon
                    const active = changeReviewDraft.reason === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setChangeReviewDraft((current) =>
                            current
                              ? { ...current, reason: option.value }
                              : current
                          )
                        }
                        className={`flex min-h-[46px] items-center gap-3 rounded-md border px-3 text-left text-sm font-maison-neue transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2 ${
                          active
                            ? "border-Gold bg-Gold/10 text-Charcoal"
                            : "border-gray-200 bg-white text-Charcoal/65 hover:border-Gold/50"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )}

            <label className="mt-5 block">
              <span className="text-xs font-maison-neue-mono uppercase text-Charcoal/55">
                Optional new review note
              </span>
              <textarea
                value={changeReviewDraft.note}
                onChange={(event) =>
                  setChangeReviewDraft((current) =>
                    current ? { ...current, note: event.target.value } : current
                  )
                }
                rows={4}
                className="mt-2 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-maison-neue text-Charcoal outline-none transition focus:border-Gold focus:ring-2 focus:ring-Gold/15"
                placeholder={
                  changeReviewDraft.status === "approved"
                    ? "Explain why this image is now approved."
                    : "Add detail for the replacement pass."
                }
              />
            </label>

            <p className="mt-4 text-sm font-maison-neue leading-6 text-Charcoal/60">
              You will review the old and new decisions once more before
              anything is saved. The existing decision and comment will remain
              in the audit history.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 small:flex-row small:justify-end">
              <button
                type="button"
                onClick={() => setChangeReviewDraft(null)}
                className="min-h-[44px] rounded-md border border-gray-200 px-4 text-xs font-rexton font-bold uppercase text-Charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={continueReviewChange}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-Charcoal px-4 text-xs font-rexton font-bold uppercase text-white transition hover:bg-Charcoal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
              >
                Continue to confirmation
              </button>
            </div>
          </div>
        </div>
      )}

      {overwriteDraft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-Charcoal/55 p-4 small:items-center">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="overwrite-review-title"
            aria-describedby="overwrite-review-description"
            data-merchandising-dialog
            tabIndex={-1}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-maison-neue-mono uppercase text-red-700">
                  Already reviewed
                </p>
                <h2
                  id="overwrite-review-title"
                  className="mt-2 text-2xl font-gyst font-bold text-Charcoal"
                >
                  Confirm this review change
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOverwriteDraft(null)}
                className="rounded-md p-2 text-Charcoal/45 transition hover:bg-gray-100 hover:text-Charcoal"
                aria-label="Close overwrite warning"
              >
                <XCircle className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="mt-5 grid gap-3 small:grid-cols-2">
              <div className="rounded-md border border-gray-200 bg-Scroll/35 p-4 text-sm font-maison-neue text-Charcoal">
                <p className="text-xs font-maison-neue-mono uppercase text-Charcoal/45">
                  Current
                </p>
                <p className="mt-2 font-semibold">
                  {overwriteDraft.latestReview
                    ? decisionLabel(overwriteDraft.latestReview)
                    : "Reviewed"}
                </p>
                <p className="mt-1 break-words text-xs text-Charcoal/60">
                  {overwriteDraft.latestReview?.reviewerName ||
                    overwriteDraft.latestReview?.reviewerEmail ||
                    "Reviewer not recorded"}
                </p>
                {overwriteDraft.latestReview?.note && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs">
                    {overwriteDraft.latestReview.note}
                  </p>
                )}
              </div>
              <div
                className={`rounded-md border p-4 text-sm font-maison-neue ${
                  overwriteDraft.status === "approved"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                <p className="text-xs font-maison-neue-mono uppercase opacity-65">
                  New
                </p>
                <p className="mt-2 font-semibold">
                  {overwriteDraft.status === "approved"
                    ? "Approved"
                    : "Rejected"}
                </p>
                {overwriteDraft.status === "rejected" &&
                  overwriteDraft.reason && (
                    <p className="mt-1 text-xs">
                      {reasonLabel(overwriteDraft.reason)}
                    </p>
                  )}
                {overwriteDraft.note && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-xs">
                    {overwriteDraft.note}
                  </p>
                )}
              </div>
            </div>

            <p
              id="overwrite-review-description"
              className="mt-4 text-sm font-maison-neue leading-6 text-Charcoal/65"
            >
              Confirm only if you intentionally want your decision to become the
              latest review. The previous decision will stay in the audit
              history.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-2 small:flex-row small:justify-end">
              <button
                type="button"
                data-autofocus
                onClick={() => setOverwriteDraft(null)}
                className="min-h-[44px] rounded-md border border-gray-200 px-4 text-xs font-rexton font-bold uppercase text-Charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2"
              >
                Keep existing
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  submitReview(
                    overwriteDraft.image,
                    overwriteDraft.status,
                    overwriteDraft.reason,
                    overwriteDraft.note,
                    true
                  )
                }
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-red-700 px-4 text-xs font-rexton font-bold uppercase text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-Gold focus-visible:ring-offset-2 disabled:opacity-50"
              >
                {isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                Confirm review change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
