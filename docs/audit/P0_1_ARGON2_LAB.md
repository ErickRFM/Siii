# P0.1 F02 — Laboratorio Argon2 nativo preparado

Estado: **preparado; medición Linux pendiente de aprobación y ejecución**. No se ejecutó el benchmark en Windows ni se lanzó un workflow. La validación del CLI fue únicamente help/dry-run, funciones puras, YAML, typecheck y lint; esos comandos no produjeron contraseñas, hashes ni latencias. Separadamente, la suite unitaria vigente pasó con 9 archivos y 64 tests a las 12:38 (3.19 s); no es evidencia de rendimiento Linux.

## Alcance y parámetros conservados

scripts/benchmark-argon2.ts utiliza los helpers reales src/shared/auth/password.ts. Rechaza cambios en Argon2id 65536 KiB / timeCost 3 / parallelism 1 / hashLength 32. Las contraseñas son aleatorias, sintéticas y se mantienen solo en memoria; no existen flags para introducir una contraseña o un hash y ningún valor criptográfico se imprime o se escribe al artefacto.

| Escenario | Componente medido y resultado comprobado |
| --- | --- |
| verify_valid | verifyPassword(hash sintético válido, contraseña correcta), resultado true. |
| verify_invalid | verifyPassword(mismo hash, contraseña sintética distinta), resultado false. |
| verify_dummy | verifyPassword(null, contraseña sintética), ruta dummy real y resultado false. |
| password_change_native | Verificación de contraseña actual y hash de reemplazo con parámetros vigentes. El setup verifica que el reemplazo funciona, rechaza la contraseña anterior y no necesita rehash. |

El componente de cambio mide old verify + new hash; la comprobación adicional del reemplazo queda fuera de esa latencia, en setup. No modifica sesiones, cookies, usuarios ni bases de datos.

Esto mide el componente criptográfico nativo con su cola libUV y overhead del helper. No mide login HTTP completo, cuenta bloqueada, transacciones, session revocation, cold start de hosting ni red. Esos comportamientos corresponden a la integración existente; este laboratorio no sustituye sus pruebas.

## Laboratorio concreto propuesto

Workflow preparado: .github/workflows/argon2-lab.yml. Admite push únicamente a chore/p0-1-release-gates y únicamente si cambian scripts/benchmark-argon2.ts o el propio workflow; permite medir antes del merge. El job exige vars.SIII_ARGON2_LAB_APPROVED == '1'; sin esa variable omite el job y no genera hashes. Conserva workflow_dispatch, que además requiere approvedRepresentative=true. No contiene pull_request ni horarios.

GitHub requiere el archivo workflow_dispatch en la rama predeterminada para admitir el evento manual. Por eso el push acotado permite ejecutar desde la rama P0.1 sin adelantar su merge. [Documentación primaria de GitHub](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

El agente principal, solo después de aprobación humana, establecería la variable temporal, publicaría el artefacto preparado mediante un push autorizado y retiraría la variable al terminar una ejecución. En esta subtarea no se modificaron variables del repositorio ni se hizo push/dispatch. Un job omitido carece de mediciones y no cierra F02.

Perfil propuesto para aprobación humana: GitHub runner ubuntu-24.04, Docker Linux/amd64, Node 24, 1 vCPU, 1 GiB de memoria sin swap adicional, UV_THREADPOOL_SIZE=4. La imagen node:24-bookworm-slim se resuelve a una identidad SHA256 y esa identidad se reutiliza para instalación y medición. Las dependencias se instalan desde package-lock.json en Linux. El contenedor de medición tiene network none, root filesystem read-only y únicamente /results writable para el JSON agregado.

El proyecto Vercel observado por el agente principal declara nodeVersion=24.x; su resourceConfig no está disponible. Aprobar este perfil permitiría evidencia de laboratorio representativo declarado, sin afirmar equivalencia de CPU/memoria ni comportamiento del hosting de producción. La validación del destino real y cualquier SLO HTTP siguen requiriendo su evidencia propia.

No se publicaron estos archivos ni se autorizó/ejecutó el job en esta subtarea. La aprobación del laboratorio, la variable temporal y el push autorizado deben quedar registrados antes de la ejecución; el evento manual requiere además que el workflow esté disponible en la rama predeterminada.

## Carga, límites y métricas

Setup funcional y warmup de dos operaciones por escenario; 24 operaciones por escenario/concurrencia. Se ejecutan 1, 2 y 4. La saturación 8 es opcional y solo se intenta si queda presupuesto conservador de operaciones, CPU/tiempo y RSS; si no, saturation8.skipReason documenta la omisión.

| Límite | Valor |
| --- | --- |
| Runtime configurado / máximo permitido | 120 s / 180 s, watchdog interno. |
| Operaciones de helper / llamadas nativas conservadoras | 512 / 1024; verify reserva dos para su fallback excepcional. |
| Concurrencia máxima | 8 operaciones; UV pool 4 y Argon2 parallelism 1. |
| Timeout de operación | 15 s; se detiene la carga sin reemplazar trabajo nativo pendiente. |
| RSS máximo | 768 MiB; aborta al superar el cap. |
| Sampling RSS | 20 ms, más maxRSS del kernel al finalizar. |
| Contenedor / job | Timeout externo 200 s con kill-after 5 s / job 12 minutos. |
| Recursos obligatorios | cgroup v2 con cpu.max equivalente a 1 CPU y memory.max de 1073741824 bytes. |

Las APIs nativas no ofrecen cancelación: el timeout deja de encolar y termina el proceso; el watchdog/timeout de contenedor acotan el trabajo pendiente. Nunca reduce el coste criptográfico para completar la carga.

El JSON contiene por caso/concurrencia: requested/completed/errors, duración, p50/p95/max por nearest-rank, CPU user/system, RSS máximo muestreado y máximo in-flight. Incluye peak RSS global y maxRSS del kernel, cgroup cpu.max/memory.max/memory.current/memory.peak/cpu.stat antes/después, Node/libUV/NAPI/argon2 version, arquitectura, kernel, UV pool, commit, identidad de imagen y digests de fuente/lockfile. memory.peak es acumulado del cgroup y se conserva el valor inicial; no se presenta como RSS exclusivo de Argon2.

Un abort deja un reporte parcial cuando es posible y falla el job. Errors, muestras incompletas, report ausente o status distinto de complete impiden considerar válida la medición. El artefacto contiene únicamente .argon2-lab/argon2-lab-report.json, con retención de siete días; no se adjuntan fuentes, env, logs ni hashes de contraseñas.

## Comandos disponibles

Dry-run local, sin medición ni generación de credenciales:

~~~powershell
node --import tsx scripts/benchmark-argon2.ts --help
node --import tsx scripts/benchmark-argon2.ts --dry-run --saturation-8
npm run typecheck -- --incremental false
node node_modules/eslint/bin/eslint.js scripts/benchmark-argon2.ts
~~~

En el contenedor Linux aprobado, con SIII_ARGON2_LAB_APPROVED=1 y UV_THREADPOOL_SIZE=4, el workflow ejecutaría:

~~~sh
node --import tsx scripts/benchmark-argon2.ts \
  --run --approved-representative --saturation-8 \
  --operations 24 --warmup 2 --runtime-seconds 120 \
  --output /results/argon2-lab-report.json
~~~

Los guards de plataforma, Node, aprobación y cgroup se ejecutan antes de importar los helpers nativos o generar contraseñas. Los mensajes de error solo incluyen códigos estables y no serializan excepciones del driver/addon.

## Evidencia actual y referencias

Validación LOCAL_ONLY: comprobaciones puras RED→GREEN para percentiles, límites/flags inválidos y rechazo Windows/Node22/no aprobación; help/dry-run emitieron measurementsPerformed=false. El YAML fue parseado y se comprobaron su rama/paths acotados y los gates de variable/input. Typecheck y lint del CLI pasaron. No hay valores de rendimiento Linux que reportar; F02 permanece pendiente de ejecución aprobada.

Referencias primarias: [Node 24 process/resourceUsage](https://nodejs.org/docs/latest-v24.x/api/process.html#processresourceusage), [Node/libUV threadpool](https://nodejs.org/api/cli.html#uv_threadpool_sizesize), [cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html), [límites Docker](https://docs.docker.com/engine/containers/resource_constraints/), y el código local node_modules/argon2 (versión 0.45.1 observada durante preparación; el reporte recoge la instalada al ejecutar).


## Laboratorio aprobado
El usuario aprobó una ejecución del laboratorio Linux/Node24/1 vCPU/1 GiB el 2026-10-14. Se habilita temporalmente SIII_ARGON2_LAB_APPROVED para un único push del workflow/CLI y se retirará al finalizar el job. Esta aprobación cubre la medida nativa sintética; no acredita límites reales del hosting ni latencia HTTP completa.

La CI de P0.1 2ee29bff pasó: runs38614239243 y38614243402; Vercel preview también pasó. La revisión independiente final de fuente cerró los hallazgos de grants, roles, limpieza, URL y fixtures. P0 y las puertas cloud/lector humano/capacidad de hosting siguen pendientes.

