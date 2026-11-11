# A Package is the directory, with an optional depth

A Package is everything before the last `/` of a Breakdown File path, with no rollup. `src/a` and
`src/a/b` are two unrelated Packages. The rule is easy to predict: the tile names are the folders users
see in their editor, and the flat Grid Map ([ADR-0005](./0005-grid-map-geometry.md)) draws them as they
are.

On JavaScript layouts that rule can give too many tiles. A folder per component
(`components/Button/index.tsx`) or per function turns the map into confetti. So there is an optional
`package-depth` input, default `0` (no limit, plain dirname). A positive N counts from the **deepest folder
every file shares**: the Package is that shared folder plus the next N folders, and deeper files count
towards that ancestor. Package names stay full paths.

The comment computes the shared folder from the current and Baseline files together, so both sides group
the same way. The Grid Map uses the current files only. Changing the depth doesn't break the comparison,
because Baselines store per-file lines and are grouped at read time.

## Considered Options

- **Rollup or nesting by default.** Packages would contain their children. It needs a nested layout and a
  second definition of a tile's Statements, and the Grid Map is flat (ADR-0005).
- **Count depth from the repository root.** Rejected. Shared prefixes such as `app/javascript` eat the
  levels: in mastodon, depth 2 from the root gives one tile.
- **Count depth from the nearest `package.json`.** Rejected. Mastodon has only a root `package.json`, so
  nothing would change. Vueuse has one per package, so depth 1 already gives about 280 tiles and the
  9-tile view becomes impossible. It also needs filesystem information that the render and comment steps
  don't have, since they read only the Breakdown File.

## Measured tile counts

| Repository | Depth 0 | Depth 1 | Depth 2 | Depth 3 |
| --- | --- | --- | --- | --- |
| vueuse (one folder per function) | 274 | 9 | 273 | 274 |
| mastodon frontend | 180 | 6 | 21 | 130 |

Suggest starting at 1 or 2.

## Consequences

Readers may expect nesting, and in a flat map a parent's Statements exclude its children's. The default
keeps this rule and `package-depth` is the way out for deep trees. Both the render step and the comment
step take `PACKAGE_DEPTH`, and both must be passed it, or the two groupings disagree.
