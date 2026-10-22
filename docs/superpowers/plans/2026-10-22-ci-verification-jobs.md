# CI verification jobs Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this single bounded workflow change. Parent supplied the design, isolation and native execution authorization; finish with independent review.

**Goal:** Give verification and complete browser flows separate25-minute budgets without removing any existing gate.

**Architecture:** Retain the current workflow triggers, permissions and concurrency. Split its existing verify job into independent verify and ui jobs, each with its own runner, PostgreSQL service, Node install and database preparation. Pin both to ubuntu-24.04, the image observed in the current log; no cache/container workaround or business infrastructure is introduced.

**Tech Stack:** GitHub Actions (existing pinned action SHAs), Node22, PostgreSQL17, Playwright Chromium with --with-deps.

**Spec:** Parent task: fix/ci-verification-jobs-20261022 from mainf34c76fe10f04d9d4bada2a5419c6c82eb5acdc4. Existing workflow is the baseline contract; exact matrix below.

## Global constraints

- Required independent jobs verify and ui, timeout-minutes25 each, runs-on ubuntu-24.04. The preservation checker accepts additional independent jobs (future receiver probe), without constraining their contents.
- Preserve every existing run command, action SHA, env value, service health setting, artifact path and artifact failure policy.
- No retries, timeout increases, skipped tests, omission of --with-deps or production/auth/backend/SQL/container-guard edits.
- Failure diagnostics only in ui; matrix screenshot artifact retains if-no-files-found:error, always(), hidden files and3days.
- Local only; no push, PR, GitHub merge, DB/ports or remote CI dispatch. Runtime improvement remains pending real CI.

## Command conservation matrix (written before workflow edits)

| Existing step, unchanged command/action | verify | ui | Ordering/contract |
|---|---|---|---|
| checkout@d23441a48e516b6c34aea4fa41551a30e30af803 | retained | duplicated | first |
| setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38, Node22/cache npm | retained | duplicated | second |
| npm ci --ignore-scripts | retained | duplicated | before rebuild |
| npm rebuild argon2 esbuild | retained | duplicated | same two packages |
| git diff --exit-code -- package-lock.json | retained | duplicated | after installation |
| npm run lint | retained | — | original order |
| npm run typecheck | retained | — | original order |
| npm test | retained | — | ALL unit tests |
| node --import tsx scripts/prepare-test-api-roles.ts | retained | duplicated | before migration in both disposable DBs |
| npm run db:migrate | retained | duplicated | same schema/roles; no new SQL |
| npm run test:integration | retained | — | ALL integration tests |
| npx playwright install --with-deps chromium | — | moved | before ALL UI |
| npm run test:ui | — | moved | original harness builds production bundle and closes exact server |
| synthetic-ui-failure-diagnostics upload@ea165f8d65b6e75b540449e92b4886f43607fa02 | — | moved | failure(), same path, missing ignore,hidden true,3days |
| synthetic-ux-matrix upload@sameSHA | — | moved | always(), both original glob paths, missing ERROR,hidden true,3days |
| npm run build | retained | — | after integration, original standalone build gate |
| npm audit | retained | — | final verification gate |

Both jobs inherit identical current env: DATABASE_URL and INTEGRATION_DATABASE_URL loopback5432/university_sis_test, SIII_DATABASE_ENV=test, NODE_ENV=test, NEXT_TELEMETRY_DISABLED='1'. Each owns postgres:17/userpostgres/passwordpostgres/databaseuniversity_sis_test, mapping5432, pg_isready health interval5s/timeout5s/retries10. Parallel jobs use distinct hosted machines; no DB is shared. ui-setup.ts still builds its own production bundle, so it does not depend on verify's workspace.

### Reserved consumer: SEC-04 financial-legacy (NOT added here)

acc89 in financial-tenant-constraints adds npm run test:financial-legacy, absent from this main package. Reconcile it into the ui job immediately AFTER npm run test:ui, BEFORE the upload steps, with step env SIII_HTTP_TEST_PRODUCTION='1'. It depends on the production bundle produced by the UI harness and exact shutdown of that harness server. Do not put it in verify or run it in parallel with UI; do not add the nonexistent command/package script in this branch.

## Review focus

- Omitted/relaxed gate: parsed contract compares complete original step objects and exact expected per-job sequence.
- Missing isolated DB/env/roles/migration: compare complete original services/env and preparation order in both jobs.
- Cross-job workspace assumption: ui retains original harness production build; no needs, outputs or artifacts transferred between jobs.
- Artifacts silently absent: preserve matrix error policy and confine both UI artifacts to ui; reject artifact mutation.
- Future financial step misplacement: document reservation after UI with production env; no premature package/SQL change.

## Single task: separate CI budgets and preserve the complete workflow contract

Files: modify .github/workflows/verify.yml; create docs/audits/SIII_CI_VERIFICATION_JOBS_2026-10-22.md; append docs/audits/SIII_ENGINEERING_AUDIT_2026-10-21.md; this plan. Ignored checker/evidence under .p0-local.

- [x] Parse original workflow from gitshowf34 with js-yaml (already installed transitively); implement ignored semantic contract checker against two required job layouts. RED on original one-job workflow.
- [x] Split only job layout, duplicate setup/services/env, pin current Ubuntu24.04 image, move original UI/artifacts intact and document reserved consumer.
- [x] GREEN: YAML parse and exact semantic preservation against baseline; negative mutations must reject missing gate, altered env/service/action/deadline, serial dependency, removed --with-deps, relaxed screenshot policy or misplaced artifacts.
- [x] Inspect source-log timings and add audit/report with before measurements and explicit after-CI pending; preserve historical audit prefix.
- [x] Run relevant structural contract and diffcheck; no local heavy application suites because product/tests/dependencies are unchanged. Record Node24local versus Node22CI.
- [x] Obtain independent review of workflow+docs+checker/evidence. Conventional local commit only, report SHA/gates/limitations to parent.
