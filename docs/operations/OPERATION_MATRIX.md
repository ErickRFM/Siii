# VNext institucional — 26 octubre 2026

Evidencia y límites: [SIII_INSTITUTIONAL_VNEXT_2026-10-26](../implementation/SIII_INSTITUTIONAL_VNEXT_2026-10-26.md). Este incremento no requiere DDL. La certificación productiva/autenticada y los contratos pendientes no se infieren de las pruebas locales.

| Operación | Autoridad / integridad | Evidencia | Estado |
|---|---|---|---|
| GET institutions/:id/portal/student/{profile,courses,teachers,schedule,grades,orders,payments,announcements} | student.self.read, vínculo propio no revocado, grant vigente/programa real, SQL con sesión/tenant/MFA; última calificación publicada del estudiante por sección; avisos publicados/vigentes | personal-portals-http.test.ts; personal-navigation.test.ts; capability-disclosure.test.ts | HTTP/UI LOCAL VERIFICADOS; CI FINAL PENDIENTE |
| GET institutions/:id/portal/teacher/{profile,groups,schedule} | teacher.self.read institucional, vínculo y asignación vigente; roster count real, no grupos ajenos | personal-portals-http.test.ts; personal-portals.spec.ts | HTTP/UI LOCAL VERIFICADOS; CI FINAL PENDIENTE |
| GET institutions/:id/grading/sections y GET grading?sectionId=… | Cursor sin tope silencioso, autoridad/relación en cada consulta SQL, deep link validado contra grupos autorizados | grading-concurrency-http.test.ts; consolidation-http.test.ts; gradebook-drafts.spec.ts | HTTP/UI LOCAL VERIFICADOS; CI FINAL PENDIENTE |
| POST grading, kind:score | expectedUpdatedAt obligatorio, comparación/avance monotónico bajo lock, 409 al perder carrera, antes/después en auditoría; no rectifica actas | grading-concurrency-http.test.ts; consumidores de gradebook-drafts.spec.ts actualizados | HTTP/UI LOCAL VERIFICADOS; CI FINAL PENDIENTE |
| GET/POST financials/orders | institutions.manage/MFA vigente; lista con cursor; UUID de cargo/replay; moneda del concepto, auditoría y validación transaccional de pagador | financial-payments-http.test.ts; financial-write-authority-http.test.ts | HTTP/UI LOCAL VERIFICADOS; CI FINAL PENDIENTE |
| GET/POST financials/orders/:orderId/payments | institutions.manage/MFA, origen, UUID idempotente, bloqueo/saldo/estado, abono+saldo+auditoría atómicos; efectivo/transferencia externa | financial-payments-http.test.ts; personal-portals.spec.ts | HTTP/UI LOCAL VERIFICADOS; CI FINAL PENDIENTE |
| Consulta de historial de asistencia Compañero desde SIII | El contrato nativo actual no es un contrato S2S de historial; no se usa JWT ajeno ni se replica QR | AttendanceRoutes.kt y SiiiAttendanceAuthority.kt en Compañero@55a1b997 | CONTRACT_REQUIRED; NO IMPLEMENTADO |

---

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

## SEC-03/SEC-06 — escritores de admisiones (22 octubre 2026)

| Operación | Autoridad y atomicidad | Evidencia | Estado |
|---|---|---|---|
| POST institutions/:id/admissions/cycles | admissions.manage institucional + MFA; origen; autorización inicial/final en domainTransaction; ciclo+audit(actor/tenant/recurso/requestId/antes-después) juntos | admissions-write-authority-http.test.ts: admin/Control Escolar, negativos y rollback;30/30 HTTP focales en build producción local3202 | REVISADO LOCALMENTE; CI/INTEGRACIÓN PENDIENTES |
| POST institutions/:id/admissions/applications/:applicationId/decision | Mismos controles; lectura/bloqueo por id+tenant; historial append y estado serializados; auditoría TX por transición | Misma suite: solicitud ajena404, revocación/expiración bajo espera, fallo de audit500 sin cambios, dos decisiones y dos audits | REVISADO LOCALMENTE; CI/INTEGRACIÓN PENDIENTES |

SEC-03/SEC-06 permanecen PARCIALES fuera de estos escritores. Sin migraciones ni cambios de producción; ver [informe de escritores](../audits/SIII_ADMISSIONS_WRITE_AUTHORITY_2026-10-22.md).

## SEC06 parcial — claim de estudiante (22 octubre2026)

| Operación | Autoridad y prueba | Compatibilidad/evidencia | Estado |
|---|---|---|---|
| POST institutions/:id/student-links/claim, auto-link | institutions.read y membresía activa; domainTransaction común inicial/final con MFA privilegiado; actor/contacto/prueba/estudiante bajo locks; prueba real accountEmailVerifications del mismo usuario y triple correo actual coincidente |201 {link,autoApproved:true,message}; conflicto por estudiante o miembro409; student.link.auto_approved en misma TX, requestId correlacionado. student-claim-authority-http.test.ts: proof propia/foreign-tenant, rol/estado/MFA, carreras y rollback | LOCAL29HTTP; REVISIÓN/PRERREQUISITO/CI PENDIENTES; API PARCIAL |
| Misma ruta, pending | Sin prueba o correos no coincidentes no establece vínculo; conserva solicitante derivado de sesión; misma autoridad y revalidación final |201 {claim,autoApproved:false,message}; student.claim.requested en TX; fallo de auditoría/revocación/caducidad sin fila persistida. Misma suite | LOCAL29HTTP; NO ACREDITA FLUJO DE REVISIÓN MANUAL |

Evidencia y límites: [SIII_STUDENT_CLAIM_AUTHORITY_2026-10-22.md](../audits/SIII_STUDENT_CLAIM_AUTHORITY_2026-10-22.md). Composición privada935f2220; el helper y Admisiones no se editan en este incremento. Publicar solo tras integrar ese prerrequisito y reconciliar. student-links/me y seguridad integral del módulo permanecen fuera del alcance; sin cambios de schema/migraciones, sin sincronización ni operaciones productivas.

## SEC-04 — pagadores financieros en DB (22 octubre 2026)

Actualización sobre main809c526d (PR82/83/84 integrados). Conserva las secciones históricas y sus estados al redactarse. Autoridad API/proyecciones no cambian;0025 añade integridad. CI de esta rama pendiente; sin despliegue productivo.

| Operación | Defensa/contrato | Evidencia | Estado |
|---|---|---|---|
| INSERT/UPDATE payment_orders, incluido POST financials/orders | FK alumno+tenant y usuario+membresía+tenant; nulls/ambos payers permitidos; cruces/inexistentes23503 en DB; API conserva400 uniforme y demás contratos | financial-tenant-constraints.test.ts36DB; financial-write-authority-http.test.ts22HTTP dentro de144 conjuntos | LOCAL VERIFICADO DB+HTTP; CI PENDIENTE |
| DELETE alumno/membresía referidos por órdenes | SET NULL sólo payer correspondiente; institución/importes/otro payer conservados; FK escalares/ciclo global preservados | Misma suite36: delete/nulls/global-user restriction | LOCAL VERIFICADO; CI PENDIENTE |
| GET financials/orders sobre histórico baseline24 | JOIN por tenant conserva proyección y campos ajenos null;0025 rechaza ese histórico sin modificarlo | tests/legacy/financial-payer-http.test.ts1/1; test:financial-legacy y gate CI explícito postUI | LOCAL VERIFICADO; CI LEGACY PENDIENTE |
| Migrar fresh o poblada24→25, canonical/supabase-v1 | PG>=15, lock_timeout5s/orden fijo, fail-closed; DDL+índices+ledger atómicos; sin backfill/NOT VALID confirmado | DB36 +19 migrador/perfil; catálogo confdelsetcols/convalidated; fresh/populated/rollback/idempotencia | LOCAL VERIFICADO; RELEASE PENDIENTE |
| db:preflight | SELECT/counts sin PII; PRE prepara sin certificar FK; POST verifica ledger/hash, padres inmediatos y forma exacta FK | Negativos drift/DEFERRABLE; salida VERIFIED_0025 con0/0 inválidas | LOCAL VERIFICADO; CI PENDIENTE |

[Reporte, comandos y límites](../audits/SIII_FINANCIAL_TENANT_CONSTRAINTS_2026-10-22.md). Hueco DB financiero SEC-04 verificado localmente; SEC-03/06 globales y puertas productivas mantienen su alcance pendiente. Sin F2/UI ni reescritura de manifest/hashes históricos.

### Evidencia incremental SEC-04 sobre maina1c6e8c (22 octubre 2026)

Merge normal516f374f preserva los contratos y filas anteriores;0025/journal/manifest sin cambios. Repetición local:36DB+108HTTP=144/144, legacy24 adicional1/1,826unitarias y lint/tipos/build0; preflight POST_0025/VERIFIED_0025 con0/0 inválidas, FK validadas y hash exacto. La mención114HTTP del apéndice histórico de auditoría se aclara a108 conforme al desglose22+27+30+29. Las operaciones SEC-04 siguen LOCAL VERIFICADO, CI DE RAMA/RELEASE PENDIENTES; delta MFA/logout pendiente de reconciliar. [Evidencia incremental](../audits/SIII_FINANCIAL_TENANT_CONSTRAINTS_2026-10-22.md).


### SEC-04 — composición preparatoria PR88/89 (22 octubre 2026)

Sobre merge local68f07622, Next15.5.28 y guard MFA/logout de0834b352: mismos contratos/FK y estados anteriores;144/144 (36DB+108HTTP), legacy1/1,826unitarias, lint/tipos/build/preflight0. SQL/ledger/migrador intactos,19managed conservan evidencia previa. Estado PREPARATORIO LOCAL VERIFICADO; PR88/89 revisados todavía NO acreditados en main, CI financiero/release pendientes. La prueba UI MFA no se cuenta como ejecutada por este incremento. [Reporte incremental](../audits/SIII_FINANCIAL_TENANT_CONSTRAINTS_2026-10-22.md). SIN PUSH.


### SEC-04 — composición main4614 (22 octubre 2026)

162/162 pruebas locales conjuntas=36DB+126HTTP y legacy24 separado1/1 sobre fuentes financieras idénticas al merge364fec8; preflight sintéticoVERIFIED_0025,0/0 inválidas y ledger/hash válidos. Gate legacy ubicado después de test:ui en job ui de PR99; verify conserva lint/tipos/unitarias/integración/build/audit. [Reporte incremental](../audits/SIII_FINANCIAL_TENANT_CONSTRAINTS_2026-10-22.md). Pendiente CI exacto publicado y proceso productivo aprobado.


## UX-01 parcial — capturas locales de calificaciones (22 octubre2026)

| Operación existente / consumidor | Comportamiento local y autoridad | Evidencia | Estado |
|---|---|---|---|
| GET/POST institutions/:id/grading, TeacherGradebook | Capturas por institución/sección/alumno/componente/revisión; guarda una celda, conserva otra y edición posterior; refresh sin desmontar/foco; descarta respuestas por scope;401/403 retiran privados. Endpoints y autorización servidor intactos | gradebook-drafts.spec.ts,15UI reales sobre build producción3204/PG55439,826unitarias/lint/tipos/build | LOCAL REVISADO; CI DEL COMMIT PENDIENTE |
| Publicación oficial y cambio concurrente de roster/acta | Bloqueo por captura pendiente y recheck tras ask; captura deshabilitada sólo durante POST de publicación; captura excluida visible y descarte explícito, sin editar acta ni guardar alumno retirado | Publicación/guardado bajo lock PG; segundo admin hace enrollment.withdraw real; audit y scores/finales comprobados | LOCAL REVISADO; SIN CAMBIO SERVIDOR |
| Salida/cambio de sección, consumidor UI | Memoria separada tras lectura autorizada; confirmación local en links internos, beforeunload para recarga/cierre; logout retira privados; recuperación403 recarga grupos | Cancelar/confirmar link, recarga/cierre, dos secciones y GET bloqueado, logout401/grading403; capturas pobladas claro1440/oscuro390 y axe0 | UX-01 PARCIAL: SPA ATRÁS/ADELANTE/PROGRAMÁTICA Y QA MANUAL PENDIENTES |

Informe y RED preservado: [SIII_GRADEBOOK_DRAFTS_REPRO_2026-10-22.md](../audits/SIII_GRADEBOOK_DRAFTS_REPRO_2026-10-22.md). Base reconciliada main809c526d (#84 integrado), revisión independiente sin Critical/Important pendientes. Sin CSS, F2, schema/migraciones, workflows ni disponibilidad productiva. No se certifica lector de pantalla/zoom manual ni se declara cerrado UX-01 global.

Reconciliación posterior de85 con maina1c6e8c4 (#87) por merge normal: producto y15 pruebas de calificaciones intactos frente040a3bc4; nueva validación826unitarias/lint/tipos/build y23/23 focales (15 UI reales +8 contraste). Se conservan filas, evidencia histórica y estado UX-01 PARCIAL. Pendientes integración de prueba MFA/logout separada y CI de la composición final; QAe927/fotografía scroll0 no se incorpora todavía. Sin cambio de endpoints, migraciones, producción ni push desde esta tarea.

Composición LOCAL PREPARATORIA posterior: merge0834b352 (prueba revisada de88 +Next15.5.28/lock de89) sobre9dabfc9b, aún no declarada integrada en main. Instalación exacta/audit0, lint/tipos/build,826 unitarias tras repetición sin solapamiento y23/23 focales verdes. La primera unitaria tuvo1timeout de subproceso, registrado en el informe; no se relajaron límites. Producto/tests/método de captura de85 y QAe927 intactos; faltan merge commits reales y CI del SHA final. Sin push ni edición de PR.


## UX-01 parcial — continuidad privada en navegación SPA (22 octubre2026)

| Consumidor existente | Memoria/autoridad | Evidencia local | Estado |
|---|---|---|---|
| TeacherGradebook dentro del shell persistente | Map original por actor/institución/sección/estudiante/componente/revisión, fuera del keytenant; auth/me+secciones+snapshot reales antes de restaurar; no roster/snapshot en shell | Atrás/Adelante, Ctrl+K Enter, revisión nueva al volver, dos tenants y actor distinto,18 nuevos+15 previos:33/33UI | LOCAL REVISADO; RECONCILIACIÓN/CI PENDIENTES |
| Guardado concurrente con salida/assurance |200 reconoce sólo revisión enviada en proveedor original, incluso durante GET posterior; contador no reutilizado; nunca aplica snapshot/notice tardío;401/logout purgan actor,403 contexto, lecturas revocadas no repueblan | SQL750 antes de entregar200 real, edición posterior, logout/relogin, GET retenido y403 fuera de vista, foco privado oculto durante auth | SIN CAMBIO SERVIDOR/F2/SCHEMA |
| Salida desde otras vistas/revalidación | beforeunload global del proveedor; step-up válido invalida/oculta/revalida sin borrar; foco sólo tras GET vigente y sin robar control elegido |33UI,826unitarias,lint/tipos/build,2Axe poblados0 y revisión independiente sin pendientes | UX-01 PARCIAL; SIN PERSISTENCIA DURABLE |

[Informe y evidencia RED/GREEN](../audits/SIII_GRADEBOOK_NAVIGATION_MEMORY_2026-10-22.md). Se conserva toda la matriz anterior. Coste observado: FirstLoad grading115→118kB (compartido103kB estable) y auth/me adicional aun con memoria vacía/fuera del libro; no es optimización ni benchmark. No hay bloqueo universal de router ni detección de sesión/logout externo sin rechazo; no lector/zoom manual certificado. Base de85 reconciliada por92/94 según coordinación; no se publica PR duplicado. Sin backend, SQL, CSS, producción ni push/merge desde este incremento.

## INT-04A parcial — productores de asignación docente (22 octubre2026)

| Operación | Autoridad y evento | Evidencia local | Estado |
|---|---|---|---|
| POST institutions/:id/assignments |academic.manage/origen/MFA existente; domainTransaction inicial/final; fila+teacher.assign+enqueueAcademicSection/audit queued atómicos, requestId servidor compartido, scope SQL devuelto |RED201 sin evento;39ONdev y39ON+39OFF producción, negativos/rollback/carreras |LOCAL REVISADO; UNIT/CI/INTEGRACIÓN PENDIENTES |
| PATCH misma ruta, retiro |mismos controles; upsert completo, excluye sólo docente revocado y permite teachers vacío sin borrar grupo; contador/snapshot bajo locks existentes |RED200 sin evento nuevo; dos retiros bajo barreraSQL, máximaversión igual estadofinal; revocación/caducidad final403 y rollback |INT-04 PARCIAL; SIN TRANSPORTE NI MÓVIL CERTIFICADOS |

[Informe y límites](../audits/SIII_ACADEMIC_ASSIGNMENT_OUTBOX_2026-10-22.md). ON sólo en proceso sintético y nuevo pasoCI focal aprobado, después de integración estándarOFF/antesbuild; harness original genera claves nuevas/restaurables. No cambia otros productores, F2, Compañero, SQL/schema/flags productivos. Límites500docentes/500matrículas históricas/3000ocurrencias/1MiB abortan entero ON, incluido un retiro. Lint/tipos/build0 y revisión sinC/I/M; npmtest sigue825/826 por timeout5000ms del child sin diff, también4/5 aislado. Diagnóstico externo910ms no equivale al gate; control de main y commit pendientes de coordinación. Sin push/PR/merge ni operación productiva.


Actualización de cierre local INT-04A: coordinación completó control A main5cb826/826(13.45s) y control B en esta rama826/826(8.17s), mismo npmtest estándar/Node24.18.0/Vitest4.1.12, cincoflagsunset registrados y sin diff unit/config/migrador/lock. No hubo cambio de fuente entre fallos y B. Gate local actual aprobado; se conservan dos825/826, aislado4/5 y diagnóstico910ms, sin atribuir causa ni mejora. Lint/tipos/build0,39ONdev,39ON+39OFF producción, claves/CIcontrato0 y revisión independienteC/I/M0. Commit local autorizado; reconciliación con mainfc65 y CI/publicación pendientes. No se declara cerrada INT-04 global ni producción.

## INT-05 — autoridad y operación de la conexión (24 octubre2026)

| Operación | Autoridad y persistencia | Evidencia | Estado |
|---|---|---|---|
| POST integrations/companion/v1/authority | HMAC de propósito exacto, institución de credencial, nonce único auditado; productor ON; institución/identidad/rol/vínculo vigentes; manifest sin PII con versión exacta, locks y revisión final |35HTTP ON,8firma/reloj; incluye revocación concurrente y caducidad durante auditoría bloqueada |LOCAL; CI/PRODUCCIÓN PENDIENTES|
| GET institutions/:id/companion-sync |integrations.manage + sesión/assurance existente; metadatos limitados, observación remota firmada fueraTX y revalidación final de operador; accepted distinto de projected |15HTTP operaciones +19unit de observación; sin cuerpos/hash/PII; timeout/contrato inválido no verifican aplicación |LOCAL; RECEIPT E2E FINAL PENDIENTE|
| POST institutions/:id/companion-sync |mismo permiso/origen; expectedSourceVersion bajo lock; snapshot nuevo y auditoría atómicos; histórico inmutable |concurrencia201/409, tenant/origen/MFA, rollback de evento/versión/auditoría, flagOFF503 |LOCAL; CI/PRODUCCIÓN PENDIENTES|

Informe de alcance, límites y puertas: [SIII_COMPANION_CONNECTION_2026-10-24.md](../audits/SIII_COMPANION_CONNECTION_2026-10-24.md). Se conserva la evidencia histórica anterior; estas filas no acreditan migraciones ni activación productiva.

## Invitaciones — consolidación del 26 octubre 2026

| Operación | Cambio y garantías | Evidencia | Estado |
|---|---|---|---|
| POST invitations/accept, cuenta nueva | Esquema de cuenta compartido con UI; 422 VALIDATION_ERROR independiente de existencia; conserva consentimiento, token pendiente tras validación, transacción/auditoría/MFA y control de emisor | `tests/integration/invitations.test.ts`: 39 aprobadas, incluida corrección de tres entradas, alta con correo y login; `tests/ui/invitation-flows.spec.ts`: 9 aprobadas, incluida doble entrega evitada y móvil 360 px | LOCAL VERIFICADO; CI/despliegue del SHA final en PR de consolidación |

[Informe y límites productivos](../audits/SIII_CONSOLIDATION_2026-10-26.md). El contrato sintético y los GET públicos no acreditan cuentas reales ni sincronización productiva.

## Portal institucional V3 — 26 octubre 2026

| Operación | Autoridad y garantías | Evidencia | Estado |
|---|---|---|---|
| GET institutions/:id/portal/:kind/:resource | Conserva self.read, sesión, tenant, ámbito y vínculo vigente en cada SQL; respuestas no-store incluyen contexto opaco actor/sesión/grants/expediente; colecciones fijadas al expediente resuelto | `personal-portals-http.test.ts`: 12/12 locales; pruebas UI de cuenta distinta, contexto distinto en segunda página y denegación | LOCAL VERIFICADO; CI/merge/despliegue final pendientes |
| Navegación/consulta personal | Inicio institucional sin agenda diaria; cinco destinos móviles; consulta secundaria bajo demanda; conserva búsqueda al refrescar contexto válido y retira datos al cambiar acceso, expediente o conexión | Full UI 167/167; bundle final con dos regresiones de pestaña/foco, 22/22 portal + catálogo; HTTP personal 12/12 | LOCAL VERIFICADO; CI/merge/despliegue final pendientes |
| Catálogo de consulta | Sin guía de configuración ni acciones de gestión para lector; estado activo por defecto con opción explícita de consultar inactivos/archivados dentro del permiso vigente | `academic-initial-setup.spec.ts` y escenario V3 de catálogo, incluidos en 22/22 finales; preparación administrativa conservada para gestores | LOCAL VERIFICADO; CI/merge/despliegue final pendientes |

[Inventario, revisión y límites del bloque](../audits/SIII_V3_EXECUTION_2026-10-26.md). No hay DDL nuevo ni cambios de contrato con Compañero. Los metadatos de contexto no se aceptan como credenciales ni sustituyen autorización del servidor.


## Portal docente y rectificaciones — 26 octubre 2026

| Operación | Autoridad y garantías | Evidencia | Estado |
|---|---|---|---|
| Grupos/lista/captura/resultados docentes | Identidad activa, asignación propia, tenant y capacidades; lectura sin agenda; cierre bajo locks; notas finales separadas de scores privados | teacher-workspace-http.test.ts, teacher-workspace.spec.ts, gradebook-drafts.spec.ts y personal-portals.spec.ts | IMPLEMENTADO; gate final pendiente |
| Solicitud/evidencia/revisión/resolución de rectificación | Solicitante vinculado; roles institucionales explícitos por configuración; evidencia privada 2 MiB; revisión optimista; auditoría por operación; sin autoaprobación | grade-corrections-http.test.ts, grade-correction-policy.test.ts y grade-corrections.spec.ts | INFRAESTRUCTURA; activación institucional bloqueada por defecto |
| Aplicación de rectificación | Aprobación distinta de ejecución, MFA/step-up, fuente y política vigentes, versión nueva inmutable; extraordinaria exige habilitación y autoridad adicional | Contratos de idempotencia, rechazo, fuente obsoleta, cierre y allowExecution=false | INFRAESTRUCTURA; sin ejecución productiva |

Informe y límites: [SIII_TEACHER_V3_2026-10-26.md](../audits/SIII_TEACHER_V3_2026-10-26.md).
