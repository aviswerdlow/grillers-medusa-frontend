/** @jest-environment node */

jest.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status || 200 }) } }))
jest.mock("@lib/data/cookies", () => ({ getAuthHeaders: jest.fn() }))
jest.mock("@lib/data/customer", () => ({ retrieveAuthenticatedCustomerForStaffAccess: jest.fn() }))
jest.mock("@lib/data/staff/admin", () => ({ adminHeaders: jest.fn(() => ({ Authorization: "Basic fixture" })) }))
jest.mock("@lib/util/staff-access", () => ({ canUseLocalMilestones: jest.fn(() => true) }))

import { getAuthHeaders } from "@lib/data/cookies"
import { retrieveAuthenticatedCustomerForStaffAccess } from "@lib/data/customer"
import { PUT } from "../../app/api/staff/local-milestones/orders/[orderId]/evidence/[uploadId]/route"

describe("#367 phone photo proxy", () => {
  const oldFlag = process.env.GP_LOCAL_MILESTONES_ENABLED
  const oldBackend = process.env.MEDUSA_BACKEND_URL
  const oldFetch = global.fetch
  const params = { params: Promise.resolve({ orderId: "order_fixture", uploadId: "upload_retry_01" }) }
  const image = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])
  const hash = "a".repeat(64)
  const request = (size = image.length) => new Request("https://storefront.test/api/staff/local-milestones/orders/order_fixture/evidence/upload_retry_01", {
    method: "PUT", body: image,
    headers: { "content-type": "image/jpeg", "x-gp-evidence-size": String(size), "x-gp-evidence-sha256": hash },
  }) as any

  beforeEach(() => {
    process.env.GP_LOCAL_MILESTONES_ENABLED = "true"
    process.env.MEDUSA_BACKEND_URL = "https://medusa.fixture.test"
    jest.clearAllMocks()
    ;(getAuthHeaders as jest.Mock).mockResolvedValue({ authorization: "Bearer customer-fixture" })
    ;(retrieveAuthenticatedCustomerForStaffAccess as jest.Mock).mockResolvedValue({ id: "cus_driver" })
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ evidence: { status: "stored_private" } }), { status: 201 })) as any
  })
  afterAll(() => {
    if (oldFlag === undefined) delete process.env.GP_LOCAL_MILESTONES_ENABLED
    else process.env.GP_LOCAL_MILESTONES_ENABLED = oldFlag
    if (oldBackend === undefined) delete process.env.MEDUSA_BACKEND_URL
    else process.env.MEDUSA_BACKEND_URL = oldBackend
    global.fetch = oldFetch
  })

  it("denies missing staff auth before reading or forwarding photo bytes", async () => {
    ;(getAuthHeaders as jest.Mock).mockResolvedValue({})
    const result = await PUT(request(), params) as any
    expect(result.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("rejects an oversized declared photo and keeps the feature off by default", async () => {
    expect((await PUT(request(5 * 1024 * 1024), params) as any).status).toBe(422)
    process.env.GP_LOCAL_MILESTONES_ENABLED = "false"
    expect((await PUT(request(), params) as any).status).toBe(404)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("forwards a bounded photo only with the server gateway and current customer token", async () => {
    const result = await PUT(request(), params) as any
    expect(result.status).toBe(200)
    expect(global.fetch).toHaveBeenCalledWith(
      "https://medusa.fixture.test/admin/grillers/local-milestones/orders/order_fixture/evidence/upload_retry_01",
      expect.objectContaining({ method: "PUT", headers: expect.objectContaining({
        Authorization: "Basic fixture", "x-gp-staff-authorization": "Bearer customer-fixture",
      }) })
    )
  })
})
