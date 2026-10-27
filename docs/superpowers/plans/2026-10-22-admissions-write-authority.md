# Admissions write authority implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline with TDD.

**Goal:** Authorize and audit cycle creation and admission decisions in the existing transaction boundary.
**Architecture:** Extend `domainTransaction` with an optional typed capability. Reuse current institutional context, MFA policy and initial/final checks; preserve legacy permissions and grading behavior. Both handlers retain their response contracts and decision history remains append-only with serialized status updates.
**Tech Stack:** Next.js, TypeScript, Drizzle, PostgreSQL, Vitest.
**Spec:** SEC-03/SEC-06 in `docs/audits/SIII_ENGINEERING_AUDIT_2026-10-21.md` and the authorized task scope.

## Constraints and review focus

- No changes to F2/shared auth, schema/migrations, student claims, UI or email.
- Base `main@8b2bd2c6`; synthetic database `siii_admissions_write_test` on localhost:55439 and exclusive HTTP port3202.
- Preserve201 data,401,403,400 malformed JSON,404 resource and operation-specific500 errors.
- Check missing MFA, scoped/foreign authority, expiry/revocation before and after locks, audit rollback and concurrent decision history.

## Task 1: writers and regressions

- [x] Create HTTP negative tests before production changes; build and run on the exclusive test server to observe RED.
- [x] Extend `src/modules/consolidation/domain-boundary.ts` with a capability option, central `can` on current context and exported `DomainAccessDenied`; preserve legacy/grade branches. Review correction limits capabilities to admissions.manage/institutions.read with exclusive modes and runtime rejection.
- [x] Update cycles POST and decision POST to enforce origin, `authorizeCapability('admissions.manage')`, domain transaction and audit. Lock the tenant-scoped application inside the decision transaction. Rethrow only typed access denial to the outer403 mapper; preserve operation500 contracts.
- [x] Rebuild and run the HTTP regressions until GREEN, including concurrent decisions with two before/after audits.
- [x] Verify lint, types, complete units, build and focused HTTP; update operation matrix, append PARCIAL status to MASTER_PROMPT and write a dedicated evidence report.
- [x] Obtain review and consolidate the authorized local conventional commit; no push, PR, merge or production action. Independent final review approved after the capability-mode correction and repeated gates.
