# P0.1 — correcciones de privacidad y concurrencia
Base: P0 755a4bb97460e0008b13cc28a0edbd50184ed12d. Rama dependiente chore/p0-1-release-gates; no promoción ni merge de P0.

La revisión independiente del P0 corregido encontró grants anteriores de siii_app que podían conservar DELETE/TRUNCATE de auditoría, una carrera de limpieza del throttle y un orden de locks que podía detener el worker. La migración aditiva 0003 revoca grants de tabla/columna y RPC/defaults EXECUTE, conserva SELECT/INSERT de auditoría y DELETE solamente en sesiones/throttle. Los SQL y checksums 0000–0002 permanecen intactos.

El guard inspecciona permisos efectivos, membresía utilizable de siii_app, acceso a roles privilegiados, ownership, DDL, modificaciones de auditoría y RPC SECURITY DEFINER. Los LOGIN de aplicación y migración siguen separados. La pertenencia indirecta a un rol CREATEROLE se rechaza aun cuando el LOGIN no tenga ese atributo directamente.

Login obtiene y bloquea atómicamente el bucket por UPSERT, renovando su caducidad. La limpieza usa lotes FOR UPDATE SKIP LOCKED: no espera filas que una operación de autenticación mantiene bloqueadas. Reintenta deadlocks/serialization failures y conserva el servicio continuo ante un error transitorio.

## Evidencia local 2026-10-14
PostgreSQL 17.10, loopback:55432, p0_1_test y bases sintéticas únicas. No conexiones de producción en estos tests.
- Lint: pasó.
- Unit: 54 pruebas (41 P0 + 13 del exporter de estructura).
- Integración completa: 68 pruebas pasaron; después se añadieron dos regresiones de roles. El archivo de privilegios efectivos completo (5 casos) pasó.
- Chromium: 10 recorridos pasaron.
- Typecheck y build: pasaron.
- npm audit: 0 vulnerabilidades.
- Casos RED→GREEN reales: borrado/truncado de auditoría, RPC existente, LOGIN con DELETE/TRUNCATE/UPDATE de columna, CREATEROLE indirecto, membresía NOINHERIT, limpieza concurrente del bucket y worker bloqueado.

La revisión de estas nuevas correcciones y la CI del nuevo SHA están pendientes; los resultados anteriores de PR19 no certifican este código.

## Puertas externas
Staging Supabase: pendiente de creación/aprobación y ensayo cloud. El exporter y auditoría de catálogos preparan una estructura representativa sin filas personales; el ensayo local no certifica cloud.
Argon2id en runtime de destino/representativo aprobado: pendiente.
Lector de pantalla escuchado por una persona: pendiente por flujo.
Mantener docs/BLOCKERS.md y PR19 abiertos hasta cerrar sus puertas obligatorias.


## Revisión posterior y ampliación aditiva 0004
La revisión de fff49f88 verificó las tres correcciones iniciales y pidió cambios por RPC heredados, roles secundarios SET-only y defaults anteriores ALL de siii_app. Las regresiones sintéticas confirmaron EXECUTE heredado y TRUNCATE futuro antes de 0004; SET-only obtuvo 200 antes del ajuste del guard y 503 después.

0004 reconcilia ACL de tablas/columnas/secuencias/RPC públicos de los grupos alcanzables por los roles Data API, revoca defaults globales/scoped excesivos y comprueba permisos efectivos al terminar. Rechaza pertenencia de APIroles a propietarios, roles privilegiados, siii_app o siii_migrator; no cambia membresías ni esquemas gestionados. Las tablas futuras del runtime necesitan grants explícitos revisados y políticas RLS. El guard también inspecciona DDL/DML/RPC de roles alcanzables mediante SET ROLE.
Archivo runtime-effective-privileges: 6/6; p0-1-privacy: 4/4, incluyendo idempotencia 0004. Revisión independiente posterior de estas ampliaciones y CI final aún pendientes.

## Upgrade previo y ADMIN OPTION
0005 normaliza ACL actuales de siii_app cuando defaults defectuosos crearon tablas entre 0003 y 0004. Solo restaura grants mínimos de las 13 tablas conocidas; tablas desconocidas permanecen sin grants de runtime y con RLS habilitada. La postcondición comprueba permisos efectivos prohibidos.

El guard rechaza ADMIN OPTION directo o indirecto de membresías, además de MAINTAIN. Un LOGIN sintético con ADMIN TRUE/INHERIT FALSE/SET FALSE pudo concederse SET y alcanzar TRUNCATE; readiness anterior a esa operación pasó de 200 a 503 tras la corrección. Archivos efectivos/privacidad: 11/11 pruebas pasaron en p0_1_verified_test.

Se preservaron las bases sintéticas anteriores y sus ledgers. Una normalización de fin de archivo de 0004 durante preparación cambió sus bytes respecto al primer fixture local; la rama publicada conserva los bytes revisados y las bases nuevas verifican ese SQL desde cero. No se reescribió ningún ledger ni se cambió SQL histórico 0000–0002 para forzar aceptación. P1 reconcilia la numeración de su migración nueva antes de publicación.

## Verificación conjunta del código final
En p0_1_release_test (base nueva, solo sintética) se verificó la secuencia 0000–0005 congelada para publicación. Lint/typecheck pasaron; 64 unitarias, 88 de integración y 10 Chromium pasaron; build pasó; npm audit 0.

La revisión detectó y se corrigió antes de publicar 0005 una allowlist con nombres de rutas en vez de nombres SQL. El test positivo de LOGIN restringido ahora INSERT/SELECT/UPDATE las 12 tablas mutables (incluyendo academic_programs, academic_courses y curriculum_versions) y SELECT/INSERT auditoría; UPDATE/DELETE de auditoría rechazados. Se preservan los fixtures anteriores con el borrador previo y se validan bases nuevas, sin reescribir ledgers.

La revisión también amplió los guards: el runtime acepta membresías únicamente del LOGIN y siii_app y rechaza ADMIN OPTION, roles predefinidos de acceso al servidor, DDL/DML/RPC peligrosos y MAINTAIN. La migración rechaza APIroles miembros de roles predefinidos. No se leen archivos del servidor ni se ejecutan sus programas en las pruebas.

Los parámetros URL del driver que pueden sustituir host, usuario, contraseña o base se rechazan antes de conectar; solo se permiten sslmode/application_name sin duplicados ni fragmentos. Fixture, migrador y reversa comparten el guard. El globalSetup provisiona/verifica roles API sintéticos sin depender del orden de los tests.

Revisión de fuente posterior: los hallazgos materiales anteriores resueltos; última observación de fixture cubierta en globalSetup. No se atribuyen al revisor los resultados ejecutados por el agente principal ni se certifica cloud/hosting/lector humano. CI del nuevo SHA pendiente.
