export {}
const assert = require('node:assert/strict')
const { getPathMatch } = require('next/dist/shared/lib/router/utils/path-match')
const { buildLegacyRedirects, literalQuery } = require('../../lib/util/legacy-redirects.cjs')
const manifest = require('../../lib/data/legacy-redirect-manifest.json')
const skuMap = require('../../lib/data/legacy-listid-sku-map.json')

test('each product redirect has a unique, eligible ListID identity; SKU names never choose the target', () => {
  for (const row of manifest.rows.filter(r => r.list_id && r.disposition === 'redirect')) {
    const matches = skuMap.filter(p => p.qbd_list_id === row.list_id || p.variant_list_ids.includes(row.list_id))
    assert.equal(matches.length, 1)
    assert.equal(matches[0].eligible, true)
    assert.equal(row.destination, '/us/products/' + matches[0].handle)
  }
})
test('every manifest redirect compiles and matches its actual encoded legacy path and mixed case', () => {
  const rows = manifest.rows.filter(r => r.disposition === 'redirect')
  const rules = buildLegacyRedirects()
  assert.equal(rules.length, rows.length)
  rules.forEach((rule, i) => {
    const match = getPathMatch(rule.source, {strict: true, sensitive: false})
    assert.ok(match(rows[i].source_path), rule.source)
    assert.ok(match(rows[i].source_path.toUpperCase()), rule.source)
    assert.ok(rule.destination.startsWith('/us'))
    for (const condition of rule.has || []) {
      const original = rows[i].source_query[condition.key]
      const value = new URLSearchParams(`${condition.key}=${encodeURIComponent(original)}`).get(condition.key)
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
    assert.ok(pattern.test(new URLSearchParams(query).get('cat')))
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
