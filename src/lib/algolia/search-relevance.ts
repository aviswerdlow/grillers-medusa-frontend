type SearchableProduct = {
  Title?: string | null
  objectID?: string | null
  Metadata?: Record<string, unknown> | null
  Categorization?: {
    ProductTags?: Array<{ Name?: string | null }> | null
    ProductCollections?: Array<{ Name?: string | null }> | null
  } | null
  MedusaProduct?: {
    Title?: string | null
    Handle?: string | null
    Description?: string | null
    ShortDescription?: string | null
    Variants?: Array<{ Sku?: string | null }> | null
  } | null
}

type SearchIntent = {
  triggers: string[]
  include: string[]
  exclude?: string[]
  required?: boolean
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "i",
  "kosher",
  "me",
  "meat",
  "of",
  "order",
  "the",
  "to",
  "want",
  "with",
])

const INTENTS: SearchIntent[] = [
  {
    triggers: ["flank"],
    required: true,
    include: [
      "flank steak",
      "flank",
      "flanken",
      "miami ribs",
      "london broil",
      "skirt steak",
      "skirt",
      "hanger steak",
      "hanger",
      "bavette",
    ],
    exclude: ["frank", "franks", "hot dog", "hot dogs", "sausage"],
  },
  {
    triggers: ["steak", "steaks"],
    include: [
      "steak",
      "ribeye",
      "rib eye",
      "strip",
      "filet",
      "mignon",
      "london broil",
      "skirt",
      "hanger",
      "flatiron",
      "flat iron",
      "denver",
      "delmonico",
      "minute steak",
      "shoulder steak",
      "chuck eye",
      "chuckeye",
    ],
    exclude: ["frank", "franks", "hot dog", "hot dogs", "sausage", "burger"],
  },
  {
    triggers: ["brisket"],
    required: true,
    include: ["brisket", "packer", "deckel"],
  },
  {
    triggers: ["ribeye", "rib-eye"],
    required: true,
    include: ["ribeye", "rib eye", "rib steak", "rib roast"],
  },
  {
    triggers: ["filet", "mignon", "tenderloin"],
    required: true,
    include: ["filet", "mignon", "tenderloin", "chuck filet"],
  },
  {
    triggers: ["strip"],
    required: true,
    include: ["strip steak", "new york strip", "ny strip", "strip"],
  },
  {
    triggers: ["frank", "franks", "hotdog", "hotdogs", "hot", "dog", "dogs"],
    include: ["frank", "franks", "hot dog", "hot dogs", "sausage"],
    exclude: ["steak", "brisket", "roast"],
  },
]

function normalize(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

export function searchQueryForAlgolia(query: string) {
  const normalized = normalize(query)
  if (!normalized) return ""

  return normalized
    .replace(/\bflank steaks?\b/g, "flank")
    .replace(/\bsteaks\b/g, "steak")
    .replace(/\s+/g, " ")
    .trim()
}

function includesPhrase(haystack: string, phrase: string) {
  const normalizedPhrase = normalize(phrase)
  if (!normalizedPhrase) return false
  return ` ${haystack} `.includes(` ${normalizedPhrase} `)
}

function productText(product: SearchableProduct) {
  const metadata = product.Metadata || {}
  const tags = product.Categorization?.ProductTags?.map((tag) => tag.Name) || []
  const collections =
    product.Categorization?.ProductCollections?.map(
      (collection) => collection.Name
    ) || []
  const variants =
    product.MedusaProduct?.Variants?.map((variant) => variant.Sku) || []

  return normalize(
    [
      product.Title,
      product.MedusaProduct?.Title,
      product.MedusaProduct?.Handle,
      product.MedusaProduct?.Description,
      product.MedusaProduct?.ShortDescription,
      ...tags,
      ...collections,
      ...variants,
      ...Object.entries(metadata)
        .filter(([, value]) => value === true || typeof value === "string")
        .map(([key, value]) => `${key} ${String(value)}`),
    ]
      .filter(Boolean)
      .join(" ")
  )
}

function productTitle(product: SearchableProduct) {
  return normalize(
    [product.Title, product.MedusaProduct?.Title, product.MedusaProduct?.Handle]
      .filter(Boolean)
      .join(" ")
  )
}

function activeIntents(query: string) {
  const tokens = new Set(tokenize(query))
  return INTENTS.filter((intent) =>
    intent.triggers.some((trigger) => {
      const triggerTokens = tokenize(trigger)
      return triggerTokens.every((token) => tokens.has(token))
    })
  )
}

export function isStrictSearchQuery(query: string) {
  return activeIntents(query).some((intent) => intent.required)
}

export function searchRelevanceScore(
  product: SearchableProduct,
  query: string
) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return 0

  const title = productTitle(product)
  const haystack = productText(product)
  const tokens = tokenize(query)
  const intents = activeIntents(query)
  let score = 0

  if (includesPhrase(title, normalizedQuery)) score += 120
  if (includesPhrase(haystack, normalizedQuery)) score += 60

  for (const token of tokens) {
    if (includesPhrase(title, token)) score += 18
    else if (includesPhrase(haystack, token)) score += 6
  }

  for (const intent of intents) {
    const hasInclude = intent.include.some((phrase) =>
      includesPhrase(haystack, phrase)
    )
    const hasTitleInclude = intent.include.some((phrase) =>
      includesPhrase(title, phrase)
    )
    const hasExcluded = intent.exclude?.some((phrase) =>
      includesPhrase(haystack, phrase)
    )

    if (hasExcluded && !hasInclude) score -= 200
    if (hasTitleInclude) score += 80
    else if (hasInclude) score += 36
    else if (intent.required) score -= 120
  }

  return score
}

export function productMatchesSearchIntent(
  product: SearchableProduct,
  query: string
) {
  const intents = activeIntents(query)
  if (intents.length === 0) return true

  const haystack = productText(product)
  return intents.every((intent) => {
    const hasExcluded = intent.exclude?.some((phrase) =>
      includesPhrase(haystack, phrase)
    )
    const hasInclude = intent.include.some((phrase) =>
      includesPhrase(haystack, phrase)
    )

    if (hasExcluded && !hasInclude) return false
    return intent.required ? hasInclude : true
  })
}

export function rankSearchHits<T extends SearchableProduct>(
  items: T[],
  query: string
) {
  const strict = isStrictSearchQuery(query)
  return items
    .map((item, index) => ({
      item,
      index,
      score: searchRelevanceScore(item, query),
      matchesIntent: productMatchesSearchIntent(item, query),
    }))
    .filter((entry) => !strict || (entry.matchesIntent && entry.score > 0))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item)
}
