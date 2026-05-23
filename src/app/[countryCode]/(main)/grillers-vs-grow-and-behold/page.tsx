import { redirect } from "next/navigation"

type PageProps = {
  params: Promise<{ countryCode: string }>
}

export default async function GrillersVsGrowAndBeholdRedirect({
  params,
}: PageProps) {
  const { countryCode } = await params
  redirect(`/${countryCode}/pages/grillers-vs-grow-and-behold`)
}
