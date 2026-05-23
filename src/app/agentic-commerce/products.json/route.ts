import { buildAgenticCommerceProductFeed } from "@lib/agentic-commerce/feed"
import { listProducts } from "@lib/data/products"
import { getBaseURL } from "@lib/util/env"
import { HttpTypes } from "@medusajs/types"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const DEFAULT_COUNTRY_CODE = "us"
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 250

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return fallback
  return parsed
}

export async function GET(request: NextRequest) {
  const countryCode = (
    request.nextUrl.searchParams.get("countryCode") || DEFAULT_COUNTRY_CODE
  ).toLowerCase()
  const page = parsePositiveInteger(request.nextUrl.searchParams.get("page"), 1)
  const limit = Math.min(
    parsePositiveInteger(
      request.nextUrl.searchParams.get("limit"),
      DEFAULT_LIMIT
    ),
    MAX_LIMIT
  )

  const {
    response: { products, count },
    nextPage,
  } = await listProducts({
    pageParam: page,
    countryCode,
    queryParams: {
      limit,
    } as HttpTypes.FindParams & HttpTypes.StoreProductParams,
  })

  const feed = buildAgenticCommerceProductFeed(products, {
    baseUrl: getBaseURL(),
    countryCode,
  })

  return NextResponse.json(
    {
      ...feed,
      pagination: {
        page,
        limit,
        count,
        next_page: nextPage,
      },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    }
  )
}
