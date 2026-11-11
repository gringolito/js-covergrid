'use strict'

// Entry point: Coverage Summary in, Breakdown File out.
//
//   SUMMARY_PATH=coverage/coverage-summary.json BREAKDOWN_PATH=coverage-breakdown.txt \
//     node src/convert-summary.js
//
// A missing or unreadable summary warns and writes nothing. The render step then skips the
// Grid Map and the comment says coverage could not be read.

const fs = require('node:fs')
const path = require('node:path')

const { notice, warning } = require('./workflow.js')

const isCount = (n) => Number.isSafeInteger(n) && n >= 0

/**
 * @param {unknown} summary parsed Istanbul `json-summary` document
 * @param {string} root directory the Breakdown File paths are made relative to
 * @param {typeof path} [paths] path flavour of the runner, injectable to exercise Windows
 * @returns {string} Breakdown File contents
 */
function summaryToBreakdown(summary, root, paths = path) {
  if (summary === null || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new Error('the coverage summary is not a JSON object')
  }

  const lines = []

  for (const [file, entry] of Object.entries(summary)) {
    if (file === 'total') continue

    const statements = entry && entry.statements
    if (!statements || !isCount(statements.total) || !isCount(statements.covered) || statements.covered > statements.total) {
      throw new Error(`the coverage summary has no valid statement counts for ${file}`)
    }

    // Windows runners return `src\foo.ts`. Packages split on `/`, and a Baseline made on
    // Linux must still match.
    const name = paths.relative(root, paths.resolve(root, file)).replace(/\\/g, '/')

    lines.push(`${name};${statements.total};${statements.covered}\n`)
  }

  return lines.join('')
}

// Coverage tools report real paths, so a workspace behind a symlink has to be resolved too.
// A workspace that doesn't exist here, as when converting a fixture, is taken as written.
function realWorkspace() {
  const root = process.env.GITHUB_WORKSPACE || process.cwd()
  try {
    return fs.realpathSync(root)
  } catch {
    return root
  }
}

function main() {
  const summaryPath = process.env.SUMMARY_PATH || process.argv[2]
  const breakdownPath = process.env.BREAKDOWN_PATH || process.argv[3]

  if (!summaryPath || !breakdownPath) {
    process.stderr.write('usage: SUMMARY_PATH=<coverage-summary.json> BREAKDOWN_PATH=<file> node src/convert-summary.js\n')
    process.exit(2)
  }

  let breakdown
  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
    breakdown = summaryToBreakdown(summary, realWorkspace())
  } catch (err) {
    warning(`Cannot read the coverage summary ${summaryPath}: ${err.message}`)
    return
  }

  fs.writeFileSync(breakdownPath, breakdown)
  notice(`Breakdown file written: ${breakdown.split('\n').length - 1} files from ${summaryPath}.`)
}

if (require.main === module) main()

module.exports = { summaryToBreakdown }
