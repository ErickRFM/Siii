# Siii — Prompt maestro de implementación (v2)

> **Referencia histórica, no estado actual (auditoría del 2026-10-19).**
> Este documento partió de `feat/sis-foundation@7070a46` el 2026-10-13. **El desarrollo actual parte exclusivamente del `main` remoto**. Los módulos y PRs han evolucionado: revisar `AGENTS.md`, `docs/implementation/SIII_UX_V3_PROGRESS.md` y el árbol actual antes de cada fase. No volver a implementar funciones fusionadas basándose en las secciones antiguas de este archivo. Verificar CI, permisos y base de datos reales para cada resultado.

Base auditada: `ErickRFM/Siii`, rama `feat/sis-foundation`, commit `7070a46` (2026-10-13).
Destino sugerido en el repo: `docs/agent/MASTER_PROMPT.md`. Añade a `AGENTS.md`: "Antes de cualquier tarea lee `docs/agent/MASTER_PROMPT.md`".

---

## 0. Cómo usarlo

**Prompt de arranque (pégalo tal cual a cada agente, cambiando solo la fase):**

> Eres un ingeniero senior trabajando en Siii. Lee completos `AGENTS.md` y `docs/agent/MASTER_PROMPT.md`. Tu tarea es **solo la fase P_ de la sección 9**. Rama: `feat/p_-<nombre>`. No toques nada fuera del alcance de la fase. Al terminar entrega el reporte de la sección 10 con evidencia (comandos y salidas reales). Si algo bloquea, escríbelo en `docs/BLOCKERS.md` y detente; no improvises ni inventes datos.

**Orden de ejecución**

| Orden | Fase | Paralelizable |
|---|---|---|
| 1 | P0 Endurecimiento y limpieza | No. Bloquea todo lo demás |
| 2 | P1 Autorización v2 y cuentas | No. Toca el núcleo de auth |
| 3 | P2 Personas y expedientes · P3 Planeación · P8a Sistema de diseño | Sí, ramas separadas (ver regla de migraciones, §4) |
| 4 | P4 Inscripciones | Después de P2 y P3 |
| 5 | P5 Evaluación y actas | Después de P4 |
| 6 | P6 Documentos oficiales | Después de P5 |
| 7 | P7 Integración con Compañero | Contratos desde P3; sincronización completa después de P5 |
| 8 | P8b UI por rol · P9 Cierre de producción | P8b sigue a cada backend; P9 al final |

No le pidas a un agente "termina todo" en un solo prompt: pierde contexto, mezcla migraciones y deja módulos a medias. Una fase = una rama = un PR pequeño.

---

## 1. Rol y misión

Construir Siii como **sistema oficial de operación universitaria multitenant**: control escolar inscribe y mantiene expedientes, coordinación programa grupos y horarios, docentes evalúan, administración supervisa, y todo con trazabilidad y permisos verificables en el servidor. Compañero (Android/iOS + API Ktor) consume la información oficial; **Siii es la fuente de verdad, Compañero ejecuta la experiencia diaria**. No puede haber dos sistemas controlando lo mismo.

Stack vigente: Next.js 15 (App Router) + TypeScript estricto, Drizzle ORM, PostgreSQL en Supabase vía `DATABASE_URL` (solo servidor), zod 4, argon2, vitest.

---

## 2. Estado real verificado (no asumas más ni menos)

**Existe y funciona** (typecheck, lint, 29 tests unitarios y `next build` pasan):
login con sesión por cookie, cambio de contraseña, membresías, roles con protección contra escalada, catálogos F3 (programas, materias, planes, periodos, campus), auditoría en transacción.

**Correcciones a la investigación UX previa** (estaba desactualizada):
- Sí existe `origin/main` y hay 5 PRs mergeados; F2 y F3 (catálogos) ya están en la rama. No es "solo F1".
- `.next` **no** está versionado; `tsconfig.tsbuildinfo` **sí** (`.gitignore:3` lo excluye pero está trackeado → `git rm --cached`).
- La investigación define perfiles que **no existen en el modelo**: no hay rol de **Control escolar** ni de **Facilitador/Tallerista** (`src/shared/auth/roles.ts:1` solo tiene student, workshop_participant, teacher_pending, teacher, tutor, coordinator, admin, super_admin).
- La matriz de permisos (`roles.ts:3-12`) solo cubre 10 permisos; no hay ninguno para expedientes, inscripciones, horarios, publicar actas ni documentos.

**Deuda abierta de la auditoría (se resuelve en P0):**
- Tablas de identidad (`platform_users` con `password_hash`, `auth_sessions`, `people` con email/teléfono, `security_audit_log`) creadas en `public` sin RLS; el `REVOKE` a `anon/authenticated` solo cubre las 3 tablas de `0001` (`0001:44-54`). Verificar grants reales en producción.
- `db/migrate.ts` sin guard; producción tiene `0000` aplicada fuera del journal de Drizzle.
- `drizzle-orm@0.44.7` con advisory alto (corregido en ≥0.45.2); `^0.44.5` no lo alcanza.
- Login: enumeración por timing (`login/route.ts:19-20`), lockout sin throttle por IP, contador que no se reinicia al expirar el bloqueo, sin auditoría de fallos.
- Pool de Postgres sin `error` handler ni timeouts (`src/infrastructure/database/index.ts:5-8`).
- Esquema con drift (CHECK de periodos solo en SQL), `level/modality` como `text` sin CHECK, fechas como `timestamp` + hack `T12:00:00Z`, `is_primary` sin índice único parcial.
- CI duplicado, sin lint ni audit, `git diff` del lockfile que nunca falla; tests de integración que reescriben la query en vez de probar los handlers.
- `security_audit_log.request_id` existe pero las rutas revisadas nunca lo llenan.

---

## 3. Invariantes (heredan de `AGENTS.md`; no se negocian)

1. **DENY BY DEFAULT.** Todo acceso se decide en el servidor por usuario + institución + permiso + recurso + estado. Ocultar un botón no es autorización.
2. Las claves de Supabase **nunca** llegan al navegador. El navegador no habla con tablas institucionales.
3. **Ninguna pantalla representa una acción sin endpoint real y prueba de flujo.** Los módulos sin backend muestran "En preparación". Cero datos inventados.
4. Toda operación sensible escribe auditoría **en la misma transacción**, con `request_id`, actor, institución, recurso y cambio (antes → después).
5. Cada fase entrega: esquema, migración, API, permisos, pruebas, UI accesible y documentación. Sin una de las seis, la fase no está terminada.
6. Nada de merge sin CI verde y revisión. No se cambia auth (F2) en dos ramas a la vez.
7. Nunca se ejecuta `db:migrate` contra producción ni se usan datos reales en desarrollo/CI.
8. Una calificación publicada no se edita en silencio: se **rectifica** con una nueva versión, motivo y aprobación.

---

## 4. Protocolo con varios agentes en paralelo

- Rama: `feat/pN-<nombre>`. Commits convencionales. Sin `push --force` sobre ramas compartidas.
- **Regla de migraciones:** solo un agente a la vez "posee" `db/migrations`. Numeración secuencial por orden de merge; si dos ramas crean `0002`, la segunda en mergear renumera y revalida contra una base limpia **y** contra una base "baseline de producción".
- Cada migración: aditiva, con plan de reversa documentado, probada en base vacía y en base con datos de prueba.
- `ALTER TYPE … ADD VALUE` (p. ej. nuevos roles) va en su **propia migración**: el valor nuevo no puede usarse en la misma transacción.
- Actualiza `docs/operations/OPERATION_MATRIX.md` por cada operación nueva, con evidencia real (archivo + test). Una fila sin prueba se queda en `PARTIAL`.
- Si dos fases necesitan tocar el mismo archivo, la segunda reconcilia sobre la rama ya mergeada; no resuelves conflictos "a ojo".
- Antes de pedir revisión: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run build`.

---

## 5. Perfiles y permisos v2

### 5.1 Roles (añadir los dos faltantes)

`student`, `workshop_participant`, `workshop_facilitator` (nuevo), `teacher_pending`, `teacher`, `tutor`, `control_escolar` (nuevo), `coordinator`, `admin`, `super_admin`.

`teacher_pending` es un estado con flujo de aprobación, no un permiso permanente: define quién aprueba, caducidad y auditoría.

### 5.2 Modelo de autorización: RBAC + alcance + relación

Una decisión = `can(actor, acción, recurso, contexto)`. Un único módulo (`src/shared/auth/policy.ts`) la implementa; **ninguna ruta** compara roles a mano.

1. **Permiso por rol** (catálogo abajo).
2. **Alcance** en `role_assignments`: `scope_type` (`institution | campus | program | section`) + `scope_id`. Un coordinador de un programa no ve otro programa.
3. **Relación**: docente solo sobre secciones que imparte; tutor solo sobre alumnos asignados; alumno solo sobre su propio expediente.
4. **Grants temporales** con `expires_at` (facilitadores de taller). Expirado = denegado, sin tarea de limpieza que dependa de un cron.
5. **Step-up**: acciones críticas (publicar acta, rectificar, asignar `admin`, emitir documento oficial, exportar auditoría) piden reautenticación reciente (≤ 10 min).
6. **Doble control** para rectificar calificaciones ya publicadas: quien solicita ≠ quien aprueba.

### 5.3 Catálogo de permisos (nombres consistentes con los actuales)

`institutions.read/manage` · `users.read/manage` · `memberships.manage` · `roles.assign` · `audit.read/export` · `academic.read/manage` · `students.read` · `students.write` · `students.sensitive.read` (CURP, domicilio, datos médicos) · `enrollments.read/manage/override` · `sections.read/manage` · `schedules.read/manage/publish` · `grades.read` · `grades.draft` · `grades.publish` · `grades.correct.request/approve` · `documents.read/issue` · `tutoring.read/manage` · `workshops.read/manage` · `integrations.read/manage` · `imports.run`.

### 5.4 Matriz inicial por perfil

| Perfil | Pantalla principal | Operaciones prioritarias | Alcance típico |
|---|---|---|---|
| super_admin | Plataforma | Instituciones, seguridad, auditoría global | Plataforma |
| admin | Operación institucional | Usuarios, periodos, políticas, reportes, integraciones | Institución |
| control_escolar | Gestión escolar | Expedientes, matrícula, inscripciones, bajas, documentos | Institución / campus |
| coordinator | Planeación académica | Secciones, docentes, aulas, horarios, conflictos | Programa |
| teacher | Mis grupos | Listas, captura, borradores, publicación de actas propias | Secciones propias |
| tutor | Seguimiento | Alumnos asignados, citas, alertas | Alumnos asignados |
| student | Mi trayectoria | Horario, inscripción, calificaciones oficiales, documentos | Propio |
| workshop_facilitator | Taller asignado | Sesiones, participantes | Taller + vigencia |
| workshop_participant | Mis talleres | Consulta | Propio |

Esta tabla es el **punto de partida**: P1 debe convertirla en una matriz ejecutable (tests de tabla: cada celda permitida **y** cada celda denegada).

---

## 6. Dominio y máquinas de estado

Entidades: `person` → `student_record` (expediente) → `program_enrollment` (matrícula) → `section` (grupo) → `section_enrollment` (inscripción a grupo) → `schedule_occurrence` → `assessment` → `grade_draft` → `grade_record` (versionado) → `acta`. Aparte: `document_issuance`, `tutor_assignment`, `workshop`, `outbox_event`.

Estados (transiciones explícitas, validadas en servidor, auditadas; transición no listada = error):

- **Inscripción a grupo:** `draft → confirmed → (dropped | completed)`. Confirmar es transaccional: cupo, prerrequisitos, conflicto de horario y estatus del alumno se revalidan dentro de la transacción.
- **Horario:** `draft → published → changed`. Publicar genera evento hacia Compañero.
- **Calificación:** `draft → validated → published → corrected(vN)`. Lo publicado es inmutable; corregir crea la versión N+1 con motivo y aprobador.
- **Acta:** `open → closed → rectified`.
- **Catálogos:** define qué transiciones de `status` son legales por recurso (no todos admiten `suspended`) y bloquea archivar un programa con planes o grupos activos.

Reglas de datos: fechas de calendario como `date`; `timestamptz` para instantes; enums o CHECK en la base para cada vocabulario cerrado; todo recurso lleva `institution_id` y se enlaza con FK compuesta `(id, institution_id)` para que la base rechace cruces entre tenants aunque falle la API.

---

## 7. Seguridad (obligatoria antes de cualquier dato real)

**Datos y base**
- RLS `deny-all` y `REVOKE` a `anon/authenticated` en **todas** las tablas de `public`, más `ALTER DEFAULT PRIVILEGES … REVOKE` para las futuras.
- Dos roles de base: `siii_migrator` (DDL) y `siii_app` (solo DML necesario). La app no usa el superusuario.
- Pool con `pool.on('error')`, `connectionTimeoutMillis`, `idleTimeoutMillis`, tamaño pensado para el pooler de Supabase y entorno serverless.
- PII sensible (CURP, domicilio, datos médicos): columnas separadas, permiso `students.sensitive.read`, y cifrado a nivel de aplicación si el análisis de riesgo lo exige. Revisa con asesoría legal el marco aplicable de protección de datos personales (según sea institución pública o privada) y define retención, acceso y derechos ARCO.

**Autenticación y sesiones**
- Login: verificar siempre contra un hash dummy (sin enumeración por timing); throttle por IP **y** por cuenta; reiniciar contador tras éxito y al expirar el bloqueo; bloqueo con backoff; auditar fallos, bloqueos, logout y cambios de contraseña.
- Parámetros de argon2id explícitos y documentados, medidos en el runtime de despliegue.
- Cookie `__Host-` con `Secure`, `HttpOnly`, `SameSite=Lax`; expiración absoluta **e inactividad**; rotación al elevar privilegios; límite de sesiones por usuario; job de limpieza de sesiones vencidas (el `worker/` hoy es un stub).
- Cambio de contraseña con el mismo throttle que el login y `argon2.verify` con manejo de errores.
- MFA (TOTP) obligatorio para `super_admin`, `admin` y `control_escolar`; códigos de recuperación de un solo uso.
- Altas por **invitación con token de un solo uso y caducidad**, no por "agregar cualquier UUID global" (`memberships/route.ts:26-29`). Endpoint de desactivación de usuario y flujo de recuperación.
- Pantalla de sesiones activas con revocación por dispositivo.

**HTTP**
- Cabeceras: CSP con nonce, `frame-ancestors 'none'`, HSTS, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`. Hoy `next.config.mjs` no define ninguna.
- Misma validación zod en **todas** las rutas, sin segundo esquema inline; respuestas de error con códigos estables, sin trazas.
- Paginación con cursor y orden determinista en todos los listados; ningún `limit` silencioso.
- Subidas/importaciones: límite de tamaño y de filas, validación estricta, procesamiento aislado. Empieza con CSV; no agregues parsers de Excel hasta revisar su superficie de ataque.

**Operación**
- Logs estructurados (pino) con `request_id`, sin PII ni secretos. `request_id` se genera en middleware y llega a la auditoría.
- Eliminar dependencias sin uso (`bcryptjs`, `jose`, `nanoid`, `@neondatabase/serverless`, `pino-pretty` de producción, `@vitest/ui`) o usarlas con motivo (p. ej. `jose` para firmar el servicio hacia Ktor).
- `npm audit` y verificación del lockfile en CI, con acciones fijadas por SHA.

---

## 8. UI, UX y animaciones

### 8.1 Principios
- **Una plataforma, no ocho apps:** workspace por rol e institución activa, con `InstitutionContextSwitcher` (institución · campus · periodo). El menú sale de `auth/me`; la autorización real sigue en el servidor.
- **Orientada a tareas:** la portada de cada rol es una **Bandeja de trabajo** (pendientes, conflictos, acciones autorizadas), no una pared de cifras.
- **Revisar antes de confirmar:** toda operación masiva o irreversible pasa por `OperationReview` (qué cambia, a quién afecta, simulación sin escribir) y entrega comprobante.
- **Distinguir lo informativo de lo oficial:** un documento oficial lleva folio, fecha, emisor y verificación; una consulta no.
- **Estados honestos:** cada vista implementa `cargando · vacío · error · sin permiso · desactualizado · sin conexión`. Nunca datos de relleno.
- Desktop-first para operación administrativa, responsive real para alumno/docente. Español (es-MX) con textos centralizados (preparado para i18n). Atajos de teclado y paleta de comandos para control escolar.

### 8.2 Sistema visual
- Tokens en CSS variables: color institucional **configurable por tenant**, claro/oscuro, escala tipográfica, espaciado, radios, sombras, z-index. Estados semánticos que **no dependen solo del color** (icono + texto).
- Densidad **compacta/cómoda** para tablas. Sin glassmorphism sobre tablas ni formularios de notas.

### 8.3 Biblioteca de componentes (con estados y pruebas de teclado)
`InstitutionContextSwitcher`, `WorkQueue`, `AcademicDataTable` (filtrar, ordenar, paginar por cursor, selección, exportar), `StudentRecordWorkspace`, `AcademicScheduleGrid` (lunes–sábado, 07:00–20:00, excepciones y contraturnos), `ConflictResolutionPanel` (qué recurso choca y qué alternativas existen), `GradebookGrid`, `OperationReview`, `AuditTimeline`, `IntegrationHealth`, `ImportWizard`, `PermissionGate` (solo presentación; no sustituye al servidor).

Tablas editables: navegación por teclado según el patrón *grid* de WAI-ARIA, guardado como borrador con control de versión optimista. Calendarios: evalúa FullCalendar considerando que las vistas por recursos son de pago; alternativa, un grid propio.

### 8.4 Accesibilidad (WCAG 2.2 AA, verificable)
Contraste ≥ 4.5:1; foco visible y **no oculto por barras fijas** (2.4.11); objetivos táctiles ≥ 24×24 px (2.5.8); no pedir dos veces datos ya capturados (3.3.7); **autenticación accesible**: permitir pegar y gestores de contraseñas (3.3.8); errores asociados a su campo con instrucción de corrección; confirmaciones en acciones importantes; `skip link`; pruebas automáticas (axe) **y** recorrido manual con teclado y lector de pantalla por flujo.

### 8.5 Movimiento (con propósito, medible)
Tokens: `micro 120 ms`, `base 200 ms`, `panel 300 ms`, nada > 400 ms; curva estándar `cubic-bezier(0.2, 0, 0, 1)`; escalonado ≤ 40 ms y máximo 6 elementos.

| Sí animar | No animar |
|---|---|
| Transición de ruta y paneles laterales (fade + desplazamiento corto) | Celdas del `GradebookGrid` al editar (solo anillo de foco) |
| Skeletons de carga | Tablas densas al ordenar/filtrar |
| Confirmación de éxito (sello breve) tras publicar/confirmar | Bucles decorativos o autoplay |
| Un pulso único en el conflicto detectado, con texto equivalente | Cualquier movimiento que oculte un error |

Reglas: solo `transform` y `opacity`; respeta `prefers-reduced-motion` (sustituir por cambio instantáneo o fade mínimo); presupuesto de rendimiento (sin layout thrash, INP razonable en tablas de 500 filas). Preferir CSS/View Transitions; añadir una librería de animación solo si un caso real lo justifica y documentando el costo en bundle.

### 8.6 Habilitación
Un control de alta, baja, publicación o sincronización se activa **solo** cuando existen endpoint, scope validado y prueba de flujo (invariante 3).

---

## 9. Fases

Cada fase: **Objetivo · Alcance · Entregables · Criterios de aceptación · Fuera de alcance**. Todas cierran con la sección 10.

### P0 — Endurecimiento y limpieza (bloqueante)
**Objetivo:** que la base sea segura de verdad antes de sumar dominio.
**Alcance:**
1. Verificar grants/RLS reales en producción (consultas a `information_schema.role_table_grants` y `pg_class.relrowsecurity`) y migración que aplique `REVOKE` + RLS deny-all a todo `public` + `ALTER DEFAULT PRIVILEGES`.
2. Baseline del ledger de Drizzle y guard en `db/migrate.ts` (se niega si hay esquema sin journal).
3. Subir `drizzle-orm` a una versión corregida; limpiar dependencias muertas; arreglar o eliminar `docs:openapi`.
4. Login/sesión/contraseña según §7 (dummy hash, throttle IP+cuenta, reinicio de contador, auditoría completa, cookie `__Host-`, inactividad, limpieza por job).
5. Pool de Postgres (§7), middleware de `request_id` y escritura del `request_id` en auditoría.
6. Esquema: CHECK de periodos en el schema de Drizzle, `level/modality` como enum/CHECK, `date` para periodos, índice único parcial de campus principal, `UNIQUE(id, institution_id)` en campus/periodos/materias, reglas de transición de `status`.
7. Refactor de `academic/[resource]/route.ts` a un **registro de recursos** (`{tabla, esquemaCrear, esquemaActualizar, mapeo}`) sin bloques duplicados ni segundo `.parse`; paginación con cursor; audit de PATCH con antes → después.
8. Cabeceras de seguridad y CSP.
9. CI único: install con `--ignore-scripts` cuando aplique, lockfile con `--exit-code`, lint, typecheck, unit, integración sobre Postgres, build, `npm audit`, concurrencia con cancelación, acciones por SHA. `git rm --cached tsconfig.tsbuildinfo`.
10. Pruebas de **handlers** (no solo políticas): login (éxito, bloqueo, expiración), CSRF, sesión expirada/revocada, aislamiento de tenant por endpoint, IDOR, *mass assignment*.
**Aceptación:** las consultas de grants/RLS no devuelven acceso de `anon/authenticated`; el test de timing de login no distingue usuario inexistente; CI único en verde con todos los pasos; ningún endpoint sin test de tenant.
**Fuera de alcance:** módulos nuevos de dominio.

### P1 — Autorización v2 y cuentas
**Alcance:** roles `control_escolar` y `workshop_facilitator` (migración propia); `policy.ts` con `can(...)`; alcance (`scope_type/scope_id`) y grants temporales en `role_assignments`; catálogo de permisos §5.3; step-up de reautenticación; MFA TOTP; invitaciones por token; recuperación de cuenta; desactivación de usuario; vista de sesiones y revocación; visor de auditoría con filtros y exportación (con permiso y step-up).
**Aceptación:** matriz ejecutable que prueba **cada** celda rol×permiso×alcance (permitidas y denegadas); ninguna ruta compara roles directamente (lint o test que lo detecte); no existe alta de membresía por UUID suelto.

### P2 — Personas y expedientes (control escolar)
**Alcance:** `person`, `student_record`, `program_enrollment`, `tutor_assignment`; alta guiada que impide expedientes incompletos; búsqueda; historial; estados (`activo`, `baja temporal`, `baja definitiva`, `egresado`) con motivo; PII sensible separada; importación CSV con `ImportWizard` (validación previa, reporte de errores, nada se escribe hasta confirmar).
**Aceptación:** alumno solo ve su expediente; tutor solo el de sus asignados; toda lectura de PII sensible auditada; importación con 10 000 filas validada sin bloquear el servidor.

### P3 — Planeación académica
**Alcance:** `section`, aulas, docentes asignados, `schedule_occurrence` con recurrencias y excepciones; **motor de conflictos en servidor** (aula, docente, alumnos) determinista y explicable; publicar horario genera `outbox_event`; `AcademicScheduleGrid` y `ConflictResolutionPanel`.
**Aceptación:** mover una clase muestra el impacto **antes** de confirmar; un conflicto explica qué recurso está ocupado y propone alternativas; pruebas de colisión con casos límite (cambio de horario de verano, contraturno, clase que cruza medianoche).

### P4 — Inscripciones
**Alcance:** búsqueda de oferta, prerrequisitos, cupos, lista de espera, selección provisional, confirmación, bajas y cambios de grupo con motivo, comprobante.
**Aceptación:** confirmar es transaccional y **seguro bajo concurrencia** (prueba con N inscripciones simultáneas al último cupo: exactamente una gana); idempotencia por clave; auditoría completa.

### P5 — Evaluación y actas
**Alcance:** componentes y ponderaciones, `GradebookGrid` con borrador y versión optimista, validaciones (faltantes, fuera de escala, no inscritos, componentes incompletos), previsualización de acta, publicación (inmutable, versionada, step-up), rectificación con doble control, importación CSV.
**Aceptación:** nada aparece como publicado mientras esté pendiente; no hay edición silenciosa tras el cierre; el backend revalida autorización y estado académico al publicar.

### P6 — Documentos oficiales
**Alcance:** kárdex, boleta, constancias, historia académica; emisión con folio, hash y verificación pública mínima (confirma autenticidad sin exponer PII); PDF generado en servidor; etiqueta visible "Consulta informativa" vs "Documento oficial".
**Aceptación:** reemitir no altera el folio original; un documento revocado se verifica como revocado.

### P7 — Integración con Compañero (Ktor)
**Alcance:** patrón **outbox** transaccional (`outbox_event`: agregado, tipo, versión, payload, clave de idempotencia, estado, intentos, siguiente intento); eventos versionados (`enrollment.confirmed`, `schedule.published`, `grade.published`, `student.status_changed`); contrato OpenAPI único con tests de contrato **en ambos repos**; autenticación servicio-a-servicio firmada (rotación de claves con `kid`, marca de tiempo y *nonce* contra *replay*); sincronización por cursor (delta) con reintentos, cola de fallos y reproceso; `IntegrationHealth`.
**Aceptación:** reenviar el mismo evento no duplica efectos; una caída de Ktor no bloquea operaciones de Siii; el cambio de aula en Siii se refleja en Compañero tras la sincronización, con evidencia en prueba de extremo a extremo. No tocar la asistencia QR: sigue siendo de Compañero.

### P8 — Sistema de diseño y UI por rol
**P8a (antes de las pantallas de dominio):** tokens, componentes base de §8.3 con estados, modo claro/oscuro, configuración de color por tenant, tokens de movimiento, Storybook o equivalente, pruebas axe y de teclado por componente.
**P8b (después de cada backend):** workspaces por rol y `WorkQueue`, paleta de comandos, responsive real.
**Aceptación:** cada flujo cumple §8.4; revisión visual con regresión; ningún control activo sin backend (invariante 3).

### P9 — Cierre de producción
**Alcance:** pruebas de carga (inscripción masiva y publicación de actas), simulacro de restauración de respaldo, observabilidad y alertas, runbooks, checklist de seguridad (IDOR, CSRF, inyección, *rate limiting*, cabeceras, secretos), auditoría de accesibilidad completa, revisión de protección de datos, política de retención, plan de reversa de migraciones, criterios de salida a producción.
**Aceptación:** checklist firmado; restauración probada con tiempos medidos; cero hallazgos altos abiertos.

---

## 10. Definition of Done y reporte de fase

**Una fase está terminada solo si:**
- [ ] Esquema + migración aditiva probada en base vacía y en baseline.
- [ ] API con zod, política central, auditoría con `request_id` y pruebas de handler.
- [ ] Tests de aislamiento de tenant y de IDOR para cada endpoint nuevo.
- [ ] `OPERATION_MATRIX.md` actualizada con evidencia real.
- [ ] UI solo para lo que ya tiene backend; estados completos; accesibilidad verificada.
- [ ] Documentación y, si aplica, nota de despliegue.
- [ ] `typecheck`, `lint`, `test`, `test:integration`, `build` y `audit` en verde.

**Formato del reporte (obligatorio):**
1. Qué cambió (archivos y migraciones).
2. Evidencia: comandos ejecutados y su salida real.
3. Qué **no** se hizo y por qué.
4. Riesgos nuevos o deuda introducida.
5. Preguntas abiertas para el responsable.

---

## 11. Lo que no debes hacer

- No inventes endpoints, datos de ejemplo en producción ni métricas.
- No relajes un invariante "temporalmente" para que pase un test.
- No marques `IMPLEMENTED` sin prueba.
- No mezcles fases ni refactorices fuera del alcance.
- No guardes secretos, claves ni URLs de pooler en Git.
- No te declares "terminado" por compilar: termina cuando se cumple la sección 10.

## Nota incremental — 22 octubre 2026

SEC-03/SEC-06: PARCIAL. POST de convocatorias y dictámenes añade autoridad admissions.manage/MFA y auditoría en la transacción existente, con30 HTTP focales locales. Revisión independiente aprobada; CI e integración pendientes. Claim, finanzas y puertas productivas no se acreditan por este incremento. Ver `docs/audits/SIII_ADMISSIONS_WRITE_AUTHORITY_2026-10-22.md`. Se conserva el contexto histórico anterior.
