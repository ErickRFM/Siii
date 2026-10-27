# SEC-04 — Integridad de pagadores financieros (0025)

Base: main63c237fa. Rama exclusiva fix/financial-tenant-constraints-20261022. Alcance: payment_orders, preflight de sólo lectura y regresiones; no F2, UI ni cambios productivos.

## Decisiones aprobadas
- Dos FK compuestas SQL autoritativas, MATCH SIMPLE y ON UPDATE NO ACTION: (payer_student_id,institution_id) → institutional_students(id,institution_id), y (institution_id,payer_user_id) → institution_memberships(institution_id,user_id).
- ON DELETE SET NULL afecta únicamente payer_student_id o payer_user_id, nunca institution_id. Conservar las FK escalares y sus contratos, con pruebas de coexistencia.
- PostgreSQL >=15; Drizzle0.45.4 no representa la lista de columnas SET NULL: comentario SQL-only honesto, sin casts ni FK compuesta con metadata incorrecta. Añadir dos índices hijos no únicos.
- 0025 aditiva, fully validated y atómica bajo migrador/ledger existente: lock_timeout5s, orden fijo memberships → students → orders; históricos inválidos abortan sin borrar, nulificar ni backfill. No NOT VALID confirmado.
- Journal idx25; no editar SQL/hashes/manifest/appendix históricos. canonical y supabase-v1 anexan el mismo SQL0025.

## Secuencia TDD y evidencia
1. Escribir pruebas reales PostgreSQL; observar RED sobre0000–0024: cruces INSERT/UPDATE, membresía faltante, catálogo FK y upgrade inválido fail-closed.
2. Añadir0025, schema/comments e índices, preflight SELECT/counts sin PII; observar GREEN en fresh, populated24→25, rollback, idempotencia y ambos perfiles.
3. Adaptar HTTP financiero plenamente migrado para exigir23503; preservar GET legado en base separada baseline24 sin desactivar constraints.
4. npm ci, lint/typecheck, unitarias, build y DB/HTTP focales secuenciales; docs/reporte/OPmatrix y append auditoría. Commit local tras gates; sin push/PR/merge.

## Entornos y reversa
Sólo bases nuevas siii_financial_fk_*_test del cluster local127.0.0.1:55439, guard SIII_DATABASE_ENV=test. No tocar siii_financial_test histórica, otras DB ni Supabase. Cada ensayo elimina únicamente sus bases UUID al terminar. Antes de un release real: backup/restauración ensayada, preflight sin filas inválidas, PG>=15, ledger y permisos verificados, CI/revisión y aprobación de operación. Un fallo de0025 revierte DDL/índices/ledger en la misma TX. Una reversa posterior requiere release separado que quite sólo ambas FK e índices; conserva todas las filas y vuelve a depender de defensa API parcial.

## Cierre local
Reconciliado con main809c526d antes del gate final. RED inicial15/23, preflight9 casos y Minor DEFERRABLE1 reproducidos antes de corregir. GREEN final36DB+114HTTP=144/144,19 migrador/perfil y legacy24 HTTP1/1;826unitarias, lint/tipos/build/audit0. Preflight POST_0025/VERIFIED_0025. Revisión sin hallazgos abiertos tras indimmediate. Evidencia/límites en docs/audits/SIII_FINANCIAL_TENANT_CONSTRAINTS_2026-10-22.md. CI/publicación pendientes; conservar rama/worktree, sin push/PR/merge.
