import { requestBackInStockNotification } from "@lib/data/back-in-stock"
import { trackCommunicationEvent } from "@lib/data/communications-events"
import { emitStorefrontOpsAlert } from "@lib/ops-alert"
import { sendTemplatedEmail } from "@lib/postmark"
import { resolvePublicWaitlistProduct } from "@lib/data/public-waitlist-product"

jest.mock("@lib/data/public-waitlist-product", () => ({
  resolvePublicWaitlistProduct: jest.fn(),
}))

jest.mock("@lib/postmark", () => ({
  sendTemplatedEmail: jest.fn(),
}))

jest.mock("@lib/data/communications-events", () => ({
  trackCommunicationEvent: jest.fn(async () => undefined),
}))

jest.mock("@lib/ops-alert", () => ({
  emitStorefrontOpsAlert: jest.fn(async () => ({ ok: true, skipped: false })),
}))

const emitStorefrontOpsAlertMock =
  emitStorefrontOpsAlert as jest.MockedFunction<typeof emitStorefrontOpsAlert>
const sendTemplatedEmailMock = sendTemplatedEmail as jest.MockedFunction<
  typeof sendTemplatedEmail
>
const trackCommunicationEventMock =
  trackCommunicationEvent as jest.MockedFunction<typeof trackCommunicationEvent>

describe("back-in-stock alerting", () => {
  const originalEnv = process.env
  const originalFetch = global.fetch
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(resolvePublicWaitlistProduct).mockResolvedValue({
      medusaProductId: "prod_123",
      medusaVariantId: "variant_123",
      productHandle: "first-cut-brisket",
      productTitle: "First Cut Brisket",
      sku: "10-01-01",
      quickBooksListId: undefined,
    })
    consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    process.env = {
      ...originalEnv,
      STRAPI_ENDPOINT: "https://strapi.example.com",
      STRAPI_API_TOKEN: "strapi-token",
      NEXT_PUBLIC_BASE_URL: "https://www.grillerspride.com",
    }
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    process.env = originalEnv
    global.fetch = originalFetch
  })

  it("does not persist or send when canonical eligibility cannot be verified", async () => {
    jest
      .mocked(resolvePublicWaitlistProduct)
      .mockRejectedValue(new Error("unavailable"))
    global.fetch = jest.fn()
    const result = await requestBackInStockNotification({
      email: "shopper@example.com",
      medusaProductId: "prod_internal",
      medusaVariantId: "variant_internal",
      productHandle: "forged-retail",
      productTitle: "Retail",
      sku: "retail",
    })
    expect(result.ok).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled()
    expect(trackCommunicationEventMock).not.toHaveBeenCalled()
  })

  it("persists and emails canonical identity instead of client-provided product facts", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 1 } }),
      })
    sendTemplatedEmailMock.mockResolvedValue({ ok: true, messageId: "msg" })
    expect(
      await requestBackInStockNotification({
        email: "shopper@example.com",
        medusaProductId: "prod_123",
        medusaVariantId: "variant_123",
        productHandle: "forged",
        productTitle: "Forged",
        sku: "RM-forged",
        quickBooksListId: "forged",
      })
    ).toEqual({ ok: true })
    const payload = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[1][1].body
    ).data
    expect(payload).toMatchObject({
      ProductTitle: "First Cut Brisket",
      ProductHandle: "first-cut-brisket",
      Sku: "10-01-01",
    })
    expect(payload.QuickBooksListId).toBeUndefined()
    expect(sendTemplatedEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        templateModel: expect.objectContaining({
          product_title: "First Cut Brisket",
        }),
      })
    )
  })

  it("alerts and returns an error when Strapi cannot persist the request", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "persist failed for shopper@example.com",
      }) as any

    const result = await requestBackInStockNotification({
      email: "shopper@example.com",
      medusaProductId: "prod_123",
      medusaVariantId: "variant_123",
      productHandle: "first-cut-brisket",
      productTitle: "First Cut Brisket",
      sku: "10-01-01",
      source: "pdp",
    })

    expect(result).toEqual({
      ok: false,
      error: "We couldn't save your request. Please try again.",
    })
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled()
    expect(emitStorefrontOpsAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "back_in_stock_capture_failed",
        path: "src/lib/data/back-in-stock.ts",
        meta: expect.objectContaining({
          stage: "strapi_persist",
          status: 500,
          medusa_product_id: "prod_123",
          medusa_variant_id: "variant_123",
          product_handle: "first-cut-brisket",
          sku: "10-01-01",
          source: "pdp",
          waitlist_reason: "out_of_stock",
          error_message: "persist failed for [email]",
        }),
      })
    )
  })

  it("alerts but keeps capture fail-open when duplicate lookup fails", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({ error: "lookup unavailable" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 7, documentId: "bis_doc_7" } }),
      }) as any
    sendTemplatedEmailMock.mockResolvedValue({
      ok: true,
      messageId: "msg_123",
    })

    const result = await requestBackInStockNotification({
      email: "shopper@example.com",
      medusaProductId: "prod_123",
      medusaVariantId: "variant_123",
      productHandle: "first-cut-brisket",
      productTitle: "First Cut Brisket",
      sku: "10-01-01",
      source: "pdp",
    })

    expect(result).toEqual({ ok: true })
    expect(sendTemplatedEmailMock).toHaveBeenCalled()
    expect(trackCommunicationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "waitlist_joined",
        properties: expect.objectContaining({
          confirmation_email_sent: true,
          strapi_id: "bis_doc_7",
        }),
      })
    )
    expect(emitStorefrontOpsAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "back_in_stock_capture_failed",
        fingerprint: "back_in_stock:dedupe_lookup:503",
        meta: expect.objectContaining({
          stage: "dedupe_lookup",
          status: 503,
          medusa_product_id: "prod_123",
          medusa_variant_id: "variant_123",
          product_handle: "first-cut-brisket",
          sku: "10-01-01",
          source: "pdp",
          waitlist_reason: "out_of_stock",
        }),
      })
    )
    expect(JSON.stringify(emitStorefrontOpsAlertMock.mock.calls)).not.toContain(
      "shopper@example.com"
    )
  })

  it("alerts but keeps the subscriber saved when confirmation email fails", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: 7, documentId: "bis_doc_7" } }),
      }) as any
    sendTemplatedEmailMock.mockResolvedValue({
      ok: false,
      message: "Postmark rejected shopper@example.com",
    })

    const result = await requestBackInStockNotification({
      email: "shopper@example.com",
      medusaProductId: "prod_123",
      medusaVariantId: "variant_123",
      productHandle: "first-cut-brisket",
      productTitle: "First Cut Brisket",
      sku: "10-01-01",
      waitlistReason: "allocated_out",
      source: "side_cart",
    })

    expect(result).toEqual({ ok: true })
    expect(trackCommunicationEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "waitlist_joined",
        properties: expect.objectContaining({
          confirmation_email_sent: false,
          strapi_id: "bis_doc_7",
        }),
      })
    )
    expect(emitStorefrontOpsAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alertKind: "back_in_stock_capture_failed",
        fingerprint: "back_in_stock:confirmation_email:unknown",
        meta: expect.objectContaining({
          stage: "confirmation_email",
          strapi_id: "bis_doc_7",
          source: "side_cart",
          waitlist_reason: "allocated_out",
          error_message: "Postmark rejected [email]",
        }),
      })
    )
  })

  it.each(["sku", "lifecycle"])(
    "does not notify historical internal subscriptions classified by %s",
    async (classification) => {
      process.env.MEDUSA_BACKEND_URL = "https://medusa.example.com"
      process.env.MEDUSA_READ_ONLY_API_TOKEN = "admin-token"
      global.fetch = jest.fn(async (url: string) => {
        if (
          String(url).startsWith("https://medusa.example.com/admin/products")
        ) {
          return {
            ok: true,
            json: async () => ({
              products: [
                {
                  id: "prod_123",
                  status: "published",
                  metadata:
                    classification === "lifecycle"
                      ? { availability_lifecycle: "internal_only" }
                      : {},
                  variants: [
                    {
                      id: "variant_123",
                      sku: classification === "sku" ? " RM-raw " : "renamed",
                      inventory_quantity: 10,
                    },
                  ],
                },
              ],
            }),
          }
        }
        return {
          ok: true,
          json: async () => ({
            data: String(url).includes("%24notNull")
              ? []
              : [
                  {
                    documentId: "bis_old",
                    Email: "shopper@example.com",
                    MedusaProductId: "prod_123",
                    MedusaVariantId: "variant_123",
                    ProductHandle: "old-name",
                    ProductTitle: "Old Name",
                    UnsubscribeToken: "token",
                    NotifiedAt: null,
                    UnsubscribedAt: null,
                  },
                ],
            meta: { pagination: { pageCount: 1 } },
          }),
        }
      }) as any
      const { runBackInStockTrigger } = await import(
        "@lib/data/back-in-stock-trigger"
      )
      const summary = await runBackInStockTrigger()
      expect(summary.subscribersNotified).toBe(0)
      expect(sendTemplatedEmailMock).not.toHaveBeenCalled()
      expect(trackCommunicationEventMock).not.toHaveBeenCalled()
    }
  )

  it("surfaces Medusa inventory lookup failures in the cron summary without sending notifications", async () => {
    process.env.MEDUSA_BACKEND_URL = "https://medusa.example.com"
    process.env.MEDUSA_READ_ONLY_API_TOKEN = "admin-token"
    global.fetch = jest.fn(async (url: string) => {
      const href = String(url)
      if (href.startsWith("https://medusa.example.com/admin/products")) {
        return {
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          text: async () => "inventory unavailable for shopper@example.com",
        }
      }
      if (
        href.startsWith(
          "https://strapi.example.com/api/back-in-stock-requests"
        ) &&
        href.includes("%24notNull")
      ) {
        return {
          ok: true,
          json: async () => ({ data: [] }),
        }
      }
      if (
        href.startsWith("https://strapi.example.com/api/back-in-stock-requests")
      ) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                documentId: "bis_doc_7",
                Email: "shopper@example.com",
                MedusaProductId: "prod_123",
                MedusaVariantId: "variant_123",
                ProductHandle: "first-cut-brisket",
                ProductTitle: "First Cut Brisket",
                Sku: "10-01-01",
                UnsubscribeToken: "token_123",
                NotifiedAt: null,
                UnsubscribedAt: null,
              },
            ],
            meta: { pagination: { pageCount: 1 } },
          }),
        }
      }
      throw new Error(`unexpected fetch ${href}`)
    }) as any

    const { runBackInStockTrigger } = await import(
      "@lib/data/back-in-stock-trigger"
    )
    const summary = await runBackInStockTrigger()

    expect(summary).toMatchObject({
      ok: true,
      productsConsidered: 1,
      productsBackInStock: 0,
      subscribersNotified: 0,
      subscribersFailed: 0,
    })
    expect(summary.errors).toHaveLength(1)
    expect(summary.errors[0]).toContain(
      "Medusa /admin/products inventory batch failed (503)"
    )
    expect(JSON.stringify(summary.errors)).not.toContain("shopper@example.com")
    expect(sendTemplatedEmailMock).not.toHaveBeenCalled()
    expect(trackCommunicationEventMock).not.toHaveBeenCalled()
  })
})
