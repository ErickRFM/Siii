# SIII P0 — Institutional runtime table hardening

## Failure and repair

After migrations 0019–0022, eleven new tables retained the migration connection's ownership and lacked a permissive `siii_app` policy. RLS was enabled and forced. The applicant HTTP registration consequently returned 500 (the expected 201), and the synthetic institutional replay correctly rejected mixed table ownership. Its later date rehearsal was blocked by the same required-hardening guard.

Migration `0023_new_modules_runtime_hardening` changes **no data, constraints or old migration hashes**. It processes only the eleven allowlisted tables: ensures FORCE RLS; revokes public/anonymous/authenticated table access and unsafe backend grants; grants server-only SELECT/INSERT/UPDATE; creates the backend RLS policy and explicit restrictive API-role deny policies; transfers ownership to `siii_migrator`. This mirrors the earlier audited academic security migration 0015.

The role `siii_app` is a server-only database principal; authorization, MFA and tenant-scoped filtering remain enforced in the application handlers. No production migrations were executed by this change.

## Acceptance criteria

- Existing HTTP registration, verification and login integration tests return 201/200 and enforce one-time verification.
- Institutional replay verifies every public table is RLS-enabled and owned by siii_migrator, preserves historical migrations and can perform its local-only date rehearsal.
- Backend-only security integration test verifies FORCE RLS and Data API table-denial across all eleven tables.
- Full GitHub verification passes: lint, typecheck, unit, PostgreSQL integration, Chromium keyboard/a11y flows, production build, dependency audit.
- Manually verify SIII roles (student, teacher, coordinator, admin), viewport 360/390/768/1024/1440, both themes, form drafts, dialog focus, navigation and persisted permissions. Do not confuse CI with real-account manual coverage.
