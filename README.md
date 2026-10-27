# Siii · Sistema Universitario

Monolito modular universitario: Next.js App Router, TypeScript, PostgreSQL/Drizzle y sesiones con permisos institucionales. Integra por API con el backend Kotlin/Ktor de Compañero (sin rehacer la app).

## Estado
- F1 foundation inicial con API liveness/readiness y conexión PostgreSQL.
- F2 parcial: login, sesión, cambio de contraseña, membresías y roles. Las ramas dependientes P1 incorporan MFA, capacidades por ámbito, delegación temporal e invitaciones con consentimiento; la rama dependiente F06 incorpora gestión de usuarios y recuperación; su integración sigue pendiente.
- F3 parcial: catálogos de programas, materias, planes, periodos y campus con endpoints reales. Siguen pendientes expedientes, matrículas, gestión de docentes, grupos, inscripciones, ocurrencias, calificaciones y sincronización Ktor.
- Login, seguridad, catálogos, roles e invitaciones tienen flujos conectados en sus respectivas ramas. Las tarjetas de módulos pendientes no simulan operaciones.

## Local
1. `npm ci`
2. Crear `.env` con `DATABASE_URL` de PostgreSQL (Supabase → Connect, NUNCA la URL https del proyecto).
3. `npm run db:migrate` sobre base vacía **de desarrollo** (sin permisos de producción).
4. `npm run bootstrap:admin` con variables de `docs/operations/DEPLOYMENT.md` en un entorno limpio.
5. `npm run dev`; navegar a `/login`.
6. `npm run test`, `npm run test:integration`, `npm run build`.

## APIs actuales
- `GET /api/health` sin dependencia (liveness).
- `GET /api/ready` prueba PostgreSQL; 503 si falla.
- `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- `POST /api/v1/auth/password/change`.
- `GET /api/v1/institutions`.
- `GET,POST /api/v1/institutions/:institutionId/memberships`.
- `POST /api/v1/institutions/:institutionId/roles/assign`.

## Seguridad y pendientes
- No compartir secretos ni enlaces internos de pooler en frontend/Git.
- No habilitar datos personales reales hasta superar las puertas de docs/BLOCKERS.md y completar la revisión, CI e integración controlada. Las pruebas actuales usan PostgreSQL y datos sintéticos; la recepción real de correo sigue pendiente.
- No sustituye Compañero: requiere adaptador Ktor independiente y validación de contratos.
- Véase `docs/architecture/SUPABASE_ADAPTER.md` y `docs/ux/PRODUCT_INFORMATION_ARCHITECTURE.md`.

## F3 — Catálogo académico institucional (primera entrega)

En una institución autorizada, abre `/dashboard/institutions/<institutionId>/academic`.
El portal ofrece **programas, materias, planes (versiones), periodos y campus** respaldados por PostgreSQL,
con GET/POST/PATCH, roles `academic.read` y `academic.manage`, auditoría y validación.
La interfaz permite crear, consultar, renombrar cuando aplica, archivar y reactivar.
No incluye aún expedientes de alumnos/docentes, grupos, horarios, inscripciones ni calificaciones: esos procesos siguen pendientes.

La migración aditiva `db/migrations/0001_academic_catalogs.sql` introduce 3 tablas y restricciones.
**Advertencia de producción:** la migración inicial se aplicó mediante Supabase, no el journal interno de Drizzle.
No ejecutar `npm run db:migrate` contra la base productiva sin reconciliar historiales. Consulta
`docs/implementation/F3_ACADEMIC_CATALOG.md`. La migración retira accesos por roles públicos de Supabase
de las tres tablas nuevas.

## P0: endurecimiento en revisión

Véase [P0_HARDENING.md](docs/implementation/P0_HARDENING.md) para el migrador seguro, baseline, roles PostgreSQL, cookie/sesión, cursor y pruebas reales de handlers/UI. `npm run db:migrate` requiere SIII_DATABASE_ENV no productivo explícito y no admite producción. `npm run db:baseline` adopta únicamente el esquema conocido tras verificarlo; no reaplica DDL. Las migraciones SQL usan LF canónico.

`npm run test:ui` ejecuta Chromium con axe y teclado. Integración y UI usan PostgreSQL local desechable y un login web separado del propietario. Ningún dato de producción se usa como fixture.

## P1 — MFA en rama dependiente

Autenticación TOTP real, recuperación de un uso y step-up disponibles en login y /dashboard/security, respaldados por la migración 0006. El runtime requiere SIII_MFA_KEYS y SIII_MFA_ACTIVE_KEY_ID solo servidor; no hay claves de fallback. Configuración, endpoints, pruebas y limitaciones: [P1_MFA_REPORT.md](docs/audit/P1_MFA_REPORT.md). MFA obligatorio para perfiles privilegiados está integrado en la rama dependiente de permisos; P1 no está cerrado.

## P1 — Permisos en rama dependiente

Capacidades verificadas por backend, concesiones por institución/programa/campus, delegación temporal, protección del último administrador y MFA obligatorio. API y UI de roles conectadas; véase [P1_SCOPES_REPORT.md](docs/audit/P1_SCOPES_REPORT.md). La vinculación por UUID requiere invitación con consentimiento (409 INVITATION_REQUIRED). Invitaciones están implementadas y verificadas en la rama dependiente F08; usuarios y administración siguen su integración por PR dependientes.

## P1 — Invitaciones con consentimiento en rama dependiente

Emisión, consulta paginada, reenvío y revocación reales en /dashboard/institutions/:institutionId/invitations. La aceptación o rechazo se realiza en /invitations/accept, con token de un uso, caducidad, consentimiento explícito y prueba propia de cuenta para usuarios existentes. Se conservan tenant, ámbito, duración, restricciones de delegación, MFA y auditoría de F07. La migración 0008 agrega invitaciones, outbox cifrado y prueba de email; las migraciones anteriores permanecen intactas.

Las APIs institucionales GET/POST /api/v1/institutions/:institutionId/invitations y POST de /:invitationId/resend o /revoke están conectadas a UI. Las APIs POST /api/v1/invitations/preview, /accept y /reject validan el bearer y el consentimiento. El enlace transporta el token en fragmento; se retira antes de inicializar el router y solo permanece en memoria. Para recargar, reabrir el enlace original del correo.

El lote real npx tsx worker/invitations.ts usa un LOGIN restringido a siii_app, leases y CAS, payload/remitente inmutables e idempotencia por evento. Su scheduler operativo sigue pendiente. Configurar solo en servidor SIII_PUBLIC_ORIGIN, SIII_INVITATION_KEYS, SIII_INVITATION_ACTIVE_KEY_ID, RESEND_API_KEY, SIII_EMAIL_FROM y SIII_EMAIL_REPLY_TO, además de las claves MFA. Sin configuración de correo, la entrega queda pendiente con EMAIL_NOT_CONFIGURED; accepted del proveedor no equivale a entrega al buzón. No se enviaron correos externos en las pruebas.

Evidencia dirigida confirmada: 38 pruebas de integración F08 y 7 de Chromium. La verificación completa del commit funcional 638307fd confirmó 592 unitarias, 177 integraciones y 25 Chromium, con typecheck/lint/build verdes y audit sin vulnerabilidades. CI del HEAD reconciliado 24209285 pasó en las dos ejecuciones (38802516329 y 38802525366); merge pendiente. La segunda revisión de fuente es favorable, condicionada a QA y los límites externos. Configuración, endpoints, seguridad y límites: [P1_INVITATIONS_REPORT.md](docs/audit/P1_INVITATIONS_REPORT.md). Las puertas de [BLOCKERS.md](docs/BLOCKERS.md) siguen abiertas; esta rama no constituye una promoción a producción ni el cierre de P1.

## P1 — Usuarios y recuperación en rama dependiente

El panel /dashboard/institutions/:institutionId/users utiliza listado, búsqueda, filtros, cursor, detalle, perfil institucional e historial reales. La identidad global permanece separada. Suspender/activar conserva las concesiones; la baja lógica las revoca y la rehabilitación no las restaura. Alta mediante invitación y consentimiento; asignación de permisos en la vista de roles existente.

El restablecimiento autorizado solicita un enlace únicamente al correo global verificado del titular. /password/forgot devuelve una respuesta genérica; /password/reset permite elegir contraseña y exige TOTP o recovery si existe MFA activo. El enlace de un uso dura como máximo 30 minutos, queda ligado a authVersion y permanece en fragmento/memoria. Al completarlo se invalidan sesiones y se exige login; el administrador no recibe ni impone credenciales.

La migración aditiva 0009 incluye perfil/baja, historial append-only y requests/outbox independientes. Configurar solo en servidor SIII_PASSWORD_RESET_KEYS y SIII_PASSWORD_RESET_ACTIVE_KEY_ID, además del origen HTTPS y correo explícito de F08. npx tsx worker/password-resets.ts ejecuta el lote real con LOGIN restringido; no configura un scheduler ni acredita entrega externa. Véanse [informe backend](docs/audit/P1_USERS_BACKEND_REPORT.md), [informe UI](docs/audit/P1_USERS_UI_REPORT.md) y [revisión](docs/audit/P1_USERS_REVIEW.md). QA local final: 678 unitarias, 216 integraciones y 32 Chromium; typecheck/lint/build verdes y audit sin vulnerabilidades. [Informe consolidado](docs/audit/P1_USERS_REPORT.md). CI del commit e2180879 pasó en ambas ejecuciones (38804502406 y 38804508679); integración y merge por PR dependiente pendientes.

## P1 — Administración institucional en rama dependiente

El dashboard descubre las instituciones propias administrables con paginación real. /dashboard/institutions/:institutionId/admin conecta configuración, estado y auditoría a API/PostgreSQL. Permite editar nombre, nombre corto, clave y zona horaria, y activar/inactivar/suspender con motivo, confirmación y control de versión. Una institución archivada conserva sólo lectura. Desactivar revoca invitaciones pendientes y cancela sus mensajes en cola; reactivar no los recupera.

La gestión propia requiere concesión institucional vigente, sesión y MFA actuales; escribir requiere step-up fresco. Puede recuperar una unidad inactiva sin habilitar sus operaciones académicas ordinarias. Auditoría paginada con filtros y proyección explícita, sin contactos ni secretos. Reutiliza catálogos, usuarios, roles e invitaciones existentes. La migración aditiva0010 incorpora admin_version; SQL0000–0009 permanecen intactos.

QA local final:682unitarias,243integraciones y40Chromium verdes, instalación/typecheck/lint/build verdes,50rutas verificadas en el manifest compilado y audit0. Dos revisiones independientes favorables y regresiones documentadas. CI del SHA publicado se registra en el PR dependiente de usuarios; merge y puertas de P0 siguen pendientes. Véanse [informe F09](docs/audit/P1_INSTITUTION_ADMIN_REPORT.md), [revisión](docs/audit/P1_INSTITUTION_ADMIN_REVIEW.md), [matriz de operaciones](docs/operations/OPERATION_MATRIX.md) y [entrega P0.1/P1](docs/audit/P0_1_P1_DELIVERY.md).