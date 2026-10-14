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

