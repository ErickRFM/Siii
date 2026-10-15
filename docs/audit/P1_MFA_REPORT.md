# P1 MFA — implementación dependiente y evidencia local

Base: P0.1 2ee29bff (reconciliación de privilegios y replay). No modifica migraciones 0000–0005. La migración aditiva 0006 tiene SHA256 4E5A588A3BA7175F00096405BFB9AAE7B5EEBDAA03AEEEB6F9B5DA3DD01A8230 y se aplicó, y repitió, sobre p1_final_test aislada. Fixtures experimentales anteriores se conservaron; no se modificó ningún ledger para aceptar borradores.

## Comportamiento implementado

TOTP real con otplib 13.5.0 y NodeCryptoPlugin: SHA1, seis dígitos, periodo de 30 segundos, tolerancia solo hacia el pasado y paso persistido para impedir replay. Secretos AES-256-GCM con AAD de propósito, versión, keyId y usuario. Diez códigos de recuperación de 128 bits, almacenados como hashes vinculados al usuario, consumidos una sola vez bajo locks.

Las cuatro tablas MFA tienen RLS forzado, propietario migrador, políticas restrictivas para roles Data API y grants de runtime explícitos SELECT/INSERT/UPDATE. No hay permisos DELETE automáticos. authVersion invalida sesiones y desafíos anteriores. Activación, revocación y cambio de contraseña invalidan credenciales anteriores; step-up rota únicamente la sesión actual. Auditoría y cambios sensibles comparten transacción.

API en /api/v1/auth/mfa:
- GET: estado propio, sin secretos.
- POST enroll: contraseña vigente, inscripción vinculada a sesión por 15 minutos.
- POST verify: confirma TOTP, activa factor y entrega códigos de recuperación.
- POST challenge: verifica TOTP o recuperación y entrega sesión completa; reto por 5 minutos.
- POST step-up: contraseña y factor activo; vigencia de 5 minutos.
- POST recovery/regenerate y revoke: exigen step-up reciente.

Login con factor activo emite solo un reto antes de la verificación. La interfaz /dashboard/security permite configurar, activar, regenerar y revocar; login verifica TOTP o recuperación. Secretos y códigos se muestran solo durante el flujo correspondiente y no se almacenan en el navegador. Se conserva recuperación manual mediante autenticador; no se añadió un QR decorativo.

## Configuración operativa

SIII_MFA_KEYS es un objeto JSON de keyId a clave de 32 bytes en Base64 canónico; SIII_MFA_ACTIVE_KEY_ID elige la clave para nuevas inscripciones. Variables solo servidor, mediante gestor de secretos; nunca NEXT_PUBLIC ni Git. No existe clave de fallback. Mantener claves anteriores mientras haya factores cifrados con ellas; retirarlas impide descifrar dichos factores y devuelve 503, también al recuperar. Los tests generan claves sintéticas efímeras, sin configurar staging ni producción.

## Verificación del 2026-10-14

- 122 pruebas unitarias del commit MFA; la matriz IAM futura de 405 casos se excluyó de este commit.
- 112 pruebas PostgreSQL/HTTP: 24 MFA y 88 previas, con LOGIN runtime separado en p1_final_test.
- 12 Chromium: 2 MFA y 10 recorridos previos; axe, teclado, recuperación de un uso, inscripción expirada y errores corregibles.
- Typecheck, lint, build y git diff --check: salida 0.
- npm audit --omit=dev: cero vulnerabilidades.

Regresiones incluyen reto simultáneo, replay, expiración, sexto intento bloqueado, recuperación de un uso, claves ausentes/tamper, rollback de auditoría, sesión/versiones invalidadas, password-change requerido, revalidación después de locks y limpieza con cascadas MFA concurrente al cambio de contraseña. Logout usa Location relativa /login para conservar el host de la sesión y evitar el fallo CSP del servidor local.

Primera revisión independiente encontró revalidación insuficiente de writeAccess y una inversión de locks por CASCADE. Ambas corregidas: usuario→factor→sesión y worker usuario primero con SKIP LOCKED; regresiones HTTP verdes. Segunda revisión, CI remota y merge todavía pendientes al escribir este reporte.

## Alcance pendiente

MFA obligatorio por perfiles privilegiados, prevención de revocación mientras existan grants privilegiados y step-up institucional se integrarán con IAM, todavía no certificados. Tampoco se certifican gestión de usuarios, scopes, invitaciones, hosting real, staging cloud ni lector de pantalla humano. PR dependiente y P0 siguen sujetos a sus puertas de release; esta entrega no cierra P1 ni autoriza despliegue.
