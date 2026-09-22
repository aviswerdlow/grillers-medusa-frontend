import React, { Suspense } from "react"

import { notFound } from "next/navigation"

import { HttpTypes } from "@medusajs/types"
import ProductDetail from "@modules/products/components/product-detail"
import HowItFitsSection from "@modules/products/components/how-it-fits"
import PairsWellWith from "@modules/products/components/pairs-well-with"
import RelatedProducts from "@modules/products/components/related-products"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import type { PurchaseHistoryItem } from "@lib/data/orders"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  strapiCommonPdpData: any | Promise<any>
  strapiProductData: any
  purchaseHistoryItem?: PurchaseHistoryItem | null
  pdpExperimentVariant?: string | null
  pdpRecommendationVariant?: string | null
}

async function PdpEducationSections({
  strapiProductData,
}: {
  strapiCommonPdpData: any | Promise<any>
  strapiProductData: any
}) {
  return (
    <>
      <HowItFitsSection recipes={strapiProductData?.Recipes} />
    </>
  )
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  strapiCommonPdpData,
  strapiProductData,
  purchaseHistoryItem,
  pdpExperimentVariant,
  pdpRecommendationVariant,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  return (
    <>
      <Suspense fallback={null}>
        <ProductDetail
          product={product}
          region={region}
          countryCode={countryCode}
          strapiProductData={strapiProductData}
          purchaseHistoryItem={purchaseHistoryItem}
          pdpExperimentVariant={pdpExperimentVariant}
        />
      </Suspense>
      <Suspense fallback={null}>
        <PairsWellWith
          product={product}
          countryCode={countryCode}
          strapiProductData={strapiProductData}
          recommendationVariant={pdpRecommendationVariant}
        />
      </Suspense>
      <Suspense fallback={null}>
        <PdpEducationSections
          strapiCommonPdpData={strapiCommonPdpData}
          strapiProductData={strapiProductData}
        />
      </Suspense>
      <div className="content-container my-16">
        <Suspense fallback={<SkeletonRelatedProducts />}>
          <RelatedProducts product={product} countryCode={countryCode} />
        </Suspense>
      </div>
    </>
  )
}

export default ProductTemplate
