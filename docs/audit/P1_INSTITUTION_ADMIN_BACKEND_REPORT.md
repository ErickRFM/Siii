# F09 institutional administration backend — local evidence

Status: backend implemented and locally verified; F09/P1 remain partial pending UI verification, final review, CI, integration and existing P0 gates.

Base: `codex/p1-institution-admin`, F06 `e2180879aef284239997e3769e450d7a288893b4`.

## Scope and contracts

- `GET /api/v1/institutions/manageable`: own manageable units with tenant-bound keyset pagination.
- `GET/PATCH /api/v1/institutions/:institutionId/settings`: persisted metadata and strict partial update of name, shortName, code and IANA/UTC timezone. PATCH requires reason and expectedVersion.
- `POST /api/v1/institutions/:institutionId/status`: active/inactive/suspended with reason and expectedVersion. Archived metadata is read-only and terminal; no delete/archive endpoint exists.
- `GET /api/v1/institutions/:institutionId/audit`: tenant audit with action, targetKind, from/to filters and filter-bound pagination, maximum 100 rows.
- DTO: id, name, shortName, code, timezone, status, version, createdAt, updatedAt. Mutation responses return the persisted incremented version.
- Server page helpers: getInstitutionManagementPageAccess(id), listInstitutionManagementPageAccess(), returning institution DTO and separately computed updateSettings/changeStatus/readAudit actions.
- Stable errors: INVALID_ID/INVALID_PAGE 400, FORBIDDEN/INVALID_ORIGIN 403, VALIDATION_ERROR 422, STALE_RESOURCE/INSTITUTION_CODE_EXISTS/INSTITUTION_ARCHIVED/INVALID_STATUS_TRANSITION/VERSION_LIMIT_REACHED 409. Duplicate code responses disclose no other institution.

## Authorization and consistency

The new management context ignores only the institution's liveness for its own metadata, reactivation and audit. It requires active identity, current session/auth version, active non-deleted membership, a live institutional administrator grant, and MFA proof valid for the current active factor. Writes also require fresh five-minute step-up. Admin and super_admin remain institutional roles.

The general institutionAccess, readVisibility and lockInstitutionContext are unchanged. Ordinary catalog/user/invitation endpoints continue denying inactive/suspended institutions. Lock order is institution → actor user → factor → session → membership → grants. Grants, session and assurance are checked after lock waits. A final time/assurance check after potentially blocking writes and audit throws to roll back the entire transaction if authority expires.

Deactivation atomically revokes all pending tenant invitations and cancels queued tenant outbox entries, clearing leases. Accepted delivery metadata, global identities, memberships and grants remain unchanged. Reactivation does not resurrect invitations. The existing worker's CAS completion cannot revive a cancelled entry.

Audit output is a new reviewed projection. It excludes raw details, emails, global identity data, passwords, tokens, hashes and ciphertext. Actor labels are joined only through a membership in the audited institution. Targets require an exact known kind plus UUID. Before/after are flat whitelisted metadata; UTC filter instants are normalized before ordering and cursor scoping. Reads revalidate current authorization after their data query and return no DTO/cursor if it was lost.

## Migration

Only `0010_p1_institution_admin.sql` was added: admin_version integer NOT NULL DEFAULT 0 and CHECK >= 0, mirrored in Drizzle. Increment is bounded at PostgreSQL integer maximum. Historical SQL 0000–0009 was not edited. The journal adds only entry 10.

0010 was frozen at its first local application: SHA256 `1B9C2C7BEF3C193D09956E2D249FA9463B58C92846C7FC6B77902B29C00FE602`.
0009 remains SHA256 `A7CA5A54C19A7370248E753BDE04581CA48F24AC5E25AE0B12A10D73B825C099`.

Only the local `p1_institution_admin_test` database on 127.0.0.1:55432 was created, from template0 when absent. Existing migrations were applied to the empty database, then 0010 was applied over its populated F06 schema. No other database was reset. Reversal should retain the additive version column and revert application code; dropping the column destroys stale-form protection and requires an approved maintenance migration.

## Directed verification

All commands ran through the temporary with-awake helper, preserved the process exit code and stayed within its ten-minute limit.

- RED: initial real GET settings returned 404 versus expected 200.
- RED: UTC precision ordering and target suffix unit tests failed before correction.
- RED: warmed settings PATCH returned 200 after step-up expired during a synthetic three-second audit trigger; corrected by final throw/rollback.
- Initial expanded 26-case run: 21 passed and 5 fixture failures (reused constant code, three missing parameterized mutations, missing synthetic mail configuration). These fixture defects were fixed explicitly.
- GREEN: `npm run test:integration -- tests/integration/institution-admin.test.ts`: 26/26, 51.19 s.
- GREEN: `npm test -- tests/unit/institution-admin.test.ts`: initially 3/3, then 4/4 after adding year-zero coverage.
- Additional RED: year-zero audit unit validation accepted an incompatible date and the real HTTP handler returned 500 instead of 400 INVALID_PAGE.
- Correction: strict ISO audit instants now require a year of at least 1 before Date.parse/normalization.
- GREEN: `npm run test:integration -- tests/integration/institution-admin.test.ts -t 'year zero'`: 1/1 passed, 26 skipped (27 total), 9.09 s. Both from and to inputs return 400 INVALID_PAGE. The whole 27-case file was left for the parent's final global run.
- GREEN: `npm run typecheck`: exit 0, repeated after the year-zero correction.
- GREEN: directed eslint for institution-admin source and its unit/integration tests: exit 0.

Coverage includes tenant crossing, non-administrator and cross-tenant role rejection, strict fields, timezone validation, stale expectedVersion, overflow, concurrent updates, inactive/suspended reactivation, archived denial, post-wait grant revocation/expiry, factor freshness, membership state, session auth version, stale step-up, final audit-read authorization, delayed-audit rollback, invitation token revocation, status rollback, preserved accepted mail metadata, worker cancellation CAS and database version CHECK.

The worker test always injects a synthetic transport and restores its synthetic mail configuration in finally. No real email, cloud, Supabase, production access or secret output occurred. Port 3107 was released after the directed backend run for the UI owner.

## Remaining gates

UI/browser verification, full final regression suite, dependency audit, independent review, CI and merge are coordinated by the parent task. Production/staging and human accessibility gates remain as documented elsewhere. No large-dataset performance claim is made; the existing tenant/createdAt audit index is retained, with deterministic createdAt/id ordering and bounded pages. This report does not declare F09 or P1 complete.

## Artefacto SQL LF publicado y evidencia Windows

La huella1B9C2C7BEF3C193D09956E2D249FA9463B58C92846C7FC6B77902B29C00FE602 citada arriba identifica los bytes del archivo Windows ensayado (un CRLF), no el blob canónico publicado. La regla histórica .gitattributes sql eol=lf convierte ese separador a LF al preparar Git; SHA256 del blob0010: E082937CD0326A2376E74E11505E8EFD0DCBFE1B6D8B89BAF095579947E7DD49. El SQL lógico es idéntico, pero el migrador compara hashes crudos: no son checksums intercambiables.

Se conservó p1_institution_admin_test y su ledger sin cambios. No debe reutilizarse con checkout LF: el guard devolvería correctamente MIGRATION_LEDGER_DRIFT. Para validar el artefacto publicable, se registró el inventario y creó exclusivamente otra base local p1_institution_admin_lf_test desde template0. Se extrajeron los once SQL y journal completos de los blobs staged de Git a carpeta ignorada, y se ejecutó el CLI db/migrate.ts original desde ese cwd, sin modificarlo. Primera aplicación y repetición devolvieron MIGRATIONS_APPLIED; ledger exacto11/11 hashes+fechas contra Drizzle, y columna integer NOT NULL DEFAULT0 verificados. Resultado2026-10-15T21:40:42Z. Ninguna reescritura de SQL histórico, hash/ledger existente o guard; sin operaciones cloud. Usar la nueva base LF para futuras pruebas del checkout canónico.

Revisión independiente de esta distinción favorable, sin P1/P2 adicionales, condicionada a ese ensayo LF ya ejecutado. La CI verificará además el checkout LF fresco. El control de fuente previo sigue identificando los bytes Windows revisados; el checksum Git publicado queda identificado separadamente aquí.