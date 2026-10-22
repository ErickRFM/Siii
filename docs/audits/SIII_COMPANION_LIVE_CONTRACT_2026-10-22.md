# Contrato local Siii → Ktor → proyección Mongo (22 octubre 2026)

## Alcance y fuentes fijadas

Rama `test/companion-live-contract-probe-20261022` desde Siii `01a595626f97a2b399892d03aeaf08bba80e5396` (prerrequisito DEP-02/PR89). Receptor Compañero fijado en `586ec206576349c9a0d96ce85c50bbb3cf0fb0b5`, con fuentes limpias antes y después de ejecutar (`git status --short` vacío y `git diff --exit-code` exit0). No se modifican fuentes, tests ni scripts Gradle de Compañero.

Se implementa la CLI faltante que consume el [test receptor existente](https://github.com/ErickRFM/Compa-ero-de-esc/blob/586ec206576349c9a0d96ce85c50bbb3cf0fb0b5/services/api/src/test/kotlin/org/companerodeescuela/api/integrations/academic/SiiiPushLiveContractTest.kt) según su [runbook](https://github.com/ErickRFM/Compa-ero-de-esc/blob/586ec206576349c9a0d96ce85c50bbb3cf0fb0b5/docs/architecture/SIII_PUSH_LIVE_CONTRACT_PROBE.md). Este incremento solo acredita el límite sender TypeScript → HTTP real → recepción y proyección institucional Mongo. No acredita outbox operativo, revocaciones/tombstones, onboarding productivo, lector HTTP, Android/iOS ni HTTPS desplegado.

## Implementación

- `tests/support/companion-push-live-probe.ts`: child opt-in que valida cinco variables efímeras y construye un snapshot sintético no vacío (docente, inscripción y ocurrencia). Reutiliza `validateAcademicSnapshot` y el `signedAcademicTransport` productivo; no implementa otro firmador HMAC.
- La configuración entregada al transporte conserva un origen HTTPS válido sintético. Su fetch inyectado, solo en tests, adapta ese origen exacto a `http://127.0.0.1:<puerto>/integration/v1/events` y realiza fetch real preservando método, cuerpo, headers, política de redirects y señal de abort. No cambia la política productiva HTTPS ni habilita loopback en ella.
- Se serializa una vez el sobre y se conservan eventId, sectionId, sourceVersion y bytes en todos los requests. El reloj controlado del child permite timestamps nuevos sin sleeps y una firma stale válida; se restaura en `finally`. Las cinco firmas proceden del transporte real; el replay copia exactamente el cuarto request aceptado. WrongKey usa la misma credencial con un secreto aleatorio incorrecto.
- El child imprime únicamente el JSON requerido, menor de64KiB; sus fallos devuelven códigos estables sin argumentos, cuerpos, headers ni secretos. Abort global30s, límite duro35s y timeout externo45s; se limpian los buffers de claves locales.
- `tests/unit/companion-push-live-probe.test.ts`: diez negativos ejecutan el child Node/tsx real con un entorno mínimo. Cubren cada env faltante, destinos no literales/no raíz, secreto inválido y tenant igual al origen. No usan fetch simulado ni receipts falsos. Estos negativos fallan antes de red y son distintos de los negativos HMAC del receptor real.

## Entorno local exclusivo

Mongo portable8.0.34 fue provisionado por el coordinador, con SHA256 oficial del archivo `6b021a0864494e4decf278b36477a29eb36072432773e4e62c2f42c302630db0`. Su proceso propio46108 está registrado en `.p0-local/companion-live-runtime/mongo-owned-process.json`, ligado exclusivamente a127.0.0.1:27017. Esta tarea no modifica su configuración/dbpath ni detiene el proceso. El test receptor exige literalmente `mongodb://127.0.0.1:27017` y crea/elimina únicamente su base aleatoria `v12_test_*` en `finally`.

Java verificado: Temurin17.0.19; wrapper del receptor Gradle8.14.3. Node local24.18.0, Next15.5.28 y tsx instalado por `npm ci --ignore-scripts`; rebuildargon2/esbuild exit0. No se instalaron dependencias globales, no se consultó PostgreSQL ni se abrieron servicios remotos. Ktor usa un listener efímero loopback y su credencial HMAC32bytes solo permite `group:write` sobre el tenant sintético.

## Reproducción

En el checkout limpio de Compañero fijado, con el Mongo desechable ya disponible:

```powershell
$env:JAVA_HOME='C:/Users/erik5/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2'
$env:V12_TEST_MONGODB_URI='mongodb://127.0.0.1:27017'
$env:COMPANION_PUSH_PROBE_PROJECT_ROOT='C:/Users/erik5/.codex/worktrees/companion-live-contract/university-sis'
$env:COMPANION_PUSH_PROBE_NODE=(Get-Command node).Source
.\gradlew.bat :services:api:test --tests 'org.companerodeescuela.api.integrations.academic.SiiiPushLiveContractTest' --rerun-tasks --no-build-cache --no-configuration-cache --no-parallel --max-workers=1 '-Pkotlin.incremental=false' '-Pkotlin.compiler.execution.strategy=in-process' --console=plain
```

El receptor solo reenvía rutas del sistema operativo y `COMPANION_PUSH_PROBE_ORIGIN`, `COMPANION_PUSH_PROBE_SOURCE_INSTITUTION_ID`, `COMPANION_PUSH_PROBE_TARGET_TENANT_ID`, `COMPANION_PUSH_PROBE_CREDENTIAL_ID`, `COMPANION_PUSH_PROBE_SECRET_BASE64`. No reenvía env de base/API ni secretos productivos. La ausencia de `COMPANION_PUSH_PROBE_PROJECT_ROOT` produce skip explícito; por eso se verifica el XML y se conserva `--rerun-tasks`.

## Job CI persistente e independiente

`.github/workflows/verify.yml` añade `companion-live-contract` en paralelo al job `verify`, sin modificar el objeto de ese job, sus gates, triggers, permisos, imagen ni tiempos existentes. El nuevo job usa Ubuntu24.04 y25min, Mongo8.0.34 con puerto host ligado a127.0.0.1:27017 y healthcheck mongosh, Node22 con npmci/rebuild y Temurin17. El checkout público de Compañero fija el SHA completo586ec206 y `persist-credentials:false`; el wrapper8.14.3 y los flags del runbook se conservan, sin cache de compilación/configuración ni suite completa del receptor.

Las acciones checkout/setup-node/upload mantienen los SHA existentes. `actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961` (v5) fue comprobado contra el repositorio oficial. El job obtiene la ruta del Node22 instalado y ejecuta únicamente `SiiiPushLiveContractTest`. Verifica fuente receptora limpia y HEAD exacto después; publica solo el log Gradle y el XML de esa clase, ambos sintéticos, con retención3días. No usa secretos nuevos ni modifica el otro repositorio.

Un verificador Python de biblioteca estándar exige clase exacta, tests1/failures0/errors0/skipped0 y exactamente un testcase sin elementos skipped/failure/error. Se ejecuta incluso cuando Gradle falla. Validación local: YAML parseado; job `verify` y controles de workflow estructuralmente idénticos a la base; XML GREEN real aceptado; RED real, contador de skips mutado y skipped dentro del testcase con contadores todavía en0 rechazados. Artefacto local: `probe-workflow-validation.log`. La primera construcción de la última mutación insertaba un sibling porque Gradle usa testcase autocerrado; se corrigió el dato de prueba y el verificador rechazó el skipped anidado. No se cambió el gate para acomodar esa comprobación.

La ejecución remota Ubuntu24/Node22 y las descargas frías del receptor quedan pendientes del CI del SHA publicado. La ejecución local Windows/Node24 no se presenta como un resultado de ese job nuevo.
## Evidencia RED → GREEN

Artefactos ignorados en `.p0-local/companion-live-runtime/`:

- `probe-red.log`/`probe-red.xml`: antes de escribir la CLI, Gradle exit1. JUnit tests1/failures1/errors0/skipped0,1.916s: `IllegalArgumentException: Synthetic sender probe is missing`, línea151. No se confundió una falla de compilación/JDK/Mongo con el RED.
- `probe-guards-red.log`: diez fallos con fixture ausente. `probe-guards-green.log`:10/10 aprobados con la CLI implementada.
- `probe-green.log`/`probe-green.xml`: Gradle exit0, BUILD SUCCESSFUL3m55s; JUnit tests1/failures0/errors0/skipped0,5.075s, timestamp2026-10-22T18:18:38.160Z. El contrato real completo que se detalla abajo aprobó.
- `probe-lint.log`: exit0. `probe-typecheck.log`: exit0 tras corregir solo el tipo del entorno mínimo del harness; la declaración global de Next exige NODE_ENV, pero no se añade esa variable al child.
- `probe-audit.json`: exit0 y cero vulnerabilidades.
- `probe-unit-full.log`: exit0;836/836 pruebas en57archivos. `probe-build.log`: exit0; Next15.5.28, compilación25.3s y31/31páginas generadas. Conserva el aviso existente del plugin ESLint de Next no detectado.

El test receptor exige6HTTP en orden `[202,200,401,200,401,401]` (entrega/retry/stale/fresh/replay/wrongKey), un receipt cuyo SHA256 coincide con los bytes reportados, una sola proyección `projected`, aislamiento del tenant fuente y cero `platform_accounts`. Los dos resultados `accepted` provienen del sender y su validación de receipts reales. El source institution es distinto del tenant autorizado por la credencial; los IDs de la fixture no otorgan autoridad nativa.

## Límites y entrega

Revisión independiente combinada aprobada:0Critical/0Important/0Minor en CLI, guards, workflow y documentación; inspeccionó fuentes y evidencia guardada, sin repetir servicios/tests/CI. El estado Git fue comprobado por el implementador; el revisor no pudo acreditarlo por las restricciones de su entorno. Cambios Siii limitados a tests/docs y el job CI independiente, sin endpoints, F2, flags de integración, esquema, migraciones ni datos productivos. La matriz operacional y los pendientes de revocación/integración permanecen abiertos; este contrato no los cierra. No se ejecutan push, PR ni merge desde esta tarea. La publicación e integración requieren decisión del coordinador y CI del SHA exacto; DEP-02 debe reconciliarse antes de proponer esta rama sobre main.

## Ampliación verificada: regresiones existentes del receptor

Se reutilizaron sin modificaciones MongoSiiiSectionProjectionTest (9 casos) y MongoInstitutionalPushRepositoryTest (11 casos) del mismo checkout receptor586ec206. Primera ejecución20/20, cero fallos/errores/skips, Gradle3m27s. Cubren versiones fuera de orden y CAS, tombstones/revocaciones, identidad/rol/institución/vínculo, idempotencia, lease exclusivo/renovable/recuperable, fencing de completion y reconciliación limitada al tenant/adapter. Son pruebas del receptor; no acreditan productores de revocación ausentes en SIII ni su wiring móvil. Algunas autoridades auxiliares usan repositorios en memoria del propio test; Mongo/inbox/proyección son reales.

Invocación conjunta exacta de las tres clases:21/21 (1 sender real+9 proyección+11 inbox), failures0/errors0/skipped0. XML20:25:49–20:26:01UTC22oct:8.808s/2.830s/2.475s por clase. Gradle informó1h25m54s transcurridos tras una pausa prolongada del host; no se usa ese tiempo como benchmark ni se declara aprobado el intento mientras no existía salida final. Evidencia preservada probe-and-receiver-regressions.log y combined-{SiiiPushLiveContractTest,MongoSiiiSectionProjectionTest,MongoInstitutionalPushRepositoryTest}.xml bajo .p0-local/companion-live-runtime. Fuente receptora HEAD586ec206 y gitstatus vacío tras ejecutar. MongoDB sintético propio cerrado después de comprobar PID, ejecutable, directorio y fecha de inicio; ningún servicio ajeno se detuvo.

El job futuro ahora exige las tres clases fijadas (1/9/11) y publica sus tres XML más el log. Se conservan35s/30s/45s/120s originales y timeout25min, sin reintentos. Verificador extraído del YAML exacto aceptó los XML reales y rechazó nueve mutaciones: contador skip, elemento skipped oculto con contadores0 y ausencia de XML, una por cada clase; restauración final GREEN. El job verify y controles superiores son estructuralmente idénticos a2bda70f4. YAML parseado; la ejecución Ubuntu/Node22 sigue pendiente.

Composición local256ac95c incluye2bda70f4. GitHub integró externamente88 como f34c76fe con árbol idéntico; no se atribuye ese merge al coordinador. La base real deberá reconciliarse antes de publicar, incluyendo la reparación de particiónCI si se integra. Este añadido no habilita flags ni declara INT04/05 cerrados.
