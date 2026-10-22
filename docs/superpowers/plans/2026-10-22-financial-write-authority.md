# Financial write authority implementation plan

> **For agentic workers:** use superpowers:executing-plans inline for this bounded task.

**Goal:** Enforce existing financial write authority, tenant references and transactional audit in the fee type and payment order HTTP routes.

**Architecture:** Preserve current success projections and institutional administrator permission. Reuse authorizeCapability and lockWriteCapability with initial/final checks in a financial transaction wrapper. Validate references under transaction locks and make GET joins tenant-safe.

**Tech Stack:** Next.js, Drizzle, PostgreSQL17, Vitest HTTP integration.

**Spec:** Parent task SEC03/06 and SEC04 API increment, 2026-10-22; AGENTS.md and docs/agent/MASTER_PROMPT.md.

## Global constraints

- Base main2be56cd1; branch fix/financial-write-authority-20261022; this worktree only.
- No F2/shared/auth, Admissions, schema or migration edits. PR80 owns0024; DB constraints await0025.
- Isolated new localhost55439/siii_financial_test only; SIII_DATABASE_ENV=test; HTTP3201.
- Preserve401/403/400 distinctions and success {data} payloads. Origin403, invalid references400 INVALID_INPUT. No new academic eligibility requirements.
- No push, PR, merge or production writes. API-only progress does not close SEC04 or global SEC03/06.

## Review focus

- Missing/unverified MFA must deny administrator writes despite valid password sessions.
- A foreign or nonexistent student, concept or payer membership must not create an order or leak names.
- Revocation while waiting for the institutional mutex must deny both write routes.
- Expiry during audit must roll back data and audit using the final authorization check.
- Audit failure must roll back a successful-looking financial mutation.

### Task1: HTTP regression and implementation

Files: two src/app/api/v1/institutions/[institutionId]/financials routes; src/modules/financials/write-transaction.ts; tests/integration/financial-write-authority-http.test.ts.

- [x] Write real PostgreSQL/HTTP fixtures and tests before production edits. Assert MFA/origin denial, same-tenant success, cross-tenant references, compound GET joins, transactional audit, rollback and concurrent revocation/expiry.
- [x] Run the target HTTP file on3201 against the new isolated database; record failures against baseline.
- [x] Implement same-origin guard; getIdentity401 and authorizeCapability403; financialTransaction with initial/final lockWriteCapability institutions.manage checks; reference validation; safe joins; minimal audit.
- [x] Run target HTTP file again; all assertions pass and failures leave no writes.

### Task2: Verification and evidence

- [x] Sequential lint, typecheck, unit suite, build and target HTTP regression; no dev/build overlap.
- [x] Inspect diff/scope and document actual RED/GREEN evidence and incomplete DB constraints in docs/audits/SIII_FINANCIAL_WRITE_AUTHORITY_2026-10-22.md.
- [x] Request parent review of final diff and prepare a conventional local commit after verification. Independent review remains a gate before integration.

## Execution ledger

- Initial inspection: clean2be56cd1; branch created. domainTransaction already performs initial and final current-session/MFA/grant checks; no F2 change needed.
- RED: initial17 cases16failed/1passed; MFA/origin/revocation/expiry returned201, audit absent and rollback returned201, GET exposed ForeignPrivate/PRIVATE-FOREIGN.
- RED references split individually: foreign student/user201 versus expected400; missing student/fee/user and foreign fee500 versus expected400. Six reference cases all reproduced.
- Ruling: payer user membership verifies tenancy only, without active/academic eligibility requirements; graduated student success remains supported. Origin uses standard assertSameOrigin403, as parent confirmed.
- Ruling: typecheck exposed that domainTransaction accepts the legacy Permission union, which excludes institutions.manage. Use a financial-local transaction wrapper around the existing lockWriteCapability instead of an unsafe cast or changing F2. The exception is caught outside the transaction to preserve rollback semantics; cost if wrong is a denied write, covered by real HTTP race/expiry cases.
- Task1 complete: finalHTTP22/22, both initial and final authority checks exercised; successful MFA does not require step-up. Error500CREATE_FAILED retained.
- Task2 verification: lint/typecheck0;813unit tests; build escalated0; finalHTTP22/22. HTTP startup timeout and interrupted sandbox build recorded honestly in the report, with successful unchanged-configuration repetitions.
- Final package: seven staged files, cached diff-check0; coordinator review requested against the complete diff. No independent review verdict yet; preserve branch/worktree for that gate. No push, PR, merge or DB cleanup.
