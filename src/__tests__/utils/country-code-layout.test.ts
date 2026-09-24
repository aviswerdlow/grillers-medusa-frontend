import CountryLayout from "../../app/[countryCode]/layout"
import { getRegion } from "@lib/data/regions"
import { notFound } from "next/navigation"

jest.mock("@lib/data/regions", () => ({ getRegion: jest.fn() }))
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404")
  }),
}))

const mockedGetRegion = getRegion as jest.Mock
const mockedNotFound = jest.mocked(notFound)

beforeEach(() => {
  jest.clearAllMocks()
})

it("keeps the US storefront on the fast path without a region lookup", async () => {
  await expect(
    CountryLayout({ children: "home", params: Promise.resolve({ countryCode: "us" }) })
  ).resolves.toBe("home")
  expect(mockedGetRegion).not.toHaveBeenCalled()
  expect(mockedNotFound).not.toHaveBeenCalled()
})

it.each(["ProductDetails.jsp", "SPD", "us.example"])(
  "returns not found for a malformed country segment %s",
  async (countryCode) => {
    await expect(
      CountryLayout({ children: "home", params: Promise.resolve({ countryCode }) })
    ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404")
    expect(mockedGetRegion).not.toHaveBeenCalled()
    expect(mockedNotFound).toHaveBeenCalledTimes(1)
  }
)

it("returns not found for an unsupported two-letter region", async () => {
  mockedGetRegion.mockResolvedValue(null)
  await expect(
    CountryLayout({ children: "home", params: Promise.resolve({ countryCode: "xx" }) })
  ).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404")
  expect(mockedGetRegion).toHaveBeenCalledWith("xx")
  expect(mockedNotFound).toHaveBeenCalledTimes(1)
})

it("keeps a supported non-default region available", async () => {
  mockedGetRegion.mockResolvedValue({ id: "reg_ca" })
  await expect(
    CountryLayout({ children: "home", params: Promise.resolve({ countryCode: "ca" }) })
  ).resolves.toBe("home")
  expect(mockedGetRegion).toHaveBeenCalledWith("ca")
  expect(mockedNotFound).not.toHaveBeenCalled()
})
