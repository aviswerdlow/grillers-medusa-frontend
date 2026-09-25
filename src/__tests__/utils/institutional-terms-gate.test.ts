import { canShowInvoiceCheckout } from "@lib/util/institutional-terms"

describe("institutional invoice checkout flag", () => {
  const original = process.env.GP_INSTITUTIONAL_TERMS_ENABLED

  afterEach(() => {
    if (original === undefined) {
      delete process.env.GP_INSTITUTIONAL_TERMS_ENABLED
    } else {
      process.env.GP_INSTITUTIONAL_TERMS_ENABLED = original
    }
  })

  const cases: Array<[string | undefined, boolean, boolean]> = [
    [undefined, true, false],
    ["", true, false],
    ["false", true, false],
    ["TRUE", true, false],
    ["1", true, false],
    ["true ", true, false],
    ["true", false, false],
    ["true", true, true],
  ]

  it.each(cases)("flag %s with approved=%s shows invoice=%s", (value, approved, expected) => {
    if (value === undefined) {
      delete process.env.GP_INSTITUTIONAL_TERMS_ENABLED
    } else {
      process.env.GP_INSTITUTIONAL_TERMS_ENABLED = value
    }

    expect(canShowInvoiceCheckout(approved)).toBe(expected)
  })
})
