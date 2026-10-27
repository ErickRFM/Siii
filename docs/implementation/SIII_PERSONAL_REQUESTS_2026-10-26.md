# SIII V3 — solicitudes personales reales

## Alcance y base

Continúa el portal de #117, fusionado en `main@7359662a7c042ce8b79e8e60715601c3cd187248`. Este incremento reutiliza `student_service_requests`, las transiciones administrativas y `security_audit_log`; no crea tablas, migraciones, credenciales ni emisores duplicados.

El alumno crea solicitudes de constancia, cambio de inscripción, justificación u otro trámite, según los tipos ya existentes. El servidor obtiene el expediente del vínculo vigente: el cuerpo no acepta alumno, institución, actor, estado ni resolución. El identificador UUID existente se devuelve como folio de seguimiento; no es un folio de documento certificado.

## Autoridad y persistencia

`student.requests.create` se concede a estudiante y se conserva en los administradores que pueden delegarlo. Exige propietario, institución, programa y estado activo; los docentes o invitados no adquieren esa facultad. La proyección de capacidades muestra únicamente esta operación respaldada; el servidor vuelve a comprobarla.

El POST toma el contexto institucional bloqueado, consulta el vínculo y estudiante activos, valida el permiso con reloj de base, registra solicitud y auditoría en una transacción y revalida autoridad y el mismo expediente antes del commit. La falla de auditoría o caducidad durante espera revierte solicitud y evento.

`operationId` es UUID normalizada a minúsculas y se reutiliza como clave primaria. La misma operación con tipo/resumen/expediente idénticos devuelve 200 y la resolución actual; el primer envío devuelve 201. No se duplica el evento de recepción. Datos distintos o colisión con otra solicitud producen 409 genérico sin exponer su contenido.

| API | Contrato |
|---|---|
| POST `…/portal/student/requests` | `operationId`, `requestType`, `summary`; Origin/sesión/permisos/vínculo vigentes, transacción/auditoría e idempotencia |
| GET `…/portal/student/requests` | Solicitudes del expediente propio, folio, tipo, resumen, estado, resolución y fechas |
| GET `…/portal/student/pending-requests` | Sólo recibidas/en revisión para el inicio institucional |
| GET `…/portal/student/request-history` | Timeline propio con acciones de trámite permitidas, estado, fecha y motivo público de resolución; sin actor ni auditoría de otros dominios |
| PATCH administrativo `…/requests` | Conserva permisos/transiciones; añade antes/después de estado y motivo a la auditoría existente |

Los GET conservan cursor determinista, contexto de actor/recurso, filtros de propiedad dentro de SQL y no-store. No se aceptan filtros de propietario por query. La lectura histórica sólo proyecta `decisionReason` de los eventos de resolución; los demás detalles de auditoría no se publican. La confirmación administrativa advierte que el motivo será visible para el estudiante.

## Experiencia y reintentos

Servicios permite revisar antes de enviar, consultar folio, filtrar/buscar, recorrer páginas de 20 y abrir resolución/historial. Inicio muestra solicitudes realmente pendientes. El formulario usa controles nativos, foco de revisión/confirmación y estados de carga, vacío, error, reintento y acceso retirado. El formulario y su esquema se cargan bajo demanda para no aumentar el bundle inicial docente/estudiantil con la validación de solicitudes.

Una respuesta perdida no se interpreta como fracaso definitivo ni éxito: se conserva el payload revisado y la misma UUID. Los datos de formulario viven solamente en RAM del portal, separados del montaje de la colección. Tras offline o fallo temporal de GET permanecen ocultos y se recuperan sólo cuando se acredita la misma autoridad. No hay localStorage/sessionStorage de solicitudes. Cambios de actor, institución, sesión, grants, expediente, programa o estado y denegaciones confirmadas retiran el borrador. Los cambios de nombre u otros metadatos visuales no cambian esa propiedad.

`X-SIII-Portal-Context` asegura coherencia de perfil entre páginas; `X-SIII-Portal-Authority` identifica exclusivamente la propiedad vigente del borrador. Ambos son hashes opacos de respuesta, nunca credenciales ni permisos aceptados del cliente. Cada página valida actor/contexto/autoridad. Ningún payload oculto se pinta antes de revalidar el vínculo.

## Decisión institucional sobre documentos

El usuario indicó que Control Escolar es autoridad operativa **propuesta** para constancias, historiales certificados y documentos escolares, con aprobación de Dirección/autoridad facultada cuando corresponda. La autoridad y firma oficial se configurarán sólo con aprobación institucional y mecanismo válido. El QR futuro verificará un registro institucional de folio, versión, vigencia y revocación; **no constituye firma**.

Este incremento registra solicitudes y decisiones. Una aprobación **no emite un documento ni cambia automáticamente una inscripción**. La preparación de plantillas/previsualizaciones deberá mostrar **NO OFICIAL**; emisión certificada y firmas simuladas permanecen deshabilitadas. El módulo documental y su registro versionado continúan en el bloque siguiente, separado de Compañero. No se habilitan adjuntos sin un canal de almacenamiento/autorización probado.

## Evidencia y límites

Los cuatro contratos HTTP iniciales reprodujeron 405 antes del endpoint. La primera implementación detectó un builder Drizzle sin FROM al consultar el reloj; se corrigió mediante `tx.execute`, sin cambiar política. La suite ampliada solicitudes + portal aprobó 20/20, incluyendo resolución/replay, ámbito, propiedad, auditoría rollback y caducidad mientras la auditoría esperaba un lock.

La revisión independiente encontró P2: un envío ambiguo perdía su clave al desmontarse la vista por offline/GET fallido. Dos pruebas de navegador reprodujeron el fallo. El estado se elevó al portal, ligado a autoridad confirmada; la repetición aislada aprobó **23/23** (17 portales y seis solicitudes), incluyendo ambos reintentos y retiro después de revocación. Los logs fallidos se conservan en `.p0-local/v3-services/`.

Una ejecución docente externa ocupó 3107; nuestro primer harness salió antes de ejecutar casos. Se identificó el proceso ajeno y se dejó intacto. Nuestro navegador se validó en **127.0.0.1:3117**, con su propia base sintética. Los dos contratos HTTP personales aceptan ese puerto opcional del harness; CI mantiene 3107. No se cambió ningún endpoint productivo para resolver la colisión.

Unitarias observadas: 926/926; tipos/lint/build aprobados en las corridas registradas. La regresión definitiva, CI del SHA final, merge y producción se documentan después de ejecutarse. Las pruebas sintéticas no certifican autoridad emisora, firma legal, documentos oficiales, pasarela ni usuarios reales.

### Cierre local

- HTTP final solicitudes + portal: **20/20**, con pruebas de contexto/autoridad entre sesiones, estabilidad ante cambio de metadatos visuales, lectura de pendientes/historia y negativos de propietario/tenant/query. Se conservan las ocho pruebas nuevas sin skips.
- Navegador aislado después de corregir el P2: **23/23 en 2,2 minutos**, incluido retiro de borrador tras denegar y restaurar posteriormente el mismo grant. Capturas de Servicios claro/oscuro a 360 px inspeccionadas; 360/390/430/768/1440 sin overflow y axe sin violaciones en las vistas medidas.
- Repetición de las seis pruebas de solicitudes sobre el build final: **6/6 en 27 segundos**; incluye pérdida de respuesta, desconexión, error de lectura y resolución administrativa real.
- Unitarias: **926/926**; lint/typecheck/build aprobados; auditoría de dependencias **0**; lockfile sin modificaciones. El componente de solicitudes es diferido: build final inicial de estudiante/docente **145 kB**, frente a 173 kB antes de separar el formulario.
- El primer bloque tiene también [CI verde de main](https://github.com/ErickRFM/Siii/actions/runs/40448396542) y despliegue verificado en `7359662a…`; **este incremento aún requiere su propio CI completo, revisión/merge y SHA productivo**.
