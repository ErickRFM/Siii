# Autoridad de escritura financiera — 22 octubre2026

## Alcance verificable

Base `main@2be56cd1647b0feecf6649628f1bf8381b928833`; rama `fix/financial-write-authority-20261022`. Incremento API parcial para SEC-03/06 y la defensa HTTP de SEC-04. Solo se modifican las dos rutas financieras y se añade `src/modules/financials/write-transaction.ts`, regresión HTTP específica y documentación. No cambia F2, capacidades, UI, Admisiones, esquema, journal ni migraciones.

Los POST de conceptos y órdenes conservan `institutions.manage` y sus respuestas de éxito `{data}`. Ahora reutilizan `authorizeCapability` y `lockWriteCapability` antes de escribir y antes del commit; requieren el MFA institucional vigente, sin añadir step-up. `financialTransaction` captura la denegación fuera de `db.transaction`, de forma que la revocación/caducidad final revierte datos y auditoría. Las rutas conservan401/403/400 y500 `CREATE_FAILED`; origen inválido produce403 `INVALID_ORIGIN`.

Las referencias de órdenes se comprueban por institución dentro de la transacción y se bloquean para lectura: concepto y alumno deben pertenecer al tenant; `payerUserId` debe tener una membresía de esa institución. Ausentes y ajenas reciben el mismo400 `INVALID_INPUT`. Se comprueba pertenencia, sin inventar requisitos de alumno activo ni elegibilidad académica. Un alumno graduado sigue admitiendo orden. Los JOIN del GET incluyen institución; una fila histórica cruzada devuelve los campos personales del alumno en null, preservando la proyección existente.

Auditoría transaccional: `financial.fee_type.create` / `financial.order.create`, actor, institución, recurso, `request_id` y un `after` mínimo con códigos/IDs/importes/moneda/estado; sin nombres ni correos de pagadores. El fallo de auditoría revierte la escritura.

## RED → GREEN real

Pruebas sin mocks de autorización: `tests/integration/financial-write-authority-http.test.ts`. PostgreSQL17 local55439, **nueva base sintética exclusiva** `siii_financial_test`, migraciones0000–0023, `SIII_DATABASE_ENV=test`; servidor HTTP3201 configurable mediante `SIII_TEST_PORT`. No se tocó otra base ni Supabase.

1. Antes de modificar producción:17 casos,16 fallaron y1 pasó. Sin MFA/origen válido o con grant revocado se obtuvo201; auditoría inexistente; fallo de auditoría no impedía201. El GET devolvió `ForeignPrivate`/`PRIVATE-FOREIGN` desde otro tenant. El positivo del alumno graduado pasó.
2. Se separaron los seis casos de referencias: alumno/usuario ajenos daban201; concepto ajeno y referencias inexistentes daban500. Todos exigían400 uniforme y fallaron antes del arreglo.
3. Fuente final:22/22 HTTP aprobados, exit0,23.18s. Incluye falta de sesión, MFA, roles/tenant, origen y JSON inválidos; positivo con MFA y `step_up_at=NULL`; proyección/auditoría; rollback de auditoría; revocación esperando el mutex institucional y después de empezar la escritura; caducidad de sesión durante auditoría; las seis referencias; alumno graduado; y fila histórica cruzada creada directamente por fixture administrativa.

Comando de regresión: `npm run test:integration -- tests/integration/financial-write-authority-http.test.ts`, con `DATABASE_URL` / `INTEGRATION_DATABASE_URL` exclusivamente locales, `SIII_DATABASE_ENV=test` y `SIII_TEST_PORT=3201`.

## Verificación local

- `npm ci`:375 paquetes; audit0.
- `npm run lint`:exit0.
- `npm run typecheck`:exit0.
- `npm test`:813/813 en53archivos, exit0.
- Regresión HTTP final:22/22, exit0.
- `npm run build` escalado:exit0, compilación22.1s,28/28 páginas estáticas generadas, rutas financieras presentes. Sin dev/build simultáneos.

Una repetición HTTP no ejecutó casos porque el arranque agotó el plazo existente (`HTTP_TEST_SERVER_TIMEOUT`, log vacío). Se repitió sin aumentar timeouts ni cambiar harness/cache:22/22 verdes en la fuente final. Un intento de build dentro del sandbox no produjo progreso/traza nueva durante más de dos minutos; se verificó y detuvo exclusivamente el proceso propio del worktree. La repetición escalada terminó correctamente. No se atribuye causa concluyente ni se cuentan esas interrupciones como aprobaciones. El build conserva el aviso basal del plugin Next no detectado en ESLint; no se alteró configuración.

La primera adaptación a `domainTransaction` pasó HTTP pero TypeScript detectó que su unión legacy `Permission` no contiene `institutions.manage`. Se reemplazó por un adaptador financiero mínimo al `lockWriteCapability` vigente; sin casts ni cambios en F2. Se repitieron TypeScript y la regresión HTTP sobre la fuente final.

## Lo que permanece abierto

**No cierra SEC-04 DB:** la fixture administrativa aún puede insertar una relación histórica cruzada porque falta la FK compuesta para el alumno. No se añadió ni aplicó una migración. La futura0025 deberá seguir a0024 de PR80, incluir preflight/ensayo aislado y tratar correctamente `ON DELETE SET NULL` solo sobre `payer_student_id`; nunca anular `institution_id NOT NULL`, borrar datos reales o reescribir el ledger.

SEC-03/06 globales siguen abiertos: Admisiones y vínculos son otros escritores. No se ejecutó la suite completa de integración ni navegador para esta rama API; el CI completo corresponde a su futura publicación. No se afirma disponibilidad productiva, flujo universitario completo ni remediación del historial cruzado. Se conservan también las limitaciones existentes del folio aleatorio de órdenes y los listados sin paginación; este incremento no cambia esos contratos.

La revisión independiente del coordinador y el CI del SHA publicado siguen siendo gates antes de merge. No hubo push, PR, merge ni operación productiva desde esta tarea.

## Revisión independiente y correlación HTTP

El coordinador comunicó revisión independiente favorable de `d3da6485`, sin hallazgos Critical/Important. Se resolvió la observación menor de cobertura: los dos positivos financieros ahora exigen que el `request_id` persistido coincida exactamente con `response.headers.get('x-request-id')`, además de validar el UUID. No se modificó producción. Repetición específica:22/22 HTTP aprobados en16.59s; lint y typecheck exit0. El CI del SHA publicado permanece pendiente; no se repitieron build/unitarias por este cambio exclusivo de prueba/documentación.
