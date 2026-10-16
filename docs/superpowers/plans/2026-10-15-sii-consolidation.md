# SII Consolidation Implementation Plan

> Execute inline with superpowers:executing-plans.

**Goal:** integrate existing academic and security stacks into a reviewable draft PR, validate real PostgreSQL and browser flows, then promote only when all release gates pass.

**Architecture:** Preserve main and both PR histories. Security migrations 0000–0010 retain their exact hashes; unmerged academic migrations become 0011–0014. New academic tables receive explicit runtime grants and forced RLS before use. Reuse central authorization and institutional navigation.

**Tech Stack:** Next.js, TypeScript, Drizzle, PostgreSQL17, Vitest, Playwright.

**Spec:** User consolidation request of 2026-10-15; docs/agent/MASTER_PROMPT.md.

## Global Constraints
- Never mutate production or use production credentials in Preview.
- No force push, no modification of another chat's checkout.
- Main merge requires exact-head CI, review, migration/reversal and release gates.

## Review Focus
- Expired/revoked memberships and missing MFA must deny domain writes.
- Teacher grades require actual assignment and fresh step-up for publication.
- Renumbering cannot change existing security ledger hashes.
- All new tables require denied API roles and usable minimal runtime.
- Calendar dates must remain date strings in tests and code.

## Tasks
- [x] Inventory current remote PRs and verify ancestry; isolate workspace.
- [x] Reconcile schema, journal and navigation conflicts; run typecheck/unit baseline.
- [x] Add real database regressions for migration/runtime isolation; fix grants/RLS and domain authorization.
- [x] Validate canonical migration twice, populated baseline, local copy/recovery, HTTP, Chromium, responsive/axe, build and audit; cloud reversal remains blocked.
- [ ] Review full integration diff, publish draft consolidation PR to main, verify exact-head CI.
- [ ] Close supported staging gates; deploy safe Preview with synthetic role accounts if credentials and verified migrator permit it.
- [ ] Merge and production promotion only with required gates; otherwise record exact remaining blockers and preserve draft.

## Execution ledger
- Initial main c7334cdfe524fe02d7c7090e0862884743008720; initial local c07d22c6, in-progress merge untouched.
- Remote requested integration branch initially equals main. New isolated codex/sii-consolidation-20261015 contains security dff8c2d9; academic fdbcef5a integration in progress.
- Ruling: execute authorized integration continuously; user explicitly requested implementation and continuation, so no extra plan approval gate.

- Review: six material inherited/integration findings accepted and covered with real HTTP/Chromium RED→GREEN regressions.
- Historical0003 managed-role experiment reproduced42501; automatic review rejected changing its hash. Original bytes restored exactly; proposal archived, not applied. User explicitly chose to preserve SQL and deliver the draft PR.
- Unit708, initial integration279 and focused domain13/13, focused Chromium3/3 confirmed. Full integration285/285; canonical LF focused41/41; production Chromium43/43; build, audit0 and local recovery41 tables/16 ledger passed.

- Draft PR26 published, initial HEAD38b9d046; Preview READY and login document HTTP200. First CI lacked Supabase API-role fixtures in its bare PostgreSQL service. Added isolated non-login role preparation; no SQL migration changed. Exact-head CI verification pending.
