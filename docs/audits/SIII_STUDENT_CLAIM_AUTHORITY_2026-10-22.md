# SEC06 — autoridad y prueba de buzón para claim de estudiante

Fecha:2026-10-22. Rama local `fix/student-claim-authority-20261022`. Base inicial main8b2bd2c6; composición privada actual935f2220, que aporta el helper común revisado. Esta composición NO acredita integración en main. Publicación bloqueada hasta integrar ese prerrequisito, reconciliar y repetir gates sobre el SHA final.

## Cambio acotado

Solo el handler `POST /api/v1/institutions/:id/student-links/claim` cambia producción. Reutiliza authorizeCapability('institutions.read') y domainTransaction({capability:'institutions.read'}) sin editar el helper, Admisiones, F2, schema o migraciones. El límite común valida usuario/sesión/institución/membresía/grant y MFA privilegiado antes de trabajar y antes del commit. Un alumno con sesión válida no adquiere un requisito MFA nuevo; un administrador sí conserva su MFA obligatorio.

Antes de consultar matrícula se requiere origen y autoridad institucional. Dentro de la transacción se bloquean el contacto del actor, su prueba global de buzón y el estudiante por tenant+matrícula. La creación automática exige tres correos canonicalizados iguales: people.email actual, accountEmailVerifications.verifiedEmail del mismo usuario y institutionalStudents.institutionalEmail. Coincidencia de texto sin prueba, prueba de otra cuenta, contacto cambiado o nulo producen la reclamación pending201. No se consulta la prueba de aspirantes ni se interpreta un correo de membresía como propiedad.

La prueba existente procede de aceptación de invitación con bearer+consentimiento y FK invitación/correo/usuario; también es autoridad de recuperación de contraseña. Es global e histórica: una invitación aceptada de otro tenant acredita el mismo buzón, aunque no concede permisos en el tenant destino. La membresía/capacidad actuales se comprueban independientemente.

Se comprueban ambos vínculos activos: estudiante y membresía. El mutex institucional compartido serializa las carreras; las dos restricciones únicas conocidas se traducen también a409 fuera de la transacción. La auditoría usa student.link.auto_approved o student.claim.requested, actor/tenant/recurso/requestId y after mínimo, sin copiar nombres/correos/bearers. Cualquier fallo de auditoría o denegación final revierte la fila y la auditoría. Los errores tipados se resuelven fuera de domainTransaction.

Se preservan ambos201 `{data}` y sus mensajes,401 UNAUTHORIZED,400 INVALID_INPUT,404 STUDENT_NOT_FOUND,409 ALREADY_LINKED y500 CLAIM_FAILED. El JSON malformado ahora se trata como400 en vez del500 anterior. Ausencia de membresía activa, tenant inactivo, cambio de contraseña pendiente, MFA privilegiado ausente u origen incorrecto dan403; son restricciones de seguridad deliberadas.

## Evidencia real y aislamiento

- Worktree exclusivo student-claim-authority. Nueva base sintética siii_claim_test en PostgreSQL17.11,127.0.0.1:55439, guard SIII_DATABASE_ENV=test. Migraciones existentes0000–0024,25 entradas journal; no cambios de archivos SQL. No se consultó/migró/detuvo otra base de aplicación.
- Servidor HTTP exclusivo3203, con handshake de instancia del harness vigente. No se usaron3107/3201/3202. Las fixtures de invitación extraen únicamente correo sintético cifrado y aceptan consentimiento por HTTP; no insertan un indicador de verificación ficticio. No hay envío real de correo.
- RED contra handler original8b2bd2c6:29 casos,21fallos/8controles, exit1,47.75s. Mostró201 sin autoridad/MFA/origen, autoaprobación sin prueba/de otro usuario, auditoría ausente, rollback/revocación/caducidad omitidos,500 por vínculo de membresía y carrera1actor/2estudiantes, y500 con JSON malformado. El gate de auditoría tardía no se alcanzó porque el handler original no auditaba.
- GREEN de la fuente nueva:29/29 HTTP, exit0,96.32s (88.61s de casos). Incluye aceptación real de invitación propia/ajena al tenant, prueba triple, carreras, auditoría correlacionada con la cabecera, fallos de auditoría, revocación durante espera/tras alcanzar auditoría y caducidad durante auditoría.
- El primer intento GREEN no ejecutó casos: HTTP_TEST_SERVER_TIMEOUT, log vacío y3203libre. Se inspeccionó y repitió sin cambiar harness, caché, plazo ni aserciones. No se atribuye causa concluyente ni se cuenta el intento como aprobado.
- npm ci:375paquetes y audit0; npm rebuild argon2 esbuild exit0.
- npm run lint:exit0.
- npm test:826/826 en56archivos,exit0.
- npm run build:exit0, compilación38.3s y31/31 páginas generadas; sin servidor dev simultáneo. Aviso basal del plugin Next no detectado en ESLint, sin alterar configuración.
- npm run typecheck después del build:exit0.

Regresión repetible: variables DATABASE_URL/INTEGRATION_DATABASE_URL exclusivamente de la base local anterior, SIII_DATABASE_ENV=test y SIII_TEST_PORT=3203; `npm run test:integration -- tests/integration/student-claim-authority-http.test.ts`.

## Límites y siguiente gate

La lectura `student-links/me` conserva su deuda de estado/membresía y queda explícitamente fuera del parche. No existe consumidor frontend de claim en el árbol revisado; los lifecycle existentes no ejercitan esta operación. Las reclamaciones pendientes conservan el comportamiento actual; no se inventó aprobación manual, roles nuevos, idempotencia de pendientes ni requisitos académicos adicionales.

No se ejecutó navegador ni la integración completa del repositorio en este incremento API. Los29HTTP y826unitarias no acreditan seguridad integral del módulo, disponibilidad productiva ni sincronización Compañero. Revisión independiente, integración del helper, reconciliación y CI del SHA publicado siguen pendientes. Sin push/PR/merge, migración productiva ni cambio en claim/me.
