# SIII → Compañero: envío transaccional de secciones

**Estado:** transporte, productor y endpoint interno preparados para pruebas; sincronización de producción DESACTIVADA por defecto. No sustituye la activación con credenciales reales ni la prueba de revocaciones. La base de datos Supabase y el servicio Ktor no se modifican automáticamente al fusionar este código.

## Qué se emite

Los endpoints de secciones, inscripciones, patrones y ocurrencias invocan `queueCompanionSectionSnapshot` en la MISMA transacción que guarda el cambio y su auditoría. La función existente `enqueueAcademicSection` crea un evento inmutable cifrado `group:v1`, con `sourceVersion` incremental dentro del tenant. Cambios cancelados no generan eventos; falla de outbox con la función habilitada hace rollback completo. La actualización de matrícula retirada debe llegar para revocar visibilidad.

No se ejecuta HTTP durante la transacción: `deliverAcademicEvents` adquiere un lease por fila y firma cada intento con timestamp y nonce nuevos, conservando bytes/eventId/version del cuerpo original. El receptor de Ktor acepta `POST /integration/v1/events` autenticado mediante HMAC y obtiene el tenant destino exclusivamente de la credencial del servidor.

## Configuración segura

Antes de habilitar nada:
- Aplicar de manera controlada la migración institucional `0018_academic_section_outbox.sql` (con sus guardas/RLS) en la única base de producción cuando sus prerrequisitos estén cumplidos. No ejecutar ni saltar migraciones sin preflight y copia de seguridad.
- En Compañero/Ktor, provisionar credencial institucional cifrada, activada, con scope `group:write` y tenant correcto. Usar secreto aleatorio mínimo 32 bytes, distinto de JWT, firma APK y credenciales de base de datos. Mantener trabajador Mongo receptor/proyección operativo.
- En SIII, configurar `SIII_ACADEMIC_OUTBOX_KEYS` (keyring JSON ya existente) y `SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID` con una clave de cifrado distinta de la HMAC. Configurar `SIII_COMPANION_DELIVERY_TARGETS_JSON` como secreto **servidor**, un objeto que asocia exactamente cada UUID de institución origen a `{"origin":"https://<host-verificado>","keyId":"<id>","secretBase64":"<secret-random-32+-bytes>"}`. El `origin` debe ser HTTPS sin ruta, puerto, usuario, query o fragmento. En la configuración de Ktor, vincular cada `keyId` explícitamente a la institución/tenant destino. Nunca inferir tenant de un ID enviado en el body.
- Configurar `CRON_SECRET` existente para proteger `GET /api/internal/companion-snapshot-delivery`. El endpoint responde 401 sin autorización, `status:disabled` si se dejó deshabilitado, 503 si se solicitó delivery sin destino.
- Iniciar con datos sintéticos y una institución aislada. Después de confirmar escritura de snapshot, respuesta 202 y proyección persistida en Ktor, habilitar `SIII_ACADEMIC_OUTBOX_ENABLED=true` y `SIII_COMPANION_DELIVERY_ENABLED=true` de forma **explícita**. La automatización preparada usa GitHub Actions y permanece deshabilitada por defecto; no se agregan cron jobs a `vercel.json`.
- Llamar el endpoint con `Authorization: Bearer <CRON_SECRET>`, nunca desde el navegador de usuarios ni desde JS público. Mantener `SIII_COMPANION_DELIVERY_TARGETS_JSON` fuera de `NEXT_PUBLIC_*` y nunca imprimirlo en logs.

## Pruebas de aceptación obligatorias

1. Una transacción fallida con matrícula/horario no produce un evento ni incrementa su versión; una operación autorizada sí genera un snapshot consistente.
2. El mismo evento reintentado devuelve 200 duplicado, no crea doble sección y la proyección respeta sourceVersion mayor. Nonce repetido y firma adulterada deben devolver 401.
3. Una cuenta alumno de la institución A ve solo sus asignaciones y no los rosters de B. Un docente necesita asignación vigente y la autoridad local actual. QR y pases de lista no aceptan un rol supuesto por el emisor.
4. Retiro de matrícula, revocación docente, cancelación/tombstone, inhabilitación de cuenta y de institución deben propagarse y revocar permisos; el transporte sin ese mecanismo no es un sistema de producción completo.
5. Simular caída de Ktor, respuesta 429/503, expiración de lease y reintento con body inmutable. No borrar eventos fallidos; documentar reconciliación y procedimiento operativo de reprocesamiento.

## Ejecución acotada y cancelación

El endpoint admite hasta diez candidatos y dispone de 120 segundos de ejecución. El worker deja de iniciar trabajo cuando no quedan 30 segundos completos dentro de su presupuesto de 90 segundos. El tiempo empleado en comprobar el rol de base también se descuenta de ese presupuesto; el reloj de presupuesto es monotónico.

Después de adquirir un lease, cada solicitud tiene como timeout el menor de 30 segundos, el presupuesto restante y la vigencia restante del lease menos un segundo. La señal de cancelación del request aborta la solicitud saliente. Un transporte cancelado se finaliza como retryable usando el CAS/token existente; no se reclama otro evento en esa ejecución. Si el proceso muere o falla la finalización, el lease sigue siendo recuperable al caducar. No se cambian los bytes, event ID ni versión del evento durante un reintento.

El presupuesto impide iniciar solicitudes demasiado tarde; no interrumpe transacciones PostgreSQL que ya estén en curso. Se conserva el margen del runtime para terminar la escritura de estado y su auditoría. `budgetExhausted` y `cancelled` en el resultado describen por qué terminó el lote; no acreditan proyección aplicada.

## Scheduler preparado, desactivado por defecto

`.github/workflows/companion-delivery.yml` admite ejecución cada cinco minutos y `workflow_dispatch`. Ambos disparadores requieren que la variable de repositorio `SIII_COMPANION_AUTOMATION_ENABLED` sea exactamente `true`; ausente, vacía o `false` deja el job sin ejecutar. Preparar el workflow no configura esa variable ni modifica flags productivas.

El job usa el secreto `CRON_SECRET` existente, el endpoint literal `https://siii-three.vercel.app/api/internal/companion-snapshot-delivery` y una sola solicitud. No hace checkout ni usa acciones externas o permisos de GitHub API; no necesita facturación de Vercel para definir su frecuencia. Tiene concurrencia única, sin cancelar una ejecución anterior, timeout de job de tres minutos, conexión de diez segundos y request de 110 segundos. No sigue redirects ni reintenta mediante curl: los reintentos duraderos pertenecen al outbox.

**Configuración pendiente comprobada en esta ejecución:** el repositorio de GitHub devolvió listas vacías de metadatos de secrets y variables (solo nombres/fechas consultados). Por tanto, el workflow aún necesita provisión segura de `CRON_SECRET` en GitHub y la decisión posterior sobre la variable opt-in. Esto no implica que falte el secreto en Vercel: su valor existente no fue legible mediante los accesos de esta revisión. No generar ni rotar otra clave; un operador autorizado debe trasladar o referenciar de forma segura el secreto vigente y comprobar la coincidencia durante el piloto. La presencia de variables en Vercel tampoco confirma sus valores efectivos: no se acreditó aquí que las flags productivas sean `false`.

No se imprimen cabeceras, secretos ni respuesta; solo se informa si se pudo solicitar el lote. HTTP no 200 o error de transporte falla el job. Un 200 puede representar flags de entrega deshabilitadas: el mensaje `COMPANION_DELIVERY_BATCH_REQUESTED` no acredita envío, aceptación ni proyección. Antes de activar la variable comprobar mediante el piloto el destino, las flags, la credencial y el estado real del receptor. La activación sigue requiriendo sus puertas y autorización; este bloque no la realiza.

Pruebas locales: `tests/unit/academic-delivery-budget.test.ts` inyecta reloj y persistencia para comprobar presupuesto, cancelación, lease y estados sin sleeps reales ni base de datos. La integración PostgreSQL existente conserva los tests de reclaim/lease/CAS. `tests/unit/companion-delivery-workflow.test.ts` parsea el YAML, evalúa el gate ausente/false/true y ejecuta el script real con curl reemplazado por una función local; verifica ausencia de reintentos/redirecciones, secreto ausente, HTTP 503 y timeout sin contactar servicios.

## Autoridad viva para las lecturas móviles

Ktor conserva sus rutas `/academic/load`, `/academic/schedule` y `/academic/schedule/v2`. Para identidades nativas vinculadas a SIII debe consultar el manifest firmado de origen, exigir la versión exacta en Mongo y volver a comprobar la autoridad antes de entregar datos. No basta un roster previamente proyectado. La credencial HMAC cifrada existente firma el propósito nuevo de lectura, sin rotarla ni crear otro secreto.

Configurar en Ktor `SIII_ACADEMIC_AUTHORITY_TARGETS_JSON` con el mapa explícito de tenant nativo a `{origin,sourceInstitutionId,keyId}`. `origin` es el origen HTTPS de SIII, `sourceInstitutionId` es su UUID institucional y `keyId` referencia la credencial cifrada ya provisionada. Este mapa contiene referencias, no la clave. No inferir que los UUID de ambos sistemas sean iguales. La configuración no se añade a Android ni a variables públicas.

SIII responde503 `SOURCE_AUTHORITY_DISABLED` si su productor está apagado. Esto evita presentar una versión histórica como actual después de cambios que no generaron outbox. Suspensión, retiro de matrícula, revocación docente, institución inactiva, cuenta/membresía/rol/vínculo revocado y caducidad deben invalidar lecturas; un error o un manifest incompleto no autoriza fallback institucional.

## Diagnóstico y recuperación autorizados

El operador con `integrations.manage` puede consultar `GET /api/v1/institutions/:institutionId/companion-sync`. Los estados de PostgreSQL son `queued`, `accepted` y `failed`; el diagnóstico añade intentos, clasificación, fechas y leases. Una lease activa describe trabajo reclamado, no una garantía de salud del proceso. El listado es acotado y no exporta cuerpos cifrados, nombres ni credenciales.

Con delivery habilitado, la observación remota firma `POST /integration/v1/projection-status` para hasta50 eventos. Ktor obtiene tenant y credencial del autenticador, consulta únicamente metadatos de esos recibos y conserva los estados `pending`, `processing`, `retryable`, `projected`, `superseded`, `pending_identity`, `unsupported` o `failed`. Un recibo ausente es `unknown`; fallo, timeout o contrato inconsistente queda `unavailable`, sin asumir aplicación. No usar un `projected` histórico para conceder autoridad vigente.

Para reconstruir una sección, enviar `POST /api/v1/institutions/:institutionId/companion-sync` con `{sectionId,expectedSourceVersion,reason}` desde la sesión autorizada y con origen válido. Usar0 solo cuando no existe versión. La ruta bloquea la sección, compara la expectativa y crea un snapshot actual nuevo con auditoría;409 exige volver a consultar el estado antes de decidir. No cambia bytes ni reinicia intentos del evento fallido. Conservar ese evento como evidencia, observar el nuevo recibo y comprobar la versión aplicada y sus permisos antes de dar por recuperado el flujo.

No ejecutar SQL manual para editar una sección ni borrar recibos/versiones como procedimiento de recuperación. La reconstrucción no modifica inscripciones, asignaciones ni horarios: vuelve a proyectar el estado institucional ya autorizado. Los fallos de contrato, cifrado o autoridad requieren resolver su causa antes de reconstruir.

**Puertas pendientes:** la evidencia completa hasta Android, CI/revisión del release y activación controlada continúan en el [informe de esta ejecución](../audits/SIII_COMPANION_CONNECTION_2026-10-24.md). HTTP202 sigue significando recepción, nunca proyección. No marcar la integración productiva como completa ni habilitarla automáticamente.
