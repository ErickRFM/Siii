# Student claim authority implementation plan

> **For agentic workers:** use superpowers:executing-plans inline. The first PLAN + RED pass is preserved below. Implementation is now authorized on the private reviewed helper composition; publication waits for its integration in main.

**Goal:** Allow active institutional members to request their own student link, and auto-link only with authenticated mailbox ownership matching current identity and institutional record.

**Architecture:** Reuse authorizeCapability('institutions.read') and the forthcoming domainTransaction capability option with initial/final authority checks. Lock the actor contact and tenant student in the same transaction; match canonical current people.email, accountEmailVerifications.verifiedEmail and student.institutionalEmail. Persist either link or pending claim plus audit atomically. No second helper or permissions hierarchy.

**Tech Stack:** Next.js, TypeScript, Drizzle, PostgreSQL17, Vitest real HTTP.

**Spec:** Parent's bounded SEC06 claim design and review, 2026-10-22; AGENTS.md and MASTER_PROMPT.md.

## Global constraints

- Worktree student-claim-authority, base main8b2bd2c6, branch fix/student-claim-authority-20261022.
- New synthetic localhost55439/siii_claim_test only; existing migrations0000-0024, no migration source edits. HTTP3203; never3107/3201/3202.
- Initial pass was plan/RED only. Parent now authorizes claim implementation and a local commit after verification; still no push or PR.
- Consume the reviewed domainTransaction({capability:'institutions.read'}) from private composition935f2220; do not edit the helper or Admissions handlers, and wait for its main integration before publication.
- Preserve401 UNAUTHORIZED,400 INVALID_INPUT,404 STUDENT_NOT_FOUND,409 ALREADY_LINKED,500 CLAIM_FAILED and both201 data shapes. New authority/origin denials403 are intentional.
- Any absent/mismatched mailbox proof yields pending201, never an automatic link. No new academic status requirement.
- accountEmailVerifications is global historical proof from invitation acceptance; it need not originate in the destination tenant or remain within invitation expiry.
- student-links/me remains a separate follow-up; do not widen this increment.

## Review focus

- Textual email, another user's proof, stale current contact and null email cannot grant auto-link.
- Suspension, tenant state, mandatory password and privileged MFA must gate both branches.
- Student and membership active-link uniqueness must give409 under concurrency, not leak500.
- Grant revocation and session expiry after lock waits/audit must roll back all newly inserted data and audit.
- Each success audit must identify actor/tenant/resource and exactly match response x-request-id.

### Task1: Plan and RED regression (this pass)

**Files:** Create tests/integration/student-claim-authority-http.test.ts and this plan. Existing claim route is the unmodified system under test.

**Interfaces:** POST institutions/:id/student-links/claim accepts {enrollmentNumber}; success data is {link,autoApproved:true,message} or {claim,autoApproved:false,message}. Proposed audit actions student.link.auto_approved / student.claim.requested; targets student_account_link:<id> / student_claim:<id>; after includes studentId/membershipId for links, enrollmentNumber/verificationStatus for pending requests.

- [x] Install dependencies and migrate only new isolated DB.
- [x] Build real invitation acceptance fixture for proof positives: HTTP issuer create -> encrypted synthetic mail -> HTTP consent/new account -> HTTP login. Other identity/session fixtures use legal DB rows, without inserting a forged proof flag.
- [x] Add HTTP cases for scope/state/MFA, pending fallbacks, legitimate own/foreign invitation proof, uniqueness/concurrency, exact audit correlation and rollback/races.
- [x] Execute against unchanged claim handler; record actual assertion failures and passing controls, correcting fixture/harness errors without changing product or relaxing expectations.
- [x] Report RED evidence and leave uncommitted worktree for shared-helper integration.

### Task2: Minimal implementation (authorized private helper composition)

**Files:** Modify src/app/api/v1/institutions/[institutionId]/student-links/claim/route.ts only for production; update operation matrix/evidence after verification.

- [x] Consume the reviewed shared domainTransaction capability option from private composition935f2220; main integration remains a publication gate.
- [x] Apply same-origin guard, getIdentity401 and authorizeCapability403 before student existence lookup.
- [x] Inside domainTransaction capability institutions.read, lock actor contact/proof and student by tenant; check active link by both member and student; return409 without a write on conflict.
- [x] Select the link versus pending branch using trusted canonical triple-email proof; write minimal audit in same transaction. Do not catch final authority denial inside TX.
- [x] Execute29HTTP GREEN; run lint,826unitarias, build and types after build.
- [ ] Parent arranges fresh independent review; integrate shared-helper prerequisite in main, reconcile and run CI before publication/integration.

## Consumer and evidence limits

No in-tree frontend consumer of claim was found on8b2bd2c6. student-links/me reads the link and keeps membershipId/studentRecord contract; its own state checks are outside this increment. Existing lifecycle tests do not exercise claim, and the current unit test only duplicates input validation. Real HTTP fixtures are required; a green lifecycle title is not claim evidence.

## RED execution ledger — 2026-10-22

- Base under test8b2bd2c6, original claim handler untouched. git diff -- src db is empty; only this plan and the new HTTP file are untracked. No commit/push/PR.
- npm ci:375 packages, audit0; npm rebuild argon2 esbuild exit0. npm run lint and npm run typecheck exit0.
- PostgreSQL17.11 on127.0.0.1:55439: a new siii_claim_test was created (refuses reuse if already present); existing migrations0000-0024 applied successfully,25journal entries. API role preparation found the existing safe anon/authenticated roles and created none. No migration source changed; postgres was used only to inspect the local version/database name and create this database. No other application database was queried/migrated/stopped.
- Port3203 verified free before run. Existing harness instance handshake and startup admission readiness remained unchanged; its exact child exited through normal teardown. No use of3107/3201/3202, no external mail/network transport.
- Command: SIII_DATABASE_ENV=test, DATABASE_URL/INTEGRATION_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/siii_claim_test, SIII_TEST_PORT=3203; npm run test:integration -- tests/integration/student-claim-authority-http.test.ts.
- Observed RED:21failed /8passed /29 total; exit1; tests25.66s, full run47.75s. Failures are assertions against the original behavior, not fixture or startup errors.
- Authority and origin negatives returned201 instead of403. Matching textual email without proof, or proof belonging to another user, incorrectly auto-linked. Audit rows were absent; audit failure/expiry/revocation cases still returned201. The late-audit lock test never reached its gate because the old route has no audit. Existing active-member link and same-actor/two-students race returned500 instead of409. Malformed JSON returned500 instead of400.
- Passing controls include absent/foreign student404, legitimate real invitation proof from own/foreign tenant, stale/null current-email pending, existing-student409 and the observed two-actor concurrency ordering. Passing controls do not establish correctness of the unchanged handler.
- All positive proof fixtures created an actual invitation over HTTP, decrypted only its synthetic outbox mail, accepted consent with a new student account over HTTP and logged in normally. No direct INSERT to account_email_verifications or invented verified flag.
- Do not implement next step before the shared capability option is integrated. student-links/me is still a documented separate follow-up. Full unit/build/CI are intentionally not run as approval gates for a source-unchanged RED-only pass; the targeted test is intentionally failing.
## Implementation ruling — 2026-10-22

The parent explicitly authorized implementation after ff-only reconciliation to locally reviewed935f2220. This is not main integration and does not permit publication. The helper is consumed unchanged with capability institutions.read; no second helper or F2 ownership is introduced. The parent will arrange fresh independent review after implementation and verification.

## GREEN implementation ledger — 2026-10-22

- Production delta against935f2220: only student-links/claim route; shared helper and both Admissions handlers untouched. No schema/migration/F2 edits.
- Ruling: parent explicitly permits local commit after green, superseding the RED-only no-commit constraint. This remains a private composition and does not authorize push/PR/merge; independent reviewer is arranged by the parent.
- Implemented same-origin, getIdentity401/authorizeCapability403, shared domainTransaction capability institutions.read, current-contact/proof/student locks, canonical triple-email proof, two active-link conflict checks, atomic success/audit and typed denial/conflict handling outside TX.
- First GREEN attempt: server startup timeout, no cases; log empty/port3203free. Investigated; repeated unchanged harness/limits/assertions. No asserted root cause or claimed pass for failed startup.
- Final HTTP29/29 exit0,96.32s; tests88.61s. All RED failures resolved by production changes; test expectations unchanged except EOF whitespace.
- Lint exit0; unit826/826 in56files exit0; production build exit0 (38.3s compilation,31/31 generated pages); typecheck after build exit0. No dev/build overlap. Existing Next ESLint plugin warning retained.
- Report: docs/audits/SIII_STUDENT_CLAIM_AUTHORITY_2026-10-22.md; operation matrix and engineering audit updated by append. claim/me and complete module/security/lifecycle remain outside scope.
