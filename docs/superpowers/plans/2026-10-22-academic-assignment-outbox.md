# INT-04A — assignment producer plan

Approved scoped design: coordinator instruction22October2026. Base main5cb49f75; branch fix/academic-assignment-outbox-20261022, reused managed student-claim-authority worktree. No work on the prior claim branch.

- [x] Reuse vitest.integration.config/http-setup unchanged server lifecycle and own new synthetic DB siii_assignment_outbox_20261022_test, PG55439/HTTP3211, existing0000..25 migrations. Fixture-only ephemeral academic keys when ON, restore previous values on teardown/failure; no inherited real keys, new server/config or throttle cleanup.
- [x] Write real HTTP/PG assignment creation/revocation negatives. Observe missing event before changing production. Baseline snapshot through existing section producer; retain request/SQL/decrypted frozen-event evidence.
- [x] Add only enqueueAcademicSection calls to POST/PATCH assignments inside their existing domainTransaction, with row.sectionId and one requestId shared across business/event audit. Preserve contracts/MFA/flags/snapshot/outbox versions and other producers.
- [x] Run both explicitly named ON and OFF modes without skips, negatives, rollback, final authority under SQL wait, concurrent duplicates and empty/multiple teacher snapshots. No network transport or receiver changes.
- [x] Add approved CI step ON after ordinary integration and before build; OFF remains ordinary suite. Existing harness generates fresh keys only after synthetic DB guard and restores values on failure/teardown.
- [x] Reserve CPU for relevant tests, lint/types/unit/build; independent review before conventional local commit. No push/PR/merge until coordination.
- [x] Report actual RED/GREEN and failures, append OPmatrix/engineering audit preserving history. INT04 remains partial; limits500teachers/500historicalenrollments/3000occurrences/1MiB may reject enabled writes atomically. No mobile/production certification.


RED observado contra fuente5cb intacta: alta201 sin evento (0 frente a1); retiro200 tras snapshot basal sin nuevo evento (1 frente a2). Log assignment-red.log. Primeros intentos de nombreDB/fixture/requestId se conservan separados y no se cuentan como RED funcional.

Verificación local:39ONdev y39ON+39OFF producción, lint/tipos/build0, claves ON/OFF/startupfailure0 y contratoYAML0. Revisión independiente sinC/I/M. npmtest825/826 en dos ejecuciones y aislado4/5 por timeout5000ms unchanged; diagnóstico externo910ms guard correcto. No se declara unitverde ni se continúa reintentando; coordinación hará control main5cb antes de decidir commit. Sin push/PR/merge.

Cierre posterior: coordinación verificó A main5cb826/826 y B en esta rama826/826 con mismo npmtest, cincoflagsunset/versiones/corpus comprobados. Causa intermitente no resuelta, tres fallos previos preservados; sin cambios de fuente/plazos. Gateactualcerrado, commit local autorizado y revisiónC/I/M0. No reconciliar todavía mainfc65 ni publicar.
