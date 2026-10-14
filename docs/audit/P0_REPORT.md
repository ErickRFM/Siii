# Informe de fase P0 — 2026-10-14

Estado: implementación local en revisión; **no declarar cerrada la DoD ni promover a producción** hasta resolver docs/BLOCKERS.md. Rama feat/p0-hardening, base c7334cdf.

## 1. Archivos y migración

- Privacidad/migración: db/migrations/0002_p0_hardening.sql, schemas, migration-safety.ts, schema-signature.ts, baseline/0001-schema.json, migrate.ts y scripts/db-baseline.ts.
- Autenticación: shared/auth, handlers auth/memberships/roles/institutions, worker e inicialización de administrador. Throttle persistente, Argon2id explícito, expiración/inactividad/cupo de sesiones, rotación y revalidación dentro de bloqueos.
- API/auditoría: middleware, contexto HTTP, registro académico, cursor por tenant/recurso, PATCH antes/después y rollback transaccional.
- Runtime: pool limitado, comprobación de rol DML, logs redactados; dependencias y lockfile; CSP/headers y layout dinámico.
- UI: catálogos con cursor, teclado/tabs, skip link, foco/errores asociados, contraste y estado offline.
- Calidad: CI único, ESLint TS/hooks/JSX accesible, tests reales PostgreSQL/HTTP/Chromium, prompt/plan, matriz, este informe y puertas pendientes.
- Se retira tsconfig.tsbuildinfo del índice. SQL histórico conserva contenido y usa LF canónico mediante .gitattributes; no se reescriben ledgers existentes.
- Migración aditiva: conserva timestamps legacy al convertir periodos a date; añade CHECK/índices, last_seen_at, audit details y auth_throttle; RLS/REVOKE presente y futuro y grupos separados siii_app/siii_migrator.

## 2. Comandos y salidas reales

Entorno: PostgreSQL 17.10 portable en 127.0.0.1:55432, bases locales desechables p0_empty/p0_baseline, datos exclusivamente sintéticos. Credenciales fuera del repositorio y del informe. Se actualizó el checkout original por fast-forward a 69ee3146 conservando el buildinfo del usuario; el worktree P0 incorporó main c7334cdf.

| Comando | Resultado observado |
|---|---|
| npm ci --ignore-scripts; npm rebuild argon2 esbuild | Install limpio y binarios operativos; lockfile reproducible |
| npm run db:migrate | MIGRATIONS_APPLIED en vacío; repetición sin DDL adicional |
| npm run typecheck | Exit 0 |
| npm run lint | Exit 0 |
| npm test | 6 archivos / 37 pruebas pasaron |
| npm run test:integration | 4 archivos / 55 pruebas pasaron |
| npm run test:ui | 7 pruebas pasaron (45.7 s) |
| npm run build | Exit 0; todas las rutas dinámicas; typedRoutes actualizado |
| npm audit | found 0 vulnerabilities |

Pruebas de migración: base vacía, segunda ejecución, baseline sin ledger con datos existentes, conservación de hora legacy, drift/ledger alterado, rechazo sin crear ledger, privilegios/RLS/defaults y restricciones. HTTP real verifica login, CSRF, sesión/cuenta/tenant, IDOR/mass assignment de los cinco catálogos, membresías/roles, cursores y auditoría. El servidor usa LOGIN efímero de siii_app; una prueba aparte rechaza credenciales de propietario.

Evidencia de correcciones RED → GREEN: timing de login inexistente/real; revocación durante cambio de contraseña (200 → 401); expiración mientras espera bloqueo (200 → 401); alias SQL de baseline y ausencia de ledger ante rechazo; lector de cursor/tab keys/offline/contraste; fallo de auditoría revierte curso creado.

Auditoría Supabase read-only: docs/audit/P0_PRODUCTION_READONLY.json. Solo metadata: 12 tablas públicas sin RLS, grants efectivos anon/authenticated prohibidos ausentes, defaults abiertos, ledger Supabase presente y Drizzle ausente.

CI remota: pendiente de push/PR. Revisión independiente: pendiente. Este informe se actualizará con resultados y hallazgos.

## 3. No realizado y motivo

- No ejecución SQL, migración, provisión de roles ni despliegue en producción.
- No MFA, invitaciones por correo, recuperación, nuevos roles/scopes, expedientes, grupos, pagos ni integración Compañero/Ktor: fases posteriores.
- Lector de pantalla manual por flujo, medición Argon2id del runtime de destino y réplica staging del esquema cloud: requieren evidencia adicional antes de cierre/promoción. Ver docs/BLOCKERS.md.
- No merge: requiere CI verde, revisión y cierre de las puertas pertinentes.

## 4. Riesgos, decisiones y coste si resultan incorrectas

- Se preserva RBAC v1 institucional; scopes finos/invitaciones quedan en P1. Coste: habilitación real depende de P1 y de las puertas de seguridad posteriores.
- IP desconocida fuera de Vercel usa bucket global; no se acepta X-Forwarded-For manipulable. Coste: un despliegue propio necesita integración con proxy confiable para evitar penalizar tráfico compartido.
- SQL LF canónico evita hashes diferentes Windows/Linux. Coste: staging con ledger CRLF exige reconciliación explícita, nunca edición ciega de checksums.
- Se conservan columnas legacy con la hora anterior para reversa. Coste: almacenamiento y limpieza posterior revisada.
- Se sustituye lint de Next por TypeScript/hooks/JSX accesible para retirar cadena vulnerable de dependencias sin parche. Coste: reglas específicas de Next deben restituirse cuando exista una cadena corregida; build advierte ausencia del plugin.
- El puente Drizzle del registro borra el genérico a una unión concreta solo al seleccionar tabla; inputs conservan validación específica. Coste: tests reales por recurso deben cubrir errores de mapeo.
- RLS backend permite DML del grupo servidor; el aislamiento institucional sigue en la autorización de handlers. Coste: cualquier nuevo handler debe usar esos guards y probar tenant/usuario/recurso/estado.
- El operador de migración debe poder revocar defaults de cada propietario cloud. El script falla antes de aceptar una promoción incompleta. Coste: reconciliación de privilegios y procedimiento staging antes de producción.

Reversa/promoción detalladas en docs/implementation/P0_HARDENING.md. Conservar RLS y REVOKE durante reversa; no regresar a dependencias vulnerables ni borrar auditoría/ledger.

## 5. Preguntas y evidencia requerida para cerrar

- ¿Quién ejecuta y registra el recorrido con lector de pantalla en login, cambio de contraseña y catálogo?
- ¿Cuál será el entorno staging aprobado y el runtime donde medir Argon2id con concurrencia realista?

Estas preguntas no impiden publicar un PR de revisión; sí impiden afirmar que toda la DoD y la promoción productiva están verificadas.
Medición local Argon2id (7 muestras, concurrencia 1, Node v24.18.0 Windows x64): hash mediana 125 ms / máximo 137 ms; verify mediana 126 ms / máximo 133 ms; pico RSS del proceso 105176 KiB. Incluye runtime y memoria nativa; no extrapolar a hosting ni concurrencia de producción.
