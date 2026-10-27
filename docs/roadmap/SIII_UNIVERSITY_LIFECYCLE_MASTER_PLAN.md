# Siii — Plan maestro de admisiones, caja, matrícula, vida académica y Compañero

> Roadmap de ejecución basado en una revisión de ambos repositorios el 2026-10-18. Este archivo define **trabajo pendiente**, no certifica funciones implementadas. No contiene credenciales ni datos personales.

## 0. Diagnóstico verificado y decisiones de arquitectura

- **Siii:** repositorio `ErickRFM/Siii`, `main` a la auditoría `cf22ae50bdfdfe67ddf7dd0d074e8ec6a41f474d`; Next 15, React 19, TypeScript, Drizzle, PostgreSQL/Supabase y Vercel. PR #47 de MFA inline fusionado; PR #48 de UX de aceptación nuevo/existente abierto y en CI; PR #40 de paginación de inscripciones/asignaciones abierto. Reconciliar ambos antes de cambiar estos módulos.
- Identidad existente: `platform_users`, `people`, `institution_memberships`, `role_assignments`, sesiones, MFA, verificación de correo e invitaciones. Al aceptar una invitación nueva se crea cuenta y membresía, **no** un expediente ni una matrícula. Conservar autorización y consentimiento.
- Escolar existente: `institutional_students`, `institutional_teachers`, `academic_sections`, `section_enrollments`, `section_teachers`, `teacher_account_links`, catálogos/programas/planes y horarios/calificaciones. Un estudiante académico no está ligado de manera obligatoria a `platform_users`; su `enrollment_number` se crea manualmente.
- No aparecen migraciones/tablas de caja, obligaciones financieras, pagos, recibos o conciliación en `db/migrations/0000`–`0018`; introducirlas, sin inferir ni reutilizar tables de otro proyecto.
- **Compañero:** repo `ErickRFM/Compa-ero-de-esc`, `main` a la auditoría `3254db3ea1650c8eff8e871f086b08ac3f1a9b99`. Ktor mantiene cuentas y sesiones propias; existe `SiiiAcademicProvider` y una base de proyecciones/snapshots. No existe SSO certificado ni entrega de datos completa a Android. PR #200 de composición sin mocks abierto. No mezclar proveedores de identidad y académicos.
- **Una sola fuente institucional:** PostgreSQL en Siii para identidad institucional, admisiones, planes, cobros y expediente. MongoDB en Compañero para experiencia y proyecciones autorizadas; nunca segunda autoridad académica ni copia de contraseñas.
- **Tratar registro, admisión, derecho de inscripción y expediente como estados diferentes.** Nunca solicitar matrícula para crear una cuenta de aspirante, ni acreditar pago por aceptación de invitación.

## 1. Reglas de dominio no negociables

1. Una persona puede tener **cuenta sin matrícula**. Aspirante no equivale a alumno inscrito. Una misma identidad puede tener varias membresías institucionales con ámbitos propios, nunca cruzar datos.
2. Una matrícula es **única por institución, estable, no reutilizable**, ligada una vez a un `student_id` y asociada mediante un vínculo validado a una cuenta. Congelar su formato por institución; no usar correos ni matrícula como llave primaria.
3. La liberación se produce cuando hay decisión académica favorable y **obligación financiera cumplida, exenta o becada** según política y periodo. Un pago informado por el cliente, webhook no autenticado o capturas de pantalla no es prueba de cobro conciliado.
4. Los cargos, pagos, devoluciones y exenciones son registros auditados; ajustes por asientos compensatorios, no cambios silenciosos del histórico. Representar dinero en unidades menores enteras (`amount_minor`, `currency='MXN'`), no float.
5. Una matrícula asignada no se borra por adeudo o baja. Las restricciones aplicables se modelan en la inscripción/servicio conforme a política; conservar derechos de consulta y datos.
6. Estado de pago ≠ estado de admisión ≠ estado de cuenta ≠ estado académico. Los tres procesos no se colapsan en un booleano `active`.
7. Control de acceso siempre en API y SQL: institución + rol + recurso + ámbito + estado; frontend es solo proyección. Reutilizar MFA/step-up para operaciones privilegiadas, no imponer MFA de administrador a estudiantes nuevos.
8. No introducir datos ficticios en producción, no desactivar RLS, no modificar manualmente claves de usuario, ni aplicar migraciones con `npm run db:migrate` contra Supabase Production.
9. Habilitar contratos de Compañero mediante servidor-a-servidor, claves dedicadas, HMAC/identificadores estables, outbox/inbox, versiones, idempotencia y revocación. El Android no conoce las claves de Siii ni consume Supabase.
10. Toda transición sensible: precondición de estado en servidor, transacción ACID, bloqueo/serialización, auditoría, idempotency key, rechazo de concurrencia y respuesta explicable al usuario.

## 2. Modelo de flujo: tres rutas de ingreso

### A. Aspirante (ruta regular, sin invitación)
`/admisiones` público -> Crear/verificar cuenta y correo -> Solicitud por institución/convocatoria/programa -> Captura progresiva de datos/documentos -> revisión por Control Escolar -> Dictamen/admisión -> orden de cobro -> pago conciliado o resolución formal de exención/beca -> asignación/activación de matrícula -> inscripción por periodo y materias/grupo -> panel Estudiante -> publicación académica hacia Compañero.

### B. Personal o colaborador (invitación)
Correo Resend con enlace de un uso -> revisar institución/rol/alcance/vigencia -> crear cuenta propia o vincular existente -> consentimiento -> rol institucional autorizado -> portal de docente, tutor, coordinador, caja o administración. Para docentes, vincular el registro `institutional_teachers` y `teacher_account_links` sin crear otro empleado.

### C. Alumnos existentes / importaciones autorizadas
Control Escolar localiza el expediente por matrícula y prueba de identidad -> reclama o vincula su cuenta con verificación de correo y reglas contra apropiación de cuentas -> conserva matrícula e historial original -> no genera cargos duplicados ni cambia identificadores -> permite acceso al portal. La invitación puede ser un mecanismo excepcional de reclamación, nunca reemplazo de admisión.

## 3. Fases de ejecución y entregas Git

### F00 — Cierre de la base y contratos (P0)
- Reconciliar PR #48 y PR #40 con `main` y CI de sus SHAs exactos. No fusionar ramas por antigüedad ni desplazar cambios de MFA, navegación y paginación.
- Mapa de datos / ERD de `people`, `platform_users`, `institution_memberships`, `institutional_students`, `academic_programs`, `academic_terms`, `section_enrollments`, pagos futuros y vínculo docente.
- Definir formalmente qué cobranza habilita matrícula, inscripción o reinscripción; políticas por institución/periodo, exenciones, becas, parcialidades, caducidades, traslado de carrera y recuperación de pago.
- Definir esquema de matrícula configurable por institución (prefijo, año, secuencia) y detectar duplicados históricos, correos repetidos y expedientes sin cuenta **sin modificarlos**.
- Contratos HTTP/DTO/eventos versionados y permisos por recurso. Estándares visuales Siii (vino, claro/oscuro mate, glass discreto, 360/390/430 px, accesibilidad, estados de carga/error/vacío).
- **Salida:** documento de estados/invariantes, contratos OpenAPI o equivalentes, mapa de migraciones y pruebas RED iniciales. Un PR exclusivamente de especificación.

### F01 — Identidad universal y aspirante (P0)
- Crear onboarding público de aspirante independiente de las invitaciones: creación de cuenta con contraseña Argon2 existente, verificación email Resend, limitación de intentos, protección contra enumeración y duplicados, recuperación de contraseña existente.
- Modelo propuesto: `applicant_profiles`, `admission_cycles`, `admission_applications` (tenant, convocatoria, programa, candidato, estado, version, timestamps, auditoría) y `admission_documents` con metadatos y referencia de almacenamiento; no bytes/documentos en logs.
- Estados sugeridos: `DRAFT -> SUBMITTED -> UNDER_REVIEW -> ADMITTED | REJECTED | WAITLISTED`; `CANCELLED` explícito. Estados anulables/rectificables sólo mediante política y auditoría.
- API propuesta: `POST/GET /api/v1/admissions/applications`, `.../{id}/submit`, lectura y decisión institucional protegidas. Documentos con URLs temporales/firmadas, MIME, tamaño y antivirus/malware gate cuando aplique.
- UX: asistente móvil por pasos, guardar borrador, validación de correo, resumen de requisitos y estado; no pedir matrícula o contraseña anterior.
- **Pruebas:** carrera/campus fuera del ámbito; IDOR, duplicados, email verification, reintentos, concurrencia de solicitudes, revocación, accesibilidad móvil.
- **PRs:** `feat/admissions-identity-foundation`, `feat/admissions-public-onboarding`, `feat/admissions-review-workflow`.

### F02 — Expediente e identidad académica vinculados (P0)
- Migración aditiva propuesta `student_account_links` vinculando `institutional_students` a `institution_memberships` y/o `platform_users` con FKs compuestas por `institution_id`, índices únicos sobre vínculos activos, estados/procedencia/evidencia y auditoría.
- Mantener sin cambios matrícula/ID del alumno. Crear flujo de reclamo por usuario, validación institucional y resolución manual de conflictos (no unir por simple coincidencia de email). Docentes usan `teacher_account_links` existente.
- Crear `academic_student_profiles`/expediente extendido según los campos reales y relación de documentos. Datos opcionales, versionado y permisos de acceso propios.
- Backend de consulta «mi expediente» basado en sesión, jamás `studentId` arbitrario. Restricción de lectura a su propio estudiante/ámbito, prueba multiinstitución y cambio de rol.
- Proceso de backfill reversible y auditado para alumnos existentes; no inventar cuentas ni migrar expedientes por coincidencia parcial de nombre.
- **Salida:** persona->cuenta->membresía->student unívoco, sin romper `src/components/school-registry.tsx` y APIs actuales. PRs separados SQL+API+UI.

### F03 — Caja, obligaciones y contabilidad operativa (P0)
- Primera entrega **sin pasarela financiera**: catálogo de conceptos/versiones por institución/periodo, lista de precios, cargos, becas, descuentos, exenciones y comprobantes de pago sujetos a revisión. Caja registra cobros manuales con referencia y evidencia; confirmación autorizada y trazabilidad.
- Esquema propuesto `charge_concepts`, `charge_orders`, `charge_lines`, `payment_intents`, `payment_receipts`, `payment_allocations`, `financial_adjustments`, `scholarship_awards`, `payment_audit_events` con tenant, moneda, fechas, actor, estados y campos de idempotencia.
- Estados de cargos: `OPEN/PARTIALLY_PAID/SETTLED/CANCELLED`; pagos: `PENDING/CONFIRMED/REVERSED/FAILED`; resolución de beca/exención debe quedar acreditada, no simular abono bancario.
- Registrar saldos a partir de movimientos inmutables (cargos - aplicaciones + devoluciones), evitar edición destructiva; dinero en centavos enteros y totales con conciliación. Permitir pagos parciales/configuración de exigibilidad.
- **Caja no equivale a pasarela.** Integrar Stripe/Mercado Pago/banco sólo después de elegir proveedor y obtener credenciales. Adaptador desacoplado, webhook firmado, reintentos, deduplicación e informes de conciliación.
- Interfaces: operador Caja (cargos, cobros, autorizaciones, cierres), estudiante (saldo, órdenes, comprobantes), Control Escolar (estado financiero por periodo sin editar pagos). Separar `finance.read`, `finance.manage`, `finance.verify`, `finance.reverse` de `academic.manage`.
- **Pruebas:** centavos, pagos dobles, webhooks repetidos/falsificados, reversos, acceso indebido a recibos, concurrencia, cierre de caja, conciliación y usuarios sin permisos.
- **PRs:** `feat/finance-schema-ledger`, `feat/finance-cashdesk`, `feat/finance-student-statement`, opcional `feat/finance-provider-*` después.

### F04 — Activación de matrícula, liberación de inscripción y reinscripción (P0)
- Separar `student_id` UUID, `enrollment_number` institucional irreversible y estado académico. Proponer secuencia transaccional por `institution_id`, `year/cohort` y política, protegida con unicidad en DB y nunca generada en Android.
- Estados de habilitación sugeridos: `ADMITTED -> PAYMENT_PENDING | FINANCIAL_WAIVED -> ELIGIBLE -> MATRICULATED -> ENROLLED`; no usar un único campo para cuenta, solicitud y periodo. Matrícula puede otorgarse antes del pago sólo cuando la institución lo parametrice explícitamente; criterio por defecto conserva verificación previo a activación.
- Servicio de **matriculación idempotente** bajo bloqueo: confirma dictamen, requisitos, pago real o exención y disponibilidad; crea/activa expediente + matrícula UNA VEZ, y emite evento dentro de la misma transacción. Evitar saltarse Control Escolar con llamadas directas a `/registry/students` desde usuario alumno.
- Evolucionar `section_enrollments` sin romper retiros, cupos ni la paginación del PR #40; inscribir materias por periodo, revisar oferta, prerequisitos, colisión de horarios, carga mínima/máxima y cupos bajo transacción.
- Reinscripción usa el **mismo** alumno/matrícula y cobros del periodo; historial nunca sobrescrito. Cambios de programa, baja temporal, reingreso y egreso son eventos separados con autorización.
- **Pruebas:** N solicitudes simultáneas -> una matrícula; pago revertido en carrera con inscripción; exención válida, conflicto de programa, sobrecupo, colisión/duplicado por sección, backfill y migración de expedientes existentes.
- **PRs:** `feat/matriculation-allocator`, `feat/enrollment-eligibility`, `feat/reenrollment-term-lifecycle`.

### F05 — Planes de estudio, materias e historial (P1)
- Construir relación real `curriculum_versions -> academic_courses` con semestre/cuatrimestre, créditos, obligatoriedad/electivas, seriación/prerequisitos y equivalencias; vincular versión curricular a cada alumno con trazabilidad.
- Construir transcripto/historial institucional a partir de inscripciones e `final_grades`/publicaciones vigentes; no mostrar borradores ni rectificaciones no autorizadas como calificación oficial.
- Vista estudiante: carrera, avance/créditos, mapa curricular, oferta, horario de sección, materias cursadas/pendientes, calificaciones oficiales, historial y documentos descargables según autorización.
- Vista docente: grupos/secciones asignados, lista, agenda, evaluaciones y publicación de notas; reutilizar `teacher_account_links`, `teacher-gradebook.tsx` y permisos docentes.
- Rectificaciones con motivo, versionado, doble control si institucionalmente se exige y auditoría; nunca mutar finales silenciosamente.
- **Pruebas:** equivalencias, cambios de plan, interrupciones, grados retenidos/publicados, docentes no asignados, sin registros, paginación y crecimiento histórico.
- **PRs:** `feat/curriculum-course-map`, `feat/student-transcript`, `feat/teacher-workspace`.

### F06 — Portales por perfil y navegación real (P1)
- Panel Aspirante: solicitud/documentos/decisión/cargo/ayuda; Panel Estudiante: identidad y matrícula, carrera, plan, horario, docentes, historial, servicios y pagos; Docente: grupos/roster/calificaciones; Tutor: estudiantes vinculados, avisos/seguimiento; Control Escolar: dictámenes/expedientes/matrícula/reinscripción; Caja: órdenes/cobros/conciliación; Coordinación y Administración: configuración, auditoría, roles e integraciones.
- Permisos de lectura y escritura individuales por recurso y ámbito. Usar `src/shared/auth/capabilities.ts`, `src/shared/auth/roles.ts`, `src/shared/navigation/academic-modules.ts`, `src/components/sii-app-shell.tsx`; no dar capacidad `academic.manage` a todo el alumnado para mostrar su menú.
- Menú izquierdo dependiente del rol y de la institución, con navegación persistente y profunda. Estados loading/empty/error/success/retry, tablas responsivas, formularios conservando borrador, feedback real y operaciones explícitas.
- Visual: misma identidad Siii vino y glassmorphism mate sin brillos, sombras suaves, temas light/dark, contraste, teclado, TalkBack y reduce-motion. Revisar mobile 360/390/430 px y pantallas de invitación/admisión sin abrir pestañas innecesarias.
- **Pruebas:** usuarios reales sintéticos por perfil, menú autorizado, links que abren pantallas no placeholders, 401/403 y accesibilidad axe + verificación humana.
- **PRs:** `feat/role-portals-shell`, `feat/student-portal`, `feat/cashdesk-portal`, `feat/teacher-control-portal`.

### F07 — Identidad compartida Siii↔Compañero (P0 para SSO, después de F02)
- No copiar contraseñas ni hashes entre PostgreSQL y MongoDB. Diseñar **OIDC Authorization Code + PKCE**: Siii como autoridad institucional (o broker/IdP especializado frente a Siii), Ktor valida issuer/audience/signature/JWKS y emite sus tokens propios a Android. El móvil nunca necesita credenciales DB ni tokens privilegiados de Siii.
- Identificador de sujeto estable: `institution_id + account_subject_id`, claims mínimos firmados; `student_id` y matrícula se resuelven en API después de autorización. Manejar consent, links existentes, logout/revocación, suspensión, refresh rotation y claves JWKS.
- Ktor conserva cuentas/proyecciones nativas sin atribuirles autoridad académica; migración de identidades existentes explícita, auditada y sin colisiones.
- Guardar proveedor como plugin/adaptador para cambiar de institución/IdP sin reescribir Android. No crear otro registro universal con contraseña paralela.
- **Pruebas:** Android navegador externo y callback PKCE, nonce/state/CSRF, expiración, key rotation, roles, suspensión, revocación, REST 401/403, pérdida de red y regreso.
- **PRs en ambos repos:** `feat/siii-oidc-issuer` (o broker) y `feat/companion-oidc-client`, con RFC previo para escoger producto OIDC y despliegue seguro.

### F08 — Sincronización académica durable y Compañero (P0 para E2E)
- Reutilizar `src/integrations/companion/academic.ts`, API `/api/integrations/companion/v1`, outbox de sección de `0018`, y `SiiiAcademicProvider`/proyecciones Ktor. NO reemplazar en producción con mocks.
- Conectar writers reales de inscripción, bajas, cambios de materia, estado de alumno, horario y docente a outbox versionado dentro de la misma transacción. Nunca publicar antes del commit.
- Adaptador HTTPS autenticado con HMAC/payload versionado; receptor Ktor idempotente con inbox durable, orden monotónico, scope institucional, comprobación de firma/frescura, actualizaciones y tombstones; proyección Mongo autorizada con reconciliación/replay.
- Políticas de datos: no publicar horarios de alumnos aún no elegibles, bajas, permisos revocados; no borrar historial privado incorrectamente; máximo de tamaño sin truncar. Sincronizar asignaciones/horarios reales y considerar `ClassOccurrence` para excepciones fechadas.
- Observabilidad: envío, recibido, aplicado, fallido; métricas y backoff. 202 ACCEPTED no equivale a APPLIED, ni 'online' equivale a consistencia completa.
- **Pruebas E2E:** pago+matrícula+inscripción -> HTTP Siii -> Ktor -> Mongo -> Android muestra Hoy/Horario; revocación y cambio de grupo; caída Render, retransmisión, duplicates, orden inverso y recuperación; validación física APK.
- **PRs:** `feat/siii-academic-writers-outbox`, `feat/companion-section-receiver`, `feat/companion-student-projection`, `test/siii-companion-e2e`.

### F09 — Operación, privacidad, calidad y release (transversal y cierre)
- Revisar todos los archivos de migración con `supabase-v1` (la próxima versión sería posterior a `0018`), PostgreSQL efímero, snapshot validado y rol `siii_migrator`. Despliegue expand -> backfill -> verificación -> cutover -> limpieza **solo posterior**. No `ALTER` destructivo o `DROP` no probado.
- Supabase Production continúa como una sola BD. Nueva tabla: tenant-foreign-key, índices adecuados, RLS forzado y auditoría/propiedad/mínimo privilegio; no crear otra Supabase para solucionar migraciones.
- Feature flags por módulo/tenant: admissions, finance, matriculation, portal, identity and companion; por defecto fail-closed. Backfill sin datos sensibles hacia CI, cifrado de documentos y retención institucional.
- Suite: TypeScript, lint, unitarias, integración PostgreSQL real, Playwright mobile/desktop, axe, seguridad, migraciones fresh+upgrade, concurrencia, smoke 401/403, QA de datos existentes, contrato Ktor, Android instrumentado y recovery drill.
- Vercel/Render: backups/restauración verificados, readiness real, auditoría de rol de DB, credenciales servidor only, observabilidad de workers/colas, límites de rate, idempotencia, cron/reintentos, alertas y rollback a feature off. No reenviar correos reales en tests.
- Piloto: institución+periodo+programa autorizados, cuentas de prueba sintéticas, operador Control Escolar y Caja; monitoreo con checklist firmado y consentimiento de usuarios. Después expansión por campus/tenant.
- **Aceptación de release:** sin errores críticos, E2E genuino entre servicios, respaldo/restauración probados, seguridad de roles, conciliación financiera y pruebas de dispositivos/usuarios humanos. Publicar release tag/APK cuando corresponda.

## 4. Políticas configurables que deben aprobarse ANTES de F03/F04

| Decisión | Valor inicial propuesto |
| --- | --- |
| Cuenta sin pago | Permitida: acceso a admisiones y estado de cobro |
| Admisión sin pago | Según convocatoria; no equivale a inscrito |
| Generación de matrícula | Una sola vez tras aceptación académica + liberación financiera, salvo política institucional explícita |
| Becas, exenciones, convenios | Resoluciones firmadas/auditadas, no pago ficticio |
| Parcialidades | Permitidas según concepto; elegibilidad para inscripción configurable y visible |
| Reinscripción y adeudo | Política por periodo, sin borrar matrícula ni historial |
| Cambio de carrera | Nuevo vínculo/version curricular con expediente conservado |
| Facturación fiscal | Proyecto separado con reglas locales vigentes y proveedor autorizado, no asumir que un recibo de caja sea CFDI |

## 5. Método Git obligatorio

- Una rama de integración por **épica**; cada PR pequeño se crea desde el `main` vigente y se fusiona después de QA. Nombres sugeridos arriba (`feat/...`, `fix/...`, `test/...`). No reescribir historia productiva ni force-push sin reconciliación.
- Orden de PR dentro de cada fase: (1) contrato y tests RED, (2) migración+RLS, (3) API/servicios, (4) UI adaptativa, (5) E2E/observabilidad. Si se pueden revisar independientemente, dividir.
- Checklist de cada PR: alcance/no alcance, diagrama de datos, amenazas/permiso, migración/rollback, capturas mobile light/dark, pruebas y artefactos, diff auditado, flags y dependencias del siguiente PR.
- CI exacto de la cabeza: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:ui`, `npm run build`; suite especializada de migraciones y contratos Ktor cuando aplique. No asumir que Preview READY es Production ni viceversa.
- Merge solo con todos los checks verdes y migración probada en PostgreSQL desechable; desplegar un SHA de `main` conocido, confirmar alias `siii-three.vercel.app` y `/api/ready`. Los datos productivos solo con aprobaciones explícitas y preflight/backup.
- Evidencia: actualizar `docs/implementation/FULL_INTEGRATION_PROGRESS.md` y el presente documento, con PR/commit, tests ejecutados/omitidos, bloqueo y lo que realmente funciona. No anunciar 100% por una UI o un 202.

## 6. Orden de dependencias y cortes funcionales

- **P0 inmediato:** F00 -> F01 + F02 (pueden avanzar en ramas separadas si comparten contrato de identidad) -> F03 -> F04.
- **Primer corte usable para un alumno:** cuenta/verificación -> solicitud -> admisión -> cargo -> pago confirmado/exención -> matrícula -> inscripción y panel personal (una institución piloto).
- **P1 académico:** F05 + F06 luego de existir vínculo estudiante-cuenta y cohortes. Docentes/servicios pueden evolucionar en paralelo con permisos scoped.
- **Integración móvil:** F07 (identidad) en paralelo controlado con F05; F08 requiere matrícula enlazada, reglas de elegibilidad y contrato, además de PR #200 de Compañero y mocks resueltos.
- **Operación:** F09 gate transversal desde el primer PR y cierre obligatorio de cada piloto.

## 7. Criterios de éxito E2E obligatorios

1. Aspirante no invitado crea cuenta sin matrícula; verifica correo y entra solo al panel Aspirante.
2. Se inscribe en convocatoria, envía documentos, Control Escolar aprueba; la decisión queda auditada.
3. Caja emite cargo correcto, acepta pago real conciliado o resolución de exención; repetir operación no duplica movimientos.
4. Servicio transaccional crea/activa **exactamente una** matrícula para una cuenta+expediente, incluso bajo 20 solicitudes simultáneas, sin reasignar matrícula histórica.
5. Inscripción en materias verifica cupos, carrera, plan, prerequisitos y condición financiera; el alumno consulta su horario y docentes.
6. Docente solo edita calificaciones de sus grupos; alumno solo lee notas publicadas e historial propio; Control Escolar administra con su ámbito.
7. Alumno inicia sesión en Compañero con identidad federada, sin nueva contraseña; Android recibe sus materias y horario desde Ktor y muestra los mismos datos que Siii.
8. Suspensión, baja o revocación elimina acceso futuro en Siii/Ktor y actualiza las proyecciones; no elimina la matrícula ni borra histórico.
9. Operación sin red, timeout, webhook repetido, evento fuera de orden, reembolso y recuperación desde backup terminan con estados correctos y sin datos falsos.
10. Prueba real en staging/piloto, evidencia de QA móvil/dark/accessibility, logs seguros y despliegue de `main` verificado.

## 8. Primer sprint propuesto (orden de trabajo)

1. Esperar/verificar CI de PR #48 y reconciliar contra #47. Auditar PR #40 y fusionar solo si mejora sin regresiones; ambos son gates, no excusa para posponer el diseño del dominio.
2. Especificar estados/ERD y revisar campos institucionales de expediente, convocatoria, beca y recibo con la institución.
3. Tests de admisión y vínculo estudiante-cuenta primero (RED): identidad duplicada, acceso fuera de ámbito, admisión sin expediente, estudiante existente y matrícula estable.
4. Preparar migraciones aditivas/revisión RLS en rama y demo con datos sintéticos de una convocatoria y programa; no aplicar a Production.
5. Entregar registro público de aspirante y panel de seguimiento; revisión de UX con capturas 360/390/430 y light/dark.
6. Preparar el contrato de caja y su libro de movimientos, con casos de pago parcial, exención, reembolso y conciliación. Elegir pasarela después.

## 9. Definición de 'cerrado'

Una fase está cerrada solo cuando código, permisos, migración, pruebas, UX móvil, monitoreo, documentación, datos históricos y producción/piloto están verificados en el mismo SHA. **Implementado** no significa **desplegado**; **desplegado** no significa **certificado**; **pago reportado** no significa **pago liquidado**; **correo aceptado** no significa **entregado**.
