# Migración 0027 — archivo institucional de asistencia (runbook)

**Migración:** `db/migrations/0027_institutional_attendance_results.sql` (journal `idx 27`).
**Naturaleza:** aditiva (forward-only). No altera ni elimina objetos existentes salvo el índice único nuevo.

## 1. Objetos que crea

- Índice único `occurrence_result_scope_uidx` sobre `class_occurrences(id, section_id, institution_id)`.
- Tablas `institutional_attendance_results`, `attendance_result_reconciliation`, `institutional_class_sessions` y `class_session_reconciliation`.
- Índices de consulta por alumno/sección/docente y de reconciliación pendiente.
- `ENABLE`/`FORCE ROW LEVEL SECURITY`, `REVOKE ALL` a `PUBLIC, anon, authenticated, siii_app`, grants explícitos a `siii_app`, políticas restrictivas `deny_anon`/`deny_authenticated`, y `OWNER TO siii_migrator`.

## 2. Estado de producción (evidencia)

- **No verificado en esta sesión.** El entorno no tiene `DATABASE_URL`; `npm run db:migrate` y `npm run pilot:db:gate` no pudieron ejecutarse contra Supabase.
- Comprobable de forma local: la migración existe, es aditiva, el journal es contiguo (`idx 0..27`, sin huecos) y `npm run db:drift` pasa.
- **La existencia en el repositorio no acredita aplicación en producción.**

### Cómo obtener la evidencia real (con credencial autorizada)

```bash
# 1. Puerta read-only (transacción READ ONLY, se revierte): exige solo lectura
npm run pilot:db:gate        # exit 0 = SCHEMA_READY, exit 2 = NO_GO
```

Consulta de metadatos a ejecutar sobre el proyecto correcto (solo lectura):

```sql
-- ¿Está 0027 en el ledger de Drizzle?
SELECT count(*) FROM drizzle.__drizzle_migrations;
-- RLS habilitado y forzado en las 4 tablas nuevas
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND relname IN
 ('institutional_attendance_results','attendance_result_reconciliation',
  'institutional_class_sessions','class_session_reconciliation');
-- Políticas esperadas
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies WHERE schemaname='public'
 AND tablename IN ('institutional_attendance_results','attendance_result_reconciliation',
  'institutional_class_sessions','class_session_reconciliation');
-- Grants: anon/authenticated NO deben tener acceso; siii_app sí (SELECT/INSERT; UPDATE en reconciliación)
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public'
 AND table_name IN ('institutional_attendance_results','attendance_result_reconciliation',
  'institutional_class_sessions','class_session_reconciliation')
ORDER BY table_name, grantee, privilege_type;
```

**Salida esperada:** 4 tablas con `relrowsecurity=t` y `relforcerowsecurity=t`; políticas `*_deny_anon`/`*_deny_authenticated` `RESTRICTIVE`; sin filas para `anon`/`authenticated`; `siii_app` con los privilegios listados y `siii_migrator` como owner.

## 3. Respaldo (obligatorio antes de aplicar)

1. Respaldo lógico completo del proyecto Supabase (snapshot administrado) y verificación de restaurabilidad.
2. Como 0027 es aditiva, el respaldo de las 4 tablas nuevas puede ser un `pg_dump --schema-only` más un `pg_dump -t` de datos si ya existieran. En un entorno limpio son inexistentes.
3. Registrar identificador del respaldo y hora (UTC) en el ticket de liberación. No registrar la URL ni secretos.

## 4. Aplicación (proceso autorizado)

`db/migrate.ts` bloquea producción sin autorización explícita:

```
SIII_DATABASE_ENV=production
SIII_ALLOW_PRODUCTION_MIGRATIONS=I_ACKNOWLEDGE_PRODUCTION_MIGRATION
npm run db:migrate
```

`assertMigrationLedger()` verifica hashes y timestamps del ledger antes de continuar y falla con `MIGRATION_LEDGER_DRIFT` si el journal no corresponde. **No ejecutar sobre producción sin autorización y sin respaldo.**

## 5. Reversa (rollback)

La migración es forward-only; la reversa es una migración nueva y explícita, nunca `DROP` manual en producción salvo incidente autorizado. Reversa equivalente:

```sql
BEGIN;
DROP TABLE IF EXISTS public.class_session_reconciliation;
DROP TABLE IF EXISTS public.institutional_class_sessions;
DROP TABLE IF EXISTS public.attendance_result_reconciliation;
DROP TABLE IF EXISTS public.institutional_attendance_results;
DROP INDEX IF EXISTS public.occurrence_result_scope_uidx;
COMMIT;
```

**Precondición de seguridad:** la reversa solo es válida si 0027 se aplicó y **no** se ha activado la ingesta (`SIII_COMPANION_RESULTS_ENABLED` en OFF y sin filas en las tablas). Con datos aceptados, la reversa destruye archivo y debe autorizarse como incidente con respaldo previo. Fijar el resultado en el journal de Drizzle de forma autorizada; no editar `_journal.json` a mano.

## 6. Recuperación

- Si `db:migrate` falla a mitad: cada `CREATE`/`CREATE INDEX` es idempotente respecto al estado; reintentar tras revisar el ledger. No forzar con `DROP` parcial.
- Si aparece `MIGRATION_LEDGER_DRIFT`: detener; reconciliar el ledger en una base restaurada (ver `docs/operations/SIII_PILOT_READONLY_DATABASE_GATE.md`), no en producción.
- Ante datos corruptos: restaurar desde el respaldo del paso 3 y reaplicar migraciones autorizadas.

## 7. Criterios de aceptación

- [ ] `npm run pilot:db:gate` devuelve `exit 0` (`SCHEMA_READY`) sobre el proyecto correcto.
- [ ] Las 4 tablas con RLS `ENABLE`+`FORCE` y sin acceso para `anon`/`authenticated`.
- [ ] Políticas `deny_anon`/`deny_authenticated` `RESTRICTIVE` y grants de `siii_app`/`siii_migrator` según §2.
- [ ] Respaldo registrado y restauración ensayada en base limpia.
- [ ] Reversa (§5) probada en entorno aislado, no en producción.
- [ ] Ingesta permanece OFF (`SIII_COMPANION_RESULTS_ENABLED` por defecto deshabilitado) hasta certificar el receptor.

## 8. Responsabilidades

- **Propietario:** autoriza aplicación, respaldo y ventana; confirma credencial `attendance:archive` del tenant destino en Compañero.
- **Operación:** aplica por el proceso autorizado y adjunta la evidencia de §2.
- **Auditoría:** verifica salidas de RLS/grants y conserva el respaldo.
