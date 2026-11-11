'use strict'

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const { summaryToBreakdown } = require('../src/convert-summary.js')
const { parseBreakdown, aggregateByPackage, totalStats } = require('../src/breakdown.js')

const SCRIPT = path.join(__dirname, '..', 'src', 'convert-summary.js')

const counts = (total, covered) => ({
  lines: { total, covered, skipped: 0, pct: 0 },
  statements: { total, covered, skipped: 0, pct: 0 },
  functions: { total: 1, covered: 1, skipped: 0, pct: 100 },
  branches: { total: 0, covered: 0, skipped: 0, pct: 100 },
})

// Real Vitest 5 output (v8 provider) from vueuse, with its checkout moved to a runner path.
test('a real Vitest summary converts to every file it lists, with the totals it reports', () => {
  const summary = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'coverage-summary.json'), 'utf8'))
  const stats = parseBreakdown(summaryToBreakdown(summary, '/home/runner/work/vueuse/vueuse', path.posix))

  assert.strictEqual(stats.length, Object.keys(summary).length - 1)
  assert.deepStrictEqual(totalStats(stats), { total: summary.total.statements.total, covered: summary.total.statements.covered })
  assert.ok(stats.every((s) => s.name.startsWith('packages/')), 'every path is relative to the workspace')
})

test('each file becomes one path;total;covered line relative to the workspace, without the total', () => {
  const summary = {
    total: counts(15, 9),
    '/home/runner/work/app/app/src/a.ts': counts(10, 7),
    '/home/runner/work/app/app/src/lib/b.ts': counts(5, 2),
  }

  assert.strictEqual(
    summaryToBreakdown(summary, '/home/runner/work/app/app', path.posix),
    'src/a.ts;10;7\nsrc/lib/b.ts;5;2\n',
  )
})

// Without the separator swap every Windows file is its own Package, and no key matches a
// Baseline made on Linux.
test('a Windows path is written with forward slashes so it groups and compares like a Linux one', () => {
  const summary = {
    'D:\\a\\app\\app\\src\\lib\\b.ts': counts(5, 2),
    'D:\\a\\app\\app\\src\\lib\\c.ts': counts(3, 3),
  }

  const breakdown = summaryToBreakdown(summary, 'D:\\a\\app\\app', path.win32)

  assert.strictEqual(breakdown, 'src/lib/b.ts;5;2\nsrc/lib/c.ts;3;3\n')
  assert.deepStrictEqual(aggregateByPackage(parseBreakdown(breakdown)), [{ name: 'src/lib', total: 8, covered: 5 }])
})

test('a path already relative is taken relative to the workspace', () => {
  assert.strictEqual(summaryToBreakdown({ 'src/a.ts': counts(4, 1) }, '/repo', path.posix), 'src/a.ts;4;1\n')
})

test('a summary with only a total yields an empty breakdown', () => {
  assert.strictEqual(summaryToBreakdown({ total: counts(0, 0) }, '/repo', path.posix), '')
})

test('a summary that is not an object of statement counts is rejected', () => {
  for (const summary of [null, [], 'text', { 'a.ts': {} }, { 'a.ts': { statements: { total: 1 } } },
    { 'a.ts': counts(2, 3) }, { 'a.ts': counts(-1, 0) }, { 'a.ts': counts(1.5, 1) }]) {
    assert.throws(() => summaryToBreakdown(summary, '/repo', path.posix), JSON.stringify(summary))
  }
})

// Runs the shipped entry point. `summaryFor` gets the real workspace directory and returns
// the summary text to write, or undefined to leave the summary missing. GITHUB_WORKSPACE
// points at it through a symlink, because coverage tools report real paths and macOS puts
// tmpdir behind one.
function convert(summaryFor) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'convert-summary-')))
  const dir = path.join(parent, 'real')
  const link = path.join(parent, 'link')
  fs.mkdirSync(dir)
  fs.symlinkSync(dir, link, 'dir')
  const summaryPath = path.join(dir, 'coverage-summary.json')
  const breakdownPath = path.join(dir, 'coverage-breakdown.txt')
  const text = summaryFor(dir)
  if (text !== undefined) fs.writeFileSync(summaryPath, text)

  try {
    const result = spawnSync(process.execPath, [SCRIPT], {
      env: { ...process.env, SUMMARY_PATH: summaryPath, BREAKDOWN_PATH: breakdownPath, GITHUB_WORKSPACE: link },
      encoding: 'utf8',
    })
    const breakdown = fs.existsSync(breakdownPath) ? fs.readFileSync(breakdownPath, 'utf8') : null
    return { status: result.status, stdout: result.stdout, breakdown }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true })
  }
}

test('the converter writes the breakdown file from a summary on disk', () => {
  const result = convert((dir) =>
    JSON.stringify({ total: counts(4, 1), [path.join(dir, 'src', 'a.ts')]: counts(4, 1) }),
  )

  assert.strictEqual(result.status, 0)
  assert.strictEqual(result.breakdown, 'src/a.ts;4;1\n')
})

// The render step skips on a missing breakdown file and the comment falls back to the
// unavailable notice, so the converter must not fail the job or leave a partial file.
test('a missing or unparsable summary warns and writes no breakdown file', () => {
  for (const text of [undefined, '{"total": ', JSON.stringify({ 'a.ts': {} })]) {
    const result = convert(() => text)
    assert.strictEqual(result.status, 0)
    assert.strictEqual(result.breakdown, null)
    assert.match(result.stdout, /^::warning::Cannot read the coverage summary /m)
  }
})
