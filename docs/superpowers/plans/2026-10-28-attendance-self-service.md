# Attendance self service implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline. The user authorized execution without routine confirmations.

**Goal:** Let students read only their own current attendance through the existing Companion contract.

**Architecture:** A static `companion-attendance/mine` route resolves the account link under the existing institutional transaction lock, checks `student.self.read` against the linked program and owner, and reuses attendanceSubject, attendanceRecordsMatch and readCompanionAttendance. Two short transactions surround remote I/O. A dedicated student page links from academic consultation and retires results on identity/session/authority changes.

**Tech Stack:** Next.js, Drizzle, PostgreSQL, React, Vitest, Playwright.

**Spec:** User request AUDITORÍA FINAL Y ACTIVACIÓN, items 8–12; existing COMPANION_ATTENDANCE_HISTORY.md contracts.

## Global constraints

- No new student selector, administrative permission, schema or migration.
- No secrets, PII or attendance rows in logs; no-store responses and count-only audit.
- Revalidate active tenant, account, session, scoped grant, link, student, enrollment, section version and occurrences after remote I/O.
- Missing configuration is 503, never an empty history. Review pending never means verified presence.
- Merge only new reviewed changes after CI; production and physical verification require independent evidence.

## Review focus

- Account relink or session revocation during remote I/O must discard history.
- Program scoped student cannot read a linked record in another program.
- No client chosen student, institution override or destination.
- Missing provider and provider errors cannot look like no attendance.
- Late browser responses cannot paint a previous login's data.

### Task 1: Authorized self service API

Files: new integrations/companion/personal-attendance.ts, companion-attendance/mine/route.ts, unit and HTTP tests.

- [ ] Write route and transaction regressions; run RED.
- [ ] Implement trusted link resolution and two-phase authorization; run GREEN.
- [ ] Add HTTP role, tenant, link, scope and source revocation checks.

### Task 2: Personal consultation

Files: new components/personal-attendance.tsx and student/attendance/page.tsx; link in personal-portal.tsx; UI test.

- [ ] Add UI scenario for unavailable configuration and personal navigation.
- [ ] Implement bounded history, translated decisions and explicit loading/empty/unavailable states with session discriminator and cancellation.
- [ ] Run typecheck, lint, unit, HTTP, build, audit and focused browser checks.

### Task 3: Certification

- [ ] Update operation matrix and operational evidence.
- [ ] Independent review, commit, PR, CI, merge and main CI when all required checks pass.

Pre-flight: Task 2 consumes Task 1's data contract and opaque session discriminator; use the existing history type and one shared discriminator function. No shared interfaces with credential provisioning.

Ruling: reuse the existing isolated worktree at build/siii-v20-reader; no new worktree or duplicate integration. User explicitly requested no trivial confirmations, so execute this bounded plan directly.
