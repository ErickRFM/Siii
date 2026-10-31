# SIII: CSS cascade ownership audit (31 October 2026)

## Scope and evidence
The global style import order in `src/app/layout.tsx` includes 17 application CSS files; two component-specific stylesheets are also tracked in `scripts/css-audit-baseline.json`. Exact unused selector cleanup is in PR #154. This pass removes 40 unconditional declarations from older stylesheets when a **later unconditional rule with the exact same selector and property** already owns the final paint.

Affected families: catalog tables, table scrolling and paging, catalog form labels and tabs, page headings, module content width, filtering layout, and the empty state. The later declarations are preserved; media queries, theme/forced-colors conditions, differing selectors and permissions-specific styles are untouched.

Two unreferenced `@keyframes` definitions (`sii-kit-glow` and `sii-kit-fade`) were removed after searching CSS usage and source references.

## Single owner gate
`node scripts/css-owner-gate.mjs` uses PostCSS. For 17 selected selector families, each nominated unconditional property must appear exactly once across globally imported stylesheets. This is an *incremental* gate, not a ban on required theme or responsive variants. The existing baseline gate continues to check CSS bytes, `!important` and duplicate selectors, while screenshot and accessibility tests validate rendered behavior.

## Measured source size
- CSS before this pass: **253,244 bytes** (after PR #154).
- CSS after this pass: **251,547 bytes** (a further **1,697 bytes** removed).
- CSS `!important`: **426** (unchanged).
- Same-file duplicate selector count: **435** (previously 441).

The global stylesheet count is not yet reduced. Do not delete a CSS file based on its name alone; consolidation should follow a route- and theme-scoped screenshot comparison.

## Acceptance
Run GitHub jobs `verify`, `ui`, `Companion live contract` and Vercel Preview on the final commit before merging, and reconcile PR #153's separately tested personal mobile CSS and updated budget before publishing. No automated baseline replacement or disabled tests.
