import LocalizedClientLink from "@modules/common/components/localized-client-link"

// Product-specific claims remain in Strapi; these links explain how to check them.
const facts = [
  {
    title: "Check the supervision",
    body: "See the kosher details on each product before choosing.",
    href: "/kashruth/hechsherim",
  },
  {
    title: "Choose delivery or pickup",
    body: "Check the options for your address and basket at checkout.",
    href: "/shipping/ups",
  },
  {
    title: "Talk to our Doraville team",
    body: "Ask about a cut, your order, or collection from the store.",
    href: "/customer-service",
  },
]

export default function KosherPromise(_props: { data: unknown }) {
  return (
    <section
      aria-label="Help with your order"
      className="border-y border-Charcoal/10 bg-Scroll py-8 md:py-12"
    >
      <div className="content-container grid gap-6 md:grid-cols-3">
        {facts.map((fact) => (
          <LocalizedClientLink
            key={fact.href}
            href={fact.href}
            className="block min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-Gold"
          >
            <h2 className="font-gyst text-xl text-Charcoal underline decoration-Charcoal/30 underline-offset-4">
              {fact.title}
            </h2>
            <p className="mt-2 font-maison-neue text-sm leading-relaxed text-Charcoal/75">
              {fact.body}
            </p>
          </LocalizedClientLink>
        ))}
      </div>
    </section>
  )
}
