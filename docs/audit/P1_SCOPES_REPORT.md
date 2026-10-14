# P1 — Permisos y ámbitos institucionales (F07)

Estado: implementado y validado localmente en rama dependiente de MFA; pendiente de CI del commit final, PR y merge. P1 continúa parcial.

## Comportamiento

El backend evalúa 29 capacidades y 11 perfiles con denegación por defecto, tenant, membresía, recurso, estado y caducidad. Las concesiones pueden abarcar institución, programa o campus. Las lecturas revalidan autorización en SQL antes de paginar; las escrituras bloquean y revalidan institución, usuarios, factor, sesión, membresías y recursos.

La delegación exige una sola concesión suficiente: no combina permisos para escalar, no concede más duración que la propia, protege cambios sobre uno mismo y conserva un administrador institucional permanente. Cambios de membresía o rol invalidan sesiones y desafíos del afectado, conservando historia y auditoría.

Administrador, superadministrador y control escolar requieren MFA para operar en instituciones; operaciones críticas requieren step-up de cinco minutos. Una cuenta provisionada puede configurar su propio factor sin obtener acceso institucional anticipado. La revocación del factor se deniega mientras exista obligación por rol.

POST de membresías por UUID global devuelve 409 INVITATION_REQUIRED: la vinculación requiere consentimiento mediante la siguiente entrega de invitaciones.

## Persistencia y API

Migración aditiva 0007_p1_permission_scopes.sql, SHA256 6011BFDAB8A8F4F4C1C6D62202BBB5CEACA459BC35FE9CC1AF5BA2ACBA49627C. Las migraciones 0000–0006 no se modificaron. Se aplicó y repitió sobre PostgreSQL local aislado p1_scopes_test; no se aplicó a Supabase ni producción.

- GET /api/v1/institutions/:id/capabilities: concesiones vigentes, capacidades por ámbito, perfiles delegables, límites de duración y assurance.
- GET /api/v1/institutions/:id/memberships: paginación y datos autorizados con revalidación SQL.
- POST /api/v1/institutions/:id/roles/assign y /roles/revoke: concesiones transaccionales y auditadas.
- GET /api/v1/auth/mfa: indicador propio requiredByRole; no revela roles ni otras instituciones.
- Catálogos y membresías existentes usan las mismas políticas.

UI conectada en /dashboard/institutions/:id/roles y catálogos. Navegación, acciones y ámbitos proceden del backend. Formularios con duración, errores, MFA y step-up reales; la vista de seguridad explica la prohibición de desactivar MFA obligatorio.

## Evidencia local del estado final

- npm ci, typecheck, lint y git diff --check: sin errores.
- Unitarias: 539/539, 14 archivos; incluye matriz de permisos y delegación.
- Integración PostgreSQL/HTTP: 139/139, 10 archivos, 168.55 s.
- Chromium: 18/18; teclado, axe, errores, desconexión, móvil y tema oscuro.
- Build: correcto; npm audit completo: cero vulnerabilidades.
- Dos pasadas independientes de fuente; dos P2 corregidos con siete regresiones RED→GREEN. Segunda pasada sin hallazgos materiales; véase P1_SCOPES_REVIEW.md.

La primera ejecución integral se interrumpió por Modern Standby de Windows: los eventos 506/507 documentaron una pausa de 11.5 minutos compatible con timeouts de procesos y conexiones. No se alteraron pruebas ni timeouts. Se repitieron los dos archivos afectados (38/38, 75.08 s) y después toda la suite (139/139). Durante la repetición se usó una solicitud temporal SYSTEM/EXECUTION limitada a diez minutos y retirada al terminar, sin cambios persistentes de energía. No se borraron bases o ledgers del ensayo interrumpido.

## Límites

No certifica staging cloud, capacidad del hosting, lector de pantalla manual, gestión completa de usuarios, invitaciones ni administración institucional completa. Se mantienen los bloqueos P0 de docs/BLOCKERS.md. Ningún PR dependiente se declara completo antes de CI, revisión y merge autorizado.

## Corrección del harness detectada por CI

Los runs 38642843612 y 38642983960 de 41d251fe fallaron en Chromium: el servidor tenía una clave MFA sintética generada por globalSetup, pero el proceso de los fixtures no la recibía (MFA_KEY_UNAVAILABLE). La configuración local explícita había ocultado la diferencia. Se genera ahora una sola clave en process.env del global setup y se transmite a workers y servidor; el runtime de la aplicación no tiene fallback. Typecheck y la suite Chromium completa se repitieron sin SIII_MFA_KEYS/SIII_MFA_ACTIVE_KEY_ID preconfiguradas: 18/18, 2.2 minutos. CI del nuevo commit pendiente; la evidencia backend 539/139 corresponde a la misma fuente de aplicación.
