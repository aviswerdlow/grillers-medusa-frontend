/**
 * @jest-environment node
 */

const { warmRoute, warm } = require("../../../.github/scripts/warm-route.cjs")

const deployment = new URL("https://grillers-medusa-frontend.vercel.app")

describe("post-deploy route warm-up", () => {
  it("skips an unpublished information page's 404", async () => {
    const text = jest.fn()
    const fetchImpl = jest.fn().mockResolvedValue({ status: 404, text })
    await expect(
      warmRoute("/us/page/careers", deployment, {
        allowNotFound: true,
        fetchImpl,
      })
    ).resolves.toBe("not_found")
    expect(text).not.toHaveBeenCalled()
  })

  it("names the route on a fetch failure", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error("fetch failed"))
    await expect(
      warmRoute("/us/customer-service", deployment, { fetchImpl })
    ).rejects.toThrow("Route /us/customer-service: fetch failed")
  })

  it("fails a collection 404 with its route, while accepting a healthy page", async () => {
    const missing = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    })
    await expect(
      warmRoute("/us/collections/kosher-beef", deployment, {
        fetchImpl: missing,
      })
    ).rejects.toThrow("Route /us/collections/kosher-beef: warm-up failed (404)")

    const healthy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "<main>Customer Service</main>",
    })
    await expect(
      warmRoute("/us/customer-service", deployment, { fetchImpl: healthy })
    ).resolves.toBe("warmed")
  })
})

describe("post-deploy revalidation warm-up", () => {
  it.each(["network", "timeout"])(
    "names the surface and handle on a %s failure and preserves its cause",
    async (failure) => {
      const original = new Error(
        failure === "timeout" ? "Timed out" : "fetch failed"
      )
      original.name = failure === "timeout" ? "TimeoutError" : "TypeError"
      const fetchImpl = jest.fn().mockRejectedValue(original)

      await expect(
        warm("collection", "kosher-beef", {
          deployment,
          revalidateSecret: "test-secret",
          fetchImpl,
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining(
          "surface=collection, handle=kosher-beef"
        ),
        cause: original,
      })
    }
  )

  it("keeps the cause when a response body times out", async () => {
    const timeout = new Error("Timed out")
    timeout.name = "TimeoutError"
    const fetchImpl = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => {
        throw timeout
      },
    })
    await expect(
      warm("home", undefined, {
        deployment,
        revalidateSecret: "test-secret",
        fetchImpl,
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining("surface=home, handle=<none>"),
      cause: timeout,
    })
  })

  it("names a surface without a handle and accepts a warmed response", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ warmed: true, visibleProductCount: 1 }),
    })
    await expect(
      warm("store", undefined, {
        deployment,
        revalidateSecret: "test-secret",
        fetchImpl,
      })
    ).resolves.toMatchObject({ warmed: true, visibleProductCount: 1 })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      event: "deployment.ready",
      surface: "store",
    })
  })
})
