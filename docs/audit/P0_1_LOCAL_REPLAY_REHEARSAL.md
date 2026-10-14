# P0.1 — Evidencia de replay y reversa LOCAL

Fecha: 2026-10-14. Ejecución observada a las 12:14 America/Mexico_City sobre PostgreSQL 17 en el clúster local loopback, con p0_1_verified_test como conexión administrativa. El ensayo utiliza exclusivamente la captura estructural y fixtures sintéticos; no consulta ni modifica producción y no inicia un servidor HTTP.

## Resultado comprobado

Runner: tests/integration/institutional-replay.test.ts, Vitest programático con config:false y globalSetup:[].

**11 tests passed**, un archivo, duración 6.61 s. Se aplicaron las seis entradas vigentes 0000–0005; los hashes y timestamps del ledger fueron comparados con readMigrationFiles. **Typecheck passed** con --incremental false. La suite unitaria vigente también pasó a las 12:16: **9 archivos, 64 tests**, duración 3.57 s. Un SELECT posterior de catálogos locales confirmó **0 bases y 0 roles p0_replay_ restantes**.

| Comprobación | Evidencia ejecutada |
| --- | --- |
| Replay institucional exacto | schemaSignature del replay coincide con db/baseline/0001-schema.json y supabase-2026-10-14-schema.json: 92 columnas, 33 constraints, 26 índices y 14 labels de tres enums. Owners de tablas mapeados a un rol sintético NOLOGIN. |
| Ledger faltante | db/migrate rechaza BASELINE_REQUIRED; ledger sigue ausente y la firma no cambia. |
| Baseline adoptado | db-baseline registra únicamente los hashes originales 0–1; un segundo replay con columna desconocida rechaza BASELINE_SCHEMA_DRIFT sin crear ledger. |
| Migración hasta 0005 | Conserva las entradas 0–1 y añade 2–5. Las 13 tablas quedan con RLS y owner siii_migrator. El guard de la reversa valida las seis entradas vigentes y las 13 tablas. |
| LOGIN real y catálogo positivo | Un LOGIN único NOINHERIT, con password aleatoria solo en memoria y SET autorizado a siii_app, demuestra session_user/current_user reales. INSERT/SELECT/UPDATE funcionan en las 12 tablas mutables, incluidos academic_programs, academic_courses y curriculum_versions. La decimotercera tabla, security_audit_log, permite SELECT/INSERT y rechaza UPDATE/DELETE. |
| Grants/RPC existentes | Un RPC SECURITY DEFINER sintético con EXECUTE API concedido antes de migrar queda inaccesible a anon, authenticated y siii_app. |
| Defaults globales y scoped | Dos creadores mapeados reciben grants de funciones y ALL tablas/secuencias a siii_app antes de migrar. Después, los RPC futuros de ambos creadores deniegan EXECUTE API/runtime; tablas/secuencias futuras deniegan API, y runtime carece de DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN y permisos de secuencia. |
| RLS restrictiva | Grants SELECT y política USING(true) conflictivos, añadidos temporalmente a people, no devuelven la fila sintética para anon/authenticated. |
| Auditoría append-only | siii_app inserta auditoría, pero UPDATE por columna/tabla, DELETE y TRUNCATE fallan 42501; CREATE TABLE falla 42501. |
| Repetición idempotente | Segunda adopción informa BASELINE_ALREADY_RECORDED; segunda migración conserva firma y todas las entradas del ledger. |
| Reversa de fechas | Guard de entorno/confirmación y rechazo de host remoto funcionan antes de conectar; audit RLS desactivado rechaza sin alterar tipos; reversa segura conserva estructura de seguridad y ledger, conserva auditoría previa y añade un evento; segunda reversa no cambia nada. |

El fixture es autosuficiente: si anon/authenticated faltan en el clúster efímero, los crea NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS. Nunca modifica ni elimina roles preexistentes. Registra los roles API que crea y solo los elimina al terminar si no adquirieron dependencias de ACL/políticas ni membresías por otros fixtures. La ejecución local utilizó los roles API existentes. Mapea postgres, supabase_admin, service_role y dashboard_user a cuatro roles únicos NOLOGIN/NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOBYPASSRLS; pg_database_owner conserva la semántica del owner de la base local. Crea además un LOGIN sintético restringido para la prueba positiva. Solo crea bases p0_replay_<12hex>_<nombre>_test y roles del mismo prefijo, y elimina sus fixtures al terminar.

Las pruebas de membresías heredadas y SET-only peligrosos pertenecen al ensayo independiente del cambio 0004. Este archivo ejecuta 0004/0005 y verifica sus resultados sobre defaults amplios y privilegios efectivos; no añade membresías globales compartidas a los roles API/runtime durante el trabajo UI en paralelo. La membresía SET a siii_app corresponde exclusivamente al LOGIN sintético del mismo prefijo.

## Reproducción sin HTTP

En PowerShell, desde el worktree P0.1, el archivo .p0-local/env.ps1 establece las conexiones sin imprimirlas:

~~~powershell
. .\.p0-local\env.ps1 -Database p0_1_verified_test
node --input-type=module --eval 'import { startVitest } from "vitest/node"; const ctx = await startVitest("test", ["tests/integration/institutional-replay.test.ts"], { config: false, include: ["tests/integration/institutional-replay.test.ts"], globalSetup: [], fileParallelism: false, testTimeout: 30000 }); await ctx.close();'
npm run typecheck -- --incremental false
~~~

En CI, suministrar SIII_DATABASE_ENV=test e INTEGRATION_DATABASE_URL de PostgreSQL 17 efímero en loopback, con base inicial p0_* o *_test. El test valida isolatedDatabaseUrl, admite localhost, 127.0.0.1 e IPv6 loopback y no fija puerto, por lo que admite PostgreSQL CI en 5432. La conexión de ensayo requiere CREATE DATABASE y creación de roles sintéticos; ninguna credencial se escribe en los artefactos.

## Semántica y guards de la reversa

scripts/rehearse-date-rollback.ts requiere NODE_ENV=test, SIII_DATABASE_ENV=test, SIII_SYNTHETIC_REHEARSAL=1, SIII_ROLLBACK_CONFIRM=LOCAL_SYNTHETIC_DATES_ONLY y una URL PostgreSQL loopback hacia p0_replay_<12hex>_<nombre>_test. Estos guards excluyen la base compartida p0_1_test y endpoints de producción.

assertNoConnectionOverrides valida la URL antes de conectar: solo permite sslmode/application_name, sin claves duplicadas ni fragmento. El caso ?host=example.invalid rechaza LOCAL_SYNTHETIC_ROLLBACK_REQUIRED antes de conectar, evitando overrides del destino validado.

El script exige ledger válido y completo según el journal vigente, 13 tablas con RLS y owner siii_migrator, roles runtime/migrador sin privilegios elevados, audit append-only y denegación efectiva de tablas/columnas a API. Usa una transacción y el lock de migración. Compara antes/después las ACL de tabla/columna, owners, RLS/FORCE, políticas, defaults, ACL/configuración de RPC, roles/membresías y hashes del ledger. Una diferencia revierte la transacción.

La conversión inversa conserva legacy_start_date y legacy_end_date. Si la fecha actual coincide con el día retenido, restaura la hora histórica; si el día cambió o el registro se creó después de migrar, conserva el día actual a medianoche. Casos ejecutados:

| Fixture sintético | Resultado start / end |
| --- | --- |
| Histórico sin editar | 2026-01-01 12:00:00 / 2026-06-30 18:00:00 |
| Histórico con días editados tras migrar | 2026-03-15 00:00:00 / 2026-08-15 00:00:00 |
| Registro nuevo posterior a conversión | 2026-09-01 00:00:00 / 2026-12-20 00:00:00 |

No elimina columnas, constraints, controles de autenticación, throttle ni auditoría. Añade el evento rehearsal.academic_term_dates.rollback con detalles técnicos locales; conserva íntegramente los hashes de auditoría anteriores. Si las columnas ya son timestamp, devuelve LOCAL_DATES_ALREADY_REVERSED sin insertar otro evento.

## Límites operativos

Esta es evidencia LOCAL con datos sintéticos. No acredita cloud staging, comportamiento de PostgREST/Supabase Auth/Storage, CI remota, backup/restauración de producción ni datos históricos reales.

La reversa deja intencionadamente start_date/end_date como timestamp mientras el ledger mantiene sus hashes originales. Es una prueba parcial de recuperación de datos, conservando el endurecimiento; no es rollback completo de migraciones ni perfil para arrancar la aplicación que espera date. Para operar ese esquema se necesita una migración aditiva revisada o volver al contrato date con un procedimiento aprobado. El ensayo elimina la base tras comprobarlo.

El replay preserva owner/grantee/grant options, pero el grantor será el ejecutor local. Los esquemas gestionados y el ledger Supabase de producción no se importan. La adopción del baseline solo escribe el ledger Drizzle de la base sintética luego de comprobar la estructura exacta.

