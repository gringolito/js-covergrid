# The test tool owns the gate

The action publishes the Grid Map and the numbers. It gives no coverage verdict and never fails the job
because of coverage. The comment shows numbers only, and the action has no threshold input.

Thresholds belong in the test tool's own config, for example `coverage.thresholds` in `vitest.config`.
The tool already knows its include and exclude rules, runs where the tests run, and fails the test step
with its own message. A second gate in the action would have to be configured to agree with it.

## Considered Options

- **Embed a gate in the action.** There is no JavaScript gate that every tool shares, so the action would
  grow its own threshold config and its own failure path, duplicating `coverage.thresholds`.
- **A total-only threshold input.** It is small, but it makes the action a second source of truth
  for pass or fail, and the two can disagree.

## Consequences

**The action must run after a failing test step.** A test run that fails its thresholds or its tests
stops the job before later steps run. Users must run the action with `if: always()` and set
`reportOnFailure: true` (Vitest) so the summary is still written. Without both, a failing test run gets
no comment, which is when the comment is most useful. If the summary is missing, the comment says so and
names the file.

**The comment shows no pass or fail.** It shows the numbers and the change since the Baseline. The reader
looks at the test step for the verdict.

**The `diffStats` rule.** The impacted tables list entries whose uncovered Statement count moved since the
Baseline, or that are new. Entries that are 100% covered now are left out, even if they had uncovered
Statements before, and new fully covered files are left out. The tables point at what still needs work,
and the total line still shows the gain. This rule lives here and not in
[ADR-0004](./0004-package-is-the-directory.md) because it follows from what the comment is for when the
action doesn't judge: it directs attention, and ADR-0004 only decides how files are grouped.
