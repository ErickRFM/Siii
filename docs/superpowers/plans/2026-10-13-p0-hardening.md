# P0 — Plan de endurecimiento y limpieza
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Endurecer la base existente de Siii sin sumar módulos de dominio.
**Architecture:** PostgreSQL local aislado reproduce una base vacía y un baseline sin journal. Los handlers se prueban mediante HTTP real contra Next.js y PostgreSQL; las reglas compartidas cubren autenticación, auditoría y paginación.
**Tech Stack:** Next.js 15, TypeScript, Drizzle, PostgreSQL 17, Argon2id, Zod, Vitest.
**Spec:** `docs/agent/MASTER_PROMPT.md`, sección 9/P0.
**Base:** `7070a461`, reconciliada por fast-forward con `origin/main c7334cdf` (preflight R0).

## Global Constraints
- DENY BY DEFAULT.
- DATABASE_URL solo servidor; cero datos personales reales en desarrollo/CI.
- Nunca se ejecuta db:migrate contra producción.
- Solo P0; MFA, invitaciones y nuevos roles pertenecen a P1.
- Auditoría sensible en la misma transacción, con request_id.
- Una fase = una rama = un PR pequeño. Rama: feat/p0-hardening.
- No merge sin CI verde y revisión.
- Si un bloqueo impide avanzar, registrarlo en docs/BLOCKERS.md y detenerse.

## Review Focus
- Peticiones simultáneas: contador de login, expiración y cupos de sesiones deben ser atómicos.
- Headers manipulados: no confiar en IP/request_id suministrados sin proxy confiable.
- Paginación: empates, cursor cruzado de tenant/recurso y cursors inválidos.
- Baseline: no adoptar ledger con esquema desconocido ni ocultar drift.
- Fallo de auditoría: toda escritura sensible debe revertirse.

## Task 1: Entorno y baseline
**Files:** .p0-local/ (ignorado), docs/audit/P0_REPORT.md, docs/agent/MASTER_PROMPT.md, AGENTS.md.
**Interfaces:** PostgreSQL localhost:55432, bases p0_empty/p0_baseline sin datos reales.
- [x] Guardar prompt exacto y referencia en AGENTS.md.
- [x] Actualizar refs remotas y reconciliar preflight R0.
- [x] Ejecutar baseline unit/typecheck/lint: 29 tests, sin errores.
- [x] Inicializar servidor PostgreSQL aislado y comprobar SELECT version().
- [x] Guardar metadatos de auditoría remota, sin leer datos personales.

## Task 2: Migración segura y privacidad
**Files:** db/migration-safety.ts, db/migrate.ts, scripts/db-baseline.ts, db/migrations/0002_p0_hardening.sql, db/migrations/meta/_journal.json, db/schema/*, tests/integration/migration-hardening.test.ts, tests/unit/migration-safety.test.ts.
**Interfaces:** assertMigrationEnvironment(env): void; verify/adopt baseline solo en entorno no productivo explícito; script db:baseline.
- [x] RED: rechazar producción, URL ausente, esquema sin ledger, ledger divergente; base vacía permitida.
- [x] Implementar guard con cierre de pool en finally y mensajes sin credenciales.
- [x] Baseline bajo advisory lock: verificar esquema de referencia 0000/0001 antes de registrar hashes; nunca reaplicar DDL.
- [x] Migración aditiva: RLS, REVOKE presentes/futuros, roles siii_app/siii_migrator; CHECK vocabularios/periodos, fechas date con validación previa de hora, índices tenant/campus principal.
- [x] Añadir last_seen_at y throttle persistente; datos de auditoría antes/después JSON.
- [x] GREEN: migrar vacío y baseline sintético, segunda ejecución sin cambios, SELECT/INSERT anon denegados, app DML permitido/DDL denegado, restricciones rechazadas.

## Task 3: Dependencias y pool
**Files:** package.json, package-lock.json, src/infrastructure/database/index.ts, src/shared/logging/index.ts, tests/unit/database-config.test.ts.
**Interfaces:** poolOptions(env), pool.on(error), logger con redacción.
- [x] RED: pool tiene límites/timeouts y logging no expone secretos.
- [x] Actualizar drizzle-orm >=0.45.2; eliminar dependencias sin uso y docs:openapi roto; resolver advisories sin downgrade ni audit fix --force.
- [x] Separar pino-pretty de producción; fijar versiones resueltas y validar lockfile.
- [x] GREEN: npm ci, unit, typecheck y audit.

## Task 4: Contexto HTTP y auditoría
**Files:** src/middleware.ts, src/shared/http/request-context.ts, src/shared/http/security.ts, src/shared/auth/guards.ts, rutas sensibles, tests/unit/http-security.test.ts.
**Interfaces:** requestId(headers): string; audit(tx,input): Promise<void>; CSP por nonce.
- [x] RED: ID externo reemplazado en middleware, CSP/frame/HSTS/referrer, CSRF cross-site denegado, errores sin trazas.
- [x] Implementar nonce/headers para páginas y API, sin cachear contenido autenticado; desarrollo compatible con HMR.
- [x] Propagar request_id al log y a cada evento sensible.
- [x] GREEN: tests HTTP, cabeceras reales y navegación/login.

## Task 5: Login, contraseña y sesión
**Files:** src/shared/auth/password.ts, src/shared/auth/throttle.ts, src/shared/auth/session.ts, src/shared/auth/validation.ts, rutas auth, worker/index.ts, scripts/bootstrap-admin.ts, tests/integration/auth-handlers.test.ts.
**Interfaces:** hashPassword/verifyPassword; throttle por IP y cuenta; sesión absoluta 7 días e inactividad 30 min, máximo 5 sesiones activas.
- [x] RED: éxito/fallo/inexistente/bloqueado verifican Argon2; IP y cuenta limitan, bloqueo expira y reinicia contador, auditoría falla revierte.
- [x] Dummy hash Argon2id con memoryCost 65536, timeCost 3, parallelism 1; backoff máximo 60 min; transacciones serializan cuentas.
- [x] Cookie __Host-siii_session Secure en producción; nombre local si HTTP; rotación al cambiar contraseña y al modificar privilegios; sesiones anteriores revocadas.
- [x] Limpieza real de sesiones expiradas/revocadas y throttles vencidos, con modo una ejecución para scheduler.
- [x] GREEN: HTTP real con sesión expirada/revocada/inactiva, CSRF y políticas de contraseña; timing local y parámetros Argon2 comprobados; medición de runtime de destino pendiente en docs/BLOCKERS.md.

## Task 6: Registro académico y paginación
**Files:** src/modules/academic/catalog-registry.ts, catalog-validation.ts, catalog-state.ts, src/shared/http/pagination.ts, ruta academic, listados memberships/institutions, tests/integration/academic-handlers.test.ts, tests/unit/catalog-state.test.ts.
**Interfaces:** registro resource -> tabla/schemas/mapeo; cursor ligado a tenant/recurso con orden created_at/id; {data,page:{nextCursor}}.
- [x] RED: todos los recursos GET/POST/PATCH rechazan otro tenant, IDOR y mass assignment; fechas exactas y cursor determinista.
- [x] Un safeParse por operación y esquema central; estados permitidos por recurso y transiciones explícitas.
- [x] Bloquear archivar programa con planes activos en la misma transacción; PATCH audita antes/después y bloqueo de fila.
- [x] GREEN: tests de handler por recurso, paginación sin truncación, límites y cursor inválido.

## Task 7: Otros handlers institucionales
**Files:** validaciones centrales, rutas memberships/roles, tests/integration/institution-handlers.test.ts.
**Interfaces:** políticas vigentes de roles; auditoría compartida y revocación de sesiones al elevar/reducir privilegios.
- [x] RED: lectura/escritura/roles con tenant incorrecto, IDOR, sesión vencida y claves extra.
- [x] Centralizar Zod, request_id, antes/después; conservar contratos actuales (invitaciones solo P1).
- [x] GREEN: cada endpoint existente cubierto por prueba real de autorización.

## Task 8: UI existente accesible
**Files:** src/components/academic-catalog.tsx, formulario login/contraseña solo si necesita error específico, tests de navegador accesibilidad.
**Interfaces:** consumir page.nextCursor; solicitudes abortables, botones autorizados y errores estables.
- [x] Ajustar paginación visible y selección de programas recorriendo cursor; estado archivado terminal sin botón engañoso.
- [x] Errores conectados a campos, foco/teclado y recorrido de teclado de flujos existentes. Lector de pantalla manual pendiente en docs/BLOCKERS.md.
- [x] Verificar navegador y axe; no construir pantallas de P1/P8.

## Task 9: CI único y checks
**Files:** .github/workflows/verify.yml, eliminar foundation.yml, tsconfig.tsbuildinfo deja de estar trackeado, docs/operations/OPERATION_MATRIX.md.
- [x] CI con SHA verificados, concurrency/cancel-in-progress, npm ci --ignore-scripts y rebuild explícito de binarios necesarios.
- [x] Lockfile git diff --exit-code, lint, typecheck, unit, migración local vacía/baseline, handler integration, build, audit.
- [x] npm run typecheck; npm run lint; npm test; npm run test:integration; npm run build; npm audit.
- [x] Matriz: solo IMPLEMENTED donde la prueba real correspondiente pasó.

## Task 10: Cierre y revisión
**Files:** docs/implementation/P0_HARDENING.md, docs/audit/P0_REPORT.md, docs/BLOCKERS.md si aplica.
- [x] Documentar reversa sin destruir datos y promoción staging (producción fuera de esta ejecución).
- [ ] Revisión independiente, resolver hallazgos y volver a comprobar lo afectado.
- [x] Reporte sección 10: cambios, comandos/salidas, pendientes, riesgos, preguntas.
- [ ] Sin merge. P0 completa solo si sus criterios y DoD tienen evidencia real.
