# P1 — Invitaciones institucionales y consentimiento (F08)

Entrega funcional en revisión en la rama dependiente feat/p1-invitations, reconciliada con IAM498c33bb. Incluye schema, migración, API, permisos, auditoría, worker persistente, UI y pruebas con fixtures sintéticas. P1 y P0 permanecen abiertos; este informe no acredita merge, promoción ni envío externo.

## Persistencia y permisos

La migración aditiva 0008_p1_invitations.sql incorpora institution_invitations, invitation_delivery_outbox y account_email_verifications, con referencias por tenant, estados y consumo coherentes, hash único de token y prueba de email vinculada a una invitación aceptada por ese usuario. Las tres tablas tienen RLS habilitado y forzado, denegación a roles públicos de API y permisos SELECT/INSERT/UPDATE para siii_app; el runtime no recibe DELETE ni propiedad de tablas. El migrador utiliza una identidad separada.

0008 ya se aplicó en p1_invitations_test y está congelada: SHA256 C0A7DCA7509257527D2BCD0BB334D227C01C5D2590EC84A77BB27BF15EE81559. Se conservaron los bytes y hashes de 0000–0007; no se reescribieron ledgers históricos. Este ensayo local no demuestra una migración F08 en staging.

## API y flujos reales

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | /api/v1/institutions/:institutionId/invitations | Lista paginada del tenant autorizado, estado de entrega y acciones permitidas, sin bearer. |
| POST | /api/v1/institutions/:institutionId/invitations | Crea invitación y mensaje cifrado en la misma transacción auditada. |
| POST | /api/v1/institutions/:institutionId/invitations/:invitationId/resend | Rota token y evento, cancela pendientes anteriores, conserva caducidad y aplica cooldown/cuota. |
| POST | /api/v1/institutions/:institutionId/invitations/:invitationId/revoke | Revoca la invitación pendiente de ese tenant y cancela su outbox pendiente. |
| POST | /api/v1/invitations/preview | Revalida bearer, institución, emisor, concesión original y ámbito; informa contexto sin email ni existencia de cuenta. |
| POST | /api/v1/invitations/accept | Registra consentimiento explícito y concede el acceso permitido una sola vez. |
| POST | /api/v1/invitations/reject | Consume una vez el consentimiento de rechazo y conserva historial. |

Emisión, reenvío y revocación requieren invitations.manage, MFA configurado/verificado y step-up reciente, con nueva autorización tras adquirir locks. La concesión original debe autorizar por sí sola rol, tenant, ámbito y duración; una concesión de reemplazo no revive la invitación. No se invita a super_admin. Un admin ordinario no puede modificar mediante consentimiento a un destinatario protegido ni autoasignarse acceso. Los ámbitos programa/campus deben pertenecer al tenant y seguir activos. La invitación dura como máximo siete días y no sobrevive a los límites temporales de la autoridad concedida.

Aceptar exige consent:true y token vigente. Una cuenta existente necesita su propia sesión actual y step-up reciente; los requisitos propios de login, cambio de contraseña o step-up producen errores accionables sin consumir la invitación. La prueba del correo pertenece a quien consiente: se impiden duplicados del mismo email canónico y vínculos con otra identidad, y un administrador institucional no edita contactos globales. Un contacto legacy nulo puede establecer su propia verificación con token y prueba reciente de cuenta. Una cuenta nueva elige usuario y contraseña; el usuario se normaliza igual que login. El alta, prueba de email, membresía, concesión, consumo y auditoría son transaccionales. La aceptación invalida sesiones anteriores y exige iniciar sesión; no acuña una sesión sin autenticación. Un perfil privilegiado nuevo queda sujeto al onboarding MFA restringido de F07.

La UI de administración está en /dashboard/institutions/:institutionId/invitations y usa actions.canResend/canRevoke del backend. /invitations/accept muestra institución, rol, ámbito y duración antes del consentimiento; permite cuenta nueva o existente, actualización, rechazo, estados de error y recuperación de conexión. La cuenta existente se autentica en otra pestaña conservando la decisión pendiente.

## Token, privacidad y correo

El token tiene 256 bits aleatorios y codificación Base64URL canónica; su SHA256 está ligado a invitación y tenant. El enlace usa el origen HTTPS explícito SIII_PUBLIC_ORIGIN y el fragmento #id=...&token=..., que no forma parte de la petición HTTP inicial. Un bootstrap anterior al router de Next retira el fragmento de la URL e historial y lo mantiene en memoria; no se introduce en HTML, query, enlaces, almacenamiento web ni caché de navegación. La reapertura de otro enlace en la misma página sustituye el contexto pendiente. Después de recargar hay que reabrir el correo original. El token se envía al backend solo en el cuerpo POST que valida la decisión; no se registra en auditoría ni se devuelve por API administrativa.

El payload del correo se persiste con AES-256-GCM, nonce nuevo y AAD de propósito, versión, keyId, evento y tenant. El keyring de invitaciones es independiente de MFA. Remitente y Reply-To se fijan para cada evento antes del primer envío y no cambian durante sus reintentos. La API key puede rotarse sin cambiar ese payload.

El worker real se ejecuta como lote acotado con npx tsx worker/invitations.ts, utilizando un LOGIN que herede solo siii_app. Cada lote procesa hasta 20 candidatos; toma un lease persistente, confirma la transacción antes de la red y finaliza mediante CAS del lease. Revalida autoridad y estado antes de enviar. Workers concurrentes no poseen el mismo lease y una respuesta tardía no resucita una revocación ni sobrescribe un lease nuevo. Un proceso/scheduler externo debe invocar el lote; esta entrega no configura un scheduler de producción.

El adaptador llama al endpoint oficial fijo de Resend, con timeout de diez segundos, redirect:error e Idempotency-Key por evento. Distingue errores transitorios, rechazos y aceptación con ID del proveedor. accepted significa aceptación del proveedor, nunca entrega al buzón. Reintenta como máximo ocho veces y durante menos de 23 horas, dentro de la retención de idempotencia de 24 horas. Sin configuración el mensaje permanece pendiente con EMAIL_NOT_CONFIGURED; no se simula un envío. Clave ausente, ciphertext inválido, expiración o autoridad revocada impiden la entrega.

Solo servidor: SIII_PUBLIC_ORIGIN, SIII_INVITATION_KEYS, SIII_INVITATION_ACTIVE_KEY_ID, RESEND_API_KEY, SIII_EMAIL_FROM y SIII_EMAIL_REPLY_TO. Cada clave del keyring es material aleatorio de 32 bytes en Base64 canónico; conservar claves anteriores mientras existan eventos cifrados con ellas. Ver .env.example. No usar claves del conector OAuth como credenciales del runtime ni exponer estas variables mediante NEXT_PUBLIC_.

El conector tiene un dominio verificado, pero todavía falta seleccionar y configurar el remitente institucional y la API key del runtime, ejecutar un envío externo autorizado y confirmar recepción. No se enviaron correos reales durante las pruebas: el worker utilizó un LOGIN PostgreSQL restringido y transporte de proveedor sintético inyectado. No se certifica reputación, entregabilidad, webhooks ni recepción real.

## Evidencia y correcciones

Verificación final local del ejecutor principal, 2026-10-15, sobre la fuente congelada y revisada:

| Comprobación | Resultado confirmado |
| --- | --- |
| Integración dirigida F08 | 38/38, PostgreSQL local y handlers HTTP reales; 67,55 segundos. |
| Chromium dirigido F08 | 7/7, fixtures sintéticas; navegador, teclado y axe, sin lector humano. |
| Typecheck y lint | Verdes en la verificación completa del ejecutor principal. |
| Migración 0008 | Hash congelado anterior; repetición del migrador confirmó MIGRATIONS_APPLIED, sin cambios históricos. |
| Suite unitaria completa final | 592/592 confirmadas por el ejecutor principal. |
| Suite de integración completa final | 177/177 confirmadas por el ejecutor principal. |
| Chromium completo final | 25/25, 3,8 minutos; incluye los siete recorridos F08. |
| Instalación, build, audit y diff | npm ci, build y diff correctos; audit: cero vulnerabilidades. |
| CI remota y commit final | Pendientes de registro al publicar el PR; no se afirma merge. |
| Segunda revisión independiente | Fuente favorable, sin hallazgos materiales pendientes; condicionada a QA final y límites externos. |

La primera pasada y los tests RED revelaron normalización inconsistente de username/email legacy, errores de requisitos propios de sesión y restricciones de autoasignación/destinatario protegido. Se corrigieron y verificaron con HTTP real. La UI ahora respeta las acciones calculadas por backend. Dos pruebas adicionales reprodujeron preview=200 tras revocar bearer o emisor mientras esperaba la consulta institucional; el preview transaccional con orden de locks y comprobación posterior a la espera devuelve ahora 404. La suite dirigida de 38 casos incluye estos escenarios, aceptación concurrente, unicidad global de email, rollback por auditoría, revocación durante espera, RLS/grants y leases/CAS del worker.

Un primer retest tuvo un fallo de fixture al programar un reintento con PostgreSQL now() y comprobarlo inmediatamente contra Date.now(): se observaron microsegundos de PostgreSQL por delante del milisegundo del proceso. La fixture declara ahora el evento vencido hace un segundo, sin sleeps, ampliaciones de timeout ni cambios al reloj operativo. La repetición completa dirigida pasó 38/38. El PostgreSQL local existente estaba detenido tras la noche; se reinició sin initdb, reset ni modificaciones de ledger. El bloque temporal que evita suspensión del proceso se liberó al terminar.

La preparación criptográfica previa verificó tenant en digest, keyId en AAD, errores 409 transitorios e idempotencia con tests de regresión. Los recuentos históricos de esa preparación no sustituyen los resultados finales de la tabla. Véase P1_INVITATIONS_REVIEW.md para alcance y límites de revisión.

## Puertas que siguen abiertas

F08 no cierra docs/BLOCKERS.md: faltan las puertas humanas/operativas de P0 que allí correspondan, la validación del hosting real y la promoción controlada con respaldo/reversa y revisión. Este informe no actualiza ni da por superada ninguna puerta de staging. Tampoco completa el ciclo administrativo íntegro de usuarios, recuperación global de credenciales o los módulos académicos posteriores. No se modificó producción ni se utilizaron datos personales reales como fixtures.

Referencias primarias revisadas: https://resend.com/docs/api-reference/emails/send-email, https://resend.com/docs/dashboard/emails/idempotency-keys y https://resend.com/docs/api-reference/errors.
