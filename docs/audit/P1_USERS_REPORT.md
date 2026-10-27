# P1 — usuarios, membresías y recuperación (F06)

Fecha: 2026-10-15. Base reconciliada: 242092855736900b9e26c72ea96b69fc2cc5e103 (PR23), dependiente de P0.1/MFA/RBAC/invitaciones. Rama: codex/p1-user-management. Estado: implementación funcional revisada y QA local final verde. No se declara completa conforme a F13 mientras falten CI, merge y puertas externas.

## Capacidad entregada

Usuarios incorpora listado/búsqueda/filtros/cursor, detalle, perfil institucional, activación/suspensión, baja lógica, rehabilitación e historial persistente. Alta mediante invitación consentida F08; roles y ámbitos reutilizan F07 y sus once perfiles (incluidos los siete solicitados). Identidad global y pertenencia institucional siguen separadas. La baja revoca concesiones; rehabilitar no las recrea. Cada acción sensible valida tenant, jerarquía, estado, sesión, MFA y step-up tras bloqueos; auditoría y cambio comparten transacción.

Recuperación pública y administrativa se dirige exclusivamente al correo global verificado. El titular elige su contraseña, conserva el requisito de TOTP/recovery si tiene factor activo y debe iniciar sesión después. Token de 256 bits ligado a propósito/usuario/request/authVersion, un uso, máximo 30 minutos, hash en base y bearer sólo en fragmento/memoria. El administrador no recibe enlace ni contraseña. Outbox cifrado separado y worker real con leases/CAS, payload inmutable e idempotencia propia.

La UI ofrece estados de carga, error, desconexión, confirmaciones, foco y formularios accesibles; mantiene borradores y evita que una respuesta anterior sustituya la selección o el enlace nuevo. Navegación conectada a endpoints reales. No introduce operaciones académicas F3–F8 inexistentes.

## Persistencia y permisos

Migración aditiva 0009_p1_user_management.sql, SHA256 A7CA5A54C19A7370248E753BDE04581CA48F24AC5E25AE0B12A10D73B825C099. Se conservaron SQL0–8 y hashes históricos. Aplicación y repetición mediante el migrador real en PostgreSQL17 local sintético p1_users_test, con LOGIN web que hereda sólo siii_app. RLS habilitado/forzado, API pública denegada; historial SELECT/INSERT, requests/outbox SELECT/INSERT/UPDATE, sin DELETE ni propiedad para el runtime.

No se ejecutó esta migración sobre Supabase ni producción. Los ensayos staging autorizados de P0.1 conservan su estado parcial documentado; no se saltaron SQL históricos, privilegios ni ledgers.

## Revisión y regresiones

Dos pasadas de backend corrigieron historial omitido en PATCH legacy y divulgación de users.restore contra estado incorrecto. Dos pasadas UI comprobaron bearer efímero, generaciones y accesibilidad; se corrigió el nombre accesible de los filtros y se amplió la prueba A→B. La primera QA global encontró cinco incompatibilidades de estado HTTP; se conservó el contrato F07 de lista vacía al perder autoridad durante SQL, manteniendo todos los controles. Los tests previos quedaron intactos. Véase [revisión](P1_USERS_REVIEW.md).

Evidencia dirigida: 33 HTTP F06, 62 regresiones MFA/F08 y 60 regresiones F07/F06 después del ajuste final; 7 Chromium F06. Ningún correo externo enviado.

## QA del ejecutor principal

- npm ci: salida0, dependencias sin cambios posteriores.
- typecheck y lint: salida0.
- Unitarias: 678/678, 23 archivos.
- Migrador repetido: MIGRATIONS_APPLIED, sin drift.
- Integración: 216/216, 14 archivos, 270,73 segundos.
- Chromium completo: 32/32, 4,5 minutos. Build y npm audit: salida0, cero vulnerabilidades. git diff --check: salida0. Solicitudes temporales contra suspensión liberadas al finalizar ambas etapas.
- CI remota y merge: pendientes.

## Límites y continuidad

El proveedor no está configurado en el runtime de prueba: accepted no acredita recepción y EMAIL_NOT_CONFIGURED mantiene la entrega pendiente. Configuración de secretos, scheduler y recepción real requieren entorno operativo. No hay evidencia humana con lector de pantalla ni medición HTTP del hosting. P0 permanece abierta conforme a [BLOCKERS](../BLOCKERS.md); esta entrega no habilita datos reales ni promoción. Continúa F09 sobre rama dependiente con administración de las propias instituciones y auditoría proyectada, sin convertir super_admin institucional en autoridad global de plataforma.

Detalle reproducible: [backend](P1_USERS_BACKEND_REPORT.md), [interfaz](P1_USERS_UI_REPORT.md), [revisión](P1_USERS_REVIEW.md). Git/CI se registran en el PR funcional correspondiente.