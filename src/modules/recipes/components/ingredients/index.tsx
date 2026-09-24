type RecipeIngredient = {
  id: string | number
  ingredient: string
}

const RecipeIngredients = ({
  ingredients,
}: {
  ingredients: RecipeIngredient[]
}) => (
  <section aria-labelledby="ingredients-heading">
    <h2
      id="ingredients-heading"
      className="text-h3 font-gyst text-Charcoal mb-6"
    >
      Ingredients
    </h2>
    <ul className="list-disc pl-5 space-y-2">
      {ingredients.map((item) => (
        <li
          key={item.id}
          className="text-p-md font-maison-neue text-Charcoal"
        >
          {item.ingredient}
        </li>
      ))}
    </ul>
  </section>
)

export default RecipeIngredients
