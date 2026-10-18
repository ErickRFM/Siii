# Correo transaccional institucional — Siii

## Identidad y límites

- Producto: **Siii — Sistema Institucional Integral**. ManeComb es únicamente el dominio técnico delegado, no la marca del mensaje.
- Envío: `invitaciones@correo.manecomb.com`, sin display name en la variable de entorno; el adaptador fija `Siii - Sistema Institucional Integral` como nombre visible.
- HTML adaptable a móvil con cabecera vino, botón accesible, expiración, texto alternativo y enlace verificable. No se cargan fuentes externas, imágenes remotas ni píxeles de seguimiento.
- Emisión con Resend: `html` y `text`; claves idempotentes estables por evento. Una respuesta `accepted` **no confirma recepción en la bandeja del destinatario**.
- Solo se emiten dos flujos reales: invitaciones institucionales y recuperación de contraseñas. No se inventan avisos de cambio de cuenta ni alertas MFA: requieren eventos de dominio aprobados.

## Variables — Vercel Production

| Variable | Propósito |
| --- | --- |
| `RESEND_API_KEY` | Credencial exclusiva de Siii con `Sending access` para el dominio verificado |
| `SIII_EMAIL_FROM` | Solo dirección, p. ej. `invitaciones@correo.manecomb.com` |
| `SIII_EMAIL_REPLY_TO` | Buzón real que reciba mensajes; no usar una dirección ficticia del subdominio |
| `SIII_PUBLIC_ORIGIN` | URL HTTPS de producción, sin ruta ni parámetros |
| `SIII_INVITATION_KEYS` y `SIII_INVITATION_ACTIVE_KEY_ID` | Cifrado independiente de invitaciones |
| `SIII_PASSWORD_RESET_KEYS` y `SIII_PASSWORD_RESET_ACTIVE_KEY_ID` | Cifrado independiente de recuperación |
| `CRON_SECRET` | Secreto fuerte, solo servidor, para `/api/internal/email-delivery` |

No subir claves al repositorio, a pruebas, capturas ni a documentación. Guardar secretos en Vercel únicamente, con acceso mínimo. Tras cambios de entorno, redesplegar la versión verificada.

## Flujo exacto

1. La operación autorizada crea invitación o recuperación y su mensaje cifrado en la misma transacción.
2. Next.js `after()` dispara después de la respuesta un intento de envío sobre la cola durable. No modifica el tiempo de respuesta según existencia de cuenta.
3. El worker revalida que el mensaje siga válido; toma un lease e intenta enviar con Resend. Aplica reintentos acotados, mantiene el remitente congelado y no publica el token fuera del correo cifrado.
4. `vercel.json` ejecuta un barrido diario a las 06:00 UTC mediante una ruta autenticada por `CRON_SECRET`, compatible con el límite cron Hobby. La ruta también sirve como punto de entrada para un planificador autorizado de mayor frecuencia.
5. Para reintentos dentro de los 30 minutos de vida de un restablecimiento, una frecuencia diaria **no es suficiente**. Si el envío rápido falla, configurar planificador cada 5 minutos con Vercel Pro o un cron privado equivalente, antes de certificar recuperación ante fallos.

## Pruebas de aceptación

- Confirmar `Verified` en Resend para `correo.manecomb.com` y las cuatro entradas DNS.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:ui`, `npm run build` con PostgreSQL aislado.
- Una invitación requiere MFA + verificación step-up, vigencia válida y un destinatario autorizado. El enlace es de un solo uso y se envía en fragmento `#...`.
- El destinatario debe recibir un correo de **Siii**, poder abrirlo, aceptar o rechazar la invitación, y ver cambios de estado y auditoría.
- La recuperación debe devolver una respuesta pública indistinguible para emails conocidos/desconocidos; el enlace dura 30 minutos y solicita MFA si corresponde.
- Comprobar un rechazo de Resend y un error 429/5xx sin mensajes engañosos. Verificar `queued`, `accepted`, `failed` y reintentos.
- Si el nuevo correo no llega, buscar por mensaje en Resend y estado de outbox. Nunca volcar URLs privadas, claves ni correos completos a logs.

## Guía operativa

- Si falta `RESEND_API_KEY`, `SIII_EMAIL_FROM` o `SIII_EMAIL_REPLY_TO`, el worker marca `EMAIL_NOT_CONFIGURED` y no simula un envío.
- La aceptación del proveedor no equivale a `delivered`. El seguimiento de entrega final o rebote mediante webhooks firmados es una mejora separada y necesita su propia retención y consentimiento.
- No se debe deshabilitar MFA ni alargar las caducidades para probar el flujo.
- Si Resend devuelve 4xx permanente, examinar la configuración del dominio y la dirección de origen, sin exponer el contenido del mensaje.
