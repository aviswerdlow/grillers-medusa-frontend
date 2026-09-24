import React from "react"
import { default as NextImage } from "next/image"
import {
  ArrowRight,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Search,
  Sparkles,
  Utensils,
} from "lucide-react"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import RecipeCardLink from "@modules/recipes/components/recipe-card-link"
import RecipeFilters, {
  FilterOptions,
} from "@modules/recipes/components/recipe-filters"
import RecipeSearch from "@modules/recipes/components/recipe-search"
import { RecipeHubAnalytics } from "@modules/recipes/components/recipe-analytics"
import {
  getWaysToShopMission,
  type WaysToShopMissionId,
} from "@lib/content/ways-to-shop"
import {
  getBucketById,
  getRecipeClassification,
  getRecipeBucketLabels,
  parseRecipeTime,
  recipeMatchesBucket,
  RECIPE_BUCKETS,
  sortRecipesForBucket,
  type RecipeAttributes,
  type RecipeBucketAssignment,
  type RecipeBucketId,
} from "@modules/recipes/lib/recipe-taxonomy"

type RecipeCardData = {
  documentId?: string
  Slug: string
  Title: string
  ShortDescription?: string
  Image?: { url: string }
  RecipeCategories?: Array<{ Name: string; Slug: string }>
  Ingredients?: Array<{ ingredient: string; id: string }>
  PrimaryRecipeBucket?: RecipeBucketId
  RecipeBucketAssignments?: RecipeBucketAssignment[]
  RecipeAttributes?: RecipeAttributes
  TaxonomyReviewNeeded?: boolean
  TotalTime?: string
  PrepTime?: string
  CookTime?: string
  Servings?: string
  Difficulty?: string
}

type RecipesCollectionProps = {
  recipes: RecipeCardData[]
  hubRecipes?: RecipeCardData[]
  page: number
  pageInfo: { pageCount: number; total: number }
  countryCode: string
  filterOptions?: FilterOptions
  currentFilters?: {
    category?: string
    method?: string
    difficulty?: string
    dietary?: string
    search?: string
    bucket?: string
    mission?: WaysToShopMissionId
  }
}

const PLACEHOLDER_DESCRIPTION = "Etiam id nisi"

const BUCKET_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "shabbos-table": Sparkles,
  "weeknight-dinner": Clock3,
  "yom-tov-passover": ChefHat,
  "kfp-briskets-roasts": Search,
  "whole-birds": ChefHat,
  "steaks-chops": Flame,
  "butchers-picks": Utensils,
}

const BROWSE_PATHS = RECIPE_BUCKETS.map((bucket) => ({
  ...bucket,
  href: `/recipes?bucket=${bucket.id}#recipes-results`,
  icon: BUCKET_ICONS[bucket.id] || Sparkles,
}))

const RecipesCollection = ({
  recipes,
  hubRecipes = [],
  page,
  pageInfo,
  countryCode,
  filterOptions,
  currentFilters,
}: RecipesCollectionProps) => {
  const { pageCount, total } = pageInfo
  const displayRecipes = uniqueRecipes(recipes.filter(isUsableRecipe))
  const hubSource = uniqueRecipes(
    [...hubRecipes, ...displayRecipes].filter(isUsableRecipe)
  )
  const activeBucket = getBucketById(currentFilters?.bucket)
  const activeMission = getWaysToShopMission(currentFilters?.mission)
  const hasActiveFilters = Boolean(
    currentFilters?.bucket ||
      currentFilters?.category ||
      currentFilters?.method ||
      currentFilters?.difficulty ||
      currentFilters?.dietary ||
      currentFilters?.search
  )
  const featureSource = hasActiveFilters ? displayRecipes : hubSource
  const featuredRecipe =
    featureSource.find((recipe) => recipe.Image?.url) || featureSource[0]
  const shelves = hasActiveFilters ? [] : buildShelves(hubSource)

  // Build pagination URL with current filters
  const buildPaginationUrl = (targetPage: number) => {
    const params = new URLSearchParams()
    if (targetPage > 1) params.set("page", targetPage.toString())
    if (currentFilters?.category)
      params.set("category", currentFilters.category)
    if (currentFilters?.method) params.set("method", currentFilters.method)
    if (currentFilters?.difficulty)
      params.set("difficulty", currentFilters.difficulty)
    if (currentFilters?.dietary) params.set("dietary", currentFilters.dietary)
    if (currentFilters?.search) params.set("q", currentFilters.search)
    if (currentFilters?.mission) params.set("mission", currentFilters.mission)
    else if (currentFilters?.bucket) params.set("bucket", currentFilters.bucket)
    const queryString = params.toString()
    return `/recipes${queryString ? `?${queryString}` : ""}`
  }

  const resultLabel = currentFilters?.search
    ? activeBucket
      ? `${activeBucket.label} matching "${currentFilters.search}"`
      : `Recipes matching "${currentFilters.search}"`
    : activeMission
    ? `${activeMission.label} recipes`
    : activeBucket
    ? activeBucket.label
    : hasActiveFilters
    ? "Filtered recipes"
    : "Latest recipes"

  return (
    <div className="bg-Scroll text-Charcoal" data-country-code={countryCode}>
      <RecipeHubAnalytics
        totalRecipes={total}
        activeSearch={currentFilters?.search}
        activeCategory={currentFilters?.category}
        activeDifficulty={currentFilters?.difficulty}
        activeBucket={currentFilters?.bucket}
      />

      <section className="border-b border-Charcoal/10 bg-Scroll">
        <div className="mx-auto grid max-w-7xl gap-8 px-4.5 py-10 md:py-14 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
          <div className="flex flex-col justify-center">
            <p className="font-maison-neue text-p-sm font-bold uppercase text-Crimson">
              Grillers Pride recipes
            </p>
            <h1 className="mt-3 max-w-4xl text-h1-mobile md:text-h2 font-gyst text-Charcoal">
              Kosher recipes for your table
            </h1>
            <p className="mt-5 max-w-2xl text-p-lg font-maison-neue text-Charcoal/75">
              Browse like a butcher&apos;s cookbook: Shabbos roasts, weeknight
              cutlets, holiday platters, whole birds, and exact-cut ideas for
              the meat in your cart.
            </p>
            <RecipeSearch
              className="mt-8 max-w-2xl"
              variant="hero"
              placeholder="Search brisket, cutlets, turkey, roast, grilling..."
            />
          </div>

          {featuredRecipe && (
            <div className="hidden md:block">
              <RecipeCard
                recipe={featuredRecipe}
                listName="Recipe hub feature"
                position={1}
                priority
                variant="featured"
              />
            </div>
          )}
        </div>
      </section>

      <div
        id="recipes-results"
        className="scroll-mt-4 mx-auto max-w-7xl px-4.5 py-8 md:scroll-mt-8 md:py-12"
      >
        <section className="mb-6 border-b border-Charcoal/10 pb-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="font-maison-neue text-p-sm font-bold uppercase text-Gold">
                Recipe categories
              </p>
              <h2 className="mt-1 font-gyst text-h4 text-Charcoal">
                Browse by occasion or cut
              </h2>
            </div>
            <LocalizedClientLink
              href="/recipes#recipes-results"
              className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border px-3 py-2 text-p-sm font-maison-neue font-semibold ${
                activeBucket
                  ? "border-Charcoal/15 bg-white text-Charcoal"
                  : "border-Gold bg-Gold text-Charcoal shadow-sm"
              }`}
              aria-current={!activeBucket ? "page" : undefined}
            >
              All
            </LocalizedClientLink>
          </div>

          <div
            className="flex snap-x gap-2 overflow-x-auto pb-2"
            aria-label="Recipe browse paths"
          >
            {BROWSE_PATHS.map((path) => {
              const Icon = path.icon
              const isActive = activeBucket?.id === path.id

              return (
                <LocalizedClientLink
                  key={path.id}
                  href={path.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`snap-start inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 font-maison-neue text-p-sm font-semibold whitespace-nowrap ${
                    isActive
                      ? "border-Gold bg-Gold text-Charcoal shadow-sm"
                      : "border-Charcoal/15 bg-white text-Charcoal"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      isActive ? "text-Charcoal" : "text-Charcoal/70"
                    }`}
                    aria-hidden="true"
                  />
                  {path.label}
                </LocalizedClientLink>
              )
            })}
          </div>

          <p className="mt-2 text-p-sm font-maison-neue text-Charcoal/65">
            {activeMission || activeBucket
              ? `${total} ${total === 1 ? "recipe" : "recipes"} shown for ${
                  activeMission?.label || activeBucket?.label
                }.`
              : `${total} recipe ideas to explore.`}
          </p>
        </section>

        <div className="mb-8 border-b border-Charcoal/10 pb-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-maison-neue text-p-sm font-bold uppercase text-Crimson">
                Your recipes
              </p>
              <h2 className="mt-2 font-gyst text-h3 text-Charcoal">
                {resultLabel}
              </h2>
              {activeBucket?.description && (
                <p className="mt-2 max-w-2xl text-p-md font-maison-neue leading-relaxed text-Charcoal/72">
                  {activeMission?.description || activeBucket.description}
                </p>
              )}
              <p className="mt-4 inline-flex min-h-[32px] items-center rounded-full bg-white px-3 font-maison-neue-mono text-[11px] font-bold uppercase tracking-wide text-Charcoal/60 ring-1 ring-Charcoal/10">
                {hasActiveFilters
                  ? `${total} matching recipes`
                  : `${total} recipe ideas`}
              </p>
            </div>
            {filterOptions && <RecipeFilters filterOptions={filterOptions} />}
          </div>
        </div>

        {!hasActiveFilters && shelves.length > 0 && (
          <section className="space-y-10 pb-10">
            {shelves.map((shelf) => (
              <section
                key={shelf.id}
                className="border-b border-Charcoal/10 pb-10"
              >
                <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="font-maison-neue text-p-sm font-bold uppercase text-Gold">
                      {shelf.eyebrow}
                    </p>
                    <h2 className="mt-2 font-gyst text-h3 text-Charcoal">
                      {shelf.title}
                    </h2>
                    <p className="mt-2 max-w-2xl text-p-md font-maison-neue text-Charcoal/65">
                      {shelf.description}
                    </p>
                  </div>
                  <LocalizedClientLink
                    href={shelf.href}
                    className="inline-flex min-h-[44px] items-center gap-2 self-start rounded-[5px] border border-Charcoal bg-white px-4 text-p-sm font-maison-neue font-bold text-Charcoal hover:bg-Charcoal hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-Gold md:self-end"
                  >
                    Browse recipes
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </LocalizedClientLink>
                </div>
                <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {shelf.recipes.map((recipe, index) => (
                    <li key={`${shelf.id}-${recipe.documentId || recipe.Slug}`}>
                      <RecipeCard
                        recipe={recipe}
                        listName={shelf.title}
                        position={index + 1}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        )}

        <section>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-maison-neue text-p-sm font-bold uppercase text-Charcoal/55">
                Full browse
              </p>
              <h2 className="mt-2 font-gyst text-h3 text-Charcoal">
                {activeMission
                  ? `${activeMission.label} recipes`
                  : activeBucket
                  ? `${activeBucket.label} recipes`
                  : hasActiveFilters
                  ? "Matching recipes"
                  : "Newest recipe ideas"}
              </h2>
            </div>
            {displayRecipes.length > 0 && (
              <p className="text-p-sm font-maison-neue text-Charcoal/60">
                Page {page} of {pageCount}
              </p>
            )}
          </div>

          {displayRecipes.length === 0 ? (
            <EmptyRecipesState />
          ) : (
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {displayRecipes.map((recipe, index) => (
                <li key={recipe.documentId || recipe.Slug}>
                  <RecipeCard
                    recipe={recipe}
                    listName={
                      hasActiveFilters
                        ? "Recipe search results"
                        : "Latest recipes"
                    }
                    position={(page - 1) * displayRecipes.length + index + 1}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Pagination */}
          {displayRecipes.length > 0 && (
            <nav className="mt-10 flex flex-col items-center justify-center gap-3 font-maison-neue text-p-sm font-bold text-Charcoal sm:flex-row">
              <div className="flex items-center gap-3">
                {page > 1 && (
                  <LocalizedClientLink
                    href={buildPaginationUrl(page - 1)}
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-[5px] border border-Charcoal/15 bg-white px-4 hover:border-Gold"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    Previous
                  </LocalizedClientLink>
                )}
                <span className="min-h-[44px] inline-flex items-center rounded-[5px] border border-Charcoal/10 bg-white px-4 text-Charcoal/70">
                  {total} recipes
                </span>
                {page < pageCount && (
                  <LocalizedClientLink
                    href={buildPaginationUrl(page + 1)}
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-[5px] border border-Charcoal/15 bg-white px-4 hover:border-Gold"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </LocalizedClientLink>
                )}
              </div>
            </nav>
          )}
        </section>
      </div>
    </div>
  )
}

function RecipeCard({
  recipe,
  listName,
  position,
  priority = false,
  variant = "standard",
}: {
  recipe: RecipeCardData
  listName: string
  position: number
  priority?: boolean
  variant?: "standard" | "featured"
}) {
  const tags = getRecipeTags(recipe)
  const timeLabel = getTimeLabel(recipe)
  const difficultyLabel = formatDifficulty(recipe.Difficulty)
  const isFeatured = variant === "featured"

  return (
    <RecipeCardLink
      href={`/recipes/${recipe.Slug}`}
      listName={listName}
      recipe={{
        id: recipe.documentId,
        slug: recipe.Slug,
        title: recipe.Title,
        position,
      }}
      className="group block h-full"
    >
      <article className="flex h-full flex-col overflow-hidden border border-Charcoal/10 bg-white transition-colors group-hover:border-Gold">
        <figure
          className={`relative w-full overflow-hidden bg-Charcoal/5 ${
            isFeatured ? "aspect-[4/3]" : "aspect-[4/3]"
          }`}
        >
          {recipe.Image?.url ? (
            <NextImage
              src={recipe.Image.url}
              alt={recipe.Title}
              fill
              sizes={
                isFeatured
                  ? "(min-width: 1024px) 420px, 100vw"
                  : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              }
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              priority={priority}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-Scroll text-Charcoal/35">
              <ChefHat className="h-10 w-10" aria-hidden="true" />
            </div>
          )}
          {timeLabel && (
            <figcaption className="absolute left-3 top-3 inline-flex min-h-[32px] items-center gap-1 rounded-full bg-white/95 px-3 text-p-ex-sm-mono font-maison-neue-mono font-bold text-Charcoal shadow-sm">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {timeLabel}
            </figcaption>
          )}
        </figure>

        <div className={`flex flex-1 flex-col ${isFeatured ? "p-5" : "p-4"}`}>
          {tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-Scroll px-2.5 py-1 text-p-ex-sm-mono font-maison-neue-mono font-bold text-Charcoal/65"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <h3
            className={`font-gyst font-bold text-Charcoal group-hover:text-Crimson ${
              isFeatured ? "text-h4" : "text-h4"
            }`}
          >
            {recipe.Title}
          </h3>
          {recipe.ShortDescription && (
            <p className="mt-3 line-clamp-3 text-p-sm font-maison-neue text-Charcoal/70">
              {recipe.ShortDescription}
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-p-ex-sm-mono font-maison-neue-mono font-bold text-Charcoal/55">
            {difficultyLabel && <span>{difficultyLabel}</span>}
            {recipe.Servings && <span>Serves {recipe.Servings}</span>}
          </div>
        </div>
      </article>
    </RecipeCardLink>
  )
}

function EmptyRecipesState() {
  return (
    <div className="border border-Charcoal/10 bg-white p-6 md:p-8">
      <h3 className="font-gyst text-h4 font-bold text-Charcoal">
        No recipes found for this path yet.
      </h3>
      <p className="mt-2 max-w-2xl text-p-md font-maison-neue text-Charcoal/70">
        Try an adjacent cut or occasion.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {BROWSE_PATHS.slice(0, 4).map((path) => (
          <LocalizedClientLink
            key={path.label}
            href={path.href}
            className="inline-flex min-h-[40px] items-center rounded-full border border-Charcoal/15 bg-Scroll px-4 text-p-sm font-maison-neue font-semibold text-Charcoal hover:border-Gold"
          >
            {path.label}
          </LocalizedClientLink>
        ))}
      </div>
    </div>
  )
}

function buildShelves(recipes: RecipeCardData[]) {
  return RECIPE_BUCKETS.map((bucket) => {
    const shelfRecipes = sortRecipesForBucket(
      uniqueRecipes(
        recipes.filter((recipe) => recipeMatchesBucket(recipe, bucket.id))
      ),
      bucket.id
    ).slice(0, 4)

    return {
      id: bucket.id,
      eyebrow: bucket.eyebrow,
      title: bucket.shelfTitle,
      description: bucket.shelfDescription,
      href: `/recipes?bucket=${bucket.id}#recipes-results`,
      recipes: shelfRecipes,
    }
  }).filter((shelf) => shelf.recipes.length > 0)
}

function isUsableRecipe(recipe: RecipeCardData) {
  return Boolean(
    recipe?.Slug &&
      recipe?.Title &&
      !/^recipe title\b/i.test(recipe.Title) &&
      !recipe.ShortDescription?.includes(PLACEHOLDER_DESCRIPTION)
  )
}

function recipeKey(recipe: RecipeCardData) {
  return recipe.documentId || recipe.Slug
}

function uniqueRecipes(recipes: RecipeCardData[]) {
  const seen = new Set<string>()

  return recipes.filter((recipe) => {
    const key = recipeKey(recipe)

    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getRecipeMinutes(recipe: RecipeCardData) {
  const time = recipe.TotalTime || recipe.CookTime || recipe.PrepTime
  return parseRecipeTime(time)
}

function getTimeLabel(recipe: RecipeCardData) {
  if (recipe.TotalTime) return recipe.TotalTime
  if (recipe.CookTime) return recipe.CookTime
  if (recipe.PrepTime) return recipe.PrepTime
  return ""
}

function formatDifficulty(difficulty?: string) {
  if (!difficulty) return ""

  const normalized = difficulty.toLowerCase()
  if (normalized === "hard" || normalized === "advanced") return "Project"
  if (normalized === "medium") return "Moderate"
  if (normalized === "easy") return "Easy"

  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
}

function getRecipeTags(recipe: RecipeCardData) {
  const categoryTags =
    recipe.RecipeCategories?.map((category) => category.Name).filter(Boolean) ||
    []
  const classification = getRecipeClassification(recipe)
  const tags: string[] = getRecipeBucketLabels(recipe, 2)
  const minutes = getRecipeMinutes(recipe)

  if (minutes !== null && minutes <= 50) tags.push("Fast win")
  if (classification.attributes.proteins.includes("turkey")) tags.push("Turkey")
  if (classification.attributes.proteins.includes("chicken"))
    tags.push("Chicken")
  if (classification.attributes.proteins.includes("beef")) tags.push("Beef")
  if (classification.attributes.kfpCandidate) tags.push("Passover idea")

  return Array.from(new Set([...categoryTags, ...tags])).slice(0, 3)
}

export default RecipesCollection
