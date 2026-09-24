export const RECIPE_BUCKETS = [
  {
    id: "shabbos-table",
    label: "Shabbos Table",
    eyebrow: "Occasion",
    description:
      "Make-ahead mains, roasts, braises, platters, and table-center recipes for Friday night or Shabbos lunch.",
    shelfTitle: "Shabbos table mains",
    shelfDescription:
      "Roasts, braises, sliced boards, and poultry mains that can hold up for a fuller table.",
  },
  {
    id: "weeknight-dinner",
    label: "Weeknight Dinner",
    eyebrow: "Fast Wins",
    description:
      "Cutlets, burgers, franks, and skillet dinners for busy evenings.",
    shelfTitle: "Quick weeknight dinners",
    shelfDescription:
      "Cutlets, burgers, skillets, and quick sears for getting real dinner onto the table.",
  },
  {
    id: "yom-tov-passover",
    label: "Yom Tov & Passover",
    eyebrow: "Holiday",
    description:
      "Holiday centerpieces, Passover ideas, whole birds, and polished hosting recipes.",
    shelfTitle: "Yom Tov and Passover centerpieces",
    shelfDescription:
      "Roasts, briskets, and whole birds for holiday meals. Check each ingredient for your holiday requirements.",
  },
  {
    id: "kfp-briskets-roasts",
    label: "Passover Briskets & Roasts",
    eyebrow: "Holiday Cut",
    description:
      "Brisket and roast recipes for Passover. Check the certification of every ingredient.",
    shelfTitle: "Passover briskets and roasts",
    shelfDescription:
      "Briskets and roasts for the Seder table, with braising and roasting instructions.",
  },
  {
    id: "whole-birds",
    label: "Whole Birds",
    eyebrow: "Cook by Cut",
    description:
      "Whole chickens, turkeys, split breasts, netted breasts, drumsticks, duck, and large poultry pieces.",
    shelfTitle: "Whole birds and large poultry pieces",
    shelfDescription:
      "Roasting and braising recipes for chicken, turkey, and duck.",
  },
  {
    id: "steaks-chops",
    label: "Steaks & Chops",
    eyebrow: "Cook by Cut",
    description:
      "Steaks, chops, rib cuts, rack cuts, cube steaks, minute steaks, and sear-forward pieces.",
    shelfTitle: "Steaks and chops",
    shelfDescription:
      "Searing, resting, and slicing instructions for steaks and chops.",
  },
  {
    id: "butchers-picks",
    label: "Butcher's Picks",
    eyebrow: "Discovery",
    description:
      "South African specialties and less-familiar cuts to try at home.",
    shelfTitle: "Butcher's picks worth knowing",
    shelfDescription:
      "Try a new cut with step-by-step preparation and cooking instructions.",
  },
] as const

export type RecipeBucketId = (typeof RECIPE_BUCKETS)[number]["id"]

export type RecipeAttributes = {
  timeMinutes: number | null
  servingsMin: number | null
  servingsMax: number | null
  kfpCandidate: boolean
  proteins: string[]
  cutFamilies: string[]
  methods: string[]
  effortLevel: "quick" | "moderate" | "project" | "unknown"
}

export type RecipeTaxonomyInput = {
  documentId?: string
  Slug: string
  Title: string
  ShortDescription?: string | null
  Image?: { url?: string | null } | null
  TotalTime?: string | null
  PrepTime?: string | null
  CookTime?: string | null
  Servings?: string | null
  Difficulty?: string | null
  RecipeCategories?: Array<{ Name?: string | null; Slug?: string | null }>
  Ingredients?: Array<{ ingredient?: string | null }>
  Steps?: Array<{ instruction?: string | null }>
  PrimaryRecipeBucket?: RecipeBucketId
  RecipeBucketAssignments?: Array<{
    bucketId: RecipeBucketId
    confidence: number
    reasons: string[]
    signals: string[]
  }>
  RecipeAttributes?: RecipeAttributes
  TaxonomyReviewNeeded?: boolean
}

export type RecipeBucketAssignment = {
  bucketId: RecipeBucketId
  confidence: number
  reasons: string[]
  signals: string[]
}

export type RecipeClassification = {
  recipeId?: string
  slug: string
  title: string
  primaryBucketId: RecipeBucketId
  assignments: RecipeBucketAssignment[]
  needsReview: boolean
  attributes: RecipeAttributes
}

export type RecipeRuntimeFilters = {
  category?: string
  method?: string
  difficulty?: string
  dietary?: string
  search?: string
  bucket?: string
}

type BucketScore = {
  bucketId: RecipeBucketId
  score: number
  reasons: string[]
  signals: string[]
}

const BUCKET_PRIORITY: RecipeBucketId[] = [
  "yom-tov-passover",
  "kfp-briskets-roasts",
  "whole-birds",
  "steaks-chops",
  "shabbos-table",
  "weeknight-dinner",
  "butchers-picks",
]

const QUICK_PREP_TERMS = [
  "cutlet",
  "cutlets",
  "skillet",
  "quick",
  "burger",
  "burgers",
  "patty",
  "patties",
  "hot dog",
  "hot dogs",
  "frank",
  "franks",
  "sausage",
  "schnitzel",
  "stir fry",
]

const CASUAL_TERMS = [
  "hot dog",
  "hot dogs",
  "frank",
  "franks",
  "burger",
  "burgers",
  "patty",
  "patties",
  "sliders",
  "hash",
  "tacos",
  "nachos",
]

const SHABBOS_TERMS = [
  "shabbos",
  "shabbat",
  "roast",
  "braise",
  "braised",
  "make ahead",
  "make-ahead",
  "platter",
  "board",
  "carved",
  "cholent",
  "stew",
  "soup",
  "brisket",
  "deckel",
  "netted",
]

const HOLIDAY_TERMS = [
  "yom tov",
  "passover",
  "pesach",
  "holiday",
  "rosh hashanah",
  "rosh hashana",
  "sukkot",
  "sukkos",
  "hosting",
  "centerpiece",
  "crowd",
  "buffet",
  "pomegranate",
  "date",
  "dates",
  "apricot",
  "cranberry",
  "jeweled",
  "honey",
]

const FORMAL_HOSTING_TERMS = [
  "brisket",
  "deckel",
  "rib roast",
  "prime rib",
  "standing rib",
  "whole turkey",
  "whole chicken",
  "whole bird",
  "rack of lamb",
  "lamb rack",
  "lollipop lamb",
  "duck",
]

const KFP_TERMS = [
  "kfp",
  "passover",
  "pesach",
  "potato starch",
  "almond",
  "almonds",
  "horseradish",
  "matzo",
  "matzah",
  "macaroon",
]

const BRISKET_ROAST_TERMS = [
  "brisket",
  "deckel",
  "roast",
  "rib roast",
  "prime rib",
  "chuck roast",
  "shoulder roast",
  "french roast",
  "london broil",
  "chuckeye",
  "chuck",
  "shoulder",
  "shank",
  "oxtail",
  "netted roast",
  "top of rib",
  "standing rib",
  "boneless rib",
]

const WHOLE_BIRD_TERMS = [
  "whole chicken",
  "whole turkey",
  "whole bird",
  "capon",
  "cornish hen",
  "spatchcock",
  "8 piece",
  "8-piece",
  "eight piece",
  "eight-piece",
  "cut up chicken",
  "cut-up chicken",
  "bone in turkey breast",
  "bone-in turkey breast",
  "split turkey breast",
  "netted turkey breast",
  "turkey wing",
  "turkey wings",
  "turkey thigh",
  "turkey thighs",
  "turkey neck",
  "turkey necks",
  "turkey drumstick",
  "turkey drumsticks",
  "chicken drumstick",
  "chicken drumsticks",
  "chicken thigh",
  "chicken thighs",
  "chicken wing",
  "chicken wings",
  "drumette",
  "drumettes",
  "duck",
]

const STEAK_CHOP_TERMS = [
  "steak",
  "steaks",
  "chop",
  "chops",
  "ribeye",
  "rib eye",
  "delmonico",
  "flat iron",
  "teres major",
  "minute steak",
  "cube steak",
  "oyster steak",
  "rib steak",
  "flanken",
  "rack",
  "lollipop",
  "lamb chop",
  "lamb chops",
  "veal chop",
  "veal chops",
  "prime rib",
]

const BEEF_TERMS = [
  "beef",
  "angus",
  "american angus",
  "brisket",
  "deckel",
  "ribeye",
  "rib eye",
  "rib roast",
  "prime rib",
  "steak",
  "steaks",
  "burger",
  "burgers",
  "flanken",
  "oxtail",
  "shank",
  "chuck",
  "chuckeye",
  "delmonico",
  "london broil",
  "shoulder roast",
  "miami ribs",
  "short ribs",
  "french roast",
  "flat iron",
  "picanha",
  "teres major",
  "hanger steak",
  "skirt steak",
  "marrow",
  "tongue",
  "cheek",
  "sweetbread",
  "beef fry",
  "grass-fed",
]

const GROUND_MEAT_TERMS = [
  "ground beef",
  "ground lamb",
  "ground veal",
  "ground turkey",
  "ground chicken",
  "90/10",
  "85/15",
  "burger",
  "burgers",
  "patty",
  "patties",
]

const RIB_TERMS = [
  "flanken",
  "miami ribs",
  "short ribs",
  "slab ribs",
  "ribs",
  "rib steak",
  "rib roast",
  "prime rib",
  "standing rib",
  "rack",
  "lollipop",
]

const SOUP_STOCK_TERMS = [
  "soup bone",
  "soup bones",
  "bone soup",
  "chicken bone",
  "chicken bones",
  "stock",
  "cholent",
  "oxtail",
  "shank",
  "neck",
  "necks",
  "marrow",
]

const STEW_BRAISE_TERMS = [
  "stew cubes",
  "stew meat",
  "beef cubes",
  "grass-fed cubes",
  "braise",
  "braised",
]

const POULTRY_PART_TERMS = [
  "pargiot",
  "chicken breast",
  "chicken breasts",
  "chicken strip",
  "chicken strips",
  "chicken tender",
  "chicken tenders",
  "leg quarter",
  "leg quarters",
  "dark chicken",
  "iqf chicken",
  "chicken liver",
  "chicken livers",
  "chicken gizzard",
  "chicken gizzards",
]

const PREPARED_FORMAT_TERMS = [
  "boerewors",
  "sausage",
  "frank",
  "franks",
  "hot dog",
  "hot dogs",
  "pastrami",
  "corned beef",
  "kebab",
  "kebabs",
  "biltong",
  "knockwurst",
]

const BUTCHER_PICK_TERMS = [
  "boerewors",
  "biltong",
  "south african",
  "oyster steak",
  "hanger steak",
  "skirt steak",
  "flanken",
  "picanha",
  "deckel",
  "lamb",
  "veal",
  "duck",
  "tongue",
  "cheek",
  "marrow",
  "liver",
  "sweetbread",
  "sweetbreads",
  "gizzard",
  "gizzards",
  "neck",
  "osso buco",
  "rack of lamb",
  "lamb rack",
  "lollipop lamb",
  "prime rib",
]

export function classifyRecipe(
  recipe: RecipeTaxonomyInput
): RecipeClassification {
  const text = getSearchableRecipeText(recipe)
  const identityText = getRecipeIdentityText(recipe)
  const timeMinutes = parseRecipeTime(
    recipe.TotalTime || recipe.CookTime || recipe.PrepTime
  )
  const servings = parseServings(recipe.Servings)
  const kfpSignals = matchingTerms(text, KFP_TERMS)
  const kfpCandidate = kfpSignals.length > 0
  const casualSignals = matchingTerms(text, CASUAL_TERMS)
  const casual = casualSignals.length > 0
  const scores = new Map<RecipeBucketId, BucketScore>()

  const addScore = (
    bucketId: RecipeBucketId,
    score: number,
    reason: string,
    signals: string[]
  ) => {
    const current =
      scores.get(bucketId) ||
      ({
        bucketId,
        score: 0,
        reasons: [],
        signals: [],
      } satisfies BucketScore)

    current.score += score
    current.reasons.push(reason)
    current.signals.push(...signals)
    scores.set(bucketId, current)
  }

  if (timeMinutes !== null && timeMinutes <= 55) {
    addScore(
      "weeknight-dinner",
      4,
      `Total listed recipe time is ${timeMinutes} minutes or less.`,
      ["time<=55"]
    )
  }

  const quickSignals = matchingTerms(text, QUICK_PREP_TERMS)
  if (quickSignals.length > 0) {
    addScore(
      "weeknight-dinner",
      casual ? 6 : 4,
      `Recipe copy signals a quick or casual dinner format: ${joinSignals(
        quickSignals
      )}.`,
      quickSignals
    )
  }

  const shabbosSignals = matchingTerms(text, SHABBOS_TERMS)
  if (shabbosSignals.length > 0 && !casual) {
    addScore(
      "shabbos-table",
      4,
      `Recipe reads like a Shabbos-table main: ${joinSignals(shabbosSignals)}.`,
      shabbosSignals
    )
  }
  if ((servings.servingsMax || 0) >= 6 && !casual) {
    addScore(
      "shabbos-table",
      2,
      `Serves ${recipe.Servings}, which fits a family or hosted table.`,
      ["serves>=6"]
    )
  }
  if (timeMinutes !== null && timeMinutes >= 90 && !casual) {
    addScore(
      "shabbos-table",
      2,
      `Cook time is ${timeMinutes} minutes, which fits a make-ahead or slow-cooked table main.`,
      ["time>=90"]
    )
  }

  const holidaySignals = matchingTerms(text, HOLIDAY_TERMS)
  const formalHostingSignals = matchingTerms(text, FORMAL_HOSTING_TERMS)
  if (holidaySignals.length > 0 && !casual) {
    addScore(
      "yom-tov-passover",
      kfpCandidate ? 7 : 5,
      `Holiday, Passover, or hosting cues found: ${joinSignals(
        holidaySignals
      )}.`,
      holidaySignals
    )
  }
  if (kfpCandidate && !casual) {
    addScore(
      "yom-tov-passover",
      5,
      `Passover/KFP cue found: ${joinSignals(kfpSignals)}.`,
      kfpSignals
    )
  }
  if (formalHostingSignals.length > 0 && !casual) {
    addScore(
      "yom-tov-passover",
      3,
      `Formal centerpiece cut found: ${joinSignals(formalHostingSignals)}.`,
      formalHostingSignals
    )
  }

  const roastSignals = matchingTerms(text, BRISKET_ROAST_TERMS)
  if (roastSignals.length > 0 && kfpCandidate && !casual) {
    addScore(
      "kfp-briskets-roasts",
      8,
      `Brisket or roast-family cut plus Passover/KFP cue found: ${joinSignals([
        ...roastSignals,
        ...kfpSignals,
      ])}.`,
      [...roastSignals, ...kfpSignals]
    )
  }

  const birdSignals = matchingTerms(text, WHOLE_BIRD_TERMS)
  if (birdSignals.length > 0) {
    addScore(
      "whole-birds",
      7,
      `Whole-bird or large poultry format found: ${joinSignals(birdSignals)}.`,
      birdSignals
    )
  }

  const steakSignals = matchingTerms(text, STEAK_CHOP_TERMS)
  if (steakSignals.length > 0) {
    addScore(
      "steaks-chops",
      7,
      `Steak, chop, rack, or sear-forward cut found: ${joinSignals(
        steakSignals
      )}.`,
      steakSignals
    )
  }

  const butcherSignals = matchingTerms(text, BUTCHER_PICK_TERMS)
  if (butcherSignals.length > 0 && !casual) {
    const signatureSignals = butcherSignals.filter(
      (signal) => signal !== "prime rib"
    )

    addScore(
      "butchers-picks",
      signatureSignals.length > 0 ? 8 : 4,
      `Specialty, premium, South African, or underused cut cue found: ${joinSignals(
        butcherSignals
      )}.`,
      butcherSignals
    )
  }

  if (scores.size === 0) {
    const fallbackBucket: RecipeBucketId =
      timeMinutes !== null && timeMinutes <= 75
        ? "weeknight-dinner"
        : (servings.servingsMax || 0) >= 5
        ? "shabbos-table"
        : "butchers-picks"

    addScore(
      fallbackBucket,
      1,
      "No strong cut or occasion signals found; assigned by time/serving fallback for editorial review.",
      ["fallback"]
    )
  }

  const assignments = Array.from(scores.values())
    .filter((entry) => entry.score >= 2 || entry.signals.includes("fallback"))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (
        BUCKET_PRIORITY.indexOf(a.bucketId) -
        BUCKET_PRIORITY.indexOf(b.bucketId)
      )
    })
    .map((entry) => ({
      bucketId: entry.bucketId,
      confidence: Math.min(1, Number((entry.score / 10).toFixed(2))),
      reasons: Array.from(new Set(entry.reasons)),
      signals: Array.from(new Set(entry.signals)),
    }))

  return {
    recipeId: recipe.documentId,
    slug: recipe.Slug,
    title: recipe.Title,
    primaryBucketId: assignments[0].bucketId,
    assignments,
    needsReview: assignments.some((entry) =>
      entry.signals.includes("fallback")
    ),
    attributes: {
      timeMinutes,
      servingsMin: servings.servingsMin,
      servingsMax: servings.servingsMax,
      kfpCandidate,
      proteins: inferProteins(identityText),
      cutFamilies: inferCutFamilies(identityText),
      methods: inferMethods(text),
      effortLevel: inferEffortLevel(timeMinutes),
    },
  }
}

export function getBucketById(bucketId?: string | null) {
  return RECIPE_BUCKETS.find((bucket) => bucket.id === bucketId)
}

export function getRecipeBucketIds(recipe: RecipeTaxonomyInput) {
  return getRecipeClassification(recipe).assignments.map(
    (assignment) => assignment.bucketId
  )
}

export function recipeMatchesBucket(
  recipe: RecipeTaxonomyInput,
  bucketId?: string | null
) {
  if (!bucketId) return true
  if (!getBucketById(bucketId)) return true

  return getRecipeBucketIds(recipe).includes(bucketId as RecipeBucketId)
}

export function filterRecipesByBucket<T extends RecipeTaxonomyInput>(
  recipes: T[],
  bucketId?: string | null
) {
  if (!bucketId || !getBucketById(bucketId)) return recipes
  return recipes.filter((recipe) => recipeMatchesBucket(recipe, bucketId))
}

export function applyRecipeRuntimeFilters<T extends RecipeTaxonomyInput>(
  recipes: T[],
  filters: RecipeRuntimeFilters
) {
  return recipes.filter((recipe) => {
    if (filters.bucket && !recipeMatchesBucket(recipe, filters.bucket)) {
      return false
    }

    if (filters.category) {
      const categories = recipe.RecipeCategories || []
      if (!categories.some((category) => category.Slug === filters.category)) {
        return false
      }
    }

    if (filters.difficulty && recipe.Difficulty !== filters.difficulty) {
      return false
    }

    if (filters.search) {
      const query = normalizeText(filters.search)
      const searchable = getSearchableRecipeText(recipe)
      if (!searchable.includes(query)) {
        return false
      }
    }

    return true
  })
}

export function sortRecipesForBucket<T extends RecipeTaxonomyInput>(
  recipes: T[],
  bucketId?: string | null
) {
  if (!bucketId || !getBucketById(bucketId)) return recipes

  return [...recipes].sort((a, b) => {
    const aClass = getRecipeClassification(a)
    const bClass = getRecipeClassification(b)
    const aAssignment = aClass.assignments.find(
      (item) => item.bucketId === bucketId
    )
    const bAssignment = bClass.assignments.find(
      (item) => item.bucketId === bucketId
    )
    const aPrimary = aClass.primaryBucketId === bucketId ? 1 : 0
    const bPrimary = bClass.primaryBucketId === bucketId ? 1 : 0
    const aBucketScore = getBucketSortScore(aClass, bucketId as RecipeBucketId)
    const bBucketScore = getBucketSortScore(bClass, bucketId as RecipeBucketId)
    const aImage = a.Image?.url ? 1 : 0
    const bImage = b.Image?.url ? 1 : 0

    if (bPrimary !== aPrimary) return bPrimary - aPrimary
    if ((bAssignment?.confidence || 0) !== (aAssignment?.confidence || 0)) {
      return (bAssignment?.confidence || 0) - (aAssignment?.confidence || 0)
    }
    if (bBucketScore !== aBucketScore) return bBucketScore - aBucketScore
    if (bImage !== aImage) return bImage - aImage

    return a.Title.localeCompare(b.Title)
  })
}

export function getRecipePrimaryBucket(recipe: RecipeTaxonomyInput) {
  return getRecipeClassification(recipe).primaryBucketId
}

export function getRecipeBucketLabels(recipe: RecipeTaxonomyInput, limit = 3) {
  return getRecipeClassification(recipe)
    .assignments.slice(0, limit)
    .map((assignment) => getBucketById(assignment.bucketId)?.label)
    .filter(Boolean) as string[]
}

export function getRecipeClassification(
  recipe: RecipeTaxonomyInput
): RecipeClassification {
  if (recipe.PrimaryRecipeBucket && recipe.RecipeBucketAssignments?.length) {
    return {
      recipeId: recipe.documentId,
      slug: recipe.Slug,
      title: recipe.Title,
      primaryBucketId: recipe.PrimaryRecipeBucket,
      assignments: recipe.RecipeBucketAssignments,
      needsReview: Boolean(recipe.TaxonomyReviewNeeded),
      attributes:
        recipe.RecipeAttributes ||
        classifyRecipe({ ...recipe, RecipeBucketAssignments: undefined })
          .attributes,
    }
  }

  return classifyRecipe(recipe)
}

export function parseRecipeTime(time?: string | null) {
  if (!time) return null

  const normalized = normalizeText(time)
  let minutes = 0
  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(hr|hrs|hour|hours)/)
  const minuteMatch = normalized.match(/(\d+)\s*(min|mins|minute|minutes)/)

  if (hourMatch) minutes += Number(hourMatch[1]) * 60
  if (minuteMatch) minutes += Number(minuteMatch[1])

  if (!minutes) {
    const bareNumber = normalized.match(/^(\d+)$/)
    if (bareNumber) minutes = Number(bareNumber[1])
  }

  return minutes || null
}

export function parseServings(servings?: string | null) {
  if (!servings) return { servingsMin: null, servingsMax: null }

  const numbers = servings.match(/\d+/g)?.map(Number) || []
  if (numbers.length === 0) return { servingsMin: null, servingsMax: null }

  return {
    servingsMin: Math.min(...numbers),
    servingsMax: Math.max(...numbers),
  }
}

export function getSearchableRecipeText(recipe: RecipeTaxonomyInput) {
  return normalizeText(
    [
      recipe.Title,
      recipe.ShortDescription,
      recipe.Slug,
      recipe.Difficulty,
      recipe.Servings,
      ...(recipe.RecipeCategories || []).flatMap((category) => [
        category.Name,
        category.Slug,
      ]),
      ...(recipe.Ingredients || []).map((ingredient) => ingredient.ingredient),
    ]
      .filter(Boolean)
      .join(" ")
  )
}

function getRecipeIdentityText(recipe: RecipeTaxonomyInput) {
  return normalizeText(
    [
      recipe.Title,
      recipe.ShortDescription,
      recipe.Slug,
      ...(recipe.RecipeCategories || []).flatMap((category) => [
        category.Name,
        category.Slug,
      ]),
      ...(recipe.Ingredients || [])
        .slice(0, 1)
        .map((ingredient) => ingredient.ingredient),
    ]
      .filter(Boolean)
      .join(" ")
  )
}

function matchingTerms(text: string, terms: string[]) {
  return terms.filter((term) => termMatches(text, term))
}

function termMatches(text: string, term: string) {
  const parts = normalizeText(term)
    .split(/[\s-]+/)
    .filter(Boolean)
  if (parts.length === 0) return false

  const pattern = parts.map(escapeRegExp).join("[\\s-]+")
  const regex = new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, "i")

  return regex.test(text)
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/&/g, " and ").replace(/[’']/g, "'")
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function joinSignals(signals: string[]) {
  return Array.from(new Set(signals)).slice(0, 5).join(", ")
}

function inferProteins(text: string) {
  const proteins: string[] = []
  const hasTurkey = termMatches(text, "turkey")
  const hasLamb = termMatches(text, "lamb")
  const hasVeal = termMatches(text, "veal")
  const hasDuck = termMatches(text, "duck")
  const hasChicken =
    matchingTerms(text, [
      "chicken",
      "pargiot",
      "capon",
      "cornish hen",
      "chicken cutlet",
      "chicken cutlets",
      "chicken breast",
      "chicken breasts",
      "chicken thigh",
      "chicken thighs",
      "chicken drumstick",
      "chicken drumsticks",
      "chicken wing",
      "chicken wings",
      "drumette",
      "drumettes",
    ]).length > 0

  if (
    !hasTurkey &&
    !hasLamb &&
    !hasVeal &&
    !hasDuck &&
    !hasChicken &&
    matchingTerms(text, BEEF_TERMS).length
  ) {
    proteins.push("beef")
  }
  if (hasChicken) proteins.push("chicken")
  if (hasTurkey) proteins.push("turkey")
  if (hasLamb) proteins.push("lamb")
  if (hasVeal) proteins.push("veal")
  if (hasDuck) proteins.push("duck")
  if (matchingTerms(text, PREPARED_FORMAT_TERMS).length) {
    proteins.push("prepared")
  }

  return Array.from(new Set(proteins))
}

function inferCutFamilies(text: string) {
  const cutFamilies: string[] = []

  if (matchingTerms(text, BRISKET_ROAST_TERMS).length)
    cutFamilies.push("briskets-roasts")
  if (matchingTerms(text, WHOLE_BIRD_TERMS).length)
    cutFamilies.push("whole-birds")
  if (matchingTerms(text, STEAK_CHOP_TERMS).length)
    cutFamilies.push("steaks-chops")
  if (matchingTerms(text, RIB_TERMS).length) cutFamilies.push("ribs")
  if (matchingTerms(text, GROUND_MEAT_TERMS).length)
    cutFamilies.push("ground-meat")
  if (matchingTerms(text, SOUP_STOCK_TERMS).length)
    cutFamilies.push("soup-stock")
  if (matchingTerms(text, STEW_BRAISE_TERMS).length)
    cutFamilies.push("stew-braise")
  if (matchingTerms(text, POULTRY_PART_TERMS).length)
    cutFamilies.push("poultry-parts")
  if (matchingTerms(text, QUICK_PREP_TERMS).length)
    cutFamilies.push("quick-cuts")
  if (matchingTerms(text, PREPARED_FORMAT_TERMS).length)
    cutFamilies.push("prepared")
  if (matchingTerms(text, BUTCHER_PICK_TERMS).length)
    cutFamilies.push("specialty")

  return Array.from(new Set(cutFamilies))
}

function inferMethods(text: string) {
  const methods: string[] = []

  if (matchingTerms(text, ["roast", "roasted"]).length) methods.push("roast")
  if (matchingTerms(text, ["braise", "braised"]).length) methods.push("braise")
  if (matchingTerms(text, ["sear", "seared", "smashed"]).length)
    methods.push("sear")
  if (matchingTerms(text, ["grill", "grilled"]).length) methods.push("grill")
  if (matchingTerms(text, ["skillet", "pan"]).length) methods.push("skillet")
  if (matchingTerms(text, ["slow", "cholent", "stew"]).length)
    methods.push("slow-cook")

  return Array.from(new Set(methods))
}

function inferEffortLevel(timeMinutes: number | null) {
  if (timeMinutes === null) return "unknown"
  if (timeMinutes <= 55) return "quick"
  if (timeMinutes <= 120) return "moderate"
  return "project"
}

function getBucketSortScore(
  classification: RecipeClassification,
  bucketId: RecipeBucketId
) {
  const assignment = classification.assignments.find(
    (item) => item.bucketId === bucketId
  )
  const signals = assignment?.signals || []

  if (bucketId === "butchers-picks") {
    if (
      signals.some((signal) =>
        ["boerewors", "biltong", "south african"].includes(signal)
      )
    ) {
      return 10
    }
    if (
      signals.some((signal) =>
        [
          "oyster steak",
          "hanger steak",
          "skirt steak",
          "flanken",
          "picanha",
          "deckel",
        ].includes(signal)
      )
    ) {
      return 9
    }
    if (
      signals.some((signal) =>
        ["lamb", "veal", "duck", "osso buco"].includes(signal)
      )
    ) {
      return 8
    }
    if (
      signals.some((signal) =>
        ["tongue", "cheek", "marrow", "liver", "neck"].includes(signal)
      )
    ) {
      return 7
    }
    if (signals.includes("prime rib")) return 3
  }

  if (bucketId === "weeknight-dinner" && signals.includes("time<=55")) return 5

  return 0
}
