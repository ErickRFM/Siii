# Admisiones: autoridad de escritores y auditoría transaccional

Base main@8b2bd2c66c730519193704c6e2becdd64de55fac; rama local fix/admissions-write-authority-20261022.

## Cambio acotado

Sólo POST admissions/cycles y POST admissions/applications/:applicationId/decision. Ambos usan admissions.manage institucional mediante authorizeCapability y domainTransaction existente, ampliada para capacidad explícita y contexto vigente bajo bloqueo antes del cambio y antes del commit. Las ramas legacy de permisos y calificaciones conservan su comportamiento y assurance.

Se mantiene201 con data,401 sin sesión,403 sin autoridad/origen válido,400 de validación (incluye JSON malformado),404 de solicitud inexistente/ajena y500 con CYCLE_CREATE_FAILED o DECISION_FAILED. DomainAccessDenied se propaga al mapper403 fuera de la transacción. Control Escolar institucional y administradores requieren MFA vigente; no se cambia F2.

Cada dictamen lee/bloquea la solicitud por id+institución dentro de la transacción, añade historial y actualiza el estado. No se inventan transiciones terminales ni rechazos409. Auditoría y cambio comparten transacción, actor, institución, recurso, requestId y antes/después. La correlación usa el ID generado por middleware y devuelto en la respuesta, sin confiar en el ID cliente.

## Evidencia local sintética

- npm ci --ignore-scripts:375 paquetes; audit0. Migraciones EXISTENTES0000–0024 aplicadas a base NUEVA siii_admissions_write_test, PostgreSQL local127.0.0.1:55439. Sin migraciones editadas ni datos/secretos productivos.
- Build de base correcto; RED de admissions-write-authority-http.test.ts:17 fallos/13 aprobados, con201 sin MFA/origen,403 para Control Escolar y ausencia de auditoría/revalidación.
- Primer build corregido:26/30. Las cuatro diferencias provenían de una expectativa incorrecta del requestId cliente. Se verificó middleware y las pruebas HTTP existentes; el test ahora exige el ID servidor y que difiera del cliente, sin modificar producto.
- GREEN30/30 HTTP sobre build de producción, servidor exclusivo3202. Cubre positivos admin/Control Escolar+MFA, sesión/MFA/rol/alcance/tenant/origen/JSON, solicitud ajena/inexistente, revocación antes del bloqueo, pérdida de grant/expiración durante auditoría, rollback al fallar audit y dos decisiones concurrentes con dos transiciones auditadas.
- La revisión independiente detectó que la opción genérica podía admitir capacidades con requisitos de sección/step-up. RED2/2 confirmó callbacks ejecutados para grades.publish y roles.assign. Se corrigió con una unión tipada de opciones mutuamente excluyentes y allowlist runtime de admissions.manage/institutions.read; no se alteró la rama gradeScopeAllows ni su assurance crítica. Ocho unitarias fijan rechazo, modos ambiguos, capacidades soportadas, legacy y publicación por sección.
- Tras esa corrección: TypeScript, ESLint, build y826 unitarias/56 archivos correctos;30/30 HTTP focales repetidos sobre el build final. Revisión independiente final aprobada: Important cerrado, sin Critical/Important pendientes; confirmación recibida de coordinación antes del commit local.

Los HTTP usan SIII_DATABASE_ENV=test, SIII_HTTP_TEST_PRODUCTION=1 y SIII_TEST_PORT=3202. El harness crea un rol de aplicación restringido, valida la instancia y cierra su propio servidor. No se ejecutaron suites contra3107 ni se detuvo PostgreSQL compartido. No se ejecutó la suite HTTP global: evidencia focal más unitarias completas. Avisos existentes de plugin Next/ESLint y futuros imports de Vite no se ocultaron.

## Estado y límites

SEC-03/SEC-06: PARCIAL; sólo estos dos escritores. student-links/claim, finanzas, UI y restantes pendientes históricos están fuera de alcance. Sin Supabase, roles productivos, push, PR ni merge. Revisión independiente aprobada; CI del commit exacto e integración siguen pendientes. Este informe no acredita producción.

Contexto comunicado por coordinación: PR80 integrado en main8b2bd2c6 con el árbol de95f9252c; CI premerge39736372668 y39736367431 SUCCESS (818 unitarias/404 PostgreSQL/84 UI), Vercel SUCCESS. CI postmerge39738330828 pendiente al recibir la coordinación. PR82 finanzas a08c39f sobre8b2bd2c6 tenía67 HTTP/818 unitarias/build local verdes y revisión aprobada; CI pendiente y cuota Vercel24h. Son referencias de coordinación, no ejecuciones de esta rama.

SEC01/05 no se declaran disponibles en producción: permanecen las puertas de sender/scheduler, roles efectivos y ledger/restauración/despliegue.
