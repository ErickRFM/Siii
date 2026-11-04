# Auditoría consolidada SIII — 2026-11-03

**Ámbito:** cuatro frentes (rama V24/V25 vs `main`, arquitectura y seguridad, CI/pruebas/deuda, UI/UX y accesibilidad) + consolidación.
**Método:** 4 subagentes en paralelo (solo lectura) + verificación directa del auditor. Ninguna afirmación de subagente se dio por buena sin comprobación cuando era crítica o contradecía a otra.
**No se modificó código, no se ejecutaron migraciones, no se tocó base de datos ni red.**

---

## 0. Verificación dura ejecutada localmente

| Comprobación | Comando | Resultado |
|---|---|---|
| Tipos | `npm run typecheck` (`tsc --noEmit`) | Verde, sin salida de error |
| Lint | `npm run lint` (`eslint .`) | Verde |
| Pruebas unitarias | `npm test` | **87 archivos, 1060 pruebas, todas pasan**, exit 0 |
| Igualdad de contenido con main | `git rev-parse 'HEAD^{tree}'` / `'origin/main^{tree}'` | Ambos `a9148f4d703ae57503033b01bfebceb771b25db5` |
| Diff neto con main | `git diff --stat origin/main HEAD` | **Vacío** |
| Divergencia de commits | `git rev-list --count origin/main..HEAD` / `HEAD..origin/main` | **6 adelante / 1 atrás** |
| Migraciones con RLS | grep `ENABLE ROW LEVEL SECURITY\|AS RESTRICTIVE\|ALTER DEFAULT PRIVILEGES` | 120 coincidencias en 17 archivos |
| `!important` en CSS | grep `!important` en `src/**/*.css` | **432 en 15 archivos** (`sii-glass.css`: 151) |
| Función de política | grep `export function can(` | `src/shared/auth/capabilities.ts:109` (no existe `policy.ts`) |

**Corrección al contexto inicial:** la rama no está 8 commits por delante de `main`, sino **6 por delante y 1 por detrás** de `origin/main`. El "8" salía de comparar contra la `main` local, que está 3 commits desactualizada.

---

## 1. Frente A — Rama `codex/v24-companion-contract-20261031` vs `main`

### A1 · La rama no aporta cambio neto alguno — CRÍTICO (operativo)
`HEAD` (`705a3fc`) y `origin/main` (`7fe378f`) apuntan al **mismo árbol** (`a9148f4d…`); `git diff origin/main HEAD` está vacío. El trabajo V24/V25 ya está integrado en `main` mediante el PR #160 (`feat(companion): retain institutional attendance and class histories`), que es un squash del contenido de esta rama. `git merge-tree --write-tree origin/main HEAD` devuelve exit 0 sin conflictos.

→ Abrir un PR desde esta rama sería redundante y ensucia la trazabilidad de "qué falta realmente".

### A2 · Contradicción documental sobre el receptor fijado — ALTO
- `docs/audits/SIII_COMPANION_V24_CODE_2026-10-31.md:6` fija el receptor en `…Compa-ero-de-esc@a08244d…`.
- `.github/workflows/verify.yml:208` y `:266` fijan `c0ccd27b0eec9bd1a0f583be5e0b0fd484e8a00b`.
- `docs/audits/SIII_COMPANION_V25_RESULTS_2026-10-31.md:18` también dice `c0ccd27…`.

El doc V24 se contradice con el código y con el doc V25. Verificado con grep: `a08244d…` no aparece en el código, solo en V24.

### A3 · `main` local desactualizada — MEDIO
`main` local está 3 commits por detrás de `origin/main`.

### A4 · Migración 0027 — BAJO estructural / MEDIO por reversa
`db/migrations/0027_institutional_attendance_results.sql` existe, es aditiva, con `ENABLE`+`FORCE ROW LEVEL SECURITY`, `REVOKE ALL` a `PUBLIC, anon, authenticated, siii_app` y políticas restrictivas `deny_anon`/`deny_authenticated`. El journal (`meta/_journal.json`) es **idéntico** al de `origin/main`, con idx 0–27 contiguos, sin huecos ni colisiones. **No declara plan de reversa explícito.**

### A5 · Gates V24/V25 realmente presentes en el archivo de CI — VERIFICADO (config), NO VERIFICADO (ejecución)
`verify.yml` exige 7 suites nativas con `skipped=0` (historial 8, `SiiiChangeNotificationTest` 4), verifica inmutabilidad del receptor por `rev-parse HEAD` y árbol limpio, y fija Postgres 17 + `mongo:7.0.45@sha256:…`.
Los tres archivos de prueba citados existen: `tests/unit/personal-attendance-route.test.ts`, `tests/unit/attendance-view.test.ts`, `tests/integration/institutional-attendance-results.test.ts`.

### Afirmaciones de los docs NO acreditables
V24 (`:16`) y V25 (`:15-17`) afirman "ejecutados y aprobados" y conteos (1060 unitarias / 49 focalizadas / 9 PostgreSQL) **sin evidencia de ejecución en el repositorio**. Los 1060 unitarios sí los verifiqué yo localmente; las de integración contra base real **no**.

### NO VERIFICADO (frente A)
Ejecución real del CI y del gate de contrato; aplicación de la 0027; piloto; producción; FCM; dispositivos físicos; el SHA del receptor y la "cadena real de 39 casos" (repo externo `Compa-ero-de-esc`, sin fetch permitido).

---

## 2. Frente B — Arquitectura y seguridad

| # | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| B1 | RLS deny-all + `FORCE RLS` + `REVOKE` + `ALTER DEFAULT PRIVILEGES` extendidos a lo largo de las migraciones | 120 coincidencias en 17 archivos (`0002_p0_hardening.sql`, `0004`, `0015`, `0016`, `0027`…) | Crítico — **satisfecho en código** |
| B2 | La política central **no** está donde indica el MASTER_PROMPT §5.2 | `can()` en [capabilities.ts](file:///c:/proyectos/siii/src/shared/auth/capabilities.ts#L109-L115); `src/shared/auth/policy.ts` **no existe**. Las rutas usan `can(...)`; no encontré comparaciones de rol a mano salvo la validación de "último admin" | Medio (desviación de diseño) |
| B3 | Roles `control_escolar` y `workshop_facilitator` existen, con alcance (`scopeType/scopeId`) y grants temporales (`validUntil`) | [roles.ts](file:///c:/proyectos/siii/src/shared/auth/roles.ts#L1), `db/migrations/0007_p1_permission_scopes.sql` | Alto — satisfecho |
| B4 | Auditoría transaccional con `request_id` obligatorio | `audit()` en [request-context.ts](file:///c:/proyectos/siii/src/shared/http/request-context.ts) lanza `AUDIT_REQUEST_ID_REQUIRED`; `x-request-id` se genera en [middleware.ts](file:///c:/proyectos/siii/src/middleware.ts) | Alto — satisfecho |
| B5 | Cookie de sesión endurecida | [session-policy.ts](file:///c:/proyectos/siii/src/shared/auth/session-policy.ts#L1-L6): `__Host-siii_session` en producción, `httpOnly`, `secure` en prod, `sameSite=lax`, inactividad 30 min, límite 5 sesiones | Alto — satisfecho |
| B6 | CSP con nonce por request, HSTS en producción y cabeceras de seguridad | `src/middleware.ts` (CSP + `frame-ancestors 'none'`), `next.config.mjs` (HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) | Crítico — satisfecho |
| B7 | Anti-enumeración por timing y throttle por IP+cuenta con backoff | [password.ts](file:///c:/proyectos/siii/src/shared/auth/password.ts) (hash dummy), [throttle.ts](file:///c:/proyectos/siii/src/shared/auth/throttle.ts), `credential-flow.ts` | Crítico — satisfecho |
| B8 | `drizzle-orm@0.45.4` ≥ 0.45.2 (advisory histórico corregido) | `package.json` | Bajo — satisfecho |
| B9 | Invariante 3 en código de servidor: no hay controles fantasma detectables | Solo 2 coincidencias de "en preparación", ambas ramas de estado controladas (`academic-setup-checklist.tsx:42`, `grade-corrections.tsx:71` con `!payload.available`) | Bajo |

### NO VERIFICADO (frente B)
Estado real de RLS/grants en Supabase de producción (`information_schema.role_table_grants`, `pg_class.relrowsecurity`, `pg_policy`); HSTS efectivo en el despliegue. **El código no acredita el estado de producción.**

---

## 3. Frente C — CI, pruebas y deuda técnica

| # | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| C1 | Existe CI canónico `verify.yml` (jobs `verify`, `ui`, `companion-live-contract`) + 4 workflows especializados sin duplicación. Actions fijadas por SHA; `concurrency` con `cancel-in-progress` | `.github/workflows/` | Bajo — satisfecho |
| C2 | El CI **sí** ejecuta audit y verificación de lockfile | `verify.yml:46` `git diff --exit-code -- package-lock.json`; `:72` `npm audit --audit-level=high` | — (corrección, ver abajo) |
| C3 | Pruebas de **handler reales** (no queries reescritas) | `tests/integration/http-handlers.test.ts` levanta servidor Next real y cubre login, tenant, IDOR, mass assignment, CSRF, sesión expirada, timing | Alto — satisfecho |
| C4 | Guard anti-drift en migrate + pruebas de seguridad de migración | `db/migrate.ts` (`assertMigrationLedger`), `tests/unit/migration-safety.test.ts` | Alto — satisfecho |
| C5 | Deuda de esquema del MASTER_PROMPT §2 **corregida** | [core.ts](file:///c:/proyectos/siii/db/schema/core.ts#L30-L50): `date` nativo (L39-L41), índice único parcial `campuses_one_primary_uidx` (L32), `UNIQUE(id, institution_id)` (L31,L48), checks de estado y fechas; checks de `level/modality` en `db/schema/academic.ts` | Medio — cerrado |
| C6 | No hay verificación automática de sincronía `db/schema` ↔ `db/migrations` en CI | `verify.yml` ejecuta `db:migrate` pero no un chequeo de drift tipo `drizzle-kit check` | Alto |
| C7 | `OPERATION_MATRIX.md` mezcla estados (`IMPLEMENTED` conviviendo con "CI PENDIENTE") | `docs/operations/OPERATION_MATRIX.md` | Medio (documental) |
| C8 | Cobertura de handler parcial en módulos nuevos (p. ej. grading/outbox) | ausencia de `tests/integration/grading-handler.test.ts` | Medio |

### Correcciones a afirmaciones de subagentes (refutadas por verificación directa)
1. **"El CI no ejecuta `npm audit`" → FALSO.** `verify.yml:72` lo ejecuta con `--audit-level=high`.
2. **"`worker/` es un stub" → FALSO.** `worker/index.ts` es un worker real que orquesta `runCleanup()` (sesiones) y `reconcileAttendanceResults()`; `worker/session-cleanup.ts` existe.

### NO VERIFICADO (frente C)
Ejecución de las suites de integración contra PostgreSQL real (`npm run test:integration`) y del job de contrato; resultados de `npm audit` sobre el árbol instalado.

---

## 4. Frente D — UI/UX y accesibilidad

| # | Hallazgo | Evidencia | Severidad |
|---|---|---|---|
| D1 | Deuda de cascada CSS: 432 `!important` en 15 archivos, con capas superpuestas | grep verificado; `sii-glass.css` concentra 151 | Alto |
| D2 | La biblioteca §8.3 está mayormente sin implementar **con esos nombres**: existen `SiiDataTable`, `SiiPageLayout`, `SiiPanel`, `SiiFilterBar` en [sii-institutional.tsx](file:///c:/proyectos/siii/src/components/ui/sii-institutional.tsx). No encuentro con esos nombres `WorkQueue`, `GradebookGrid`, `OperationReview`, `AuditTimeline`, `IntegrationHealth`, `ImportWizard`, `PermissionGate`, `ConflictResolutionPanel`, `AcademicScheduleGrid`, `StudentRecordWorkspace` | grep de los 12 nombres → solo 1 archivo | Alto |
| D3 | El "context switcher" de institución existe embebido, no como componente dedicado | `sii-app-shell.tsx` (única coincidencia de `switcher`/`institution-context`) | Medio |
| D4 | Tokens de movimiento de §8.5 no tokenizados (duraciones hardcodeadas) | grep de `120ms/200ms/300ms` no devuelve variables; valores dispersos | Medio |
| D5 | Estados honestos incompletos: hay carga/vacío/error/sin permiso; faltan `desactualizado` y `sin conexión` | `SiiAsyncState`/`SiiEmptyState` en `sii-institutional.tsx` | Medio |
| D6 | `prefers-reduced-motion` respetado y foco visible / skip link presentes | `sii-glass.css` (~20 ocurrencias), skip link en `layout.tsx` | Bajo — satisfecho |
| D7 | Regresión visual y accesibilidad existen pero la integración con CI no está confirmada; no hay Storybook | `tests/ui/approved-reference.spec.ts`, `tests/ui/p0-accessibility.spec.ts`; `docs/design/reference/` | Medio |

### Corrección a afirmación de subagente (refutada)
- **"Datos mock/placeholder en producción en `student-dashboard-metrics.ts`" → FALSO.** El archivo deriva todas las métricas de `snapshot` real y además marca recursos truncados como incompletos ([student-dashboard-metrics.ts](file:///c:/proyectos/siii/src/components/student-dashboard-metrics.ts#L1-L40)). No contiene datos de relleno.

### Limitación del frente D
La verificación es estática: contraste real, navegación por teclado, lectores de pantalla, INP/CLS y comportamiento en dispositivo requieren renderizar la app y **NO VERIFICADO**. La ausencia de un componente por nombre **no prueba** que la capacidad no exista bajo otra implementación; cada caso debe confirmarse por flujo.

---

## 5. Tabla consolidada por severidad

| Prioridad | ID | Hallazgo | Frente | Estado |
|---|---|---|---|---|
| P0 | A1 | Rama redundante: árbol idéntico a `origin/main` (trabajo ya en `main` vía #160) | Rama | Verificado |
| P0 | A2 | SHA de receptor contradictorio entre doc V24 (`a08244d`) y código/V25 (`c0ccd27`) | Rama/Docs | Verificado |
| P0 | A5 | CI/gate de contrato y migración 0027 **no** acreditados como ejecutados | Rama | No verificado |
| P0 | B1 | RLS/grants reales en Supabase producción sin comprobar | Seguridad | No verificado |
| P0 | A4 | Migración 0027 sin plan de reversa declarado | Rama | Verificado |
| P1 | C6 | Sin chequeo de drift `db/schema` ↔ `db/migrations` en CI | CI | Verificado |
| P1 | D1 | 432 `!important` y cascada CSS sin dueño claro | UI/UX | Verificado |
| P1 | D2 | Componentes §8.3 sin implementar con los nombres especificados | UI/UX | Verificado (estático) |
| P1 | B2 | `policy.ts` inexistente (`can()` en `capabilities.ts`) | Arquitectura | Verificado |
| P1 | C8 | Cobertura de handler parcial en módulos nuevos | Pruebas | Verificado |
| P2 | C7 | `OPERATION_MATRIX.md` con estados duales | Docs | Verificado |
| P2 | D4 | Tokens de movimiento no tokenizados | UI/UX | Verificado |
| P2 | D5 | Faltan estados `desactualizado` / `sin conexión` | UI/UX | Verificado |
| P2 | D7 | Sin Storybook; regresión visual/axe sin integración CI confirmada | UI/UX | Parcial |

---

## 6. Plan P0 / P1 / P2 (con criterios verificables)

### P0 — Bloqueante
1. **Cerrar la redundancia de rama.** No abrir PR desde `codex/v24-companion-contract-20261031`; confirmar y archivar.
   *Criterio:* `git diff origin/main HEAD` vacío y sin PR pendiente desde esa rama.
2. **Unificar el SHA del receptor.** Corregir el doc V24 para que cite `c0ccd27…` y declarar ahí la fuente única de verdad.
   *Criterio:* `grep a08244d` sin resultados en el repo.
3. **Acreditar la ejecución del CI y del gate de contrato** del SHA final.
   *Criterio:* run de `verify.yml` en verde con el artefacto del gate de 7 suites adjunto.
4. **Verificar RLS/grants reales en el entorno gestionado** antes de cualquier activación.
   *Criterio:* consulta a `pg_class.relrowsecurity`/`role_table_grants` sin acceso de `anon`/`authenticated`.
5. **Aplicar la migración 0027 por el proceso autorizado y documentar su reversa.**
   *Criterio:* journal aplicado + prueba de reversa en base limpia y baseline.
6. **Eliminar afirmaciones sin evidencia** en V24/V25 ("ejecutados y aprobados").
   *Criterio:* cada resultado remite a comando/artefacto real o queda como PENDIENTE.

### P1 — Alto
7. Añadir al CI un chequeo de drift `db/schema` ↔ `db/migrations`.
8. Reducir `!important` con objetivo medible por archivo, empezando por `sii-glass.css` (151), sin alterar comportamiento.
9. Completar la biblioteca §8.3 o degradar el alcance documentado; verificar por flujo qué capacidades ya existen bajo otros nombres.
10. Alinear nomenclatura de política (`policy.ts`/`capabilities.ts`) o documentar la desviación para no romper contratos.
11. Añadir pruebas de handler para grading/outbox y endpoints sin cobertura de tenant/IDOR.

### P2 — Medio
12. Unificar estados en `OPERATION_MATRIX.md` (`PARTIAL` para local-sin-CI).
13. Tokenizar duraciones de movimiento (micro/base/panel) en variables CSS.
14. Implementar estados `desactualizado` y `sin conexión` con textos localizados.
15. Evaluar Storybook y conectar regresión visual/axe al CI.

---

## 7. Hecho / Verificado / Pendiente / Bloqueado

**Hecho**
- Auditoría de los 4 frentes con subagentes en paralelo y verificación directa de los puntos críticos.
- Consolidación en este documento.

**Verificado (evidencia local)**
- `typecheck`, `lint` y `npm test` en verde (1060 pruebas, 87 archivos).
- `HEAD` y `origin/main` comparten árbol `a9148f4d…`; diff neto vacío; rama redundante.
- Rama 6 adelante / 1 atrás; `main` local 3 atrás.
- 0027 aditiva con RLS/REVOKE y journal idx 27 sin huecos; sin plan de reversa.
- `verify.yml` ejecuta lockfile `--exit-code`, lint, typecheck, unit, integración, build y `npm audit --audit-level=high`; acciones por SHA; gate de 7 suites.
- Deuda de esquema del §2 corregida; RLS extendida; cookie `__Host-`, CSP y auditoría con `request_id` presentes; `can()` en `capabilities.ts`.
- 432 `!important` en 15 archivos CSS.
- Refutadas 3 afirmaciones de subagentes (audit ausente en CI; worker stub; datos mock en el dashboard).

**Pendiente (a cargo del responsable)**
- Ejecutar CI, gate de contrato, integración contra Postgres, migración, piloto y producción.
- Verificar RLS/grants y cabeceras en el entorno desplegado.

**Bloqueado**
- Verificación del receptor `c0ccd27…`/cadena real: repo externo `Compa-ero-de-esc`, sin fetch permitido.

---

*Documento generado en modo auditoría. No modifica código, esquema ni despliegues.*

---

## 8. Ejecución de hallazgos (2026-11-03)

### BLOQUE 1 — Git y consolidación

- `git fetch --all --prune` ejecutado. `HEAD` = `origin/main` = `1d7d799`; árbol idéntico.
- Rama `codex/v24-companion-contract-20261031` cerrada de forma segura: árbol igual a `main` (trabajo ya integrado vía #160), sin commits exclusivos. Rama local y remota eliminadas; sin PR abierto desde esa rama.
- No se generó PR sin cambios funcionales desde esa rama.

### BLOQUE 2 — Contrato SIII ↔ Compañero

- Discrepancia resuelta: `a08244d…` quedó **superado** por `c0ccd27…` (compare API `a08244d...c0ccd27`: `ahead_by 7`, `behind_by 0`). El SHA canónico es `c0ccd27b0eec9bd1a0f583be5e0b0fd484e8a00b`.
- Documento V24 corregido para citar `c0ccd27…`; fuente única de verdad declarada en `.github/workflows/verify.yml`.
- Compatibilidad HMAC verificada en código: `v1=[0-9a-f]{64}`, `HMAC-SHA256`, `timingSafeEqual`, `x-integration-key-id`/`x-integration-signature`, contratos versionados `siii.attendance_archive.v1` / `siii.attendance_history.v1`. Sin incompatibilidad real detectable.

### BLOQUE 3 — CI completo

- CI de `main` **verde** en el SHA desplegado `1d7d799`: run `verify.yml` `41586201078`, jobs `verify`, `ui` y `Companion live contract` en `success`.
- Gate de contrato con las **7 suites nativas**: `1,1,9,11,5,8,4` (39 casos), `failures=0 errors=0 skipped=0`; artefacto `companion-live-contract` adjunto (no expirado).
- `verify.yml` conserva `npm audit --audit-level=high` y la verificación de lockfile; no se debilitó ninguna prueba.

### BLOQUE 4 — Supabase y migración 0027

- Evidencia **local**: 0027 existe, es aditiva, journal contiguo `idx 0..27`, `npm run db:drift` verde.
- Runbook creado: [SIII_MIGRATION_0027_RUNBOOK.md](file:///c:/proyectos/siii/docs/operations/SIII_MIGRATION_0027_RUNBOOK.md) con respaldo, aplicación autorizada, verificación RLS/grants, reversa, recuperación y criterios de aceptación.
- **NO VERIFICADO en producción:** sin `DATABASE_URL` en el entorno no se ejecutó `pilot:db:gate` ni `db:migrate`. No se realizó ninguna acción destructiva ni irreversible. Acreditación pendiente de credencial autorizada.

### BLOQUE 5 — Consolidación

- **P1 #7 (C6) implementado:** gate determinista `npm run db:drift` (`scripts/schema-migration-drift.ts`) que verifica que toda `pgTable` de `db/schema` tenga `CREATE TABLE` en migraciones, journal contiguo y alineación `.sql`↔journal. Añadido al job `verify` del CI con prueba de regresión `tests/unit/schema-migration-drift.test.ts`.
- **P1 #10 (B2) corregido:** `MASTER_PROMPT` §5.2 apunta ahora a `src/shared/auth/capabilities.ts` (el `policy.ts` citado nunca existió).
- **P0 #6 atendido:** V24/V25 llevan sección de "Estado de evidencia verificable" que remite a artefactos reales y marca lo no ejecutado como PENDIENTE.
- **Fijado el gate de drift:** se confirmó que `drizzle-kit generate` produce un falso positivo masivo (no hay snapshots versionados), por lo que no se usó como gate.
- **Fuera de alcance por no ser bloqueantes de seguridad/despliegue/integridad:** D1 (432 `!important`), D2 (§8.3 sin nombres), C8 (cobertura parcial de handler). Requieren verificación visual/e2e y no se tocaron para no introducir regresiones sin certificación.
