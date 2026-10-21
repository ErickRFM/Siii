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
- Iniciar con datos sintéticos y una institución aislada. Después de confirmar escritura de snapshot, respuesta 202 y proyección persistida en Ktor, habilitar `SIII_ACADEMIC_OUTBOX_ENABLED=true` y `SIII_COMPANION_DELIVERY_ENABLED=true` de forma **explícita**. No se agregan cron jobs a `vercel.json`; antes de programar ejecución periódica verifica límites de frecuencia del plan Vercel y tasa de salida.
- Llamar el endpoint con `Authorization: Bearer <CRON_SECRET>`, nunca desde el navegador de usuarios ni desde JS público. Mantener `SIII_COMPANION_DELIVERY_TARGETS_JSON` fuera de `NEXT_PUBLIC_*` y nunca imprimirlo en logs.

## Pruebas de aceptación obligatorias

1. Una transacción fallida con matrícula/horario no produce un evento ni incrementa su versión; una operación autorizada sí genera un snapshot consistente.
2. El mismo evento reintentado devuelve 200 duplicado, no crea doble sección y la proyección respeta sourceVersion mayor. Nonce repetido y firma adulterada deben devolver 401.
3. Una cuenta alumno de la institución A ve solo sus asignaciones y no los rosters de B. Un docente necesita asignación vigente y la autoridad local actual. QR y pases de lista no aceptan un rol supuesto por el emisor.
4. Retiro de matrícula, revocación docente, cancelación/tombstone, inhabilitación de cuenta y de institución deben propagarse y revocar permisos; el transporte sin ese mecanismo no es un sistema de producción completo.
5. Simular caída de Ktor, respuesta 429/503, expiración de lease y reintento con body inmutable. No borrar eventos fallidos; documentar reconciliación y procedimiento operativo de reprocesamiento.

**Limitación pendiente:** cambios de docentes y de identidad no tienen hooks de productor cubiertos por este PR, no existe observación de la salud de receiver en producción, ni hay un lector Android SIII validado extremo a extremo. NO marcar Compañero/SIII como sincronización completa ni habilitar automáticamente producción.
