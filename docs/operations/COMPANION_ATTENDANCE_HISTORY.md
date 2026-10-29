# Consulta institucional de asistencia de Compañero

`GET /api/v1/institutions/:institutionId/companion-attendance/:studentId` consulta
Compañero desde el servidor SIII. Requiere sesión vigente y `academic.manage`
institucional, con las comprobaciones MFA y de alcance existentes. El UUID del
alumno se resuelve a su matrícula oficial; el cliente no puede enviar matrícula,
institución ni destino alternativos. No incorpora permisos nuevos ni escribe
asistencias en SIII.

El servidor comprueba alumno/programa, inscripciones activas, versiones de grupo
y relaciones de ocurrencia antes y después de la consulta. La lectura aceptada
registra auditoría con recurso, request ID y cantidad, sin matrícula ni registros.
Los estados `review_required` siguen indicando revisión pendiente: no prueban
presencia física. La respuesta declara `sampleLimit: 100`; no acredita un archivo
histórico completo y su disponibilidad exige que la autoridad actual siga vigente.

## Configuración privada

1. Provisionar mediante la operación autorizada de credenciales de Compañero una
   clave exclusiva del tenant con **únicamente** `attendance:read`. No ampliar ni
   reutilizar la clave del productor `group:write`.
2. Guardar en el gestor de secretos del servidor SIII
   `SIII_COMPANION_ATTENDANCE_TARGETS_JSON`, un mapa por UUID institucional con
   `origin` HTTPS sin ruta/puerto/credenciales, `keyId` y `secretBase64` canónico.
   El secreto debe tener entre 32 y 128 bytes aleatorios. No usar valores de la
   documentación como claves ni guardar configuración real en Git.
3. Compañero debe desplegar `POST /integration/v1/attendance-history` y tener
   enlace de identidad nativa e integración de autoridad SIII vigentes.
4. Verificar con una cuenta autorizada y un expediente real aprobado. Este cambio
   no crea credenciales productivas, no cambia configuración de hosting y no
   certifica consultas productivas ni notificaciones FCM.

Sin configuración o ante fallo remoto, el endpoint devuelve 503. Un alumno ajeno,
inactivo o sin inscripción disponible devuelve 404; falta de autoridad devuelve
403. Un cambio de fuente durante la consulta descarta la respuesta con 503.
Todo resultado utiliza `Cache-Control: no-store`; los errores remotos no se
propagan. El límite remoto es 10 segundos y 128 KiB, sin seguir redirecciones.

## Evidencia de código

- `tests/unit/companion-attendance-history.test.ts`: firma HMAC exacta, finalidad
  independiente, destino y contrato estrictos, errores y límites.
- `tests/unit/companion-attendance-route.test.ts`: autoridad antes/después,
  revocación, cambio de versión y ocurrencia, overrides y auditoría mínima.
- `tests/integration/companion-attendance-http.test.ts`: autorización real,
  aislamiento institucional y de alumno, origen y configuración ausente.
- `tests/support/companion-chain-live-probe.ts`: laboratorio opt-in con el GET real,
  PostgreSQL local, Ktor y Mongo. El adaptador de transporte reside exclusivamente
  en `tests/support/server.mjs`; la aplicación no acepta destinos HTTP locales.

La evidencia ejecutada se informa en el PR y en el cierre V20; esta guía describe
el contrato y los requisitos, no afirma habilitación productiva.
