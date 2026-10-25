# Conexión SIII ↔ Compañero — evidencia de ejecución

Estado de trabajo: implementación y validación sintética en curso. Este informe no acredita activación institucional productiva.

## Base comprobada

SIII parte de `main@2a3c8390062aefbb87dc8dc596620fee31ff8565`; Compañero de `main@586ec206576349c9a0d96ce85c50bbb3cf0fb0b5`. Se conservan providers, contratos académicos, rutas HTTP, autenticación nativa y componentes de interfaz actuales. Los PR antiguos101/219/220 no se fusionan como parte de esta implementación.

## Autoridad de origen

`POST /api/integrations/companion/v1/authority` devuelve exclusivamente IDs de secciones y sus versiones actuales. La credencial existente del mapa de delivery identifica la institución SIII; el cuerpo no elige otro tenant. Se firma el método, path, timestamp, nonce y SHA256 del cuerpo con la HMAC existente. La ventana es de60segundos; el ID único de auditoría reserva el nonce atómicamente incluso si la autorización posterior falla. No se añade otro secreto ni una tabla de sesiones paralela.

La captura de outbox debe estar encendida: cuando se apaga, la autoridad responde503 antes de depender de las tablas0018. Una proyección histórica no puede certificarse vigente después de cambios realizados con el productor apagado. Ktor no debe reutilizar un manifest anterior ante503.

La identidad académica y su institución deben estar activas. Para estudiantes también debe estar activo el programa. Una identidad nativa verificada puede existir sin cuenta de acceso SIII; si existe cualquier historial de vínculo a una cuenta SIII, se exige vínculo vigente, usuario activo, membresía activa no eliminada y rol correspondiente vigente. Se admite alcance institucional y programa propio para estudiantes; no se presupone un mapeo de campus/programa docente que el modelo no acredita.

Las lecturas toman el bloqueo compartido de institución y después los usuarios ordenados por UUID, en el mismo orden que los escritores institucionales. Revalidan después de la auditoría y evalúan caducidad con `clock_timestamp()`. Un cambio de secciones/versiones durante la consulta falla cerrado. Los snapshots continúan en MongoDB: este endpoint no exporta nombres, rosters, horarios ni expedientes.

El máximo es1000 secciones; falta de versión o exceso produce503, nunca un listado parcialmente autorizado. Los permisos de asistencia, QR y administración nativa siguen separados de estas lecturas.

## Diagnóstico y recuperación

`GET /api/v1/institutions/:institutionId/companion-sync` exige `integrations.manage` con la sesión/assurance institucional existente. Ofrece conteos, leases, fechas y metadatos acotados; no devuelve cuerpos cifrados, hashes ni datos personales. `accepted` conserva su significado de recepción durable. La observación remota usa un propósito firmado separado (`/integration/v1/projection-status`), el mismo tenant/credencial, hasta50 IDs y respuestas de hasta32768bytes. Falta de respuesta o recibo permanece no verificada/desconocida.

La lectura remota ocurre fuera de la transacción local; se revalida la autorización del operador antes de devolver el resultado. No se interpretan errores del proveedor como detalles imprimibles.

`POST` en la misma ruta reconstruye un snapshot actual con `sectionId`, `expectedSourceVersion` y motivo. Bloquea la sección, comprueba la versión y crea un evento nuevo mediante el productor existente, con auditoría en la misma transacción. No modifica bytes, versiones ni intentos de eventos históricos. Dos solicitudes con la misma expectativa no crean dos versiones; la segunda debe devolver409. La entrega y aplicación posterior se observan por separado.

## Laboratorio reproducible

`tests/support/companion-chain-live-probe.ts` solo admite base de pruebas en loopback y receptorHTTP127.0.0.1. Genera catálogos y operador MFA exclusivamente sintéticos; crea grupo, alumno, docente, asignación, inscripción y patrón horario por APIs HTTP reales de SIII. Usa el worker, leases, CAS, cifrado y firma reales; únicamente adapta el destino HTTPS ficticio al servidor local de prueba.

Los comandos de retiro y cambio ONLINE/CANCELLED usan endpoints reales. La interrupción del receptor conserva eventos pendientes y reintentos. El avance del reloj de reintento es exclusivo de las filas de esa institución sintética. Las fases de deshabilitar/restaurar institución usan SQL del laboratorio: demuestran la reacción a su estado persistido, no el flujo de administración institucional HTTP. Ninguna de esas herramientas está importada por la aplicación.

La prueba de cadena de Compañero debe acreditar recepción pendiente antes de ejecutar el proyector, consulta503 cuando falta la versión exacta, aplicación durable posterior, lectura autenticada y retiros/revocaciones. La validación Android instrumentada y los resultados finales se registrarán después de ejecutarse; no se deducen de las pruebas JVM.

La primera integración completa local sobre la base reutilizada tuvo604 casos aprobados,35 omitidos de autoridad ON y un fallo del test de reintento: su lote global de100 recogió eventos de laboratorios anteriores antes del evento que esperaba. Los metadatos confirmaron95 eventos `KEY_UNAVAILABLE` y5 `BODY_INVALID` procesados en esa ventana, con claves efímeras anteriores. No se cambió el worker ni su límite para acomodar el test. En una base local recién migrada, la suite focal original de outbox pasó17/17; la integración completa se repite en otra base nueva para reproducir el aislamiento de CI. La base anterior se conserva para diagnóstico.

El lector de estados pasó22 pruebas unitarias, incluida una regresión del contrato real Kotlin: `explicitNulls=false` omite los metadatos nulos. `sourceVersion` sigue identificando el evento; `appliedSourceVersion` identifica la cabeza proyectada observada, o permanece desconocida. Los tiempos de observación local/remoto se conservan: comparar esos valores no representa una transacción distribuida ni concede permisos.

## Puertas externas todavía pendientes

- Supabase productivo tiene18 migraciones, sin outbox/versiones. [Ensayo y preparación comprobados](SIII_COMPANION_DATABASE_READINESS_2026-10-24.md) cubren0018..0025, rollback y recuperación sintética. Falta respaldo productivo reciente y restauración independiente comprobada, además de autorización explícita para DDL.
- Las variables requeridas existen en Vercel Production. Las flags sensibles no permiten lectura de su valor mediante el conector: no se afirma su valor efectivo. No se cambiaron ni regeneraron.
- GitHub no tiene secretos ni variables de repositorio al consultar sus nombres/fechas. El scheduler preparado sigue sin activación y necesita configurar de forma segura el `CRON_SECRET` existente, sin generar otra clave innecesaria.
- El despliegue Render de referencia está asociado a586ec; todavía no acredita bootstrap HMAC, proyección productiva ni las nuevas lecturas. Una consulta pública `/ready` agotó45segundos en la primera ejecución. La repetición del24octubre alrededor de17:10UTC respondió200, `status:up` y comprobación MongoDB `up`; esto acredita salud puntual, no el HMAC ni la conexión académica.
- Faltan revisión final, CI de ambos commits, merges y comprobación de SHA desplegados. La activación requiere además piloto sintético autorizado y pruebas de la aplicación. La validación en dispositivo físico se registra separada del emulador.
