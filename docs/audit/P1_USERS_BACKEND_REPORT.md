# P1 F06 — Backend de usuarios institucionales y recuperación propia

Rama codex/p1-user-management desde F08/638307fd. Implementación en revisión; este informe no cierra P1, no acredita merge y no sustituye las puertas P0 de docs/BLOCKERS.md. No se modificaron producción ni recursos administrados de Supabase. Todos los usuarios, contactos, claves y transportes de prueba son sintéticos.

## Persistencia y aislamiento

Se creó exclusivamente la base local nueva p1_users_test mediante TEMPLATE template0 en el cluster ya existente 127.0.0.1:55432. Se conservaron las bases anteriores. Los datos de conexión y manifiesto de hashes están solo en .p0-local ignorado. El migrador canónico y su repetición devolvieron MIGRATIONS_APPLIED.

La migración aditiva 0009_p1_user_management.sql quedó congelada después de su primera aplicación: SHA256 A7CA5A54C19A7370248E753BDE04581CA48F24AC5E25AE0B12A10D73B825C099. Incorpora columnas display_name, institutional_code, institutional_email y deleted_at en institution_memberships, CHECK deleted_at implica suspended, reserva única de código institucional por tenant, índices, membership_events, password_reset_requests y password_reset_outbox. Requests de recuperación referencian el par usuario/email verificado; outbox referencia el par request/usuario. No se editaron SQL0000–0008 ni ledgers históricos.

Las tablas nuevas tienen RLS habilitado y forzado, denegación restrictiva a anon/authenticated y privilegios mínimos del LOGIN que hereda siii_app. El runtime tiene SELECT/INSERT en membership_events y SELECT/INSERT/UPDATE en requests/outbox; no recibe DELETE ni UPDATE de historial. Propiedad y migración permanecen separadas del runtime.

## Contrato institucional

| Método | Ruta bajo /api/v1/institutions/:institutionId | Contrato |
| --- | --- | --- |
| GET | /memberships | Filtros q, status=all/active/suspended/deleted y role vigente; paginación y cursor ligado a filtros normalizados. |
| GET | /memberships/:membershipId | Identidad de lectura, perfil institucional, estado, concesiones vigentes y acciones concretas autorizadas. |
| GET | /memberships/:membershipId/history | Historial institucional paginado y proyectado mediante whitelist. |
| PATCH | /memberships/:membershipId/profile | displayName, institutionalCode, institutionalEmail y reason, sin campos globales. |
| POST | /memberships/:membershipId/lifecycle | operation=suspend/activate/delete/rehabilitate y reason. |
| POST | /memberships/:membershipId/password-reset | Solicita recuperación al titular; reason, respuesta 202 sin destino ni token. |

Se conserva PATCH /memberships/:membershipId con su contrato previo de status y reason enumerado, ahora rechazando deletedAt e incorporando el cambio al mismo historial institucional transaccional. El alta sigue siendo F08 mediante invitación consentida; POST por UUID global sigue devolviendo INVITATION_REQUIRED.

El perfil es local al tenant: displayName hasta 160 caracteres, código hasta 80 y email institucional hasta 254. El código se normaliza a mayúsculas y sigue reservado tras una baja lógica. Un campo opcional puede limpiarse con null. El administrador institucional no modifica people, username, actividad global ni email de recuperación. El email institucional nunca autoriza recuperación. Las respuestas construyen campos explícitos; no exponen la fila interna ni la verificación global del correo.

El listado usa users.read y revalida visibilidad en SQL; rol significa concesión vigente, por lo que una membresía eliminada sin concesiones vigentes aparece con status=deleted y queda fuera de role=teacher. El cursor no puede reutilizarse con otro tenant o conjunto de filtros. Las operaciones usan users.update/users.suspend/users.restore/users.reset, jerarquía vigente, prohibición de cambio propio, MFA/step-up crítico y locks institución → usuarios ordenados → factores → sesión → membresías. Se protege al último administrador permanente incluso si el emisor tiene una concesión temporal de superadministrador.

Suspender impide acceso e invalida sesiones conservando concesiones; activar una suspensión ordinaria las conserva. Eliminar registra deletedAt, fuerza suspended, revoca las concesiones de esa membresía y cancela invitaciones pendientes emitidas por ese usuario en ese tenant. Rehabilitar devuelve la membresía a active sin resucitar concesiones. PATCH legacy e invitaciones F08 no evaden la baja. Se conserva identidad e historial y no se modifica la membresía en otra institución; las sesiones anteriores se invalidan por versión de autenticación conforme al modelo F07.

projectUserHistory, exportado en src/shared/users/history.ts, acepta solo estados, fechas ISO, campos institucionales de longitud acotada y conteos revisados. Descarta campos desconocidos y no devuelve audit.details crudo, password, token, ciphertext, correo global ni objetos anidados arbitrarios. Puede reutilizarse como frontera acotada de proyección; no implementa el panel F09.

## Recuperación de credenciales del titular

| Método | Ruta | Contrato |
| --- | --- | --- |
| POST | /api/v1/auth/password/reset/request | email global verificado; respuesta 202 idéntica para desconocido, inválido, limitado o no configurado. |
| POST | /api/v1/auth/password/reset/preview | resetId y token; contexto mínimo de bearer válido, sin identidad ni dirección. |
| POST | /api/v1/auth/password/reset/complete | resetId, token, newPassword y, si hay MFA activo, code o recoveryCode. |

El titular elige contraseña de 12–128 caracteres. El administrador nunca impone una contraseña ni recibe el enlace. El token tiene 256 bits, Base64URL canónico, hash ligado al propósito password-reset, request, usuario y authVersion; dura como máximo 30 minutos y se consume una sola vez. Su destino procede exclusivamente de account_email_verifications. Un cambio de authVersion, email verificado, actividad global, expiración o consumo vuelve inválida la prueba.

El request público aplica presupuesto por IP y por email canónico, incluido email desconocido. Los requests institucionales comparten el presupuesto por cuenta: tres por hora; el IP público permite treinta por minuto. Las respuestas, nombres y códigos no distinguen existencia o configuración. No se promete tiempo absoluto constante ante distinta contención PostgreSQL; no se añadió una demora artificial.

La finalización adquiere usuario → factor → request, verifica otra vez versión, dueño, estado y caducidad después de esperar, y exige TOTP o recovery vigente cuando el factor está activo. No existe bypass por correo. mfa-proof.ts centraliza la misma política existente de cinco fallos, bloqueo global de quince minutos, paso TOTP ya consumido y recovery de un uso; el reset y login comparten esos registros. Incluso recovery exige descifrado y configuración MFA válidos. Los fallos se confirman transaccionalmente; un error de auditoría durante éxito revierte contraseña, authVersion, consumo de token/recovery, lease, desafíos y sesiones. Al terminar se invalidan sesiones y pendientes y se exige login real, sin acuñar cookie de autenticación.

## Cola y configuración de servidor

El lote real npx tsx worker/password-resets.ts comprueba assertApplicationRole y utiliza outbox separado, payload AES-256-GCM cifrado, remitente/Reply-To congelados, lease persistente y finalización CAS. Reintenta con el mismo evento, hasta ocho intentos y dentro de la caducidad de recuperación (30 minutos), además del límite compartido inferior a 23 horas del proveedor. Una respuesta antigua no sobrescribe un lease reclamado ni resucita un reset ya consumido/cancelado. accepted significa aceptación del proveedor, no recepción en el buzón. El scheduler operativo no está configurado en esta entrega.

El cifrado comparte la primitiva de envelope con F08, conservando exactamente su AAD anterior; reset autentica el propósito propio SIII:password-reset-delivery, keyId, evento y usuario. La clave de idempotencia es siii-password-reset-<evento>, distinta de invitaciones. Variables nuevas exclusivamente de servidor: SIII_PASSWORD_RESET_KEYS (JSON de claves aleatorias canónicas Base64 de 32 bytes) y SIII_PASSWORD_RESET_ACTIVE_KEY_ID. No hay fallback a claves de invitación o MFA. Se reutilizan SIII_PUBLIC_ORIGIN HTTPS, RESEND_API_KEY, SIII_EMAIL_FROM y SIII_EMAIL_REPLY_TO. Mantener claves antiguas mientras haya mensajes cifrados pendientes; nunca usar credenciales OAuth del conector como API key del runtime.

Sin remitente/Reply-To/API key el mensaje cifrado queda queued con EMAIL_NOT_CONFIGURED. Sin keyring u origen válido no se afirma envío y la API pública conserva respuesta genérica. No se configuraron credenciales reales ni se realizaron envíos externos; los tests ejercitan LOGIN restringido y transporte sintético inyectado. Confirmación de recepción, dominio institucional, configuración operativa y entregabilidad siguen pendientes.

## Verificación y revisiones

- Primera unidad de política/validación/token reprodujo ausencia de módulo; 13 casos pasaron al implementar. La suite backend dirigida final incluye 20 pruebas de política, proyección, propósito y configuración.
- Primera HTTP: 20 casos, 13 verdes y siete RED. Cinco fallos de reset compartían SQL 22P02 al interpolar un array para ANY; diagnóstico local que imprimió solo el código lo reprodujo. Se sustituyó por inArray y la repetición pasó 20/20. Otro fallo era reason legacy fuera del enum; se corrigió la fixture. Se precisó que role filtra concesiones vigentes sin restaurar las de una baja.
- Primera revisión integral encontró dos defectos: PATCH legacy no alimentaba membership_events y users.restore se evaluaba contra estado active. Ambos tuvieron pruebas RED concretas antes de corregir: historial vacío y capability ausente. Unidad y HTTP posteriores pasan.
- Suite ampliada F06: 33/33 HTTP reales sobre PostgreSQL local, 72,20 segundos. Incluye presupuestos concurrentes público/institucional/IP, TOTP/recovery reutilizados entre reset y login, rollback íntegro de éxito por auditoría, lease vencido reclamado y CAS antiguo, ocho intentos, invitación que no rehabilita baja, último administrador permanente y MFA/step-up después de espera SQL. Los fallos de evento y auditoría revierten también PATCH legacy.
- Suite unitaria completa observada: 619/619, incluidos los siete tests de bootstrap de reset que el agente UI incorporó durante el trabajo. Lint del backend y git diff --check verdes; typecheck completo también pasó al terminar este bloque backend y después de regenerar los tipos de las rutas UI concurrentes.
- Regresión HTTP de MFA + invitaciones: 62/62, dos archivos (24 MFA y 38 F08), 94,76 segundos, exit 0; bloque temporal de ejecución liberado.
- La repetición de typecheck en el QA del commit final, integración completa, Chromium de F06/completo, build, audit, CI remota, segunda revisión y commit final: pendientes de registro por el ejecutor principal.

La revisión temprana de las ocho piezas crypto/MFA fue favorable sin hallazgos, con paquete SHA256 6C3B00D7B4569BBB0F99CC46E6E610FFBE15846E9F6F93A8922D20B188DD7ECB; no evaluaba handlers/schema. La revisión completa posterior y el QA final siguen siendo obligatorios. No hay prueba humana de lector de pantalla ni validación de hosting o cierre de P0 en este informe.

## Regresión de compatibilidad F07 detectada en QA global

El ejecutor principal informó 211/216 integraciones verdes y cinco fallos de contrato en permission-scopes.test.ts:274. Los casos existentes bloquean SQL y hacen caducar/revocan la autoridad, cambian authVersion, suspenden la membresía o retiran la verificación MFA después del preflight. El control final de listUsers no filtraba PII indebidamente, pero respondía 403 donde GET memberships de F07 conserva 200 con data vacía y nextCursor null. No se modificaron estos tests.

Corrección limitada a esa rama de salida: la misma revalidación SQL sigue ejecutándose; si falla, descarta todos los DTO y el cursor y devuelve exactamente {data:[],page:{nextCursor:null}} con Cache-Control:no-store. El preflight sin permiso conserva 403. No se cambió el chequeo de detalle, la política, la visibilidad, SQL, UI ni otro backend. El diff puntual sustituye únicamente return jsonError('FORBIDDEN',403) de ese branch final por la respuesta vacía compatible.

Nueva huella de src/shared/users/handlers.ts: SHA256 0274254ADFA461EBD1548061AF19A6383EE43C6B79E9C91A91FF32CB137D310B. La migración 0009 mantiene A7CA5A54C19A7370248E753BDE04581CA48F24AC5E25AE0B12A10D73B825C099. Integración dirigida F07+F06 posterior al ajuste: 60/60 verdes (27 F07 y 33 F06), 108,51 segundos, dos archivos, exit 0 y bloque temporal de ejecución liberado. Los cinco casos RED de compatibilidad existentes pasan sin modificar tests. El QA global posterior sigue a cargo del ejecutor principal.

## QA global final del ejecutor principal

Sobre la fuente final revisada: npm ci, typecheck y lint con salida0; 678/678 unitarias; migrador real repetido MIGRATIONS_APPLIED; 216/216 integraciones (270,73s); 32/32 Chromium (4,5min); build, npm audit (0 vulnerabilidades) y diff-check con salida0. Dos bloques temporales de ejecución liberados. No cambió la fuente tras estas comprobaciones. Revisiones independientes backend/UI y corrección final de compatibilidad favorables; CI del commit y merge pendientes. Resultado consolidado: P1_USERS_REPORT.md. Se mantienen las puertas de BLOCKERS.md, entrega externa de correo y validación humana pendientes.