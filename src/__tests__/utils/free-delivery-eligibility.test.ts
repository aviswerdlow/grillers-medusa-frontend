import {
  freeDeliveryEligibilityMetadata,
  getExcludedFreeDeliverySubtotal,
  getFreeDeliveryEligibleSubtotal,
  getLineItemFreeDeliveryExclusionReason,
  getProductFreeDeliveryEligibility,
  isLineItemFreeDeliveryEligible,
} from "@lib/util/free-delivery-eligibility"

describe("free delivery eligibility", () => {
  it("defaults products and cart lines to eligible", () => {
    expect(getProductFreeDeliveryEligibility(null).qualifies).toBe(true)
    expect(isLineItemFreeDeliveryEligible({ metadata: {} } as any)).toBe(true)
  })

  it("lets a SKU-level exclusion override the product default", () => {
    const product = {
      Metadata: { QualifiesForFreeDeliveryOffers: true },
      MedusaProduct: {
        Variants: [
          { Sku: "A", QualifiesForFreeDeliveryOffers: true },
          {
            Sku: "B",
            QualifiesForFreeDeliveryOffers: false,
            FreeDeliveryExclusionReason: "Bulky low-margin item",
          },
        ],
      },
    }

    expect(getProductFreeDeliveryEligibility(product, "A").qualifies).toBe(true)
    expect(getProductFreeDeliveryEligibility(product, "B")).toEqual({
      qualifies: false,
      reason: "Bulky low-margin item",
    })
  })

  it("lets an explicit SKU inclusion override a product-level exclusion", () => {
    const product = {
      Metadata: {
        QualifiesForFreeDeliveryOffers: false,
        FreeDeliveryExclusionReason: "Product family is usually excluded",
      },
      MedusaProduct: {
        Variants: [
          { Sku: "SMALL", QualifiesForFreeDeliveryOffers: true },
          {
            Sku: "BULK",
            QualifiesForFreeDeliveryOffers: false,
            FreeDeliveryExclusionReason: "Cheap bulky case",
          },
        ],
      },
    }

    expect(getProductFreeDeliveryEligibility(product, "SMALL")).toEqual({
      qualifies: true,
    })
    expect(getProductFreeDeliveryEligibility(product, "BULK")).toEqual({
      qualifies: false,
      reason: "Cheap bulky case",
    })
  })

  it("does not infer a SKU exclusion from the first variant when no SKU is selected", () => {
    const product = {
      Metadata: { QualifiesForFreeDeliveryOffers: true },
      MedusaProduct: {
        Variants: [
          { Sku: "BULK", QualifiesForFreeDeliveryOffers: false },
          { Sku: "SMALL", QualifiesForFreeDeliveryOffers: true },
        ],
      },
    }

    expect(getProductFreeDeliveryEligibility(product).qualifies).toBe(true)
  })

  it("serializes exclusion metadata onto add-to-cart requests", () => {
    expect(
      freeDeliveryEligibilityMetadata({
        qualifies: false,
        reason: "Cheap heavy item",
      })
    ).toEqual({
      free_delivery_eligible: false,
      free_delivery_exclusion_reason: "Cheap heavy item",
    })
  })

  it("calculates cart progress from eligible line subtotal only", () => {
    const items = [
      {
        metadata: {},
        subtotal: 100,
        unit_price: 100,
        quantity: 1,
      },
      {
        metadata: {
          free_delivery_eligible: false,
          free_delivery_exclusion_reason: "Bulky low-margin item",
        },
        subtotal: 40,
        unit_price: 40,
        quantity: 1,
      },
    ] as any[]

    expect(getFreeDeliveryEligibleSubtotal(items)).toBe(100)
    expect(getExcludedFreeDeliverySubtotal(items)).toBe(40)
    expect(getLineItemFreeDeliveryExclusionReason(items[1])).toBe(
      "Bulky low-margin item"
    )
  })

  it("uses serialized item amounts for free-delivery progress", () => {
    const items = [
      { metadata: {}, subtotal: { value: "19.99" }, unit_price: "19.99", quantity: 1 },
      { metadata: {}, subtotal: { value: "invalid" }, unit_price: { numeric_: "12.50" }, quantity: 2 },
    ] as any[]

    expect(getFreeDeliveryEligibleSubtotal(items)).toBeCloseTo(44.99)
  })
})
