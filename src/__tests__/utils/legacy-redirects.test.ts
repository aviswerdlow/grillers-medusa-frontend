export {}
const assert = require('node:assert/strict')
const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match')
const { buildLegacyRedirects, literalQuery } = require('../../lib/util/legacy-redirects.cjs')
import manifest from "../../lib/data/legacy-redirect-manifest.json"
import skuMap from "../../lib/data/legacy-listid-sku-map.json"

test('each direct product redirect has a unique, eligible ListID identity; SKU names never choose the target', () => {
  for (const row of manifest.rows.filter(r => r.list_id && r.disposition === 'redirect' && !('policy_lane' in r))) {
    const matches = skuMap.filter(p => p.qbd_list_id === row.list_id || p.variant_list_ids.includes(row.list_id || ""))
    assert.equal(matches.length, 1)
    assert.equal(matches[0].eligible, true)
    assert.equal(row.destination, '/us/products/' + matches[0].handle)
  }
})
test('approved policy fallbacks cover the former holds without inventing product successors', () => {
  const policyRows = manifest.rows.filter(r => 'policy_lane' in r)
  assert.equal(policyRows.length, 265)
  assert.deepEqual(
    policyRows.reduce((counts: Record<string, number>, row) => {
      counts[row.policy_lane!] = (counts[row.policy_lane!] || 0) + 1
      return counts
    }, {}),
    {broader_collection: 156, current_category: 68, current_page: 41}
  )
  for (const row of policyRows) {
    assert.equal(row.disposition, 'redirect')
    assert.ok(row.destination?.startsWith('/us/'))
    assert.ok(!row.destination?.startsWith('/us/products/'))
  }
  assert.deepEqual(manifest.summary, {redirect: 638, covered: 1})
  assert.equal(manifest.rows.filter(r => r.disposition === 'hold').length, 0)
})
test('duck, mozzarella, and biltong fallbacks use the reviewed closer collections', () => {
  const fixtures: Array<{field: 'category' | 'list_id'; value: string; destination: string}> = [
    {field: 'category', value: 'Kosher Turkey and Duck By Source:Kosher Duck Antibiotic-Free Free Range', destination: '/us/collections/kosher-duck'},
    {field: 'list_id', value: '80000679-1328572653', destination: '/us/collections/kosher-cheese'},
    {field: 'category', value: 'Specialties - Biltong, Drywors', destination: '/us/collections/kosher-specialty-charcuterie'},
    {field: 'list_id', value: '390000-1102714368', destination: '/us/collections/kosher-specialty-charcuterie'},
    {field: 'list_id', value: 'F30000-1139167617', destination: '/us/collections/kosher-specialty-charcuterie'},
  ]
  for (const fixture of fixtures) {
    const rows = manifest.rows.filter(row => row[fixture.field] === fixture.value)
    assert.equal(rows.length, 1, fixture.value)
    assert.equal(rows[0].policy_lane === 'current_category' || rows[0].policy_lane === 'broader_collection', true)
    assert.equal(rows[0].destination, fixture.destination)
    assert.equal(buildLegacyRedirects(rows)[0].destination, fixture.destination)
  }
  assert.ok(manifest.rows.find(row => row.list_id === '800005E9-1321290589')?.destination?.startsWith('/us/products/'))
})
test('every manifest redirect compiles and matches its actual encoded legacy path and mixed case', () => {
  const rows = manifest.rows.filter(r => r.disposition === 'redirect')
  const rules: Array<{source:string;destination:string;has?:Array<{key:string;value:string}>}> = buildLegacyRedirects()
  assert.equal(rules.length, rows.length)
  rules.forEach((rule, i) => {
    const match = getPathMatch(rule.source, {strict: true, sensitive: false})
    assert.ok(match(rows[i].source_path), rule.source)
    assert.ok(match(rows[i].source_path.toUpperCase()), rule.source)
    assert.ok(rule.destination.startsWith('/us'))
    for (const condition of rule.has || []) {
      const original = (rows[i].source_query as Record<string, string | undefined>)[condition.key] || ""
      const value = new URLSearchParams(`${condition.key}=${encodeURIComponent(original)}`).get(condition.key) || ""
      const pattern = new RegExp(`^(?:${condition.value})$`)
      assert.ok(pattern.test(value))
      assert.ok(pattern.test(value.toUpperCase()))
      assert.ok(!pattern.test(value + ':unrelated'))
    }
  })
})
test('category encodings and regexp punctuation preserve exact query meaning', () => {
  const expected = 'Meat:Soup, Stew & Cholent (Bulk)'
  const pattern = new RegExp(`^(?:${literalQuery(expected)})$`)
  for (const query of ['cat=' + encodeURIComponent(expected), new URLSearchParams({cat: expected}).toString()]) {
    assert.ok(pattern.test(new URLSearchParams(query).get('cat') || ''))
  }
  assert.ok(!pattern.test('Meat:SoupX Stew & Cholent Bulk'))
})
test('unresolved and retired fixtures never silently redirect to the homepage', () => {
  assert.deepEqual(buildLegacyRedirects([{disposition:'hold'}, {disposition:'retired'}]), [])
  const row={disposition:'redirect', source_path:'/old', source_query:{}, destination:'https://attacker.invalid'}
  assert.throws(() => buildLegacyRedirects([row]), /Unsafe/)
  assert.throws(() => buildLegacyRedirects([{...row,source_path:'/us',destination:'/us'}]), /loop/)
  assert.throws(() => buildLegacyRedirects([{...row,destination:'/us/a'},{...row,destination:'/us/b'}]), /Duplicate/)
})

test('plain Home.jsp rule covers the refresh query without a shadowed rule', () => {
  const home = manifest.rows.filter(r => r.source_path === '/Home.jsp')
  assert.equal(home.length, 2)
  assert.equal(home.find(r => r.source_query.refresh === 'true')?.disposition, 'covered')
  const rules = buildLegacyRedirects().filter((r: { source: string }) => r.source === '/Home.jsp')
  assert.equal(rules.length, 1)
  assert.equal(rules[0].destination, '/us')
  assert.equal(rules[0].has, undefined)
})
