import { generateMetadata } from '../../app/[countryCode]/(main)/page/[slug]/page'
jest.mock('@lib/data/strapi/legal', () => ({
  LEGAL_SLUGS: ['privacy-policy'], isLegalSlug: (slug: string) => slug === 'privacy-policy',
  getLegalPage: jest.fn(async () => ({Title:'Privacy',SEO:{metaTitle:'Privacy policy'}})),
  getInfoPage: jest.fn(async () => ({Title:'About us',SEO:{metaTitle:'About Grillers Pride'}})),
}))
jest.mock('@lib/util/env', () => ({getBaseURL:()=> 'https://www.grillerspride.com',isProductionHost:()=> true}))
jest.mock('@modules/info/templates/info-page', () => () => null)
jest.mock('../../components/wholesale-lead-form', () => () => null)

test.each(['about-us','privacy-policy'])('information page %s has one configured canonical and matching social URL', async slug => {
  const metadata=await generateMetadata({params:Promise.resolve({countryCode:'us',slug})})
  expect(metadata.alternates).toEqual({canonical:`https://www.grillerspride.com/us/page/${slug}`})
  expect(metadata.openGraph).toMatchObject({url:`https://www.grillerspride.com/us/page/${slug}`})
})
test('unknown information slug stays nonindexable and has no canonical', async () => {
  const metadata=await generateMetadata({params:Promise.resolve({countryCode:'us',slug:'unknown'})})
  expect(metadata.robots).toEqual({index:false,follow:false})
  expect(metadata.alternates).toBeUndefined()
})
