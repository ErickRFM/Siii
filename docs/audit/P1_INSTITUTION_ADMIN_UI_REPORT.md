# F09 — Administración institucional: UI y flujos Chromium

## Alcance

La ruta `/dashboard/institutions/[institutionId]/admin` obtiene identidad y autorización de gestión en el servidor mediante `getInstitutionManagementPageAccess`. La página valida el UUID y responde `notFound` si falta acceso. El contexto permite consultar y administrar exclusivamente instituciones propias con concesión institucional vigente, incluso inactivas o suspendidas; no modifica `session.ts`, las capacidades generales ni los guards académicos.

El dashboard incorpora descubrimiento desde `GET /api/v1/institutions/manageable`, con cursor, diez resultados por página, carga, vacío, error, reintento y manejo de desconexión. No utiliza la lista server sin paginación.

El panel persiste configuración y estado mediante las APIs reales `settings` y `status`. Cada mutación incluye motivo y `expectedVersion`; requiere confirmación que explica el efecto, incluida la revocación de invitaciones pendientes al inactivar o suspender. Un conflicto `STALE_RESOURCE` conserva el borrador y bloquea nuevas escrituras hasta una recarga explícita. La recarga confirma el descarte, vuelve a consultar la API y restaura el foco.

Las respuestas de mutación y recarga se comprueban contra el ID institucional. La página usa una key institucional y aborta solicitudes al salir para evitar aplicar datos de una institución a otra. Un `401/403` bloquea acciones, retira la auditoría visible y ofrece el retorno a seguridad de cuenta. El estado archivado es de solo lectura.

La auditoría usa la proyección pública del servidor: recurso, responsable institucional o sistema, motivo y campos permitidos antes/después. Cuenta con filtros por acción, tipo de recurso y fechas, cursor y estados de consulta. No renderiza JSON arbitrario, información global de identidad ni contactos. Las rutas funcionales de catálogos, usuarios, roles e invitaciones se reutilizan únicamente para institución activa y según capacidades vigentes.

Se conservan el shell y los tokens visuales existentes. La UI incluye etiquetas, regiones, estados anunciados, confirmaciones, foco de errores, adaptación móvil y tema claro/oscuro. No se agregan formularios académicos sin backend.

## Archivos

- `src/components/institution-admin.tsx`
- `src/components/institution-admin.css`
- `src/components/sii-app-shell.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/dashboard/security/page.tsx` (corrección puntual de retorno seguro y texto de recuperación)
- `src/app/dashboard/institutions/[institutionId]/admin/page.tsx`
- `tests/ui/institution-admin.spec.ts`

## Evidencia ejecutada

- `npx eslint src/components/institution-admin.tsx src/components/sii-app-shell.tsx src/app/dashboard/page.tsx src/app/dashboard/security/page.tsx 'src/app/dashboard/institutions/[institutionId]/admin/page.tsx' tests/ui/institution-admin.spec.ts`: exit 0, sin diagnósticos (repetido tras la corrección de retorno).
- `npm run typecheck`: exit 0 (`tsc --noEmit`).
- `npm run test:ui -- tests/ui/institution-admin.spec.ts`: 7 passed, 1 failed (3.0m), exit 1. La única falla fue el enlace de retorno tras step-up: `security/page.tsx` excluía `admin` de la lista de destinos permitidos; no se incrementó el timeout.
- Tras corregir la causa: `npm run test:ui -- tests/ui/institution-admin.spec.ts -g 'management requests real step-up'`: **1 passed (20.5s)**, exit 0. El flujo verifica step-up real, retorno, cambios entre instituciones propias, borrador separado, UUID inválido y recurso no accesible con 404.

Ambas ejecuciones Chromium utilizaron PostgreSQL local aislado `p1_institution_admin_test`, datos sintéticos, roles de runtime sin privilegios y claves fixture inyectadas por el soporte de pruebas. Se limpiaron las variables del proveedor de correo y las claves heredadas del proceso; no se enviaron mensajes externos. El helper temporal de ejecución se liberó al concluir cada bloque. Los otros siete recorridos de la ejecución inicial pasaron, incluidos axe claro/escritorio y oscuro/móvil, ancho móvil sin desbordamiento, offline, persistencia, auditoría paginada, revocación, estados y denegación de tenant.

La evidencia RED real del defecto de retorno quedó preservada en `.p0-local/f09-ui-red-security-return/` (`test-failed-1.png`, `error-context.md`, `trace.zip`), ignorada por Git. Se inspeccionaron la captura y el contexto antes de corregir. La lista de destinos conserva sus anclas y rutas de UUID con segmentos exactos; incorpora `admin` y `users`, sin aceptar destinos externos. Se eliminó además el texto obsoleto que presentaba la recuperación F06 como pendiente.

## Verificación pendiente

Se escribieron primero las pruebas de comportamiento, pero no se ejecutó un ciclo RED antes del componente: el puerto 3107 permanecía asignado en exclusiva a las pruebas de backend. No se declara evidencia RED.

No se reporta una ejecución única de 8/8 después del cambio: se conserva la evidencia exacta de 7/8 inicial y 1/1 focal corregido. La repetición global y la segunda revisión independiente corresponden al agente principal.

El servidor y el SQL ejecutados por este agente se limitaron al soporte de pruebas Chromium sobre la base local aislada autorizada. No se ejecutaron migraciones, integración backend, build, QA global, commits, push, CI ni merge desde este agente. Esas verificaciones están coordinadas por el agente principal. No se presenta axe como validación humana de lector de pantalla. La fase permanece parcial hasta las puertas F13, revisión independiente y CI.

## Verificación global posterior del coordinador

La ejecución completa posterior pasó 40/40 Chromium (5,2min), incluyendo los ocho recorridos F09. Los fallos previos y sus correcciones se conservan como evidencia histórica en P1_INSTITUTION_ADMIN_REVIEW.md: retorno seguro, expiración MFA y sincronización de la revocación. Las dos últimas correcciones sólo modificaron fixtures, con focales y revisión independiente favorables; no se cambiaron timeouts ni implementación MFA. Se mantiene pendiente la validación humana de lector de pantalla y el merge conforme a F13.