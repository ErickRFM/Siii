# Matriz de operaciones — evidencia de P0

Estado IMPLEMENTED se refiere al endpoint y a su prueba real local. No certifica promoción a producción ni flujos de P1. Las pruebas HTTP usan Next.js, PostgreSQL y un LOGIN separado sin DDL; solo fixtures sintéticos.

| ID | Operación / endpoint | Actor y alcance | Validación / transacción / auditoría | Evidencia | Estado |
|---|---|---|---|---|---|
| OP-001 | GET /api/health | Público; liveness | Sin datos institucionales | Setup HTTP real espera health | IMPLEMENTED |
| OP-002 | GET /api/ready | Público; readiness | Conexión y rol backend mínimo; sin detalles de DB | database-role.test.ts: propietario devuelve 503 | IMPLEMENTED |
| OP-003 | POST /api/v1/auth/login | Público; cuenta e IP | Zod estricto, Argon2id real/dummy, throttle, bloqueo y sesiones bajo transacción; auth.login/failed/locked/throttled | http-handlers.test.ts: éxito, inexistente, timing, lockout, concurrencia y cookie | IMPLEMENTED |
| OP-004 | POST /api/v1/auth/logout | Sesión propia | Origin, revocación transaccional y auth.logout | http-handlers.test.ts: logout revoca token | IMPLEMENTED |
| OP-005 | POST /api/v1/auth/password/change | Cuenta propia activa | Contraseña actual/nueva, sesión revalidada bajo bloqueo, rotación y auditoría | http-handlers.test.ts: cambio, CSRF, revocación concurrente y expiración | IMPLEMENTED |
| OP-006 | GET /api/v1/institutions | Membresías propias activas | Sesión, cursor estable; sin instituciones ajenas | http-handlers.test.ts: paginación/tenant; /auth/me restringe mustChangePassword | IMPLEMENTED |
| OP-007 | GET/POST /api/v1/institutions/:institutionId/memberships | members.read / members.manage en institución | Zod estricto, tenant y política v1; POST transaccional, membership.create | http-handlers.test.ts: lectura, creación, tenant, mass assignment; invitación por correo pendiente P1 | IMPLEMENTED |
| OP-008 | POST /api/v1/institutions/:institutionId/roles/assign | roles.assign; política v1 | Actor/destino revalidados; sin self-grant; transacción, revocación de sesiones y role.assign | http-handlers.test.ts y auth-policy.test.ts | IMPLEMENTED |
| OP-009 | PATCH /api/v1/institutions/:institutionId/memberships/:membershipId | members.manage; política v1 | Scope, estado/razón, rol protegido, sin self-edit; transacción y antes/después | http-handlers.test.ts: tenant, IDOR, CSRF y revocación | IMPLEMENTED |
| OP-010 | POST /api/v1/institutions/:institutionId/roles/revoke | roles.assign; política v1 | Sin self-revoke, rol protegido; transacción, sesiones y role.revoke | http-handlers.test.ts y auth-policy.test.ts | IMPLEMENTED |
| OP-011 | GET /api/v1/institutions/:institutionId/academic/:resource | academic.read en institución | Registro de 5 recursos; cursor tenant/recurso, limit 1–100, precisión microsegundos | http-handlers.test.ts: todos los recursos, tenant, cursor inválido/empates | IMPLEMENTED |
| OP-012 | POST mismo endpoint académico | academic.manage en institución | Zod estricto, FK scoped, unicidad/fechas; transacción y academic.:resource.create | http-handlers.test.ts: 5 recursos, mass assignment, referencia ajena, rollback si falla auditoría | IMPLEMENTED |
| OP-013 | PATCH mismo endpoint académico | academic.manage en institución | UUID scoped, estados por recurso, archivo terminal y planes activos; transacción y antes/después | http-handlers.test.ts: 5 recursos, IDOR, transiciones; p0-accessibility.spec.ts: edición UI | IMPLEMENTED |
| OP-014 | GET /api/v1/auth/me | Sesión propia activa | Expiración absoluta/inactividad/revocación y revalidación después del bloqueo | http-handlers.test.ts: sesiones inválidas y expiración mientras espera | IMPLEMENTED |

Evidencia en tests/integration/, tests/unit/ y tests/ui/. Los estados reflejan verificaciones locales; el informe de fase registra CI, revisión y puertas pendientes.
