# Consolidación 2026-10-15 — estado verificado

Las filas heredadas que siguen describen sus ramas originales. La promoción integral permanece PARTIAL; evidencia vigente en [SII_CONSOLIDATION_REPORT](../audit/SII_CONSOLIDATION_REPORT.md).

| Operación integrada | Estado | Evidencia |
|---|---|---|
| RLS/runtime18 tablas académicas | LOCAL_VERIFIED | tests/integration/consolidation.test.ts |
| Libro docente y administración institucional | LOCAL_VERIFIED | consolidation-http.test.ts; consolidated-modules.spec.ts |
| Inscripción concurrente, actas y congelación de roster | LOCAL_VERIFIED | consolidation-http.test.ts |
| Colisiones al inscribir/asignar y entre periodos | LOCAL_VERIFIED | consolidation-http.test.ts |
| Lectura sensible de tutoría auditada | LOCAL_VERIFIED / UI_PENDING | consolidation-http.test.ts |
| Compañero con suspensión institucional | LOCAL_VERIFIED / KTOR_E2E_PENDING | consolidation-http.test.ts |
| Formularios con catálogos paginados y navegación | LOCAL_VERIFIED | consolidated-modules.spec.ts; consolidated-navigation.test.ts |
| Perfil de migración managed y restauración | STAGING_VERIFIED / PRODUCTION_PENDING | release-profile.test.ts; baseline-recovery.test.ts; SII_MANAGED_RELEASE_RUNBOOK.md |
| Runtime mínimo y login/MFA/catálogo/auditoría cloud | STAGING_VERIFIED / VERCEL_PENDING | docs/audit/SII_STAGING_RUNTIME_PROOF.json; docs/audit/SII_STAGING_HTTP_PROOF.json |

---

# Matriz de operaciones — evidencia local P0/P1

Estado IMPLEMENTED se refiere al endpoint y a su prueba real local. No certifica promoción a producción, merge ni cierre de P0/P1; P1 se entrega en ramas dependientes. Las pruebas HTTP usan Next.js, PostgreSQL y un LOGIN separado sin DDL; solo fixtures sintéticos.

| ID | Operación / endpoint | Actor y alcance | Validación / transacción / auditoría | Evidencia | Estado |
|---|---|---|---|---|---|
| OP-001 | GET /api/health | Público; liveness | Sin datos institucionales | Setup HTTP real espera health | IMPLEMENTED |
| OP-002 | GET /api/ready | Público; readiness | Conexión y rol backend mínimo; sin detalles de DB | database-role.test.ts: propietario devuelve 503 | IMPLEMENTED |
| OP-003 | POST /api/v1/auth/login | Público; cuenta e IP | Zod estricto, Argon2id real/dummy, throttle, bloqueo y sesiones bajo transacción; auth.login/failed/locked/throttled | http-handlers.test.ts: éxito, inexistente, timing, lockout, concurrencia y cookie | IMPLEMENTED |
| OP-004 | POST /api/v1/auth/logout | Sesión propia | Origin, revocación transaccional y auth.logout | http-handlers.test.ts: logout revoca token | IMPLEMENTED |
| OP-005 | POST /api/v1/auth/password/change | Cuenta propia activa | Contraseña actual/nueva, sesión revalidada bajo bloqueo, rotación y auditoría | http-handlers.test.ts: cambio, CSRF, revocación concurrente y expiración | IMPLEMENTED |
| OP-006 | GET /api/v1/institutions | Membresías propias activas | Sesión, cursor estable; sin instituciones ajenas | http-handlers.test.ts: paginación/tenant; /auth/me restringe mustChangePassword | IMPLEMENTED |
| OP-007 | GET/POST /api/v1/institutions/:institutionId/memberships | users.read en el tenant; alta por consentimiento | GET con búsqueda/filtros/cursor y visibilidad vigente; POST por UUID devuelve INVITATION_REQUIRED, alta mediante F08 | permission-scopes.test.ts y user-management.test.ts: tenant, revalidación tras espera, filtros/cursores | IMPLEMENTED |
| OP-008 | POST /api/v1/institutions/:institutionId/roles/assign | roles.assign; política v1 | Actor/destino revalidados; sin self-grant; transacción, revocación de sesiones y role.assign | http-handlers.test.ts y auth-policy.test.ts | IMPLEMENTED |
| OP-009 | PATCH /api/v1/institutions/:institutionId/memberships/:membershipId | members.manage; política v1 | Scope, estado/razón, rol protegido, sin self-edit; transacción y antes/después | http-handlers.test.ts: tenant, IDOR, CSRF y revocación | IMPLEMENTED |
| OP-010 | POST /api/v1/institutions/:institutionId/roles/revoke | roles.assign; política v1 | Sin self-revoke, rol protegido; transacción, sesiones y role.revoke | http-handlers.test.ts y auth-policy.test.ts | IMPLEMENTED |
| OP-011 | GET /api/v1/institutions/:institutionId/academic/:resource | academic.read en institución | Registro de 5 recursos; cursor tenant/recurso, limit 1–100, precisión microsegundos | http-handlers.test.ts: todos los recursos, tenant, cursor inválido/empates | IMPLEMENTED |
| OP-012 | POST mismo endpoint académico | academic.manage en institución | Zod estricto, FK scoped, unicidad/fechas; transacción y academic.:resource.create | http-handlers.test.ts: 5 recursos, mass assignment, referencia ajena, rollback si falla auditoría | IMPLEMENTED |
| OP-013 | PATCH mismo endpoint académico | academic.manage en institución | UUID scoped, estados por recurso, archivo terminal y planes activos; transacción y antes/después | http-handlers.test.ts: 5 recursos, IDOR, transiciones; p0-accessibility.spec.ts: edición UI | IMPLEMENTED |
| OP-014 | GET /api/v1/auth/me | Sesión propia activa | Expiración absoluta/inactividad/revocación y revalidación después del bloqueo | http-handlers.test.ts: sesiones inválidas y expiración mientras espera | IMPLEMENTED |

Evidencia en tests/integration/, tests/unit/ y tests/ui/. Los estados reflejan verificaciones locales; el informe de fase registra CI, revisión y puertas pendientes.

## Capacidades P1 en ramas dependientes

Las filas anteriores conservan evidencia de P0; los contratos actuales incorporan capacidades por ámbito, MFA y concesiones vigentes de F07. Los endpoints sensibles revalidan autoridad tras locks. La promoción depende de BLOCKERS.md y del merge autorizado; IMPLEMENTED no significa COMPLETO según F13.

| ID | Operación / endpoint | Actor y alcance | Validación / transacción / auditoría | Evidencia | Estado |
|---|---|---|---|---|---|
| OP-015 | GET /api/v1/auth/mfa; POST subrutas enroll,verify,challenge,step-up,recovery/regenerate,revoke | Identidad propia; desafío restringido y factor real | Secretos cifrados, TOTP/recovery de un uso, anti-replay, lockout, sesiones/versiones y auditoría | mfa-security.test.ts, mfa-flows.spec.ts y mfa-enrollment-guidance.spec.ts; P1_MFA_REPORT.md y MFA_ENROLLMENT_GUIDANCE.md | IMPLEMENTED |
| OP-016 | GET /api/v1/institutions/:id/capabilities y gestión de roles | Concesiones vigentes, jerarquía y ámbito | No permisos del cliente ni grants superiores/extendidos; último admin permanente; invalidación y auditoría | permission-scopes.test.ts y permission-scopes.spec.ts; P1_SCOPES_REPORT.md | IMPLEMENTED |
| OP-017 | GET/POST /api/v1/institutions/:id/invitations; POST /:invitationId/resend y /revoke | invitations.manage institucional; MFA/step-up | Consentimiento, ámbito, TTL, tokenhash, cooldown/budget; autoridad revalidada y auditoría | invitations.test.ts e invitation-flows.spec.ts; P1_INVITATIONS_REPORT.md | IMPLEMENTED |
| OP-018 | POST /api/v1/invitations/preview,/accept,/reject | Destinatario con bearer válido y prueba propia cuando corresponde | Una vez, consentimiento y cuenta propia; sin elevación o resurrección de baja; token fuera de history/Flight/storage | invitations.test.ts e invitation-flows.spec.ts | IMPLEMENTED |
| OP-019 | Worker real de invitaciones | LOGIN sólo siii_app; transporte explícito | Outbox cifrado, payload/remitente congelados, leases/CAS e idempotencia | Regresiones de worker HTTP/DB; recepción externa/scheduler pendientes | IMPLEMENTED, EXTERNO PENDIENTE |
| OP-020 | GET memberships/:id y /history; PATCH /profile | users.read/update; perfil del tenant | Identidad global sólo lectura; whitelist, cursor, jerarquía, MFA, locks y evento/auditoría TX | user-management.test.ts y user-management.spec.ts | IMPLEMENTED |
| OP-021 | POST memberships/:id/lifecycle; PATCH legacy de estado | users.suspend/restore, jerarquía y último admin | Baja lógica revoca grants; rehabilitar no los restaura; sesiones/versiones y rollback de historial/auditoría | user-management.test.ts y user-management.spec.ts | IMPLEMENTED |
| OP-022 | POST memberships/:id/password-reset y POST /auth/password/reset/request | users.reset + step-up, o solicitud pública genérica | Sólo email global verificado; presupuesto compartido, anti-enumeración; sin enlace ni contraseña para admin | user-management.test.ts | IMPLEMENTED |
| OP-023 | POST /auth/password/reset/preview y /complete | Titular con bearer y MFA activo cuando aplica | Hash por propósito/request/usuario/authVersion, un uso/30min; contraseña elegida, invalidación y login posterior | user-management.test.ts y user-management.spec.ts | IMPLEMENTED |
| OP-024 | Worker real de recuperación | LOGIN sólo siii_app; keyring separado | Outbox cifrado, leases/CAS, idempotencia propia y límite de intentos/TTL | user-management.test.ts; recepción externa/scheduler pendientes | IMPLEMENTED, EXTERNO PENDIENTE |
| OP-025 | GET /api/v1/institutions/manageable y GET /:id/settings | Propio admin/super_admin institucional con MFA | Gestión propia independiente de unidad activa; no autoridad global; cursor por identidad y revalidación SQL | institution-admin.test.ts, suite dirigida26/26 | IMPLEMENTED |
| OP-026 | PATCH /api/v1/institutions/:id/settings y POST /:id/status | settings.manage/institutions.manage; step-up fresco | expectedVersion, archivo terminal, bloqueo ordenado y throw/rollback tras última espera; desactivar revoca invites/cancela leases | institution-admin.test.ts: concurrencia, estado y rollback | IMPLEMENTED |
| OP-027 | GET /api/v1/institutions/:id/audit | audit.read propio, MFA actual | Proyección explícita, actor sólo por membresía tenant, filtros/cursor y comprobación final de autorización | institution-admin.test.ts; año0000 corregido con negativos HTTP/unit y dos revisiones | IMPLEMENTED |

Interfaces reales: seguridad, catálogos, roles, invitaciones, usuarios y recuperación en sus rutas documentadas. Administración F09 tiene dos revisiones de fuente favorables y QA global local verde:682unitarias/243integraciones/40Chromium, build y audit0; CI del SHA publicado y merge se registran en el PR dependiente. Expedientes, matrículas, docentes/grupos/inscripciones/ocurrencias/calificaciones y sincronización Ktor completa siguen pendientes; sus pantallas no simulan operaciones.

## Ampliación2026-10-17 — preparación y expedientes

| Operación | Evidencia real | Estado |
|---|---|---|
| Preparación inicial de catálogos por ámbito | academic-setup-presence.test.ts; academic-initial-setup.spec.ts | PROBADO LOCALMENTE; INTEGRADO EN MAIN (PR35) |
| Retorno de MFA y revalidación de capacidades entre pestañas | security-return.test.ts; mfa-flows.spec.ts; permission-scopes.spec.ts | PROBADO LOCALMENTE; INTEGRADO EN MAIN (PR35) |
| GET registry/students y registry/teachers con cursor tenant/recurso | consolidation-http.test.ts: ambos recursos, más de200registros, empates/microsegundos, negativos | PROBADO LOCALMENTE; INTEGRADO EN MAIN (PR35) |
| Paginación UI y selectores completos de servicios | consolidated-modules.spec.ts:205alumnos/65docentes | PROBADO LOCALMENTE; INTEGRADO EN MAIN (PR35) |

El reporte FULL_INTEGRATION_PROGRESS.md separa integración en main, despliegue y validación productiva. No se introducen permisos nuevos en el cliente ni se altera la política MFA.

| ID | Operación | Actor y alcance | Persistencia y auditoría | Evidencia | Estado |
|---|---|---|---|---|---|
| OP-029 | PATCH registry/students o registry/teachers, kind=profile | academic.manage institucional; origen y autoridad revalidados | Bloqueo tenant+id, expected antes de escribir,409 contra pérdida de cambios; sólo nombre/apellidos/correo, auditoría antes/después en TX; identificadores y cuentas conservados | registry-profile-http.test.ts:8casos, consolidado API308 y16casosProduction; consolidated-modules.spec.ts: error/red/conflicto/foco/axe/recarga/logout-login; árbol final767unit/57UI | PROBADO LOCALMENTE, CI/PUBLICACIÓN PENDIENTES |

PR35 quedó integrado en `main` mediante `06166d90936fc939334a71ba600ec118c58b2586` con head revisado `4d87d61f83fa95b7869a7e0981a88f52a525804b`: 765 pruebas unitarias, 300 de integración y 54 de Chromium aprobadas; build/typecheck/lint correctos, audit 0 y Verify SIS SUCCESS en las ejecuciones `39073966596` y `39073970270`. La recuperación del mismo ámbito tras un error conserva el borrador; un ámbito confirmado distinto invalida guía, tabla y selector. Evidencia en `academic-initial-setup.spec.ts`, `permission-scopes.spec.ts` y `catalog-access-key.test.ts`.

## Secciones paginadas — incremento separado

| ID | Operación / endpoint | Actor y alcance | Validación | Evidencia real | Estado |
|---|---|---|---|---|---|
| OP-028 | GET /api/v1/institutions/:id/sections | academic.manage institucional vigente | Autoridad antes del cursor; filtro tenant, cursor tenant/recurso, limit 1–100, orden por microsegundos/UUID; POST/PATCH idénticos | sections-pagination-http.test.ts: 8/8; sections-pagination.spec.ts: 1/1, 205 filas/206 opciones en operaciones y horarios; registry.test.ts: 5/5 | PROBADO LOCALMENTE; PR/CI PENDIENTES |
| OP-031 | GET enrollments y assignments | academic.manage institucional vigente | Cursor tenant/recurso/sectionId, limit1–100, orden microsegundos/UUID; sin revocados en asignaciones, conserva bajas de inscripción; POST/PATCH idénticos | academic-rosters-pagination-http.test.ts23/23; suite339/339; academic-rosters-pagination.spec.ts208filas+baja/revocación/SQL/auditoría/recarga/axe; 58UI completas | PROBADO LOCALMENTE; CI/PUBLICACIÓN PENDIENTES |

La validación de secciones usa su propia base sintética PostgreSQL local y el puerto 3108. Su build de producción, typecheck y lint pasan. La reconciliación histórica de PR9/14/15/16/18/25 se documenta por equivalencia de archivos, migraciones y contratos en `docs/audit/HISTORICAL_PR_RECONCILIATION_20261017.md`; no se basa únicamente en ascendencia Git.

## Fundamento outbox académico — habilitación pendiente

| ID | Operación | Actor y alcance | Validación y transacción | Evidencia | Estado |
|---|---|---|---|---|---|
| OP-030 | enqueueAcademicSection(tx,scope) y worker académico interno | Backend; autoridad heredada de la futura transacción académica autorizada | Snapshot completo tenant/section, sourceVersion atómico, body cifrado congelado, audit TX, lease/retry/CAS; flag disabled por defecto | academic-outbox.test.ts unit/integration, migración0018 y perfil managed | FOUNDATION LOCAL; WRITERS/TRANSPORTE/RECONCILIACIÓN/API MÓVIL PENDIENTES |

## C32 — identidad de aspirante (2026-10-22)

| Operación | Actor y controles | Evidencia real | Estado |
|---|---|---|---|
| Registro y reenvío /api/v1/admissions/register, /resend | Público, Origin explícito y límites IP/cuenta; respuesta genérica; correo cifrado; reenvío sólo buzón sin prueba | applicant-registration-http.test.ts; admissions-security.spec.ts | IMPLEMENTED; PUBLICACIÓN PENDIENTE |
| Confirmación /api/v1/admissions/verify | Prueba de buzón de un uso/30min y contraseña nueva; rechazo de hash legacy; revocación de sesiones y auditoría TX; sin login automático | applicant-registration-http.test.ts: legacy, expiración, replay, rollback; admissions-security.spec.ts | IMPLEMENTED; PUBLICACIÓN PENDIENTE |
| Login, session y logout de aspirante | Sesión independiente con bearer hash, cookie HttpOnly/Secure/Strict, 8h, rotación y revocación; expiración tras esperas | applicant-registration-http.test.ts; admissions-security.spec.ts | IMPLEMENTED; PUBLICACIÓN PENDIENTE |
| POST institutions/:id/admissions/applications | Dueño derivado de sesión; rechaza applicantId; institución/catálogos vigentes; folio atómico e idempotencia; auditoría TX | applicant-registration-http.test.ts: suplantación, tenant, permisos, concurrencia, rollback | IMPLEMENTED; PUBLICACIÓN PENDIENTE |
| GET y SSR de Admisiones institucional | admissions.manage institucional + MFA; autorización final SQL por sesión/versión/grant/tenant; sin shell duplicado | applicant-registration-http.test.ts: guest, scoped, foreign, MFA y revocación durante SELECT | IMPLEMENTED; PUBLICACIÓN PENDIENTE |
| Worker de confirmación de aspirante | Runtime siii_app, payload cifrado/remitente congelado, leases e idempotencia; proveedor no verifica el buzón | applicant-registration-http.test.ts; worker/applicants.ts | IMPLEMENTED; CORREO REAL/SCHEDULER PENDIENTES |

La evidencia sintética local/CI no acredita producción. Puertas de publicación y reconciliación C31: [informe C31/C32](../audits/SIII_C31_C32_2026-10-21.md).

## Corrección SEC-02 — listados sensibles (21 octubre 2026)

| Operación | Autoridad efectiva | Compatibilidad y alcance | Evidencia | Estado |
|---|---|---|---|---|
| GET /institutions/:id/admissions/applications y GET /institutions/:id/financials/orders | authorizeCapability('institutions.manage'), institución activa, membresía vigente y MFA privilegiado | Conserva rutas, 401/403, campos JSON y filas autorizadas; institutions.read no autoriza PII/deudas de terceros | sensitive-institutional-lists-http.test.ts: RED15/24 antes del arreglo, GREEN24/24 y27/27 tras ampliar cobertura; HTTP+PostgreSQL local sintético, también build producción | CORREGIDO LOCALMENTE; PR75 depende de PR79; CI PENDIENTE |
| SSR /dashboard/institutions/:id/admissions | Misma capacidad administrativa antes de consultar/serializar | Redirige sin permiso; conserva tabla y formulario del administrador autorizado | Misma suite: alumno/guest/participante/docente pendiente/admin sin MFA no reciben PII | CORREGIDO LOCALMENTE; PR75 depende de PR79; CI PENDIENTE |

Esta corrección no completa Admisiones/Caja. La sesión de aspirante, verificación real de correo, autorización y auditoría de escritores, integridad financiera cruzada y paginación siguen abiertos en `docs/audits/SIII_ENGINEERING_AUDIT_2026-10-21.md`. Sin migraciones ni cambios productivos.

## Actualización22 octubre2026 — autoridad financiera API

La sección SEC-02 anterior conserva su estado histórico. PR75 ya está integrado después de79→81 en `main@2be56cd1647b0feecf6649628f1bf8381b928833`, con [CI39734285341 SUCCESS](https://github.com/ErickRFM/Siii/actions/runs/39734285341). La corrección SEC-02 está integrada y verificada; esto no acredita disponibilidad productiva ni completar Admisiones/Caja.

| Operación | Autoridad y transacción | Compatibilidad y evidencia | Estado |
|---|---|---|---|
| POST /api/v1/institutions/:id/financials/fee-types | `authorizeCapability('institutions.manage')`; `financialTransaction` reutiliza `lockWriteCapability` inicial y FINAL con MFA vigente; origen válido; auditoría `financial.fee_type.create` en la misma TX, con actor/tenant/recurso/requestId/after mínimo | Conserva201 `{data}`,401/403/400 y500 `CREATE_FAILED`; administrador con MFA sin step-up sigue autorizado. `financial-write-authority-http.test.ts`: éxito/auditoría, MFA/origen, rollback, revocación durante esperas y caducidad durante auditoría | LOCAL VERIFICADO; CI DE RAMA PENDIENTE; API PARCIAL |
| POST /api/v1/institutions/:id/financials/orders | Mismo helper central de capacidades, comprobación inicial/FINAL y auditoría `financial.order.create` en TX; concepto/alumno del tenant y `payerUserId` con membresía de esa institución, bajo locks | Misma respuesta de éxito y permisos; referencias ajenas/inexistentes400 uniforme `INVALID_INPUT`. Alumno graduado permitido sin agregar elegibilidad académica. Misma suite: seis referencias, MFA, auditoría/rollback y revocación/caducidad concurrentes | LOCAL VERIFICADO; CI DE RAMA PENDIENTE; SEC-04 DB ABIERTO |
| GET /api/v1/institutions/:id/financials/orders | Autoridad administrativa SEC-02 integrada; JOIN de concepto y alumno por ID+institución | Conserva campos/listado; fixture administrativa inserta fila histórica tenantA→alumnoB y verifica nombre/apellidos/matrícula null. No afirma rechazo de esa fila por la DB mientras falte FK compuesta | LOCAL VERIFICADO; CI DEL NUEVO JOIN PENDIENTE; SEC-04 DB ABIERTO |

Incremento local `d3da6485fe7be992e312f17759df10044f5da45d`:22/22 HTTP reales en PostgreSQL sintético local55439 y HTTP3201;813unitarias, lint/typecheck/build aprobados. Evidencia RED→GREEN y límites en [SIII_FINANCIAL_WRITE_AUTHORITY_2026-10-22.md](../audits/SIII_FINANCIAL_WRITE_AUTHORITY_2026-10-22.md). No cambia F2 ni schema/journal/migraciones. La futura FK requiere0025 después de0024 de PR80; SEC-03/06 globales y SEC-04 DB siguen abiertos. Sin push, merge ni operación productiva desde esta tarea.
Reconciliación C32 sobre main@2be56cd: las filas SEC-02 conservan su evidencia histórica. Admisiones añade la capacidad específica admissions.manage para control_escolar/admin/super_admin, comprobación final SQL y sesión independiente de aspirante; Caja conserva la autoridad de SEC-02. Las pruebas de PR75 se mantienen sin desactivar.
