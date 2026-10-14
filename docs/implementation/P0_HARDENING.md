# P0 — Endurecimiento de la base existente

Rama `feat/p0-hardening`, base auditada `7070a461` reconciliada con `main c7334cdf`.
Solo P0. No se crean módulos académicos nuevos ni flujos de P1.

## Cambios verificables

- `0002_p0_hardening.sql`: RLS restrictiva para anon/authenticated, REVOKE presente/futuro, grupos de base siii_app/siii_migrator y DML mínimo. Auditoría append-only para la aplicación.
- Periodos como date; timestamps anteriores preservados en legacy_start_date/legacy_end_date. CHECK de fechas y vocabularios, referencias únicas (id,institution_id), campus principal único.
- El runtime HTTP y el worker rechazan credenciales con superusuario, BYPASSRLS, DDL, propiedad de objetos o pertenencia al migrador. El login real de conexión debe heredar solo siii_app.
- Migrador bloqueado en producción, incluido el proyecto Supabase auditado aunque se etiquete como test. Esquema sin ledger requiere adopción explícita y exacta; hashes/orden del ledger se comprueban antes de DDL.
- Archivos SQL con LF canónico: Drizzle calcula SHA-256 sobre bytes; CRLF en Windows daría hashes diferentes de Linux.
- Login siempre verifica Argon2id real/dummy, limita IP y cuenta, reinicia contador tras bloqueo/success, usa backoff 15/30/60 minutos y audita fallos/bloqueos. Piso de respuesta de 250 ms reduce variación de hashes heredados; el rechazo por IP no depende del usuario.
- Argon2id: memoryCost 65536 KiB, timeCost 3, parallelism 1, hashLength 32. El runtime de despliegue necesita su propia medición antes de datos reales.
- Sesión absoluta 7 días, inactividad 30 minutos, máximo 5 sesiones vigentes. Cookie __Host-siii_session Secure/HttpOnly/SameSite=Lax en producción; siii_session en HTTP local.
- Cambio de contraseña rota token y revoca los anteriores; cambios de privilegios/membresía revocan dispositivos del afectado. Lecturas y escrituras usan orden usuario -> sesión; vigencia se comprueba después de adquirir el bloqueo.
- `worker/index.ts --once` elimina sesiones expiradas/inactivas/revocadas y buckets vencidos en transacción con auditoría; modo continuo ejecuta cada 15 minutos y atiende SIGTERM.
- Middleware genera request_id y nonce, reemplaza headers externos y añade CSP/cabeceras. Layout dinámico permite nonce por petición. Logs pino sin cuerpos ni errores SQL y con redacción de secretos/contacto.
- Registro académico por recurso: un schema de create/update, mapeo tipado, estados explícitos, cursor ligado a tenant/recurso y precisión de microsegundos. PATCH registra antes/después. Archivo de programa con planes activos rechazado.
- Listados conservan data y añaden page.nextCursor; limit 1–100, por defecto 50. El catálogo recorre páginas y su selector de planes lee todos los programas mediante cursor.
- UI: foco/skip link, flechas/Home/End en tabs, errores asociados, conexión/desactualización y contraste AA. La aplicación mantiene controles de P1 y demás dominios pendientes.
- CI único, SHA verificados de checkout/setup-node v6, install --ignore-scripts/rebuild explícito, diff --exit-code del lockfile, todos los checks, Postgres 17 y axe/teclado Chromium.

## Entorno y comandos

El CLI no toma autorización del simple nombre del archivo .env. Exportar explícitamente DATABASE_URL e indicar SIII_DATABASE_ENV=development, test o staging. No se admite production.

```powershell
$env:SIII_DATABASE_ENV='development'
# DATABASE_URL se obtiene del gestor de secretos; no pegarla en el chat ni registrarla.
npm ci --ignore-scripts
npm rebuild argon2 esbuild
npm run db:migrate
npm run typecheck
npm run lint
npm test
npm run test:integration
npm run test:ui
npm run build
npm audit
```

Integración/UI necesitan PostgreSQL **local desechable**, credencial de pruebas capaz de crear las bases/roles efímeros y SIII_DATABASE_ENV=test. El servidor web usa un LOGIN distinto, generado por el setup, sin privilegios de propietario. Solo fixtures sintéticos.

Para baseline conocido sin ledger, primero `db:preflight`, exportación estructural revisada y respaldo. En staging/local: SIII_BASELINE_CONFIRM=0001_academic_catalogs y `npm run db:baseline`; luego migrate. El script compara columnas, constraints, índices y enums con `db/baseline/0001-schema.json`. Divergencia = detenerse y reconciliar; nunca reescribir hashes a ciegas.

## Promoción y reversa

No se aplicó ninguna migración a Supabase de producción. La auditoría read-only está en `docs/audit/P0_PRODUCTION_READONLY.json`: 12 tablas sin RLS, grants directos prohibidos vacíos, defaults abiertos, ledger Supabase presente y Drizzle ausente.

Antes de promoción: reproducir el esquema real sin datos personales en staging, reconciliar metadata mediante proceso revisado, comprobar permisos del operador para revocar defaults de **cada** creador, provisionar LOGIN separados y probar el mismo procedimiento con respaldo recuperable. La app URL no puede ser la del migrador/propietario. Producción se promueve por la herramienta y ventana revisadas; nunca db:migrate/db:push.

Reversa conserva la privacidad: no quitar RLS/REVOKE ni regresar a dependencias vulnerables. En mantenimiento y con respaldo, las fechas pueden restaurarse a timestamp usando los valores legacy para filas anteriores y start_date/end_date::timestamp para las nuevas. Mantener columnas añadidas y auditoría; no borrar registros sensibles ni ledger automáticamente. Cambios posteriores de dominio requieren reconciliación de dependencias antes de cualquier reversa.

## Límites explícitos

- Fuera de Vercel, el cliente IP desconocido usa un bucket global; no se confía en X-Forwarded-For del cliente. Autohosting necesita proxy confiable antes de producción.
- Se preserva RBAC v1 institucional. MFA, invitaciones (el POST de membresía por UUID sigue siendo deuda de P1), recuperación, scopes por programa/campus y visor de sesiones/auditoría son P1.
- La validación de lector de pantalla y la medición en el runtime real deben tener evidencia separada; axe/teclado no sustituyen esas verificaciones.
