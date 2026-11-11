# The Coverage Summary is the only input

The action reads one Istanbul `json-summary` file, `coverage-summary.json`. `src/convert-summary.js`
turns it into the **Breakdown File**: one line per source file, `path;totalStatements;coveredStatements`.
Everything downstream stays on the Breakdown File: the Grid Map, the total, the diff summary, the impacted
tables, and the baseline artifact. Every number comes from that one file.

The converter skips the `total` key. It makes paths relative to `GITHUB_WORKSPACE` and replaces every `\`
with `/`. A missing or unparsable summary warns and writes nothing.

## Why json-summary

- **Every common tool writes it.** Vitest, Jest, nyc and c8 all produce it, so the action asks for no
  particular test runner.
- **It has statements.** The unit the Grid Map was designed around, see [ADR-0005](./0005-grid-map-geometry.md),
  is present per file, as `total` and `covered`.
- **It is small and flat.** One entry per file, with no per-statement maps to parse.

## Considered Options

- **LCOV.** It is the most portable format, but it counts lines and branches, not statements. Supporting
  it would need a second unit in the domain model. See [ADR-0002](./0002-lcov-out-of-scope.md).
- **Per-tool raw formats, such as Istanbul's `coverage-final.json`.** It has statement maps, so the counts
  could be derived. Each tool needs its own parser, and the result is the numbers `json-summary` already
  gives us.
- **V8 raw coverage.** It is byte ranges per function, not statements. Turning it into statements is what
  the coverage tools do, and a second implementation here would disagree with theirs.

## Consequences

**Statement counts differ between tools and providers.** Istanbul instruments the source, and Vitest's `v8`
provider derives statements from V8 ranges. The same code gets different totals. Numbers compare within one
repository on one provider. If a repository switches provider, its next comparison against the Baseline is
unreliable. The action doesn't detect this.

**Paths need normalisation.** Coverage tools report absolute, real paths, and on Windows runners they use
`\`. The converter resolves `GITHUB_WORKSPACE` to its real path before making paths relative, so symlinked
workspaces don't leave absolute paths in the Breakdown File. The `\` replacement keeps Baselines from
Windows and Linux runners in the same form.

**The summary must exist.** A failing test run writes no summary unless the tool is told to. See
[ADR-0003](./0003-the-test-tool-owns-the-gate.md).
