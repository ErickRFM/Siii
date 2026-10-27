# Fanout transaccional del registro académico — 24 octubre 2026

Alcance: bloque 1 de `docs/superpowers/plans/2026-10-24-companion-connection.md`, sobre `main@2a3c8390062aefbb87dc8dc596620fee31ff8565`. Preparación local; no acredita activación ni sincronización productiva.

## Causa y corrección

Los PATCH de alumnos/docentes guardaban estados y perfiles sin actualizar las secciones que los incorporan. La prueba HTTP inicial con outbox habilitado encontró siete fallos: no había eventos y un error de inserción de outbox no intervenía en la operación del registro.

`registry-change.ts` obtiene secciones distintas en orden UUID y reutiliza `enqueueAcademicSection` (nombre real de la función existente; el plan mencionaba `enqueueAcademicSectionChange`). Se ejecuta dentro de la transacción autorizada que actualiza el registro y escribe auditoría, conservando su actor y request ID. No modifica contratos, migraciones, flags, credenciales ni transporte.

- Alumno: cambios de estado o nombre producen snapshot en todas sus secciones, incluidas inscripciones históricas retiradas, cuyo payload también contiene nombre y estado. Múltiples filas de inscripción no duplican el evento por sección.
- Docente: cambios de estado producen snapshot de asignaciones no revocadas; inactivar elimina al docente del array y reactivar lo restaura. Cambios de nombre se propagan cuando el docente está activo. Asignaciones revocadas no lo incluyen y no requieren evento.
- Correo institucional e idénticos estado/nombre no alteran el payload v1 y no generan eventos adicionales. Las operaciones conservan su auditoría local.
- Flag apagada: el helper sale antes de consultar relaciones o escribir versiones/outbox.
- Fallo al encolar cualquier sección: PostgreSQL revierte registro, auditoría, versiones y todos los eventos anteriores del mismo fanout.

## Evidencia local

Prueba nueva: `tests/integration/registry-outbox-http.test.ts`. Usa handlers HTTP reales, aplicación con rol mínimo y PostgreSQL desechable en loopback. No mocks de autorización, transacción ni outbox. Incluye todas las transiciones de estado del alumno, inactivación/restauración docente, nombre/correo, varios grupos, historial, tenant, actor sin permiso, origen, orden observado por trigger privado y fallo en la segunda sección tanto para estado como para perfil.

Los logs de esta ejecución quedan en `.p0-local/companion-connection/` (ignorados). Se copió el global setup existente allí cambiando exclusivamente sus rutas locales para no sobrescribir logs anteriores.

| Comprobación | Resultado |
|---|---|
| RED HTTP, sin implementación | 7 fallos esperados / 2 negativos correctos |
| HTTP outbox ON + regresión `registry-profile-http` | 19/19 |
| HTTP outbox OFF + misma regresión | 19/19 |
| `npm test` | 851/851; 59 archivos |
| `npm run typecheck` | Sin errores |
| ESLint de ruta, helper y prueba nuevos | Sin errores |

Comando HTTP: `npx vitest run --config .p0-local/companion-connection/vitest.config.ts tests/integration/registry-outbox-http.test.ts tests/integration/registry-profile-http.test.ts`, con `SIII_DATABASE_ENV=test`, URL de PostgreSQL sintético local y `SIII_ACADEMIC_OUTBOX_ENABLED=true/false`. La configuración temporal reutiliza la configuración de integración y sustituye el global setup por su copia de logs aislados. El setup cierra su propio Next y elimina su rol de aplicación al terminar; PostgreSQL se conserva para el resto del trabajo.

Incidencias de verificación resueltas: el primer `npm test` dentro del sandbox no llegó a cargar pruebas por `EPERM` al renombrar caché temporal de Vite en Windows; la repetición fuera del sandbox pasó completa. El observador de orden inicial no podía escribir su tabla privada bajo `siii_app`; se corrigió exclusivamente el trigger de prueba mediante `SECURITY DEFINER` y `search_path` fijo, sin ampliar grants de la aplicación. Vite avisa sobre imports sin extensión ya usados por la configuración existente; no es fallo de prueba.

## Pendiente fuera de este bloque

Incorporar la prueba nueva al paso CI con outbox ON (el paso actual nombra solo asignaciones); revisión independiente y CI de rama; fanout/autoridad de institución, cuentas y roles; cambios fechados de aula/hora; scheduler, reconciliación y validación completa hasta Android. No se tocaron servicios remotos ni datos productivos.
