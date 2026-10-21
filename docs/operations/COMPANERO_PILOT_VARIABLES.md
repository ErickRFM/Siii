# Piloto privado SIII ↔ Compañero: variables reales y orden de activación

**Este documento no contiene secretos ni los genera automáticamente.** No pegues claves, tokens o URIs en issues, PR, capturas ni conversaciones. Regístralas en los gestores de secretos correspondientes. `NEXT_PUBLIC_*` jamás debe contener credenciales de backend. Los cambios de este PR **no activan** el piloto por sí solos.

## A. Supabase: preflight obligatorio

SIII usa su única base PostgreSQL en Supabase. Antes de añadir variables y habilitar la bandeja de salida:

1. Confirmar a qué proyecto de Supabase apunta `DATABASE_URL` de SIII (verificar host/proyecto, **sin copiar usuario, contraseña ni URI completa**).
2. Revisar estado real de todas las migraciones 0002..0018 y hashes, esquemas, relaciones, roles `siii_app` / `siii_migrator`, funciones y RLS. El historial de migraciones *no basta* si el esquema no corresponde.
3. Preparar respaldo y plan de reversión. Aplicar migraciones pendientes **en orden**, jamás ejecutar la 0018 salteando requisitos previos.
4. Confirmar con consulta de solo lectura que existen `public.academic_section_versions` y `public.academic_section_outbox` con índices, dueño y RLS. Mantener flags de envío **false** durante todos estos pasos.

## B. Vercel, proyecto SIII, Production (variables de servidor)

| Nombre exacto | Formato / fuente | Primer estado |
| --- | --- | --- |
| `DATABASE_URL` | Conexión existente con rol restringido. No duplicarla ni publicarla | Ya configurada: validar rol |
| `CRON_SECRET` | Secreto existente para `Authorization: Bearer ...`; mantener privado | Reutilizar |
| `SIII_ACADEMIC_OUTBOX_KEYS` | JSON keyring `{"siii-k1":"<BASE64_32_BYTES>"}` | Secreto nuevo |
| `SIII_ACADEMIC_OUTBOX_ACTIVE_KEY_ID` | `siii-k1` (debe existir en JSON) | Nuevo |
| `SIII_COMPANION_DELIVERY_TARGETS_JSON` | `{"<SIII_INSTITUTION_UUID>":{"origin":"https://compa-ero-de-esc.onrender.com","keyId":"siii-uptlax-1","secretBase64":"<BASE64_HMAC_32_BYTES_O_MAS>"}}` | Secreto nuevo |
| `SIII_ACADEMIC_OUTBOX_ENABLED` | Literal `false` o `true`, caso sensible | `false` |
| `SIII_COMPANION_DELIVERY_ENABLED` | Literal `false` o `true`, caso sensible | `false` |
| `COMPANERO_API_URL` | URL HTTPS de API de Compañero, ya existente | Verificar URL |
| `COMPANERO_INTEGRATION_ENABLED` | Configuración de la integración de lectura existente, independiente del outbox | Mantener estado actual |

**No son intercambiables:** `SIII_ACADEMIC_OUTBOX_KEYS` cifra eventos en PostgreSQL (AES-256-GCM) y `secretBase64` firma solicitudes HMAC. Genera dos secretos **independientes** y conserva el keyring antiguo para desencriptar eventos durante rotación. Para generar cada clave desde tu equipo y copiarla directamente al gestor de secretos, utiliza una herramienta criptográfica local (p. ej., `node -p "require('node:crypto').randomBytes(32).toString('base64')"`). No publiques su resultado.

El UUID en el objeto es el identificador real de la institución SIII; el `keyId` es el identificador **de credencial de recepción**, no un identificador de alumno. `origin` debe ser HTTPS y terminar en el host sin ruta, puerto, query ni fragmento. El path firmado es `/integration/v1/events`, añadido automáticamente por el código. El JSON va íntegro en una sola variable; no comillas sueltas ni comas sobrantes.

La prueba de formato es `node scripts/companion-pilot-preflight.mjs` desde un entorno que tenga las variables. No necesita DB ni hace solicitudes. Al finalizar la activación, `--active` también exige las flags `true`. El comando **no prueba** que Supabase tenga migraciones ni que el HMAC esté provisionado en Ktor.

## C. Render, servicio Ktor Compañero

| Nombre exacto | Qué hace |
| --- | --- |
| `APP_ENV` | `production` para validar reglas de configuración |
| `MONGODB_URI` y `MONGODB_DATABASE` | Persistencia privada MongoDB existente |
| `JWT_SECRET` | Autenticación de Compañero; distinto de cualquier clave SIII |
| `INSTITUTION_INTEGRATION_ENCRYPTION_KEY` | Base64url **sin padding** de 32 bytes de AES-256, distinto de `MFA_ENCRYPTION_KEY`, permite guardar credenciales receptoras cifradas en MongoDB |
| `MFA_ENCRYPTION_KEY` | Clave existente MFA; no usar para integración |
| `ATTENDANCE_QR_SECRET` | Firma QR de clase, **no** utilizar para HMAC SIII |
| `SCHOOL_PRESENCE_QR_SHA256`, `SCHOOL_WIFI_SSIDS`, `SCHOOL_WIFI_BSSIDS` | Configuración de asistencia institucional, separada del transporte SIII |

En Ktor, el PR [Compañero #208](https://github.com/ErickRFM/Compa-ero-de-esc/pull/208) incorpora un **bootstrap voluntario de una sola vez en Render**, basado en `SIII_INBOUND_BOOTSTRAP_ENABLED=true`, `SIII_INBOUND_KEY_ID`, `SIII_INBOUND_TENANT_ID`, `SIII_INBOUND_SECRET_BASE64` y `SIII_INBOUND_EXPIRES_AT_EPOCH_SECONDS`. Solo funciona después de integrar ese PR y de que `INSTITUTION_INTEGRATION_ENCRYPTION_KEY` esté configurada correctamente. Aprovisiona mediante `MongoInstitutionalPushRepository.putCredential` cifrado, con `scopes = setOf("group:write")`; falla si el mismo keyId existe con otros datos. Tras ese arranque, desactiva la bandera y retira los cuatro valores temporales de Render; la credencial duradera queda en Mongo. Consultar `docs/operations/SIII_INBOUND_PILOT_BOOTSTRAP.md` del repositorio Compañero. **No** crea instituciones, alumnos ni vínculos de identidad; tampoco instala la migración SIII.

El UUID SIII puede ser **distinto** del tenant interno de Compañero. Verifica la relación uno-a-uno de institución e identidad antes de habilitar eventos. El receptor solo acepta un HMAC con el secreto correcto, nonce único y timestamp dentro de su ventana. La ruta es `POST /integration/v1/events`; `GET` no es una prueba válida de recepción.

## D. Secuencia de activación pilotada

1. Confirmar migración 0018/roles/RLS y respaldo con el equipo responsable de la única base productiva; sin datos reales aún.
2. Provisionar clave AES y HMAC/tenant de Ktor en Mongo de modo seguro; comprobar el proceso de proyección y credenciales mediante pruebas sintéticas firmadas.
3. Introducir secret keyring y map JSON en Vercel. Mantener flags `false`. Desplegar `main` de SIII; verificar que el SHA de Vercel incluye el PR que creó productor y sender.
4. Ejecutar preflight sin `--active` y recopilar solo sus estados OK/FALTA. Comprobar que `GET /api/internal/companion-snapshot-delivery` responde 401 sin `CRON_SECRET`, sin exponer contenido de outbox.
5. Activar **solo** `SIII_ACADEMIC_OUTBOX_ENABLED=true`, guardar una sección sintética en una institución piloto y confirmar la fila nueva con versión en outbox. Si falla, revertir la flag.
6. Activar `SIII_COMPANION_DELIVERY_ENABLED=true` y llamar al endpoint desde una herramienta protegida con `Authorization: Bearer <CRON_SECRET>` (sin pegarlo en chats). Revisar recepción 202/200, evento duradero, proyección `PROJECTED` y permisos en API. Añadir cron después de verificar el límite del plan Vercel.
7. Probar alta y baja de inscripción, cambios de docente, horario, cancelaciones y bloqueo de institución. Comprobar que el alumno Android ve materias/horario correctos y NO ve recursos ajenos.
8. Solo entonces introducir matrículas reales, con consentimiento y revisión institucional.

**Punto NO-GO:** si falta migración, criptografía correcta, proyección Ktor, vinculación entre identidades, rutas de lectura Android o revocación efectiva, la conexión NO está lista para producción. Las flags deben permanecer apagadas, aunque el CI y el despliegue aparezcan READY.
