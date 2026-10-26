# SIII UI/UX VNext Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Execute the complete delivery requested by the user without individual approval gates.

**Goal:** Modernize the existing institutional interface with coherent responsive workspaces and real academic actions.

**Architecture:** Retain Next.js, Radix/shadcn primitives, canonical HSL colors, existing API handlers and capability provider. Shared drawers and searchable native choices consolidate forms. Academic tabs and weekly calendar prioritize the working data.

**Tech Stack:** Next.js 15, React 19, TypeScript, CSS/container queries, Playwright/axe, Vitest, PostgreSQL 17.

**Spec:** The user request “SIII — Implementación integral de modernización UI/UX VNext” and repository AGENTS.md.

## Global Constraints
- Base: remote main `1699415748b71fad8f11a8754096e2ccc52d6b69`, verified 2026-10-25.
- No production data, secrets, migrations or API authorization changes. Database/schema/API phases are compatibility verification only.
- Keep existing capability navigation and audited POST/PATCH contracts; no unsupported editing actions.
- Preserve institutional matte burgundy colors, light/dark themes and reduced motion.
- Validate widths 390, 768, 1024, 1366, 1600 and 1920, plus 200% zoom equivalent and keyboard.
- Reconcile open login PR #108 explicitly; #101 and #110 are independent Companion work. Historical #40/#48/#49 are not open in the current listing.

## Design decisions
- Evolve existing primitives; replacing the stack would duplicate working authentication and permission flows.
- Use full-width academic tables with Secciones/Inscripciones/Asignaciones tabs, real fetched counts, local filters over the complete cursor collection, contextual creation and state-change drawers.
- Preserve native selects with a labeled search input and retained selection; no custom keyboard combobox protocol.
- Prioritize a seven-day weekly calendar, with a chronological mobile agenda; recurring patterns remain inspectable. Room and class creation use drawers.
- A server-read sidebar preference cookie replaces post-hydration localStorage layout changes. Cookie is presentation only.
- Fluid workspace widths and common control/panel tokens apply across existing modules. Keep CSS with uncertain/dynamic consumers; consolidate only selectors whose consumers are verified.

## Review Focus
- Failed writes preserve values and display validation inside the modal.
- Permission loss clears institutional collections and disables actions.
- Drawer Escape, focus restoration, scroll and confirmation remain usable at mobile/zoom.
- Counts reflect fetched records, filtered counts are explicitly labeled.
- Date changes never show occurrences from a previous week as current.

## Tasks
- [x] 1. Baseline: run unit tests and synthetic authenticated screenshots before edits; retain logs under `.p0-local/vnext-*`.
- [x] 2. Shared foundations: `ui/sii-workspace.tsx`, `sii-workspaces.css`, canonical tokens; searchable fields/drawer focus and validation tests.
- [x] 3. Academic operations: replace stacked forms with tabbed tables and contextual drawers; verify actual POST/PATCH payloads, conflict/validation failure, filters and counts.
- [x] 4. Scheduler: weekly calendar/agenda first, creation drawers and patterns tab; preserve conflict/cancellation API and tests.
- [x] 5. Platform: server sidebar cookie, shared sizing across administration/security/admissions/grades/services, contextual services creation, reconcile #108.
- [x] 6. Local verification: lint, types, unit/integration/build, UI/axe/viewport evidence; independent whole-branch review and findings corrected. Publication and final-SHA CI are recorded in the PR and closing report, without creating a later documentation-only SHA.

## Ledger
- Baseline unit: 65 files, 907 tests pass after retry outside sandbox temp-file restrictions.
- Local DB: dedicated disposable cluster `.p0-local/vnext-pg`, loopback 55441, database `siii_vnext_test`. No production connection used.
- Initial sandbox run could not import Vitest modules (EPERM on temporary cache rename); not a product test failure.

- Local final gates: 911 unit tests; 605 integration passes/35 flag skips; 151 distinct UI flows across full and targeted runs; production build; financial legacy 1/1; audit 0.
- Independent review: final pass without concrete unresolved findings. Manual screen-reader/device testing remains explicitly unverified.
