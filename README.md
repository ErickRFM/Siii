# Siii · Sistema Universitario

Monolito modular universitario: Next.js App Router, TypeScript, PostgreSQL/Drizzle y sesiones con permisos institucionales. Integra por API con el backend Kotlin/Ktor de Compañero (sin rehacer la app).

## Estado
- F1 foundation inicial con API liveness/readiness y conexión PostgreSQL.
- F2 parcial: login, sesión, cambio de contraseña, tabla de membresías y roles, políticas centralizadas, operaciones protegidas de membresía y asignación y una interfaz inicial de login/instituciones.
- F3-F8 **NO implementadas** todavía: expedientes, matrículas, docentes, materias, inscripciones, ocurrencias, calificaciones y sincronización Ktor.
- Interfaz nueva en fase shell; las tarjetas de módulos no simulan operaciones.

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
- No utilizar para datos personales reales hasta completar la auditoría de seguridad, login rate limiting por IP, provisión de usuarios/invitaciones, revocación/recuperación y pruebas de integración sobre PostgreSQL real.
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
