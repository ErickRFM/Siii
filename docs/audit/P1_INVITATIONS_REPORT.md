# P1 invitaciones — evidencia de preparación criptográfica

Rama aislada feat/p1-invitations desde MFA3f75897c; antes de modificar schema/API de identidad se reconciliará con el commit IAM dependiente. Esta preparación no es una funcionalidad F08 completa ni una entrega de usuarios.

Implementado y probado:
- Tokens aleatorios de256bits, Base64URL canónico, hash SHA256 ligado al identificador de invitación y tenant.
- Enlace con origen HTTPS explícito de servidor y bearer en fragmento, sin query/credenciales de URL.
- Outbox payload AES256GCM con AAD propósito/versión/evento/tenant y nonce nuevo; keyring separado SIII_INVITATION_KEYS y SIII_INVITATION_ACTIVE_KEY_ID, sin fallback a claves MFA.
- Adaptador Resend POST al endpoint oficial fijo, timeout10segundos, redirect:error, idempotencia por evento, contenido texto, remitente y Reply-To explícitos. Estado accepted exige ID del proveedor y no equivale a delivered; no se propagan cuerpos de error ni secretos.
- Sin configuración retorna EMAIL_NOT_CONFIGURED y no contacta al proveedor.

33unitarias nuevas pasan; suite completa de esta rama155unitarias pasa; typecheck y lint pasan; npmci reproducible audit0. Una mutación controlada que quitó tenant del digest falló la prueba de aislamiento; se restauró inmediatamente la fuente correcta y se repitió la suite verde. No hubo llamadas de envío externas en estas pruebas.

El conector Resend tiene un dominio verificado, pero el runtime de esta rama no tiene RESEND_API_KEY/remitente/Reply-To configurados; tampoco se seleccionó un dominio institucional. No se extrajo la credencial OAuth del conector ni se inventaron mensajes enviados.

Pendientes: schema/cola persistente y worker, permisos/estados/consentimiento de aceptación, caducidad y consumo transaccional de un uso, resend/revoke/reject, APIs/UI conectadas, HTTP/Chromium/revisiones/CI/PR/merge. No se afirma entrega externa, aceptación de invitaciones o F08 completa.

Referencias primarias revisadas:
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/dashboard/emails/idempotency-keys
