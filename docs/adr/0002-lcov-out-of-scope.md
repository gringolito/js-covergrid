# LCOV is out of scope

The action doesn't read LCOV. Node's test runner, Bun and Deno write only LCOV, so their users can't use
the action as it is.

## Why

LCOV records lines (`DA:`) and branches. It has no statements. The domain model is built on one unit, the
**Statement**: a Tile's area, its colour and every total are Statements. Accepting LCOV would add a second
unit, Lines, and each part of the comment would need to say which one it shows. Numbers from the two units
can't be compared or mixed in one Baseline.

## Considered Options

- **Treat lines as statements.** One executable line is not one statement, and a Baseline recorded from
  LCOV would not compare with one from `json-summary`. The label would be wrong, and the reader couldn't
  tell.
- **Support both units.** It is the honest way to read LCOV, and it doubles the domain model: every
  number in the comment would need a unit, and a Baseline would need to record which one it holds.

## Consequences

Users of tools that only write LCOV can't use the action. Revisiting this means adding Lines as a unit in
[CONTEXT.md](../../CONTEXT.md) first. See [ADR-0001](./0001-coverage-summary-is-the-only-input.md) for the
accepted input.
