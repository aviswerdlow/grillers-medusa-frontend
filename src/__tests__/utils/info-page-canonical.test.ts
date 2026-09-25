import StaticPage, { generateMetadata } from '../../app/[countryCode]/(main)/page/[slug]/page'
import { getCustomerInstitutionalTerms } from '@lib/data/institutional-terms'
jest.mock('@lib/data/strapi/legal', () => ({
  LEGAL_SLUGS: ['privacy-policy'], isLegalSlug: (slug: string) => slug === 'privacy-policy',
  getLegalPage: jest.fn(async () => ({Title:'Privacy',SEO:{metaTitle:'Privacy policy'}})),
  getInfoPage: jest.fn(async () => ({Title:'About us',SEO:{metaTitle:'About Grillers Pride'}})),
}))
jest.mock('@lib/util/env', () => ({getBaseURL:()=> 'https://www.grillerspride.com',isProductionHost:()=> true}))
jest.mock('@modules/info/templates/info-page', () => () => null)
jest.mock('../../components/wholesale-lead-form', () => () => null)
jest.mock('@lib/data/institutional-terms', () => ({getCustomerInstitutionalTerms: jest.fn()}))

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

describe('wholesale account terms', () => {
  const previousFlag = process.env.GP_INSTITUTIONAL_TERMS_ENABLED

  afterEach(() => {
    if (previousFlag === undefined) {
      delete process.env.GP_INSTITUTIONAL_TERMS_ENABLED
    } else {
      process.env.GP_INSTITUTIONAL_TERMS_ENABLED = previousFlag
    }
    jest.clearAllMocks()
  })

  const wholesalePage = () => StaticPage({params: Promise.resolve({countryCode: 'us', slug: 'wholesale'})})

  test('does not fetch or show account terms when the feature is off', async () => {
    delete process.env.GP_INSTITUTIONAL_TERMS_ENABLED
    const html = JSON.stringify(await wholesalePage())
    expect(getCustomerInstitutionalTerms).not.toHaveBeenCalled()
    expect(html).not.toContain('approved invoice terms')
  })

  test('shows only the signed-in account\'s approved terms', async () => {
    process.env.GP_INSTITUTIONAL_TERMS_ENABLED = 'true'
    jest.mocked(getCustomerInstitutionalTerms).mockResolvedValue({
      status: 'approved', reason: null,
      terms: {name: 'Net 15', creditLimitCents: 50000, openInvoiceCents: 12000},
      source: {revision: 'fixture-1', lastSuccess: '2026-09-24T00:00:00Z'},
    })
    const html = JSON.stringify(await wholesalePage())
    expect(html).toContain('Your approved invoice terms')
    expect(html).toContain('Net 15')
    expect(html).not.toContain('50000')
    expect(html).not.toContain('12000')
  })

  test('does not show terms for an unapproved account', async () => {
    process.env.GP_INSTITUTIONAL_TERMS_ENABLED = 'true'
    jest.mocked(getCustomerInstitutionalTerms).mockResolvedValue({
      status: 'held', reason: 'source_unavailable', terms: null, source: null,
    })
    const html = JSON.stringify(await wholesalePage())
    expect(html).not.toContain('approved invoice terms')
  })
})
