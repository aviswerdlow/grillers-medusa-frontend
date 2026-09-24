import { render, screen, within } from "@testing-library/react"
import { Kind, parse, visit } from "graphql"

import { GetRecipeBySlugQuery } from "@lib/data/strapi/recipes"
import RecipeIngredients from "@modules/recipes/components/ingredients"

jest.mock("graphql-request", () => ({
  gql: (strings: TemplateStringsArray, ...values: string[]) =>
    strings.reduce(
      (query, part, index) => query + part + (values[index] || ""),
      ""
    ),
}))
jest.mock("@lib/strapi", () => ({
  cachedStrapiRequest: jest.fn(),
}))

describe("recipe detail ingredients", () => {
  it("requests more than Strapi's default 10 repeatable ingredients", () => {
    const query = parse(GetRecipeBySlugQuery)
    let ingredientLimit: number | undefined

    visit(query, {
      Field(field) {
        if (field.name.value !== "Ingredients") return
        const pagination = field.arguments?.find(
          (argument) => argument.name.value === "pagination"
        )?.value
        if (pagination?.kind !== Kind.OBJECT) return
        const limit = pagination.fields.find(
          (field) => field.name.value === "limit"
        )?.value
        if (limit?.kind === Kind.INT) ingredientLimit = Number(limit.value)
      },
    })

    expect(ingredientLimit).toBeGreaterThanOrEqual(11)
  })

  it("renders every returned ingredient, including the eleventh parsley row", () => {
    const ingredients = Array.from({ length: 10 }, (_, index) => ({
      id: index + 1,
      ingredient: `Ingredient ${index + 1}`,
    }))
    ingredients.push({
      id: 11,
      ingredient: "2 tablespoons chopped flat-leaf parsley",
    })

    render(<RecipeIngredients ingredients={ingredients} />)

    const section = screen.getByRole("region", { name: "Ingredients" })
    expect(within(section).getAllByRole("listitem")).toHaveLength(11)
    expect(
      within(section).getByText("2 tablespoons chopped flat-leaf parsley")
    ).toBeInTheDocument()
  })
})
