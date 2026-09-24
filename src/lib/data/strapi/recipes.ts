import { gql } from "graphql-request"
import { cachedStrapiRequest } from "@lib/strapi"
import { withTimeout } from "@lib/util/promise-timeout"
import type { StrapiCollectionProduct } from "./collections"
import type { StrapiSEO, StrapiSocialMeta } from "./seo"

export type RecipeCategory = {
  Name: string
  Slug: string
}

export type RecipeNutritionInfo = {
  Calories?: string
  Protein?: string
  Fat?: string
  Carbohydrates?: string
  Fiber?: string
  Sugar?: string
  Sodium?: string
  ServingSize?: string
}

export type RecipeData = {
  documentId?: string
  Title: string
  Slug: string
  ShortDescription?: string
  Image?: { url: string }
  PublishedDate?: string
  TotalTime?: string
  PrepTime?: string
  CookTime?: string
  Servings?: string
  Ingredients?: { ingredient: string; id: string }[]
  Steps?: { id: string; instruction: string }[]
  Category?: RecipeCategory
  RecipeCategories?: RecipeCategory[]
  CookingMethod?: string
  Difficulty?: string
  DietaryTags?: string[]
  VideoUrl?: string
  AverageRating?: number
  RatingCount?: number
  NutritionInfo?: RecipeNutritionInfo
  RelatedProducts?: StrapiCollectionProduct[]
  SEO?: StrapiSEO
  SocialMeta?: StrapiSocialMeta
}

export type RecipeFilterParams = {
  category?: string
  cookingMethod?: string
  difficulty?: string
  dietaryTag?: string
  search?: string
}

export const GetRecipeBySlugQuery = gql`
  query GetRecipeBySlug($slug: String!) {
    recipes(filters: { Slug: { eq: $slug } }, pagination: { limit: 1 }) {
      Title
      Slug
      ShortDescription
      Image {
        url
      }
      PublishedDate
      TotalTime
      PrepTime
      CookTime
      Servings
      Difficulty
      RecipeCategories {
        Name
        Slug
      }
      VideoUrl
      AverageRating
      RatingCount
      RelatedProducts {
        documentId
        Title
        FeaturedImage {
          url
        }
        GalleryImages {
          url
        }
        Metadata {
          AvgPackSize
          AvgPackWeight
          Serves
          PiecesPerPack
          Uncooked
          Cooked
          HeatAndServe
          GlutenFree
          MSG
          QualifiesForFreeDeliveryOffers
          FreeDeliveryExclusionReason
        }
        MedusaProduct {
        AvailabilityLifecycle
          ProductId
          Handle
          ShortDescription
          PricingMode
          Variants {
          AvailabilityLifecycle
            VariantId
            Sku
            QualifiesForFreeDeliveryOffers
            FreeDeliveryExclusionReason
            Price {
              CalculatedPriceNumber
            }
          }
        }
      }
      Ingredients(pagination: { limit: 100 }) {
        ingredient
        id
      }
      Steps {
        id
        instruction
      }
      NutritionInfo {
        Calories
        Protein
        Fat
        Carbohydrates
        Fiber
        Sugar
        Sodium
        ServingSize
      }
      SEO {
        metaTitle
        metaDescription
        keywords
        canonicalUrl
      }
      SocialMeta {
        ogTitle
        ogDescription
        ogImage {
          url
        }
        ogImageAlt
        ogType
        twitterCard
        twitterTitle
        twitterDescription
        twitterImage {
          url
        }
        twitterImageAlt
        twitterCreator
        twitterSite
      }
    }
  }
`

// Recipe schema in Strapi has been simplified — Category (singular),
// CookingMethod, and DietaryTags fields no longer exist on the type.
// The current schema exposes RecipeCategories (relation) and Difficulty.
const RECIPE_CARD_FIELDS = `
  documentId
  Slug
  Title
  ShortDescription
  Image {
    url
  }
  RecipeCategories {
    Name
    Slug
  }
  TotalTime
  PrepTime
  CookTime
  Servings
  Difficulty
  Ingredients {
    ingredient
    id
  }
`

export const GetPaginatedRecipesQuery = gql`
  query PaginatedRecipes($page: Int!, $pageSize: Int!) {
    recipes_connection(
      pagination: { page: $page, pageSize: $pageSize }
      sort: ["PublishedDate:desc"]
      status: PUBLISHED
      filters: {
        Title: { notContainsi: "Recipe Title" }
        ShortDescription: { notContainsi: "Etiam id nisi" }
      }
    ) {
      nodes {
        ${RECIPE_CARD_FIELDS}
      }
      pageInfo {
        page
        pageSize
        pageCount
        total
      }
    }
  }
`

export const GetRecipeHubRecipesPageQuery = gql`
  query RecipeHubRecipesPage($page: Int!, $pageSize: Int!) {
    recipes_connection(
      pagination: { page: $page, pageSize: $pageSize }
      sort: ["PublishedDate:desc"]
      status: PUBLISHED
      filters: {
        Title: { notContainsi: "Recipe Title" }
        ShortDescription: { notContainsi: "Etiam id nisi" }
      }
    ) {
      nodes {
        ${RECIPE_CARD_FIELDS}
      }
      pageInfo {
        page
        pageSize
        pageCount
        total
      }
    }
  }
`

export const GetRecipeHubImagesPageQuery = gql`
  query RecipeHubImagesPage($page: Int!, $pageSize: Int!) {
    recipes_connection(
      pagination: { page: $page, pageSize: $pageSize }
      sort: ["Slug:asc"]
      status: PUBLISHED
      filters: {
        Title: { notContainsi: "Recipe Title" }
        ShortDescription: { notContainsi: "Etiam id nisi" }
      }
    ) {
      nodes {
        Slug
        Image {
          url
        }
      }
      pageInfo {
        pageCount
      }
    }
  }
`

type RecipeHubImagesPage = {
  recipes_connection: {
    nodes: Array<{ Slug: string; Image?: { url?: string | null } | null }>
    pageInfo: { pageCount: number }
  }
}

export async function getRecipeHubImageMap(): Promise<Map<string, string>> {
  const images = new Map<string, string>()
  // Bound the entire pagination pass, not each page independently. The shared
  // client also aborts a stalled request; no further pages start after timeout.
  const deadline = Date.now() + 12_000

  try {
    let pageCount = 1
    for (let page = 1; page <= pageCount; page += 1) {
      const data = await withTimeout(
        cachedStrapiRequest<RecipeHubImagesPage>(
          "recipe-hub-images",
          GetRecipeHubImagesPageQuery,
          { page, pageSize: 100 }
        ),
        Math.max(0, deadline - Date.now()),
        null,
        "Recipe hub image lookup; using snapshot images"
      )
      if (!data) return new Map()

      pageCount = data.recipes_connection.pageInfo.pageCount
      for (const recipe of data.recipes_connection.nodes) {
        if (recipe.Slug && recipe.Image?.url) {
          images.set(recipe.Slug, recipe.Image.url)
        }
      }
    }
    return images
  } catch {
    console.warn("Unable to load recipe hub images; using snapshot images.")
    return new Map()
  }
}

// Filtered recipes query with dynamic filters
export const GetFilteredRecipesQuery = gql`
  query FilteredRecipes(
    $page: Int!
    $pageSize: Int!
    $filters: RecipeFiltersInput
  ) {
    recipes_connection(
      pagination: { page: $page, pageSize: $pageSize }
      sort: ["PublishedDate:desc"]
      status: PUBLISHED
      filters: $filters
    ) {
      nodes {
        ${RECIPE_CARD_FIELDS}
      }
      pageInfo {
        page
        pageSize
        pageCount
        total
      }
    }
  }
`

// Get all recipe categories for filter dropdown
export const GetRecipeCategoriesQuery = gql`
  query RecipeCategories {
    recipeCategories {
      Name
      Slug
    }
  }
`

// Get distinct filter options from recipes
export const GetRecipeFilterOptionsQuery = gql`
  query RecipeFilterOptions {
    recipes(
      pagination: { limit: 100 }
      status: PUBLISHED
      filters: {
        Title: { notContainsi: "Recipe Title" }
        ShortDescription: { notContainsi: "Etiam id nisi" }
      }
    ) {
      RecipeCategories {
        Name
        Slug
      }
      Difficulty
    }
  }
`

export type RecipesPageData = {
  SEO?: StrapiSEO
  SocialMeta?: StrapiSocialMeta
}

export const GetRecipesPageSEOQuery = gql`
  query RecipesPageSEO {
    recipesPage {
      SEO {
        metaTitle
        metaDescription
        keywords
        canonicalUrl
      }
      SocialMeta {
        ogTitle
        ogDescription
        ogImage {
          url
        }
        ogImageAlt
        ogType
        twitterCard
        twitterTitle
        twitterDescription
        twitterImage {
          url
        }
        twitterImageAlt
        twitterCreator
        twitterSite
      }
    }
  }
`

/**
 * Generates Recipe JSON-LD schema for SEO
 */
export function generateRecipeJsonLd(
  recipe: {
    Title: string
    Slug: string
    ShortDescription?: string
    Image?: { url: string }
    PublishedDate?: string
    PrepTime?: string
    CookTime?: string
    TotalTime?: string
    Servings?: string
    Difficulty?: string
    Ingredients?: { ingredient: string; id: string }[]
    Steps?: { id: string; instruction: string }[]
    VideoUrl?: string
    AverageRating?: number
    RatingCount?: number
    NutritionInfo?: RecipeNutritionInfo
  },
  baseUrl: string,
  countryCode: string
) {
  const recipeUrl = `${baseUrl}/${countryCode}/recipes/${recipe.Slug}`

  // Convert time strings like "30 minutes" to ISO 8601 duration format
  const parseTimeToISO = (timeStr?: string): string | undefined => {
    if (!timeStr) return undefined
    const match = timeStr.match(/(\d+)\s*(min|minute|hour|hr)/i)
    if (!match) return undefined
    const value = parseInt(match[1])
    const unit = match[2].toLowerCase()
    if (unit.startsWith("hour") || unit === "hr") {
      return `PT${value}H`
    }
    return `PT${value}M`
  }

  // Build nutrition info if available
  const nutritionInfo = recipe.NutritionInfo
    ? {
        "@type": "NutritionInformation",
        ...(recipe.NutritionInfo.Calories && {
          calories: recipe.NutritionInfo.Calories,
        }),
        ...(recipe.NutritionInfo.Protein && {
          proteinContent: recipe.NutritionInfo.Protein,
        }),
        ...(recipe.NutritionInfo.Fat && {
          fatContent: recipe.NutritionInfo.Fat,
        }),
        ...(recipe.NutritionInfo.Carbohydrates && {
          carbohydrateContent: recipe.NutritionInfo.Carbohydrates,
        }),
        ...(recipe.NutritionInfo.Fiber && {
          fiberContent: recipe.NutritionInfo.Fiber,
        }),
        ...(recipe.NutritionInfo.Sugar && {
          sugarContent: recipe.NutritionInfo.Sugar,
        }),
        ...(recipe.NutritionInfo.Sodium && {
          sodiumContent: recipe.NutritionInfo.Sodium,
        }),
        ...(recipe.NutritionInfo.ServingSize && {
          servingSize: recipe.NutritionInfo.ServingSize,
        }),
      }
    : undefined

  // Build aggregate rating if available
  const aggregateRating =
    recipe.AverageRating && recipe.RatingCount
      ? {
          "@type": "AggregateRating",
          ratingValue: recipe.AverageRating,
          ratingCount: recipe.RatingCount,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined

  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.Title,
    description: recipe.ShortDescription,
    url: recipeUrl,
    ...(recipe.Image?.url && { image: recipe.Image.url }),
    ...(recipe.PublishedDate && { datePublished: recipe.PublishedDate }),
    ...(parseTimeToISO(recipe.PrepTime) && {
      prepTime: parseTimeToISO(recipe.PrepTime),
    }),
    ...(parseTimeToISO(recipe.CookTime) && {
      cookTime: parseTimeToISO(recipe.CookTime),
    }),
    ...(parseTimeToISO(recipe.TotalTime) && {
      totalTime: parseTimeToISO(recipe.TotalTime),
    }),
    ...(recipe.Servings && { recipeYield: recipe.Servings }),
    ...(recipe.Difficulty && {
      recipeDifficulty: recipe.Difficulty,
    }),
    ...(recipe.Ingredients &&
      recipe.Ingredients.length > 0 && {
        recipeIngredient: recipe.Ingredients.map((i) => i.ingredient),
      }),
    ...(recipe.Steps &&
      recipe.Steps.length > 0 && {
        recipeInstructions: recipe.Steps.map((step, index) => ({
          "@type": "HowToStep",
          position: index + 1,
          text: step.instruction,
        })),
      }),
    ...(recipe.VideoUrl && {
      video: {
        "@type": "VideoObject",
        name: `How to make ${recipe.Title}`,
        description:
          recipe.ShortDescription || `Watch how to make ${recipe.Title}`,
        contentUrl: recipe.VideoUrl,
        ...(recipe.Image?.url && { thumbnailUrl: recipe.Image.url }),
      },
    }),
    ...(nutritionInfo && { nutrition: nutritionInfo }),
    ...(aggregateRating && { aggregateRating }),
    author: {
      "@type": "Organization",
      name: "Grillers Pride",
    },
    publisher: {
      "@type": "Organization",
      name: "Grillers Pride",
    },
    recipeCategory: "Main Course",
    recipeCuisine: "Kosher",
  }
}
