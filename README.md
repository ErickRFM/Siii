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
