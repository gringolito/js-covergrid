'use strict'

// Breakdown File parsing and aggregation.
//
// A Breakdown File has one line per source file, `path;totalStatements;coveredStatements`.
// src/convert-summary.js writes it from the Coverage Summary, and it is the single source of
// every number this action reports (ADR-0001).

/** @typedef {{ name: string, total: number, covered: number }} Stat */

/**
 * @param {string} text contents of a Breakdown File
 * @returns {Stat[]} one entry per source file, in file order
 */
function parseBreakdown(text) {
  const stats = []

  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue

    const fields = line.split(';')
    const [name, total, covered] = fields
    if (fields.length !== 3 || !/^\d+$/.test(total) || !/^\d+$/.test(covered) || name.trim() === '') {
      throw new Error(`malformed breakdown line: ${JSON.stringify(raw)}`)
    }

    stats.push({ name: name.trim(), total: parseInt(total, 10), covered: parseInt(covered, 10) })
  }

  return stats
}

function dirSegments(filename) {
  const i = filename.lastIndexOf('/')
  return i === -1 ? [] : filename.slice(0, i).split('/')
}

/**
 * The deepest folder every file sits under, '' when they share none.
 *
 * @param {string[]} filenames
 * @returns {string}
 */
function sharedFolder(filenames) {
  if (filenames.length === 0) return ''

  let shared = dirSegments(filenames[0])
  for (const name of filenames.slice(1)) {
    const dir = dirSegments(name)
    let i = 0
    while (i < shared.length && i < dir.length && shared[i] === dir[i]) i++
    shared = shared.slice(0, i)
  }
  return shared.join('/')
}

/**
 * A Package is everything before the last `/`, with no rollup of deeper paths into
 * shallower ones. A positive `depth` keeps the shared folder plus that many folders below
 * it, so deeper folders fold into their ancestor at that depth.
 *
 * @param {string} filename
 * @param {number} [depth] folders kept below `shared`; 0 for no limit
 * @param {string} [shared] folder the depth counts from, see sharedFolder
 * @returns {string}
 */
function packageForFile(filename, depth = 0, shared = '') {
  const i = filename.lastIndexOf('/')
  if (i === -1) return filename

  const dir = filename.slice(0, i)
  if (depth === 0) return dir

  const keep = (shared === '' ? 0 : shared.split('/').length) + depth
  return dir.split('/').slice(0, keep).join('/')
}

/**
 * @param {string | undefined} text the `package-depth` input
 * @returns {number} 0 when unset
 */
function parsePackageDepth(text) {
  const value = (text || '').trim()
  if (value === '') return 0
  if (!/^\d+$/.test(value)) throw new Error(`package-depth must be a whole number, got ${JSON.stringify(text)}`)
  return parseInt(value, 10)
}

/**
 * @param {Stat[]} stats per-file entries
 * @param {number} [depth] see packageForFile
 * @param {string} [shared] see packageForFile; defaults to the folder `stats` share
 * @returns {Stat[]} one entry per Package, in first-seen order
 */
function aggregateByPackage(stats, depth = 0, shared = sharedFolder(stats.map((s) => s.name))) {
  const byPkg = new Map()

  for (const s of stats) {
    const name = packageForFile(s.name, depth, shared)
    const entry = byPkg.get(name) || { name, total: 0, covered: 0 }
    entry.total += s.total
    entry.covered += s.covered
    byPkg.set(name, entry)
  }

  return [...byPkg.values()]
}

/**
 * @param {Stat[]} list
 * @returns {{ total: number, covered: number }}
 */
function totalStats(list) {
  return list.reduce(
    (acc, s) => ({ total: acc.total + s.total, covered: acc.covered + s.covered }),
    { total: 0, covered: 0 },
  )
}

/**
 * Coverage Ratio as a percentage. Special-cased at the ends so a fully covered Package
 * reads exactly 100 rather than 99.99999999.
 *
 * @param {number} total
 * @param {number} covered
 * @returns {number} 0..100
 */
function coverageRatio(total, covered) {
  if (total === 0) return 0
  if (covered === total) return 100
  return (covered * 100) / total
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function round2(n) {
  return Math.round(n * 100) / 100
}

/**
 * Entries whose uncovered Statement count moved since the Baseline, or that the Baseline
 * did not have at all.
 *
 * An entry that is now fully covered is left out, even if it had uncovered Statements
 * before: the impacted tables point at what still needs work, and the total shows the gain.
 *
 * @param {Stat[]} current
 * @param {Stat[]} base
 * @returns {{ current: Stat, base: Stat | null }[]}
 */
function diffStats(current, base) {
  const baseByName = new Map(base.map((s) => [s.name, s]))
  const diffs = []

  for (const s of current) {
    const uncovered = s.total - s.covered
    if (uncovered === 0) continue

    const b = baseByName.get(s.name)
    if (!b) {
      diffs.push({ current: s, base: null })
    } else if (uncovered !== b.total - b.covered) {
      diffs.push({ current: s, base: b })
    }
  }

  return diffs
}

/**
 * Current total Coverage Ratio minus the Baseline's, to two decimals.
 *
 * @param {Stat[]} current
 * @param {Stat[]} base
 * @returns {number}
 */
function totalRatioDiff(current, base) {
  const c = totalStats(current)
  const b = totalStats(base)
  return round2(coverageRatio(c.total, c.covered) - coverageRatio(b.total, b.covered))
}

module.exports = {
  parseBreakdown,
  packageForFile,
  sharedFolder,
  parsePackageDepth,
  aggregateByPackage,
  totalStats,
  coverageRatio,
  diffStats,
  totalRatioDiff,
  round1,
  round2,
}
