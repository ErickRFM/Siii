# SIII → Compañero: rotación HMAC sin interrupción

Estado: procedimiento de seguridad y plan de implementación. **No ejecuta rotaciones ni autoriza accesos por sí mismo.**

## Estado observado — 2026-10-27

- MongoDB Atlas, proyecto `companero_dev`, colección `institutional_integration_credentials`: una sola credencial activa (`siii-hmac-20261025-138dedb2ba5840759868ff77844616a7`), ámbito `group:write`, expiración `2026-11-02T03:57:35Z`.
- El workflow `.github/workflows/companion-hmac-expiry-guard.yml` emite alertas a partir de una fecha **fija**. No inspecciona MongoDB ni renueva claves.
- El workflow `.github/workflows/companion-delivery.yml` procesa el outbox; su `CRON_SECRET` es **otro secreto**, distinto de HMAC.
- No existe evidencia de una clave sucesora. No deshabilitar la única clave ni sustituir a ciegas secretos de Vercel.

## Condiciones previas obligatorias

1. Identificar los componentes que firman las solicitudes en SIII y las verifican en Compañero, y los formatos exactos de `keyId`, cuerpo canónico, timestamp y nonce. Revisar pruebas existentes.
2. Comprobar respaldo/restauración de la colección de credenciales y disponibilidad de la base. Preservar ciphertext; nunca exportar secretos a logs, issues, commits o artifacts.
3. Confirmar que Compañero acepta **dos keyId simultáneos**, validados por registro y tenant, sin cambiar el emisor. Si no hay soporte probado, implementarlo y probarlo antes de emitir una sucesora.
4. Confirmar el mecanismo autorizado de emisión, cifrado, expiración, almacén y aprovisionamiento en Vercel. No crear una API pública para emitir credenciales. Restringir el operador con identidad administrativa, MFA, registro auditable, aprobación y privilegios mínimos.
5. Tener plan de recuperación probado y responsables de SIII, Render y MongoDB.

## Protocolo de renovación (fail-closed)

1. Crear una clave criptográficamente aleatoria usando un generador seguro **en el operador de confianza**, no en Actions. Seleccionar `keyId` nuevo e inequívoco, tenant correcto, scope mínimo y caducidad acotada.
2. Guardar el verificador/ciphertext nuevo en Compañero, **sin** deshabilitar el antiguo. Comprobar que ambos IDs están habilitados y que el nuevo vence en una fecha futura.
3. Aprovisionar la firma saliente de SIII en Production a través del administrador de secretos de Vercel; redeploy controlado. No imprimir los valores ni copiarlos a GitHub.
4. Validar desde el entorno desplegado: nueva firma legítima → 200 en `/integration/v1/projection-status`; firma inválida → 401; timestamp viejo/replay/nonce reutilizado → rechazo; tenant equivocado/scope insuficiente → rechazo; ausencia de efectos colaterales.
5. Ejecutar el procesador autenticado SIII y comprobar la ausencia de 401 nuevos en Render. Un resultado `claimed=0` **no acredita** entrega real. Cuando haya datos reales autorizados, comprobar outbox, acuse, versión e idempotencia.
6. Mantener la clave anterior un periodo breve de superposición, monitorizando firmas por `keyId`, sin secretos. Solo después de verificar tráfico real con la nueva clave, deshabilitar la anterior.
7. Actualizar la alerta con metadatos de la nueva clave y expiración, y documentar hora UTC, keyId (no secreto), checks, responsable y evidencia.

## Reversión

- Si el nuevo firmante falla, restaurar en Vercel la **referencia** a la credencial anterior todavía activa; no recrear su secreto ni apagar la entrega sin evaluar los eventos pendientes.
- Si la clave anterior está vencida, no forzar una excepción de validación: emitir credencial nueva a través del procedimiento autorizado.
- Detener el cambio y escalar si la nueva clave no autentica, aparecen errores de nonce o falta respaldo. Mantener el outbox durable y las métricas.
- Al retirar una credencial, nunca borrar sus registros de auditoría.

## Automatización segura futura

- Un controlador programado solo consulta metadatos de expiración desde un servicio interno autenticado y de alcance reducido. Las alertas deben informar intervalos de 14/7/3/1 días y errores de conexión.
- Separar **preparar**, **validar**, **promover** y **revocar** en pasos idempotentes con estados durables, bloqueo distribuido, compare-and-swap por versión, auditoría y alertas.
- Ningún workflow de GitHub debe obtener secretos HMAC ni poseer una capacidad permanente de emisión. Aprovisionamiento por identidad de corta duración en el servicio de confianza; confirmar el diseño y los permisos antes de habilitarlo.
- No declarar "rotación automática" hasta tener tests de concurrencia, fallos parciales, reintentos, rollback y prueba de staging + producción.

## Bloqueo actual

**Una sola credencial**; expiración el 2 de noviembre de 2026, 03:57:35 UTC. La siguiente acción operativa requiere identificar el comando o servicio de emisión existente y autorización explícita para rotar. Este documento no realiza la rotación.
