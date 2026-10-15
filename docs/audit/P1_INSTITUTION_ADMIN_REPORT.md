# P1 — administración institucional (F09) y continuidad de UX

Fecha: 2026-10-15. Base e2180879aef284239997e3769e450d7a288893b4, PR24 de usuarios/recuperación con CI verde. Rama codex/p1-institution-admin. Estado: implementación funcional revisada y QA global local verde; CI del commit publicado se registra por SHA en el PR dependiente. La integración y las puertas externas impiden declarar COMPLETO conforme a F13.

## Resultado funcional

El dashboard ofrece instituciones propias administrables mediante listado paginado real. El panel /dashboard/institutions/:institutionId/admin consulta y edita nombre, nombre corto, clave y zona horaria IANA/UTC; permite activar, inactivar y suspender con motivo y confirmación. La institución archivada sólo conserva lectura. No se introduce creación global desde el superadministrador institucional.

Una frontera de gestión independiente permite metadata/reactivación/auditoría de las propias instituciones inactivas, manteniendo la prohibición de catálogos, usuarios, roles e invitaciones ordinarias mientras la unidad no esté activa. Requiere concesión institucional admin/super_admin vigente, membresía/identidad/sesión actuales y MFA. Cada escritura exige step-up fresco. No se cambian los guards generales ni los contratos de Compañero/Ktor.

Las ediciones llevan expectedVersion: si otra solicitud ya cambió la institución, se devuelve409 STALE_RESOURCE y la UI conserva el borrador hasta una recarga explícita. Locks ordenados y comprobación temporal posterior a la última escritura/auditoría lanzan rollback ante pérdida de autorización, incluyendo esperas en outbox, índice único o auditoría. La desactivación revoca invitaciones pendientes y cancela mensajes queued/leases de ese tenant sin invalidar identidades globales, otras membresías, concesiones ni metadatos de entregas ya aceptadas. Reactivar no resucita invitaciones.

Auditoría paginada por acción/recurso/fechas con cursor ligado a filtros normalizados. Sólo campos permitidos, actor unido por membresía de ese tenant y targets de tipo conocido+UUID; no expone raw details, contactos, identidad global, contraseñas, bearer/hash o ciphertext. Fecha0000 se rechaza antes de SQL. No se ofrece exportación masiva ni capacidad a gran escala no medida.

## API y persistencia

| Método | Ruta bajo /api/v1/institutions | Capacidad |
| --- | --- | --- |
| GET | /manageable | Descubrimiento paginado de las propias instituciones gestionables. |
| GET/PATCH | /:institutionId/settings | Configuración persistida; PATCH estricto, motivo y expectedVersion. |
| POST | /:institutionId/status | Cambio de estado con motivo/versión y efectos transaccionales. |
| GET | /:institutionId/audit | Historial proyectado, filtros y paginación. |

Migración aditiva0010_p1_institution_admin.sql: admin_version integer NOT NULL DEFAULT0 y CHECK>=0, espejo Drizzle. SHA256 congelada1B9C2C7BEF3C193D09956E2D249FA9463B58C92846C7FC6B77902B29C00FE602. Incremento protegido ante máximo int32. SQL0000–0009 intactos, incluido0009/A7CA5A54C19A7370248E753BDE04581CA48F24AC5E25AE0B12A10D73B825C099.

Se creó p1_institution_admin_test local desde template0 y después p1_institution_admin_lf_test para el artefacto Git LF (véase nota final); migración verificada sobre su schema previo F06 y repetida mediante CLI real. Runtime web de prueba con LOGIN restringido a siii_app y políticas/privilegios heredados intactos. No se ejecutó SQL en cloud o producción ni se eliminaron recursos de staging. La reversa de aplicación puede conservar la columna aditiva; quitarla destruiría la protección de versiones y requiere una migración/ventana aprobada.

## UI y seguridad revisadas

Conserva shell, identidad visual, temas y diseño móvil. Configuración/estado tienen motivo, confirmación, carga, validación, errores asociados, foco y manejo de desconexión. Auditoría y descubrimiento tienen paginación real. Los enlaces de campus/programas/periodos/planes/materias, usuarios/membresías, roles/permisos e invitaciones reutilizan módulos funcionales y capacidades existentes. No se crean formularios académicos ficticios.

La selección de institución usa key y verifica id del DTO; aborta solicitudes al salir. Un401/403 bloquea escrituras y retira el historial visible. Cuenta y seguridad permite retorno propio exacto a admin/users además de los destinos anteriores, manteniendo anclas y rechazo externo. Se corrigió texto que presentaba recuperación F06 como futura.

## Hallazgos y evidencia dirigida

- Comparación de fechas ISO con distinta precisión y target con sufijo: RED unitario, corregido normalizando instantes y validando target exacto.
- Step-up caducado durante auditoría demorada: RED200 en vez de403, corregido mediante throw/rollback posterior a audit.
- Primera revisión independiente: P2 año0000; RED unitario/HTTP500, corregido con año>=1 y negativos de from/to. Segunda revisión favorable, sin nuevos P1/P2; paquete7642D97573661EABA2F31CF4CD53F442267B7942D2422C050978320AE3D87BD7, manifest sin discrepancias.
- Backend dirigido26/26 integración; correctivo posterior4/4 unitarias y1/1 HTTP focal, sin cambiar SQL congelada.
- Chromium inicial7/8: falló retorno desde Seguridad tras step-up real. Corrección de whitelist admin/users; focal1/1 verde20,5s. Se guardaron trace/captura ignorados. No se aumentaron tiempos ni se afirmó8/8 de una única corrida.

## QA global del coordinador

Instalación reproducible, typecheck y lint verdes;682/682 unitarias y migrador repetido MIGRATIONS_APPLIED. Integración completa243/243,15archivos,322,35s. Primera Chromium global39/40: fixture MFA con margen de un segundo aún vigente para el proceso web. Se corrigió sólo esa fixture con id exacto/fecha pasada y401 explícito, focal1/1 y revisión puntual verdes; implementación MFA intacta. La segunda ejecución39/40 detectó una consulta inicial de auditoría aún en vuelo al revocar permisos; se corrigió sólo la secuencia de la fixture, con PATCH403 real, focal y revisión puntual favorables. Ejecución final completa40/40 Chromium verde (5,2min), build verde y50rutas verificadas contra el manifest compilado. Audit:0vulnerabilidades; diff-check y lockfile intactos, salida0. CI se registra por SHA en el PR dependiente; merge pendiente.

Detalle: [backend](P1_INSTITUTION_ADMIN_BACKEND_REPORT.md), [UI](P1_INSTITUTION_ADMIN_UI_REPORT.md), [dos revisiones](P1_INSTITUTION_ADMIN_REVIEW.md), [matriz de operaciones](../operations/OPERATION_MATRIX.md) y [entrega consolidada](P0_1_P1_DELIVERY.md).

## Puertas conservadas

P0 continúa abierta por el prerrequisito administrativo del migrador canónico cloud, hardening/RLS/reversa restantes, hosting/HTTP y lector humano. El laboratorio Linux aprobado ya se ejecutó una vez; no se repitió. Correo externo, recepción y schedulers necesitan entorno operativo. PR dependientes sin merge ni promoción; ningún dato real se usa como fixture. Véase [BLOCKERS](../BLOCKERS.md).
## Artefacto SQL LF publicado y evidencia Windows

La huella1B9C2C7BEF3C193D09956E2D249FA9463B58C92846C7FC6B77902B29C00FE602 citada arriba identifica los bytes del archivo Windows ensayado (un CRLF), no el blob canónico publicado. La regla histórica .gitattributes sql eol=lf convierte ese separador a LF al preparar Git; SHA256 del blob0010: E082937CD0326A2376E74E11505E8EFD0DCBFE1B6D8B89BAF095579947E7DD49. El SQL lógico es idéntico, pero el migrador compara hashes crudos: no son checksums intercambiables.

Se conservó p1_institution_admin_test y su ledger sin cambios. No debe reutilizarse con checkout LF: el guard devolvería correctamente MIGRATION_LEDGER_DRIFT. Para validar el artefacto publicable, se registró el inventario y creó exclusivamente otra base local p1_institution_admin_lf_test desde template0. Se extrajeron los once SQL y journal completos de los blobs staged de Git a carpeta ignorada, y se ejecutó el CLI db/migrate.ts original desde ese cwd, sin modificarlo. Primera aplicación y repetición devolvieron MIGRATIONS_APPLIED; ledger exacto11/11 hashes+fechas contra Drizzle, y columna integer NOT NULL DEFAULT0 verificados. Resultado2026-10-15T21:40:42Z. Ninguna reescritura de SQL histórico, hash/ledger existente o guard; sin operaciones cloud. Usar la nueva base LF para futuras pruebas del checkout canónico.

Revisión independiente de esta distinción favorable, sin P1/P2 adicionales, condicionada a ese ensayo LF ya ejecutado. La CI verificará además el checkout LF fresco. El control de fuente previo sigue identificando los bytes Windows revisados; el checksum Git publicado queda identificado separadamente aquí.