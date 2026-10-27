# P0.1 F02 — Argon2 en laboratorio Linux aprobado

Medición ejecutada una vez con aprobación humana del 2026-10-14. [Run 38618968477](https://github.com/ErickRFM/Siii/actions/runs/38618968477) terminó success, SHA f7ee7b7c428cdebdff8a8897ad5b6c5dd0b153d8. Se retiró SIII_ARGON2_LAB_APPROVED al terminar; el laboratorio permanece deshabilitado por defecto.

## Resultado observado

Docker Linux/amd64, Node v24.21.0, libUV 1.52.1/pool 4, argon2 0.45.1. cgroup v2 verificó exactamente 1 CPU y 1073741824 bytes de memoria, sin swap adicional. Imagen SHA256 470015c1ab1577c19efce2e80cdad4afd9c682cf8f4dcf3dccae5abfd9113397.

Se conservaron Argon2id v19, memoria 65536 KiB, timeCost 3, parallelism 1 y hashLength 32. Setup verificó contraseña correcta, incorrecta, dummy y reemplazo sin necesidad de rehash. Warmup: dos operaciones por escenario. La medición completa duró 61300,40 ms: 384 muestras (24 por escenario/concurrencia), 399 operaciones de helper incluidas preparación/warmup, 0 errores y ninguna muestra incompleta. Concurrencia máxima 8; saturación realizada dentro de los límites. Pico RSS muestreado y maxRSS del kernel: 361316352 bytes (344,58 MiB).

| Concurrencia | Verificación válida p50 / p95 ms | Inválida p95 ms | Dummy p95 ms | Cambio nativo p95 ms |
|---|---:|---:|---:|---:|
| 1 | 98,64 / 113,98 | 113,90 | 111,12 | 219,99 |
| 2 | 205,47 / 264,28 | 262,61 | 205,86 | 472,77 |
| 4 | 583,18 / 602,18 | 600,10 | 609,54 | 1199,64 |
| 8 | 1100,33 / 1192,45 | 1195,48 | 1201,29 | 2880,48 |

Fuente reproducible: P0_1_ARGON2_LINUX_REPORT.json, reporte agregado original. Incluye commit, digests de helper/lockfile/imagen, Node/NAPI/argon2, CPU, cgroup/throttling, muestras y RSS por caso. Percentiles nearest-rank; no afirmación estadística de igualdad de tiempos con 24 muestras.

## Alcance y decisión

La carga mide los helpers nativos reales, incluida la cola libUV. El cambio de contraseña mide old verify + new hash; su validez se comprueba en preparación. Se mantienen los parámetros actuales: la prueba no mostró errores, timeouts ni saturación de memoria dentro del perfil aprobado. Concurrencia 8 incrementa la cola y la latencia; este resultado sirve para dimensionar y limitar cargas en ese perfil.

No mide login HTTP completo, bloqueo de cuenta, transacciones, revocación de sesiones, red, cold start ni memoria de Next.js. Esos flujos tienen pruebas de integración distintas. El proyecto Vercel declara Node24.x, pero su presupuesto efectivo de CPU/memoria no está disponible. No se certifica capacidad del hosting real ni un SLO de producción, y no se extrapola Windows.

## Límites y privacidad

Máximo CLI 180 s (ejecución 120 s), 512 operaciones de helper/1024 llamadas nativas conservadoras, concurrencia 8, timeout individual 15 s, RSS 768 MiB, sampling 20 ms. Watchdog/timeout externo impiden que continúe una carga abortada; las APIs nativas no ofrecen cancelación.

El contenedor de medida tenía network none, filesystem read-only, capabilities retiradas, no-new-privileges y salida escribible solo para el reporte agregado. No se usaron HTTP, SQL ni credenciales reales; contraseñas sintéticas solo en memoria. El JSON carece de contraseñas, hashes de contraseñas y variables secretas.

## Reproducir requiere una nueva aprobación

El workflow admite push acotado al CLI/workflow en chore/p0-1-release-gates con la variable de aprobación explícita. La variable ya fue retirada. workflow_dispatch requiere que el archivo exista en default branch y exige además approvedRepresentative=true. No hay ejecución por PR ni por horarios.

Help/dry-run son LOCAL_ONLY, sin hashing:

~~~sh
node --import tsx scripts/benchmark-argon2.ts --help
node --import tsx scripts/benchmark-argon2.ts --dry-run --saturation-8
~~~

Una nueva medida debe registrar aprobación y volver a usar el perfil Linux/Node24/1CPU/1GiB. No modificar parámetros para hacer pasar el ensayo.

Referencias: [Node24 resourceUsage](https://nodejs.org/docs/latest-v24.x/api/process.html#processresourceusage), [libUV pool](https://nodejs.org/api/cli.html#uv_threadpool_sizesize), [cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html), [Docker limits](https://docs.docker.com/engine/containers/resource_constraints/).

