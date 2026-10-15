# Siii · Sistema Universitario

Monolito modular universitario: Next.js App Router, TypeScript, PostgreSQL/Drizzle y sesiones con permisos institucionales. Integra por API con el backend Kotlin/Ktor de Compañero (sin rehacer la app).

## Estado
- F1 foundation inicial con API liveness/readiness y conexión PostgreSQL.
- F2 parcial: login, sesión, cambio de contraseña, membresías y roles. Las ramas dependientes P1 incorporan MFA, capacidades por ámbito, delegación temporal e invitaciones con consentimiento; el ciclo completo administrativo de usuarios sigue pendiente.
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

Capacidades verificadas por backend, concesiones por institución/programa/campus, delegación temporal, protección del último administrador y MFA obligatorio. API y UI de roles conectadas; véase [P1_SCOPES_REPORT.md](docs/audit/P1_SCOPES_REPORT.md). La vinculación por UUID requiere invitación con consentimiento (409 INVITATION_REQUIRED). Invitaciones están implementadas en la rama dependiente F08 y pendientes de validación final e integración; el ciclo completo de usuarios y administración sigue en ejecución.

## P1 — Invitaciones con consentimiento en rama dependiente

Emisión, consulta paginada, reenvío y revocación reales en /dashboard/institutions/:institutionId/invitations. La aceptación o rechazo se realiza en /invitations/accept, con token de un uso, caducidad, consentimiento explícito y prueba propia de cuenta para usuarios existentes. Se conservan tenant, ámbito, duración, restricciones de delegación, MFA y auditoría de F07. La migración 0008 agrega invitaciones, outbox cifrado y prueba de email; las migraciones anteriores permanecen intactas.

Las APIs institucionales GET/POST /api/v1/institutions/:institutionId/invitations y POST de /:invitationId/resend o /revoke están conectadas a UI. Las APIs POST /api/v1/invitations/preview, /accept y /reject validan el bearer y el consentimiento. El enlace transporta el token en fragmento; se retira antes de inicializar el router y solo permanece en memoria. Para recargar, reabrir el enlace original del correo.

El lote real npx tsx worker/invitations.ts usa un LOGIN restringido a siii_app, leases y CAS, payload/remitente inmutables e idempotencia por evento. Su scheduler operativo sigue pendiente. Configurar solo en servidor SIII_PUBLIC_ORIGIN, SIII_INVITATION_KEYS, SIII_INVITATION_ACTIVE_KEY_ID, RESEND_API_KEY, SIII_EMAIL_FROM y SIII_EMAIL_REPLY_TO, además de las claves MFA. Sin configuración de correo, la entrega queda pendiente con EMAIL_NOT_CONFIGURED; accepted del proveedor no equivale a entrega al buzón. No se enviaron correos externos en las pruebas.

Evidencia dirigida confirmada: 38 pruebas de integración F08 y 7 de Chromium. La verificación completa ya confirma 592 unitarias y 177 integraciones, con typecheck/lint verdes; Chromium completo, build, audit, CI y merge siguen pendientes de registro. La segunda revisión de fuente es favorable, condicionada a QA y los límites externos. Configuración, endpoints, seguridad y límites: [P1_INVITATIONS_REPORT.md](docs/audit/P1_INVITATIONS_REPORT.md). Las puertas de [BLOCKERS.md](docs/BLOCKERS.md) siguen abiertas; esta rama no constituye una promoción a producción ni el cierre de P1.
