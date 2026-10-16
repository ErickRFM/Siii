# SII production rescue implementation plan

> Execute inline with superpowers:executing-plans; user explicitly authorizes autonomous implementation, supported migrations and deployment after verified recovery.

**Goal:** Preserve existing production records and publish the consolidated application with verified database access.
**Architecture:** Exact schema adoption, encrypted application backup with tested local restoration, explicit managed PostgreSQL release profile recording actual executed hashes, minimum runtime credentials, staged production build then promotion.
**Tech Stack:** PostgreSQL17, Next.js/TypeScript, Drizzle, Supabase, Vercel, Vitest/Playwright.
**Spec:** User production rescue request attached 2026-10-15; docs/agent/MASTER_PROMPT.md, overridden only by the user's explicit production release scope.

## Constraints and review focus
- Preserve canonical SQL0000–0015 and all existing ledgers; never record a hash for SQL that was not executed or exactly adopted.
- A managed profile must be explicit, versioned, fingerprinted, tested under non-superuser permissions and rejected on ambiguous/drifting history.
- Capture actual production data only encrypted; never print passwords, hashes, tokens, backup plaintext or database URLs.
- No production schema/data changes before a recoverable backup, restore verification, staging rehearsal and exact-head CI/review.
- Keep old deployment and database connection available for rollback; do not create Supabase projects.

## Tasks
- [x] Reconcile main f7315ee9 and green CI; verify production baseline12 tables and no ledger.
- [x] Compare exact foundation signature; capture encrypted data/schema/ACL/history backup and restore to isolated local PostgreSQL, verify all records including identity hashes privately.
- [x] Implement managed release profile with provenance and strict ledger validation; test failure cases and non-superuser migration on fresh/populated databases.
- [ ] Rehearse on existing staging, verify runtime/RLS and recovery/reversal; complete QA and independent review, PR/CI/merge.
- [ ] Adopt verified production baseline and execute reviewed release, verify existing record integrity and minimum runtime privileges.
- [ ] Configure required production secrets and production branch; stage reviewed main in Vercel, smoke-test authenticated flows, promote and verify domain.
- [ ] Record actual GitHub/Supabase/Vercel/application evidence and remaining scope accurately.

Progress: staging has18 executed migrations,41 forced-RLS tables and an authorized minimum runtime. Real staging HTTP login/MFA/catalog/persistence/tenant-denial/audit passed. Build passed. Full integration is being repeated against a fresh local database and one production server after a shared .next test collision. Runtime keys stay encrypted; Vercel CLI authenticated and branch-specific Secret upload awaits branch publication.
