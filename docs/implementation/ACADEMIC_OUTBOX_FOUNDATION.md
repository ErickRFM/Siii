# Academic section snapshot outbox foundation

This increment adds source storage, a serializer and internal worker functions. It adds no academic writer, route, cron, production migration, credential or deployment. `SIII_ACADEMIC_OUTBOX_ENABLED` defaults disabled and returns before accessing either new table.

## Source transaction

`enqueueAcademicSection(tx, scope)` takes the authorized academic mutation transaction, institution/section scope, request ID and an optional actor ID for human-originated work. It grants no actor authority. Future writers must pass the human actor and propagate enqueue failures so a mutation cannot commit without its required event.

Caller precondition: authorization must already be checked and revalidated inside this transaction for the live actor, institution, permission, resource and source state, including the domain locking protocol. The helper does not authenticate a caller, authorize client-supplied scope, or recheck source lifecycle policy.

A section row lock serializes enqueue calls. An atomic upsert increments the institution/section source version within the same transaction as the immutable event and audit. Versions are positive safe JSON integers; database overflow fails and rolls the transaction back. One SQL statement reads a coherent MVCC snapshot after the caller's mutation. All joins include the tenant. Future academic writers must participate in the same transaction and locking protocol when this foundation is connected.

The payload follows `siii.academic_section_snapshot.v1`. It uses real subject/term metadata, current active assigned teachers, the complete enrollment history and persisted dated occurrences. Open sections may have an empty teacher list. Credits are integers from 0 through 30. Terms have no artificial duration maximum. There are no invented identities or truncated arrays: more than 500 teachers/enrollments, 3000 occurrences or a 1 MiB complete UTF-8 envelope fails explicitly.

Each enrollment preserves its exact `enrolled`/`withdrawn` status and includes source `studentStatus` (`active`, `inactive`, `withdrawn`, `graduated`). A native student reader must require both an active source student and an enrolled row. Teacher rosters retain the history and source status. A later source status change requires a newer event before the receiver can know about it.

The current occurrence schema stores a date and pattern minutes rather than start/end instant columns. The serializer freezes derived UTC instants using the institution timezone and PostgreSQL `AT TIME ZONE`; end minute 1440 becomes exact next-day midnight. Persisted occurrence UUIDs remain unchanged across later room/state changes. A delete event has an empty payload and retains the section identity and monotonic version.

## Privacy and delivery

The dedicated `SIII_ACADEMIC_OUTBOX_KEYS` JSON keyring and `SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID` encrypt the complete frozen body with AES-256-GCM. Keys are canonical base64 encodings of 32 random bytes. Authenticated context binds this purpose, key ID, institution, section and event. No invitation keys or contexts are reused. Retain old keys while their events remain stored. Bodies, PII and remote exception text are absent from logs and audit details.

Workers claim a bounded batch of 1–100 events with `SKIP LOCKED`, a 60-second lease and a fresh token. Transport runs after the claim transaction commits, with a 30-second abortable budget. Every completion uses event/state/token/unexpired-lease CAS. Lost leases cannot complete or resurrect another worker's work. Retries use exponential backoff and stop after eight attempts. Key/body failures use fixed safe codes. Source changes after enqueue do not alter the frozen body; every retry preserves the exact UTF-8 bytes required by receiver inbox deduplication.

A future worker entrypoint must first await `assertApplicationRole()` from `src/infrastructure/database`, following `worker/invitations.ts` and `worker/password-resets.ts`, and fail closed before calling delivery if the database login is unsafe. `deliverAcademicEvents()` is an internal function over the global database handle and does not run that role assertion itself. No production worker entrypoint is supplied or certified by this increment.

There is no built-in HTTP or signing adapter. An injected transport may report `accepted` only for an authenticated HTTP202 receipt. This means received, not target `APPLIED`. Receipt reconciliation, fresh per-attempt signing headers, academic writer integration, source revocation propagation and mobile API consumption remain separate required work before production activation.

Future source lifecycle integration must enqueue versioned delete tombstones for affected sections when an institution is disabled; it must not publish a fresh readable upsert snapshot for a disabled institution. This requirement includes transaction/audit coupling and reconciliation of previously queued/accepted events. The current foundation is not connected to these lifecycle writers and must remain disabled until that flow is implemented and exercised.

## Migration and verification

Migration0018 creates two tables with RLS enabled and forced. Public/API grants are revoked, restrictive API-deny policies are installed, and backend DML is limited to the necessary columns. The backend cannot update event identity, tenant, section, version, encrypted body, digest, operation, occurrence time or creation time. A migration guard also rejects inherited and SET-only API paths.

Canonical0018 runs unchanged under `supabase-v1`. The historical manifest and0017 appendix hashes remain unchanged; no existing production ledger is updated. The managed migration test now verifies 43 private RLS-forced tables, including both new tables owned by `siii_migrator`.

Local evidence on 2026-10-17: 774 unit tests pass, including seven new tests. The dedicated PostgreSQL suite passes 46 tests: 16 outbox, ten migration-hardening, nine managed-profile and eleven institutional-replay tests. It covers fresh and populated baselines, a real non-superuser managed migration, application-role inspection, frozen-column SQL denial, API RLS denial, version concurrency/overflow/rollback, identity deactivation history, midnight conversion, complete-payload limits, retries and lease fencing. Typecheck, lint and production build pass with the feature unset.

For synthetic loopback testing, set `SIII_DATABASE_ENV=test` and both database URL variables to a dedicated database ending in `_test`, apply `npm run db:migrate`, then run `npm exec vitest run -- --config vitest.outbox.config.ts`. This config starts no HTTP server and does not use port3107. Full HTTP/UI validation remains the parent integration gate alongside the parallel registry changes. No production data, migration, key or cloud write was used.

Rollback starts by keeping the feature disabled and disconnecting future workers/writers. Retain events and matching keys until reviewed retention/reconciliation permits deletion. There is no destructive automatic down migration. Dropping these tables requires a separately authorized disposable environment or a reviewed production recovery plan.

CI correction: the initial PR head failed because its synthetic login omitted a password required by CI SCRAM and because the two new tables did not transfer ownership to siii_migrator. The existing institutional replay reproduced the ownership and rollback failures locally. Migration0018 now transfers both owners, the login fixture supplies an ephemeral password, and the directed config includes the replay suite. The local PostgreSQL instance uses trust authentication; the next CI run must verify the SCRAM exchange and full HTTP/UI flow. No guard was relaxed and no existing ledger was rewritten.

Reconciliation: main39 was merged normally into this branch with no source or documentation conflict. The combined local head passes774unit tests, typecheck, lint and46directed PostgreSQL tests. CI on the prior49f959bf head already passed the full handler/baseline integration step including SCRAM; the reconciled head requires its own complete CI result before merge.
