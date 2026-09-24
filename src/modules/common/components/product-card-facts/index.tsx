type CardMetadata = {
  AvgPackWeight?: string | null
  PiecesPerPack?: string | number | null
  Cooked?: boolean
  Uncooked?: boolean
  GlutenFree?: boolean
  KosherForPassover?: boolean
}

export default function ProductCardFacts({
  metadata,
}: {
  metadata?: CardMetadata | null
}) {
  const pack = [
    metadata?.AvgPackWeight,
    metadata?.PiecesPerPack ? `${metadata.PiecesPerPack} per pack` : null,
  ].filter(Boolean)
  const facts = [
    metadata?.KosherForPassover && "Kosher for Passover",
    metadata?.Cooked ? "Cooked" : metadata?.Uncooked ? "Uncooked" : null,
    metadata?.GlutenFree && "Gluten free",
  ].filter(Boolean)
  return (
    <div className="min-w-0 space-y-1 font-maison-neue text-xs leading-relaxed text-Charcoal/75">
      {pack.length > 0 && <p>{pack.join(" · ")}</p>}
      {facts.length > 0 && <p>{facts.join(" · ")}</p>}
    </div>
  )
}
