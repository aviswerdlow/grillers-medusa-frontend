import type { RecipeTaxonomyInput } from "./recipe-taxonomy"

/** Keep snapshot text and taxonomy, replacing only published recipe images. */
export function overlayRecipeImages<
  T extends Pick<RecipeTaxonomyInput, "Slug" | "Image">
>(cards: readonly T[], images: ReadonlyMap<string, string>): T[] {
  return cards.map((card) => {
    const url = images.get(card.Slug)
    return url ? { ...card, Image: { ...card.Image, url } } : card
  })
}
