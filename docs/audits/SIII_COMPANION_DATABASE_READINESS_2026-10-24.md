# Preparación de base para Compañero — 24 octubre 2026

**Resultado:** el ledger productivo coincide con el perfil administrado hasta `0017`. El ensayo local de `0018..0025`, rollback y recuperación de una copia sintética pasó. **No existe respaldo productivo reciente acreditado en esta ejecución y no se autorizó ni aplicó DDL productivo.**

Base de código de referencia: `main@2a3c8390062aefbb87dc8dc596620fee31ff8565`. La aprobación de despliegue debe usar el SHA final real revisado, no este SHA histórico de referencia.

## Producción: evidencia exclusivamente de metadatos

Proyecto `kkjzbqsaummyralqjqrb`, cuenta Primary. Consultas SELECT realizadas entre `2026-10-24T07:09Z` y `07:16Z`; no se leyeron ni exportaron filas institucionales. Servidor PostgreSQL17.11.

| Puerta | Resultado observado |
|---|---|
| Drizzle |18 entradas, exactamente `0000..0017`; hash y `created_at` coinciden con `readReleaseMigrations('supabase-v1')` |
| `drizzle.siii_release_profile` | `supabase-v1`, definición `fbabc793547e0d533188444e4d4e00fdca0aa310d2fab52b520eb2b9640a43ed` |
| `drizzle.siii_release_appendix` | `schema-isolation-v1`, definición `2cb173a23f99b9c47d7dbaf17769214ad4996eccee52f8863a0152a2e99bd53a` |
| `0017` ejecutada | `68b2b137783f9523b28908594675cd2b70685163208f7caec4fb3f7052c6e296`; no sustituir por hash canónico `a8d3c2a3…` |
| Outbox y versiones académicas | Ambas tablas ausentes |
| Tablas públicas |41; todas con RLS y FORCE RLS; todas pertenecen a `siii_migrator` |
| Roles `siii_app`, `siii_migrator` | NOLOGIN, NOSUPERUSER, NOBYPASSRLS |
| anon/authenticated | Sin acceso a esquema público ni privilegios de columna institucionales, incluyendo caminos heredados/SET |
| Firma de columnas, constraints, índices y enums públicos | `652f4deb0d7edbc4e4e33d76272df08d08d620730c7e835889bbff19434048b5` |

La firma usa `SCHEMA_SIGNATURE_SQL` y SHA256 del JSONB textual. No cubre contenido institucional ni esquemas gestionados por el proveedor; no constituye respaldo.

## Pendientes cotejadas y ensayadas

| Migración | SHA256 ejecutado |
|---|---|
|0018_academic_section_outbox|`1729c616b21641fbc599d97b7ee856a4eec9509f024ae22d59a47bc5fb2a4912`|
|0019_admissions_system|`2ec808852cfd7c1347629073d68370d66e1fe3aab318e82251cc44fea493ba74`|
|0020_student_account_links|`2923a7e6ab82112d05594a8467ce1e8dfa1664d75521aaa037e782a9ff8265f0`|
|0021_financials_treasury|`6f816097f73a10f51d37200a360c437a3e27d90bb7c8346184c742a36cab9429`|
|0022_force_rls_new_tables|`02719b04dc956fa1b86ed6fb94a810395041d7f2a68bf1ab9ad876891b1f3653`|
|0023_new_modules_runtime_hardening|`3bddd9ebfc8a7c3eacd299c95b83b7c72dd9b0b11e5a253d900506f9cc4b21c4`|
|0024_applicant_identity|`2c5aa8acc279a16cc6e957225be9b027e1eae0b7096b74152ce9f9ca8c7749e9`|
|0025_financial_payer_tenants|`854d99883ca76d681d57be9befeebaa45156702a3bb0475ecc6a3885ba3a9da0`|

No saltar `0019..0025` para aplicar únicamente `0018`. No reescribir el ledger ni sustituir el perfil administrado por SQL canónico.

## Ensayo local ejecutado

`scripts/rehearse-companion-pending.ts` solo admite loopback `127.0.0.1:55439`, nombres `p0_companion_*`, entorno test y confirmación `LOCAL_SYNTHETIC_ONLY`. No acepta `siii_ui_test`, puertos alternativos, DSN remotos ni overrides de conexión. `scripts/companion-db-readiness.ts` comprueba los18 hashes/tiempos y ambos metadatos de release antes de crear las bases.

Resultado `2026-10-24T07:16:03Z`:

- Actor nuevo `p0_companion_d3904f8054_executor`, NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE; membresías únicamente hacia los roles backend existentes. No se cambiaron atributos de roles compartidos.
- Baseline nuevo `p0_companion_d3904f8054_baseline`, construido con el perfil `0000..0017`:41 tablas y firma pública idéntica a producción. Solo contiene datos sintéticos.
- `…_rollback`: ejecuta pendientes y después error deliberado22012. ROLLBACK recupera firma, ledger, propietarios, RLS, ACL, políticas y checksums de filas idénticos al baseline.
- `…_upgraded`: aplica pendientes en orden dentro de una transacción. Resultado26 entradas/56 tablas, todas FORCE RLS; datos previos conservados por conteo y checksum.
- `…_restored`: `pg_dump` custom de esquemas `public`/`drizzle`, cifrado autenticado AES256GCM en disco, descifrado en memoria y `pg_restore` con verificación de igualdad completa contra baseline. Archivo sintético cifrado214189bytes.
- Bases y actor se preservan para inspección. Next, puerto3107 y base E2E compartida no se utilizaron.

El archivo cifrado es **una prueba sintética de recuperación durante esta ejecución**. Su clave efímera no se persistió: no sirve como respaldo productivo retenido ni sustituye custodia de claves del operador. Los scripts no contienen un camino de exportación de datos productivos.

Ejecución reproducible, con URL exclusivamente sintética:

```powershell
$env:SIII_DATABASE_ENV='test'
$env:SIII_COMPANION_DB_REHEARSAL='LOCAL_SYNTHETIC_ONLY'
$env:SIII_COMPANION_REHEARSAL_URL='postgresql://postgres@127.0.0.1:55439/postgres'
$env:SIII_COMPANION_EXPECTED_SCHEMA_HASH='652f4deb0d7edbc4e4e33d76272df08d08d620730c7e835889bbff19434048b5'
node --import tsx scripts/rehearse-companion-pending.ts
```

La observación de ledger de entrada y resultados locales están en `.p0-local/companion-connection/production-ledger.json` y `pending-db-rehearsal.json`, ignorados por Git; solo contienen metadatos.

Validación: cuatro pruebas unitarias de guardas RED→GREEN; suite unitaria completa878/878 en63 archivos; typecheck y ESLint focal sin errores. El ensayo local ejecutado acredita las operaciones SQL y recuperación descritas; no se usaron mocks para esas operaciones.

## Respaldo productivo: bloqueo concreto

El proceso no tiene `DATABASE_URL`. El único archivo de conexión local encontrado, `.env.staging.local`, contiene una URL cuyo destino **no** es este proyecto productivo. No se imprimieron URL ni contraseña. No se reutilizó staging como si fuera producción.

El conector MCP permite SELECT como `postgres`, pero devuelve resultados a la conversación: no proporciona un stream local cifrado de `pg_dump`. Exportar registros institucionales mediante esos resultados expondría datos en logs/historial. No se hizo. Tampoco se infirió la existencia/recencia de copias automáticas del plan Supabase.

El mecanismo `scripts/baseline-recovery.ts` acepta exclusivamente el esquema histórico `0001`, con formato y firma fijos y sin políticas/triggers. **Rechaza el baseline actual de41 tablas**; un artefacto histórico de ese formato no acredita recuperación del estado `0017`. El ensayo `rehearse-consolidation-recovery.mjs` es una copia local por template, no un respaldo cloud portable.

Para una exportación completa, el operador necesita acceso al destino real y un rol capaz de leer todas las filas pese a FORCE RLS (sin modificar permisos productivos como parte de esta preparación), custodia de cifrado y un destino de restauración aislado. Ver [pg_dump y RLS](https://supabase.com/docs/guides/troubleshooting/pg_dump-fails-with-query-would-be-affected-by-row-level-security-policy-1d5783) y [guía oficial de respaldo/restauración](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). No crear roles ni conceder BYPASSRLS automáticamente.

## Procedimiento revisable antes de solicitar autorización productiva

1. Fijar el SHA real final con CI/revisión verdes y un artefacto de release inmutable. Este ensayo llega únicamente a `0025`: si el journal incorpora `0026+`, ampliar ensayo/revisión y lista aprobada antes de ejecutar `db:migrate`, que procesa todas las pendientes del journal.
2. Repetir SELECT de ledger, perfil, apéndice, firma y accesos. Si cambian los18 hashes/tiempos o la firma de baseline, detener y reconciliar; no editar la evidencia para forzar coincidencia.
3. Obtener respaldo productivo reciente cifrado con clave bajo custodia del operador, checksum del artefacto, fecha/corte consistente y alcance documentado (datos, ledger, roles/ACL/políticas, funciones, y tratamiento separado de Auth/Storage). Mantener todo dato real fuera de repositorio y logs.
4. Restaurar esa copia en un destino aislado autorizado y comparar esquema, contenido y permisos. Registrar resultado y recuperación medida; un backup descargado sin restauración comprobada no cumple la puerta.
5. Definir ventana, pausa de escrituras, executor y acceso de migración existente, responsables y punto de reversa. Repetir guardas sobre el corte final. Preparar una transacción del release administrado con advisory lock y migraciones consecutivas, conservando perfil/apéndice y hashes realmente ejecutados.
6. Presentar para autorización explícita el proyecto exacto, SHA, lista de migraciones/hashes, respaldo/restauración comprobados, procedimiento, ventana y reversa. **Esta auditoría no es esa autorización.** No aplicar DDL ni habilitar flags mientras falte una puerta.
7. Después de autorización y ejecución controlada: comprobar ledger final, outbox/versiones, RLS/FORCE/owners/grants y rol runtime real. Conservar flags apagadas; la activación piloto exige además contrato firmado, proyección durable, autoridad/revocaciones y lectura móvil.

Si falla la transacción de migración, ejecutar ROLLBACK y comprobar ledger/esquema previos. Si el problema aparece después del COMMIT, mantener la integración deshabilitada y aplicar el procedimiento de recuperación previamente aprobado; no borrar tablas ni rebajar RLS para intentar volver atrás. Restaurar un corte antiguo puede perder escrituras posteriores: por eso la pausa de escrituras y el criterio de recuperación deben quedar aprobados antes.
