import { Metadata } from "next"
import { notFound } from "next/navigation"

import RecipesCollection from "@modules/recipes/templates/recipes-collection"
import { extractFilterOptions } from "@modules/recipes/lib/filter-helpers"
import { overlayRecipeImages } from "@modules/recipes/lib/live-images"
import recipeHubData from "@modules/recipes/data/recipe-bucket-audit.generated.json"
import { getRecipeHubImageMap } from "@lib/data/strapi/recipes"
import {
  applyRecipeRuntimeFilters,
  sortRecipesForBucket,
} from "@modules/recipes/lib/recipe-taxonomy"
import { generateAlternates } from "@lib/util/seo"
import { getBaseURL } from "@lib/util/env"
import {
  getWaysToShopMission,
  isWaysToShopMissionId,
} from "@lib/content/ways-to-shop"
import ExperimentExposure from "@lib/experiments/exposure"
import { getExperimentAssignment } from "@lib/experiments/server"
import { itemListJsonLd, webPageJsonLd } from "@lib/util/structured-data"

type PageProps = {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{
    page?: string
    category?: string
    method?: string
    difficulty?: string
    dietary?: string
    q?: string
    bucket?: string
    mission?: string
  }>
}

export function generateStaticParams() {
  return [{ countryCode: "us" }]
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { countryCode } = await params
  const baseUrl = getBaseURL()
  const alternates = await generateAlternates("/recipes", countryCode)

  return {
    title: "Recipes | Grillers Pride",
    description:
      "Discover delicious kosher recipes from Grillers Pride. Expert cooking tips and recipes for premium kosher meats, perfect for Shabbat dinners and Jewish holidays.",
    alternates,
    openGraph: {
      title: "Recipes | Grillers Pride",
      description:
        "Discover delicious kosher recipes from Grillers Pride. Expert cooking tips for premium kosher meats.",
      type: "website",
      url: `${baseUrl}/recipes`,
      siteName: "Grillers Pride",
    },
    twitter: {
      card: "summary_large_image",
      title: "Recipes | Grillers Pride",
      description:
        "Discover delicious kosher recipes from Grillers Pride. Expert cooking tips for premium kosher meats.",
    },
  }
}

const DEFAULT_PAGE_SIZE = 9
const ALL_RECIPE_CARDS: any[] = recipeHubData.recipeCards || []
const ALL_RECIPE_FILTER_OPTIONS = extractFilterOptions(ALL_RECIPE_CARDS)

export default async function RecipesPage(props: PageProps) {
  const { countryCode } = await props.params
  const searchParams = await props.searchParams
  const page = Math.max(1, parseInt(searchParams.page || "1", 10))
  const pageSize = DEFAULT_PAGE_SIZE
  const mission = isWaysToShopMissionId(searchParams.mission)
    ? getWaysToShopMission(searchParams.mission)
    : null
  const resolvedBucket = searchParams.bucket || mission?.recipeBucket

  // Extract filter params
  const filterParams = {
    category: searchParams.category,
    method: searchParams.method,
    difficulty: searchParams.difficulty,
    dietary: searchParams.dietary,
    search: searchParams.q,
    bucket: resolvedBucket,
    mission: mission?.id,
  }

  const hubRecipes = overlayRecipeImages(
    ALL_RECIPE_CARDS,
    await getRecipeHubImageMap()
  )

  if (!hubRecipes.length) {
    return notFound()
  }

  const filteredRecipes = sortRecipesForBucket(
    applyRecipeRuntimeFilters(hubRecipes, filterParams),
    filterParams.bucket
  )
  const total = filteredRecipes.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const recipes = filteredRecipes.slice((page - 1) * pageSize, page * pageSize)
  const pageInfo = {
    page,
    pageSize,
    pageCount,
    total,
  }
  const filterOptions = ALL_RECIPE_FILTER_OPTIONS
  const recipesExperiment = await getExperimentAssignment(
    "recipes_entrypoints_v1",
    {
      routeMarket: countryCode,
      customerType: "unknown",
    }
  )
  const baseUrl = getBaseURL()
  const recipeListJsonLd = itemListJsonLd(
    baseUrl,
    countryCode,
    "Kosher recipes",
    filteredRecipes.slice(0, 48).map((recipe) => ({
      type: "Recipe",
      name: recipe.Title,
      path: `/recipes/${recipe.Slug}`,
      description: recipe.ShortDescription,
      image: recipe.Image?.url,
    }))
  )
  const recipesJsonLd = webPageJsonLd({
    baseUrl,
    countryCode,
    path: "/recipes",
    name: "Recipes",
    description:
      "Kosher recipes, butcher guidance, and holiday cooking ideas from Grillers Pride.",
    type: "CollectionPage",
    breadcrumbs: [{ name: "Recipes", path: "/recipes" }],
    mainEntity: recipeListJsonLd,
    about: ["Kosher recipes", "Shabbos cooking", "Jewish holidays"],
  })

  return (
    <>
      <ExperimentExposure assignment={recipesExperiment} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(recipesJsonLd) }}
      />
      <RecipesCollection
        recipes={recipes}
        page={page}
        pageInfo={pageInfo}
        countryCode={countryCode}
        filterOptions={filterOptions}
        currentFilters={filterParams}
        hubRecipes={hubRecipes}
      />
    </>
  )
}

export const revalidate = 300
