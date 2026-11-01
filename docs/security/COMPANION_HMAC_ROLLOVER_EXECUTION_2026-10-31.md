# SIII → Compañero: ejecución controlada de la sucesora HMAC

## Estado constatado el 31 de octubre de 2026

- Atlas `companero_dev.institutional_integration_credentials`: una sola clave habilitada, `siii-hmac-20261025-138dedb2ba5840759868ff77844616a7`, expiración `2026-11-02T03:57:35Z` y scope `group:write`.
- Ktor ya soporta varios `keyId` simultáneos; los recupera por ID y verifica expiración y nonce. No se requiere deshabilitar el predecessor para aprovisionar la sucesora.
- La provisión existente en Render es `SiiiPilotCredentialBootstrap` (una vez por `keyId`), con cifrado AES-GCM en Mongo. **No es un sistema de renovación automática.**
- Vercel Production tiene `SIII_COMPANION_DELIVERY_TARGETS_JSON` sensible e ilegible desde el conector. Por eso **no se debe sobrescribir** el JSON original de destinos.
- El código de SIII admite una configuración de rollover opcional **por institución**, manteniendo independiente `SIII_COMPANION_ATTENDANCE_TARGETS_JSON` (scope `attendance:read`).

## Runbook de ejecución segura

1. **Base certificada:** terminar CI y desplegar a SIII Production el código que incorpora `selectedAcademicDeliveryTarget`, manteniendo `SIII_COMPANION_HMAC_ROLLOVER_ENABLED=false` o ausente. Certificar que la configuración antigua sigue operando.
2. **Emitir la sucesora en un entorno de confianza:** generar 32–128 bytes desde CSPRNG, identificador nuevo no reutilizado y expiración no superior a 90 días. Verificar ID institucional contra `platform_institutions`; conservar `group:write`, sin permisos de asistencia.
3. **Provisionar recepción en Render con el bootstrap existente:** usar solo durante un despliegue `SIII_INBOUND_BOOTSTRAP_ENABLED=true`, `SIII_INBOUND_KEY_ID`, `SIII_INBOUND_TENANT_ID`, `SIII_INBOUND_SECRET_BASE64`, `SIII_INBOUND_EXPIRES_AT_EPOCH_SECONDS` y `SIII_INBOUND_SCOPE=group:write`. Confirmar en Atlas que la nueva fila está `enabled=true`, scope/tenant correctos, cifrada y con la fecha esperada **sin consultar ni registrar ciphertext o secreto**. La fila antigua debe seguir habilitada.
4. **Retirar variables temporales de Render:** apagar bootstrap, eliminar la clave de la configuración temporal mediante la interfaz protegida y redeploy. Validar que ambas credenciales permanecen en Mongo y que Ktor arranca normalmente.
5. **Preparar nuevo emisor SIII:** crear `SIII_COMPANION_HMAC_ROLLOVER_TARGETS_JSON` como variable `sensitive` de servidor en Production. Solo contiene los IDs institucionales que rotan y cada objeto tiene `origin`, `keyId` y `secretBase64`. El secreto debe ser exactamente el registrado en Render; nunca duplicarlo en GitHub. Mantener `SIII_COMPANION_HMAC_ROLLOVER_ENABLED=false` al instalar.
6. **Probar receptor antes de promover:** HTTP firmado con la nueva clave en `POST /integration/v1/projection-status` y respuesta 200; firma corrupta 401, timestamp/nonce fuera de ventana 401 y tenant/scope ajenos sin acceso. Efectuar la prueba desde un operador seguro sin poner secretos en logs ni terminal compartida.
7. **Promover SIII:** cambiar `SIII_COMPANION_HMAC_ROLLOVER_ENABLED=true` en Vercel y desplegar Production. Comprobar `keyId` nuevo, HTTP firmado 200, procesador de outbox, receipts y ausencia de errores 401 nuevos en Render. El `keyId` de asistencia es independiente.
8. **Superposición y retirada:** mantener la anterior habilitada durante una ventana breve auditada mientras se observa tráfico real. Revocar la anterior en el receptor solo después de verificar la nueva y tras comprobar que no hay clientes pendientes que aún la usen. Actualizar alerta de expiración con **metadatos** de la sucesora.
9. **Reversión:** mientras la antigua sea válida, poner el flag de rollover en `false` y redeploy de SIII; no borrar la sucesora hasta diagnosticar. Si el predecessor ya venció, no habilitar una clave caducada.

## Condiciones de no-go

- Falta de prueba HTTP positiva del nuevo secreto, permisos o tenant sin verificar, falla de Render, error de cifrado o Mongo, ausencia de garantía de rollback.
- No modificar `CRON_SECRET`, `SIII_ACADEMIC_OUTBOX_KEYS` ni `SIII_COMPANION_ATTENDANCE_TARGETS_JSON`; son claves de otros propósitos.
- No habilitar renovación autónoma sin diseñar distribución de secreto por identidad de corto plazo, exclusión mutua, idempotencia, estados de transición, auditoría y pruebas de caídas/reintentos.
- Las variables de rollover son un **mecanismo de transición**, no equivalen a rotación automática.

## Contratos de verificación

- `npm test -- tests/unit/signed-academic-transport.test.ts tests/unit/academic-projection-status.test.ts tests/unit/companion-hmac-rollover.test.ts`
- `npm run typecheck`, `npm run lint` y CI integral en GitHub.
- Receptor: `./gradlew :services:api:test --tests 'org.companerodeescuela.api.integrations.push.InstitutionalPushAuthenticatorTest' --tests 'org.companerodeescuela.api.integrations.push.SiiiPilotCredentialBootstrapTest'`.
