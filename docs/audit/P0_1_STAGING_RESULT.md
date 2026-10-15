# P0.1 — ensayo real en staging: parcial, P0 abierta

Inventario de control: **2026-10-15T19:49:44.103Z**; prueba posterior de LOGIN sólo lectura: **2026-10-15T19:52:16.896Z** (15 de octubre de 2026, America/Mexico_City). Proyecto exclusivo `siii-staging-p01`, referencia `vsnrbjexusidlvhkhmqg`, ejecución `eca305341546`. Session pooler5432 con TLS verify-full y CA explícita. No hubo escrituras en producción ni en esquemas administrados; no se eliminó ningún recurso cloud. Los secretos permanecen en archivos locales ignorados.

## Resultados cloud

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| Preflight y preparación | PASSED | Dos bases template0 y siete roles con OIDs registrados |
| Metadata seleccionada de control | PASSED | Hash antes/después idéntico, incluso después del repeat baseline |
| Migrador canónico, base vacía | FAILED | SQLSTATE42501/alter_role confirmado en0003; requiere superusuario |
| Replay legacy corregido | PASSED | Único reintento coordinado, fuente353472…, operación7cef65e7; ambas firmas exactas verificadas |
| Rechazo antes de ledger | PASSED | CLI original devolvió BASELINE_REQUIRED, operación6647d4ef |
| Adopción baseline | PASSED | CLI original BASELINE_ADOPTED, operaciónc115fabc; exactamente hashes0–1 |
| Fixtures sintéticos legacy | PASSED | Operacióne2981a8d; catálogo/filas confirmados por lectura |
| Repetición baseline existente | PASSED | Una ejecución independiente del CLI original: BASELINE_ALREADY_RECORDED; sin cambios |
| Migrador canónico, legacy | FAILED | CLOUD_CLI_FAILED a19:47:42Z, operación841b2210; SQLSTATE legacy no capturado |
| Idempotencia canónica completa / ledger0–5 | NOT_RUN | Ningún recorrido alcanzó MIGRATIONS_APPLIED |
| LOGIN real e identidad, ambas bases | PASSED | session_user/current_user del LOGIN restringido; transacciones READ ONLY |
| Guard runtime, base vacía | PASSED | APPLICATION_ROLE_QUERY y assertRoleInspection originales aceptan rol restringido |
| Guard runtime, legacy | REJECTED | DATABASE_ROLE_UNSAFE, sólo unsafe_rpc=true por fixture deliberadamente abierto |
| CRUD y auditoría runtime | NOT_RUN | Sin consultas de filas institucionales, RPC ni escrituras |
| RLS endurecida contra grants permisivos | NOT_RUN | Las12tablas legacy siguen RLSfalse antes del hardening |
| Permisos/RPC/defaults actuales y futuros endurecidos | NOT_RUN | RPC sintético deliberadamente abierto como fixture; no acredita hardening |
| Reversa y seguridad/ledger/auditoría retenidos | NOT_RUN | Prerrequisitos canónicos ausentes |

La repetición baseline se ejecutó después de comprobar en transacciones READ ONLY las dos filas exactas del ledger y la firma de12tablas contra ambos archivos de referencia. El CLI conservó ledger, firma, conteos y rutinas. SHA256 de firma: `51a09a54d79ff8f9da8d831667ac7378cee79f51c0ad6f6b8fc2f0cb8bd67aa3`. Se registró INTENT antes de invocarlo; no se repitió el migrador canónico.

## Objetos conservados y permisos efectivos

- Bases, propietario postgres: p01_empty_rehearsal (OID17659), p01_legacy_rehearsal (OID17660).
- Grupos NOLOGIN: siii_app (17638), siii_migrator (17641), p01_eca305341546_owner (17644), p01_eca305341546_creator (17647), p01_eca305341546_service (17650), p01_eca305341546_dashboard (17653).
- LOGIN p01_eca305341546_runtime (17656): INHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION. Único grupo padre siii_app, sin ADMIN y con INHERIT/SET. Se probaron conexiones reales sólo lectura en ambas bases: identidad correcta, sin privilegios elevados ni CREATE. El guard acepta empty y rechaza legacy por el RPC sintético deliberadamente abierto.
- El ejecutor postgres conserva ADMIN automático y dispone de INHERIT/SET sobre los grupos mediante filas complementarias de PostgreSQL17. No hereda ni puede SET al LOGIN runtime.
- Base vacía: esquema drizzle, tabla __drizzle_migrations vacía, secuencia y PK. Sin tablas/tipos institucionales públicos. Conserva cuatro defaults de funciones sintéticos sembrados antes del migrador; no hay funciones que reciban esos permisos.
- Base legacy:12tablas y sus26índices,33restricciones,3enums con tipos derivados; todas las tablas pertenecen al owner sintético y siguen RLSfalse. Ledger con las dos filas baseline, sin hashes posteriores. Una institución sintética y dos períodos: HISTORICAL conserva2026-01-01 12:00:00 /2026-06-30 18:00:00; MODIFIED conserva2026-02-01 09:00:00 /2026-07-31 16:00:00. Auditoría:0filas.
- RPC sintético cloud_legacy_rpc (OID19321), propietario creator sintético, SECURITY DEFINER y search_path vacío, EXECUTE=true para anon/authenticated/siii_app. Es un fixture deliberadamente inseguro para ensayar su posterior cierre, exclusivamente en la base aislada. Sigue sin endurecer; no es una función de producción ni acredita permisos seguros.
- En legacy, los catálogos niegan SELECT/INSERT/UPDATE/DELETE/TRUNCATE sobre las12tablas actuales a anon/authenticated/siii_app. Los12defaults de los propietarios sintéticos permiten privilegios futuros amplios, y owner/creator tienen CREATE en public como parte del seed explícito posterior al replay. La conexión runtime sólo lectura confirma identidad y restricciones del rol; su guard rechaza legacy por ese RPC. No hay pruebas de CRUD ni garantía para objetos futuros hasta aplicar hardening.

El [JSON completo](P0_1_STAGING_RESULT.json) registra inventarios, ACL, membresías, ledger, firma, fixtures, resultados antes/después y operaciones. No se alteraron ledger ni SQL históricos para aparentar aplicación.

## Fallos, corrección e historia

La preparación inicial falló al devolver ADMIN al otorgante automático de PostgreSQL17; su transacción revirtió sin dejar roles. El harness se corrigió para conservar ADMIN automático y añadir sólo INHERIT/SET a grupos. La preparación posterior creó los recursos registrados.

La primera ejecución legacy informó CLOUD_OPERATION_FAILED y revirtió todo. Lectura/fuente mostraron CREATE=false para sus nuevos propietarios antes de ALTER TYPE OWNER; [PostgreSQL17](https://www.postgresql.org/docs/17/sql-altertype.html) exige ese permiso. La causa se reprodujo localmente con ejecutor NOsuper/NOBYPASSRLS (42501). Se corrigió únicamente el harness: GRANT USAGE/CREATE para ambos propietarios dentro de la única transacción de replay, marcador validado y roles escapados, manteniendo exporter y SQL históricos. Tras revisión independiente favorable de fuente SHA256 `353472280868837F3C9E0ADE45668DE24184D4166503DF700E0B23F010588715`, el único reintento cloud pasó replay, firma, rechazo sin ledger, adopción y fixtures.

El migrador canónico vacío falló en SQL histórico0003: SQLSTATE42501, rutina alter_role, señales SUPERUSER/PERMISSION; hash f78e7d227715c22a4d0ecfc79b426c825306216ffccd5393cb31654a8cd6de30. El postgres administrado tiene CREATEROLE/CREATEDB y BYPASSRLS, pero no es superusuario. Ese ALTER ROLE exige superusuario. El migrador legacy posterior falló genéricamente CLOUD_CLI_FAILED; no se capturó su SQLSTATE y no se afirma que42501 haya sido observado también allí. Conservó ledger0–1 y estructura baseline, sin hardening parcial persistido. No se reintentó ninguno de estos fallos canónicos.

## QA local y revisión, separados de cloud

| Comprobación local final, proceso11313 del coordinador | Resultado |
| --- | --- |
| npmci, typecheck y lint | PASSED |
| Unitarias |121/121 |
| db:migrate repetido | PASSED |
| Integración |94/94,72.43s |
| Chromium |10/10,46.8s |
| Build | PASSED |
| npm audit |0vulnerabilidades |
| Diff-check | PASSED |
| Solicitud temporal para evitar suspensión | Liberada |
| Revisión independiente de fuente353472… | Favorable |
| Nuevo commit/CI remota exacta de PR20 | PENDING |

Los tests SQL locales incluyen3casos de replay con ejecutor no superusuario y3de rollback/repetición de probes. Los57casos unitarios del harness forman parte de las121unitarias. Se comprobaron baseline exacto, rollback al final del batch por error22012 y restauración de ACL. Estos resultados no sustituyen las puertas cloud fallidas o NOT_RUN.

## Control y siguiente paso

SHA256 de metadata seleccionada en postgres, antes y después: `efcfb5ef4928cc8f79b8a81469cfbdee797f488079dcfce0e65a9a1b314ea28a`. Cubre defaults, ACL/propietarios de esquemas conocidos, relaciones públicas y atributos/membresías de roles administrados seleccionados. No acredita datos internos completos, respaldo ni salud integral de servicios. El coordinador confirmó por get_project ACTIVE_HEALTHY, PG17.11.0.003, us-east-1 y organización rlduedthykpsfcrgaytn; es estado del proveedor, sin sustituir pruebas funcionales.

Preservar bases, roles y ledgers. Para ejecutar el SQL histórico0003 sin cambiarlo se necesita resolver un mecanismo administrativo soportado; no repetir mientras siga la misma condición. No saltar migraciones ni escribir hashes no ejecutados. P0 permanece abierta con las puertas de [BLOCKERS.md](../BLOCKERS.md), lector humano, hosting/HTTP, CI y revisión para promoción controlada. P1 puede continuar independientemente; no se autoriza merge ni producción.

La prueba real de LOGIN a19:52:16Z usó las credenciales locales ignoradas, verificadas contra proyecto/run/rol del manifest, y TLS verify-full. No ejecutó RPC ni creó/modificó filas u objetos. En ambas bases se confirmaron NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOREPLICATION y CREATEpublic=false. El rechazo de legacy demuestra que el guard detecta el fixture SECURITY DEFINER aún accesible; no certifica un runtime legacy seguro.
