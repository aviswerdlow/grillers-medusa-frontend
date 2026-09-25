import type { CollectionPageLoadResult } from "@lib/data/strapi/collection-page"

type ReadyCollection = Extract<CollectionPageLoadResult, { status: "ready" }>

export default function CollectionSourceMarker({
  result,
}: {
  result: ReadyCollection
}) {
  return (
    <meta
      name="gp-collection-source"
      content={result.stale ? "last-good" : "fresh"}
      data-age-seconds={result.stale ? result.lastGoodAgeSeconds : 0}
    />
  )
}
