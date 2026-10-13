# Despliegue y puesta en marcha

1. Ejecutar `npm ci` con Node 22 y un proyecto Supabase **de staging**.
2. Configurar `DATABASE_URL` como secreto servidor desde `Supabase → Connect`. Nunca utilizar la URL HTTPS del API como cadena de Postgres.
3. Ejecutar `npm run db:migrate` y comprobar tablas y registro del migrador.
4. Comprobar `GET /api/health` (liveness) y `/api/ready` (conectividad PostgreSQL con 503 si falla).
5. Dar de alta el primer administrador solo en ambiente nuevo: 
   `SIII_BOOTSTRAP_CONFIRM=YES SIII_BOOTSTRAP_USERNAME=... SIII_BOOTSTRAP_PASSWORD=... SIII_BOOTSTRAP_INSTITUTION_CODE=... SIII_BOOTSTRAP_INSTITUTION_NAME=... npm run bootstrap:admin`.
6. El administrador debe cambiar su clave antes de operar módulos institucionales.
7. Ejecutar tests unitarios, integración, build y pruebas de aislamiento institucional antes de producción.
8. No aplicar cambios en la base Supabase de producción sin backup y revisión de migraciones.

## Estado de seguridad
- Sesiones opacas aleatorias guardadas como SHA-256 y cookie HttpOnly/SameSite.
- Contraseñas Argon2id.
- Roles se asignan por institución, no globales.
- El backend deniega el acceso si la institución no está activa, se revoca la membresía o se revoca el rol.
- Falta completar mecanismos de recovery/verificación y pruebas E2E de todas las operaciones antes de un uso institucional real.

## Problemas detectados de F1
- `scripts/generate-openapi.ts` sigue pendiente (no invocar hasta crearlo).
- Las migraciones Drizzle iniciales necesitan comprobarse en staging antes de evolucionar con `drizzle-kit generate` para que los snapshots acompañen cambios de schema.
