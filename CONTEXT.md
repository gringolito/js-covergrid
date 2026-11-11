# JavaScript Coverage Grid Map

A reusable composite GitHub Action. It reads a JavaScript coverage summary, renders it as a **Grid Map**,
and posts one pull request comment with the Grid Map, the total, and the change since the base branch.
The Grid Map shows where a repository's tests are and aren't, with each tile sized by statement count and
coloured by coverage. The action gives no verdict. The test tool owns the threshold gate, see
[ADR-0003](./docs/adr/0003-the-test-tool-owns-the-gate.md).

## Language

### Input data

**Coverage Summary**:
The Istanbul `json-summary` file, usually `coverage-summary.json`. It is the Action's only input. Vitest,
Jest, nyc and c8 all write it. See
[ADR-0001](./docs/adr/0001-coverage-summary-is-the-only-input.md).
_Avoid_: report, lcov, coverage output

**Breakdown File**:
The converter's output (`src/convert-summary.js`), written from the Coverage Summary. It has one line per
source file, in the form `path;totalStatements;coveredStatements`, with paths relative to the workspace.
Everything downstream reads it, and it is the only source of the numbers this project reports.
_Avoid_: report, summary (that is the Coverage Summary), coverage data

**Statement**:
The unit a Breakdown File counts: whatever the coverage tool counts as a statement. Counts differ between
tools and between providers (Istanbul and Vitest's `v8` provider), so numbers are comparable within one
repository on one provider. A Tile's area and its colour are both measured in Statements.
_Avoid_: line, LOC, line count, SLOC

**Baseline**:
The Breakdown File from the most recent successful run on the base branch, taken from that run's
artifacts. A repository's first run has none, so every comparison must work without it.
_Avoid_: main, base, previous, diff-base

### The picture

**Grid Map**:
The rendered picture. Each Package is one Tile, with area proportional to its Statement count and
colour set by its Coverage Band.
_Avoid_: treemap, heatmap, chart, graph, sunburst

**Tile**:
One Package's rectangle in the Grid Map. Tiles don't nest. The Grid Map is flat.
_Avoid_: cell, box, square, block

**Package**:
The directory of a Breakdown File path: everything before the last `/`. Deeper paths don't roll up into
shallower ones. `src/components` and `src/components/Button` are two separate Packages, not parent and
child, and the first one's Statements exclude the second's. The `package-depth` input (default `0`, no
limit) coarsens this: the Package is the deepest folder every file shares plus the next N folders, and
deeper files count towards that ancestor. When every file is under `app/javascript/`, depth 2 turns
`app/javascript/mastodon/features/ui/index.tsx` into `app/javascript/mastodon/features`. Names stay full
paths. The comment computes the shared folder from the current and Baseline files together, so both sides
group the same way. The Grid Map uses the current files only. See
[ADR-0004](./docs/adr/0004-package-is-the-directory.md).
_Avoid_: module, npm package (a `package.json` unit, which this is not)

**Coverage Ratio**:
A Package's covered Statements divided by its total Statements. A Tile's area is also its Statement
count, so the coloured share of the Grid Map's area is the repository's overall Coverage Ratio.
_Avoid_: coverage score, percentage (the number drawn on a Tile is a Coverage Ratio formatted as a
percentage)

**Coverage Band**:
One of five fixed Coverage Ratio ranges. It alone determines a Tile's colour. The boundaries are
conventional (50 / 70 / 85 / 95) and are not fitted to any repository's distribution. A project whose
Packages all reach the top Band renders as a solid block of green, because that is the true picture.
_Avoid_: bucket, tier, grade, level, gradient
