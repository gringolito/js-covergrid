'use strict'

const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const {
  parseBreakdown,
  packageForFile,
  parsePackageDepth,
  sharedFolder,
  aggregateByPackage,
  totalStats,
  coverageRatio,
  diffStats,
  totalRatioDiff,
} = require('../src/breakdown.js')

const FIXTURES = path.join(__dirname, 'fixtures')

test('parseBreakdown reads semicolon-delimited path;total;covered lines', () => {
  const stats = parseBreakdown('a/b.go;10;7\na/c.go;3;3\n')
  assert.deepStrictEqual(stats, [
    { name: 'a/b.go', total: 10, covered: 7 },
    { name: 'a/c.go', total: 3, covered: 3 },
  ])
})

test('parseBreakdown ignores blank lines and trims whitespace', () => {
  const stats = parseBreakdown('\n  a/b.go;10;7  \n\n')
  assert.deepStrictEqual(stats, [{ name: 'a/b.go', total: 10, covered: 7 }])
})

test('parseBreakdown rejects a line that is not three fields', () => {
  assert.throws(() => parseBreakdown('a/b.go;10\n'), /malformed breakdown line/i)
})

test('parseBreakdown rejects non-numeric counts', () => {
  assert.throws(() => parseBreakdown('a/b.go;ten;7\n'), /malformed breakdown line/i)
})

test('packageForFile takes everything before the last slash, with no rollup', () => {
  assert.strictEqual(packageForFile('internal/tariff/courier/client.go'), 'internal/tariff/courier')
  assert.strictEqual(packageForFile('main.go'), 'main.go')
})

test('aggregateByPackage keeps a parent package separate from its children', () => {
  const pkgs = aggregateByPackage([
    { name: 'internal/tariff/a.go', total: 100, covered: 50 },
    { name: 'internal/tariff/b.go', total: 44, covered: 44 },
    { name: 'internal/tariff/courier/c.go', total: 10, covered: 0 },
  ])
  assert.deepStrictEqual(pkgs, [
    { name: 'internal/tariff', total: 144, covered: 94 },
    { name: 'internal/tariff/courier', total: 10, covered: 0 },
  ])
})

test('the depth counts from the folder every file shares and folds deeper folders into their ancestor', () => {
  const pkgs = aggregateByPackage(
    [
      { name: 'app/web/src/components/Button/index.tsx', total: 10, covered: 5 },
      { name: 'app/web/src/components/Card/index.tsx', total: 6, covered: 6 },
      { name: 'app/web/src/main.tsx', total: 4, covered: 0 },
      { name: 'app/web/entry/index.ts', total: 2, covered: 2 },
    ],
    2,
  )
  assert.deepStrictEqual(pkgs, [
    { name: 'app/web/src/components', total: 16, covered: 11 },
    { name: 'app/web/src', total: 4, covered: 0 },
    { name: 'app/web/entry', total: 2, covered: 2 },
  ])
})

test('sharedFolder is the deepest common folder, and empty when files share none', () => {
  assert.strictEqual(sharedFolder(['app/web/src/a.ts', 'app/web/entry/b.ts']), 'app/web')
  assert.strictEqual(sharedFolder(['app/web/a.ts']), 'app/web')
  assert.strictEqual(sharedFolder(['app/web/a.ts', 'index.ts']), '')
  assert.strictEqual(sharedFolder(['application/a.ts', 'app/b.ts']), '')
})

test('package-depth accepts a whole number, treats empty as no limit and rejects the rest', () => {
  assert.strictEqual(parsePackageDepth(''), 0)
  assert.strictEqual(parsePackageDepth(undefined), 0)
  assert.strictEqual(parsePackageDepth(' 3 '), 3)
  for (const bad of ['-1', '2.5', 'two']) assert.throws(() => parsePackageDepth(bad), /package-depth/)
})

test('coverageRatio returns exactly 100 when fully covered and 0 for an empty package', () => {
  assert.strictEqual(coverageRatio(0, 0), 0)
  assert.strictEqual(coverageRatio(3, 3), 100)
  assert.strictEqual(coverageRatio(8, 2), 25)
})

// A renderer fixture kept from go-covergrid. Breakdown Files are language-neutral, so its Go
// paths still exercise every rule here.
test('the sample fixture totals 989 statements at 76.8% across 18 packages', () => {
  const fs = require('node:fs')
  const stats = parseBreakdown(fs.readFileSync(path.join(FIXTURES, 'sample-breakdown.txt'), 'utf8'))
  const pkgs = aggregateByPackage(stats)
  const total = totalStats(stats)

  assert.strictEqual(stats.length, 35)
  assert.strictEqual(pkgs.length, 18)
  assert.strictEqual(total.total, 989)
  assert.strictEqual(coverageRatio(total.total, total.covered).toFixed(1), '76.8')
})

test('diffStats reports a package whose uncovered count moved', () => {
  const current = [{ name: 'p', total: 10, covered: 6 }]
  const base = [{ name: 'p', total: 10, covered: 4 }]
  assert.deepStrictEqual(diffStats(current, base), [{ current: current[0], base: base[0] }])
})

test('diffStats reports a package absent from the baseline as new', () => {
  const current = [{ name: 'p', total: 10, covered: 6 }]
  assert.deepStrictEqual(diffStats(current, []), [{ current: current[0], base: null }])
})

// The impacted tables point at what still needs work; the total line shows the gain.
test('diffStats omits a package that is now fully covered', () => {
  const current = [{ name: 'p', total: 10, covered: 10 }]
  const base = [{ name: 'p', total: 10, covered: 4 }]
  assert.deepStrictEqual(diffStats(current, base), [])
})

test('diffStats omits a package whose uncovered count is unchanged', () => {
  const current = [{ name: 'p', total: 10, covered: 6 }]
  const base = [{ name: 'p', total: 10, covered: 6 }]
  assert.deepStrictEqual(diffStats(current, base), [])
})

test('totalRatioDiff is the current total ratio minus the base, to two decimals', () => {
  const current = [{ name: 'p', total: 3, covered: 2 }]
  const base = [{ name: 'p', total: 3, covered: 1 }]
  assert.strictEqual(totalRatioDiff(current, base), 33.33)
})
