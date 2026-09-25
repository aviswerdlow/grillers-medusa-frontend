/**
 * @jest-environment node
 */

const { warmRoute } = require("../../../.github/scripts/warm-route.cjs")

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
