# R0 — Supabase/Drizzle migration safety gate

## Current verified context
Siii Supabase project has previously applied migration entries for foundation identity, public-role privileges and F3 academic catalogs. Git main Drizzle journal tracks foundation and F3, but its own migration ledger is **not yet reconciled** with Supabase's history. Never assume npm run db:migrate may be safely run against this existing Supabase project.

## Read-only audit
```bash
DATABASE_URL="<secure server-side connection string>" npm run db:preflight
```
The script does **not write to any table**. It reports:
- missing foundation/F3 tables;
- migration tags in Git;
- presence of Supabase and Drizzle migration ledgers;
- forbidden direct grants to `anon`/`authenticated`/`PUBLIC`;
- ledger drift that requires an isolated reconciled baseline.

Exit code 2 is a *stop signal* for missing tables, unexpected direct grants or mixed migration ledgers. Never suppress it with `|| true` when promoting to production.

## Required staging promotion procedure
1. Capture a reviewed production schema-only export (no personal data), and a verified recoverable backup.
2. Initialize staging with the same migration history; reconcile Drizzle metadata using a recorded, reviewed non-destructive process.
3. Run baseline audit and inspect the output.
4. Apply each add-only migration from PR #9 onward through the approved migration tool, not `db:push`.
5. Run tests against a clean PostgreSQL environment and staging with migrations, plus authenticated E2E, concurrency tests and grants review.
6. Review security and performance advisors. Confirm the application role has correct privileges while Supabase Data API roles stay blocked.
7. Promote production via an authorized migration window and a rollback plan; verify after deployment.

**Do not create test students in production.** The SQL and migration operator must have the minimum privileges required.
