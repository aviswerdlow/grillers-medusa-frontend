jest.mock("server-only", () => ({}))

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  unstable_cache: (fn: any) => fn,
}))

jest.mock("@lib/data/customer", () => ({
  retrieveAuthenticatedCustomerForStaffAccess: jest.fn(async () => ({
    email: "staff@example.com",
  })),
}))

jest.mock("@lib/util/staff-access", () => ({
  canReviewMerchandising: jest.fn(() => true),
  staffDisplayName: jest.fn(() => "Staff Reviewer"),
}))

jest.mock("@lib/staff-merchandising-ops-alerts", () => ({
  emitStaffMerchandisingActionFailureAlert: jest.fn(async () => undefined),
  emitStaffMerchandisingReviewTelemetry: jest.fn(async () => undefined),
}))

import { revalidatePath } from "next/cache"
import {
  emitStaffMerchandisingActionFailureAlert,
  emitStaffMerchandisingReviewTelemetry,
} from "@lib/staff-merchandising-ops-alerts"
import { reviewMerchandisingImage } from "@lib/data/staff/product-merchandising"

const emitReviewTelemetryMock =
  emitStaffMerchandisingReviewTelemetry as jest.MockedFunction<
    typeof emitStaffMerchandisingReviewTelemetry
  >
const emitActionFailureMock =
  emitStaffMerchandisingActionFailureAlert as jest.MockedFunction<
    typeof emitStaffMerchandisingActionFailureAlert
  >

function reviewCaption(payload: Record<string, unknown>) {
  return `GP_IMAGE_REVIEW_V1:${JSON.stringify(payload)}`
}

describe("product merchandising review telemetry", () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRAPI_ENDPOINT: "https://strapi.example.test",
      STRAPI_API_TOKEN: "read-token",
      STRAPI_REWRITE_API_TOKEN: "write-token",
    }
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it("emits info telemetry after a successful review save", async () => {
    const latestCaption = reviewCaption({
      review: { status: "unreviewed" },
      auditHistory: [],
    })
    let writtenCaption = ""
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/upload/files?")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 123,
              documentId: "img_doc",
              url: "/uploads/img_doc.jpg",
              caption: latestCaption,
            },
          ],
        } as unknown as Response
      }

      if (url.endsWith("/api/gp-upload-files/123/caption")) {
        expect(init?.method).toBe("POST")
        const body = JSON.parse(String(init?.body))
        writtenCaption = body.caption
        expect(body.expectedCaption).toBe(latestCaption)
        return {
          ok: true,
          json: async () => ({}),
        } as unknown as Response
      }

      if (url.endsWith("/api/upload/files/123")) {
        return {
          ok: true,
          json: async () => ({
            id: 123,
            documentId: "img_doc",
            url: "/uploads/img_doc.jpg",
            caption: writtenCaption,
          }),
        } as unknown as Response
      }

      throw new Error(`Unexpected fetch ${url}`)
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await reviewMerchandisingImage({
      imageId: 123,
      imageDocumentId: "img_doc",
      countryCode: "us",
      status: "approved",
      currentCaption: latestCaption,
    })

    expect(result.ok).toBe(true)
    expect(revalidatePath).toHaveBeenCalledWith(
      "/us/account/staff/merchandising"
    )
    expect(emitReviewTelemetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "saved",
        imageId: 123,
        imageDocumentId: "img_doc",
        countryCode: "us",
        status: "approved",
        previousStatus: "unreviewed",
      })
    )
  })

  it("falls back when the legacy Strapi upload endpoint accepts but does not persist the caption", async () => {
    const latestCaption = reviewCaption({
      review: { status: "unreviewed" },
      auditHistory: [],
    })
    let writtenCaption = ""
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/upload/files?")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 123,
              documentId: "img_doc",
              url: "/uploads/img_doc.jpg",
              caption: latestCaption,
            },
          ],
        } as unknown as Response
      }

      if (url.endsWith("/api/gp-upload-files/123/caption")) {
        expect(init?.method).toBe("POST")
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { message: "Not Found" } }),
        } as unknown as Response
      }

      if (url.endsWith("/api/upload?id=123")) {
        expect(init?.method).toBe("POST")
        return {
          ok: true,
          json: async () => ({}),
        } as unknown as Response
      }

      if (url.endsWith("/api/upload/files/123") && init?.method === "PUT") {
        writtenCaption =
          JSON.parse(String(init.body)).caption ||
          JSON.parse(String(init.body)).fileInfo?.caption
        return {
          ok: true,
          json: async () => ({}),
        } as unknown as Response
      }

      if (url.endsWith("/api/upload/files/123")) {
        return {
          ok: true,
          json: async () => ({
            id: 123,
            documentId: "img_doc",
            url: "/uploads/img_doc.jpg",
            caption: writtenCaption || latestCaption,
          }),
        } as unknown as Response
      }

      throw new Error(`Unexpected fetch ${url}`)
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await reviewMerchandisingImage({
      imageId: 123,
      imageDocumentId: "img_doc",
      countryCode: "us",
      status: "rejected",
      reason: "other",
      note: "Options note",
      currentCaption: latestCaption,
    })

    expect(result.ok).toBe(true)
    expect(result.review?.status).toBe("rejected")
    expect(result.review?.reason).toBe("other")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://strapi.example.test/api/upload/files/123",
      expect.objectContaining({
        method: "PUT",
      })
    )
  })

  it("emits conflict telemetry when an existing review blocks overwrite", async () => {
    const latestCaption = reviewCaption({
      review: {
        status: "approved",
        reviewerName: "Peter",
        reviewedAt: "2026-06-28T12:00:00.000Z",
      },
      auditHistory: [],
    })
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes("/api/upload/files?")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 123,
              documentId: "img_doc",
              url: "/uploads/img_doc.jpg",
              caption: latestCaption,
            },
          ],
        } as unknown as Response
      }

      throw new Error(`Unexpected fetch ${url}`)
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await reviewMerchandisingImage({
      imageId: 123,
      imageDocumentId: "img_doc",
      countryCode: "us",
      status: "rejected",
      reason: "other",
      currentCaption: null,
    })

    expect(result.ok).toBe(false)
    expect(result.conflict).toBe(true)
    expect(result.canOverwrite).toBe(true)
    expect(emitReviewTelemetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "conflict",
        imageId: 123,
        imageDocumentId: "img_doc",
        countryCode: "us",
        status: "rejected",
        previousStatus: "approved",
        conflictReason: "existing_review",
      })
    )
  })

  it("emits conflict telemetry when the image caption changed while loaded", async () => {
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes("/api/upload/files?")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 123,
              documentId: "img_doc",
              url: "/uploads/img_doc.jpg",
              caption: "Legacy caption changed by another reviewer",
            },
          ],
        } as unknown as Response
      }

      throw new Error(`Unexpected fetch ${url}`)
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await reviewMerchandisingImage({
      imageId: 123,
      imageDocumentId: "img_doc",
      countryCode: "us",
      status: "approved",
      currentCaption: "Legacy caption from initial page load",
    })

    expect(result.ok).toBe(false)
    expect(result.conflict).toBe(true)
    expect(emitReviewTelemetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "conflict",
        imageId: 123,
        imageDocumentId: "img_doc",
        countryCode: "us",
        status: "approved",
        previousStatus: "unreviewed",
        conflictReason: "caption_changed",
      })
    )
  })

  it("requires a fresh comparison when a reviewed image changes before an intentional overwrite", async () => {
    const loadedCaption = reviewCaption({
      review: {
        status: "rejected",
        reason: "other",
        note: "Loaded rejection",
        reviewerName: "Red",
        reviewedAt: "2026-06-28T12:00:00.000Z",
      },
      auditHistory: [],
    })
    const latestCaption = reviewCaption({
      review: {
        status: "approved",
        note: "A newer decision",
        reviewerName: "Peter",
        reviewedAt: "2026-06-29T12:00:00.000Z",
      },
      auditHistory: [],
    })
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes("/api/upload/files?")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 123,
              documentId: "img_doc",
              url: "/uploads/img_doc.jpg",
              caption: latestCaption,
            },
          ],
        } as unknown as Response
      }

      throw new Error(`Unexpected write during stale overwrite: ${url}`)
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await reviewMerchandisingImage({
      imageId: 123,
      imageDocumentId: "img_doc",
      countryCode: "us",
      status: "approved",
      note: "My proposed decision",
      currentCaption: loadedCaption,
      overwriteExistingReview: true,
    })

    expect(result.ok).toBe(false)
    expect(result.conflict).toBe(true)
    expect(result.canOverwrite).toBe(true)
    expect(result.latestReview).toEqual(
      expect.objectContaining({
        status: "approved",
        note: "A newer decision",
        reviewerName: "Peter",
      })
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(emitReviewTelemetryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "conflict",
        imageId: 123,
        previousStatus: "approved",
        conflictReason: "caption_changed_with_review",
        overwriteExistingReview: true,
      })
    )
  })

  it("does not fall back to non-atomic upload routes for an intentional overwrite", async () => {
    const latestCaption = reviewCaption({
      review: {
        status: "rejected",
        reason: "other",
        note: "Confirmed rejection",
        reviewerName: "Red",
        reviewedAt: "2026-06-28T12:00:00.000Z",
      },
      auditHistory: [],
    })
    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes("/api/upload/files?")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 123,
              documentId: "img_doc",
              url: "/uploads/img_doc.jpg",
              caption: latestCaption,
            },
          ],
        } as unknown as Response
      }

      if (url.endsWith("/api/gp-upload-files/123/caption")) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { message: "Not Found" } }),
        } as unknown as Response
      }

      throw new Error(`Unsafe legacy overwrite attempt: ${url}`)
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await reviewMerchandisingImage({
      imageId: 123,
      imageDocumentId: "img_doc",
      countryCode: "us",
      status: "approved",
      currentCaption: latestCaption,
      overwriteExistingReview: true,
    })

    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://strapi.example.test/api/upload?id=123",
      expect.anything()
    )
    expect(emitActionFailureMock).toHaveBeenCalled()
  })

  it("keeps hard Strapi write failures on the page-level action alert", async () => {
    const latestCaption = reviewCaption({
      review: { status: "unreviewed" },
      auditHistory: [],
    })
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/upload/files?")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 123,
              documentId: "img_doc",
              url: "/uploads/img_doc.jpg",
              caption: latestCaption,
            },
          ],
        } as unknown as Response
      }

      if (
        url.endsWith("/api/gp-upload-files/123/caption") ||
        url.endsWith("/api/upload?id=123") ||
        (url.endsWith("/api/upload/files/123") && init?.method === "PUT")
      ) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: { message: "write failed" } }),
        } as unknown as Response
      }

      throw new Error(`Unexpected fetch ${url}`)
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await reviewMerchandisingImage({
      imageId: 123,
      imageDocumentId: "img_doc",
      countryCode: "us",
      status: "approved",
      currentCaption: latestCaption,
    })

    expect(result.ok).toBe(false)
    expect(emitActionFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "review",
        imageId: 123,
        imageDocumentId: "img_doc",
        countryCode: "us",
        status: "approved",
        error: expect.any(Error),
      })
    )
  })

  it("keeps accepted-but-unpersisted Strapi writes on the page-level action alert", async () => {
    const latestCaption = reviewCaption({
      review: { status: "unreviewed" },
      auditHistory: [],
    })
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/upload/files?")) {
        return {
          ok: true,
          json: async () => [
            {
              id: 123,
              documentId: "img_doc",
              url: "/uploads/img_doc.jpg",
              caption: latestCaption,
            },
          ],
        } as unknown as Response
      }

      if (
        url.endsWith("/api/gp-upload-files/123/caption") ||
        url.endsWith("/api/upload?id=123") ||
        (url.endsWith("/api/upload/files/123") && init?.method === "PUT")
      ) {
        return {
          ok: true,
          json: async () => ({}),
        } as unknown as Response
      }

      if (url.endsWith("/api/upload/files/123")) {
        return {
          ok: true,
          json: async () => ({
            id: 123,
            documentId: "img_doc",
            url: "/uploads/img_doc.jpg",
            caption: latestCaption,
          }),
        } as unknown as Response
      }

      throw new Error(`Unexpected fetch ${url}`)
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await reviewMerchandisingImage({
      imageId: 123,
      imageDocumentId: "img_doc",
      countryCode: "us",
      status: "approved",
      currentCaption: latestCaption,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain("accepted but media readback")
    expect(emitActionFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "review",
        imageId: 123,
        imageDocumentId: "img_doc",
        countryCode: "us",
        status: "approved",
        error: expect.any(Error),
      })
    )
  })
})
