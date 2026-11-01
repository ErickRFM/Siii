# Siii — sincronización, integración y limpieza

Fecha: 31 de octubre de 2026, America/Mexico_City. Este informe registra comprobaciones actuales; no certifica todos los procesos institucionales de producción.

## Base y sincronización

- Repositorio: `ErickRFM/Siii`; rama predeterminada remota y `origin/HEAD`: `main`.
- Base remota consultada: `f19d8a0eacf37960aba95e9d09000ce6d4992f7f`, PR [#157](https://github.com/ErickRFM/Siii/pull/157) fusionado. La rama R1–R2 local tiene el mismo árbol que esa base, aunque sus SHA difieren por squash.
- CI de esa base: runs [41259850420](https://github.com/ErickRFM/Siii/actions/runs/41259850420), [41258953074](https://github.com/ErickRFM/Siii/actions/runs/41258953074) y [41258953164](https://github.com/ErickRFM/Siii/actions/runs/41258953164) completados con éxito.
- Trabajo de esta auditoría: `codex/siii-integration-audit-20261031`, creado desde el remoto verificado. Se conserva la rama anterior y el informe sin versionar `SIII_MASTER_PLAN_FULL_CERTIFICATION_2026-10-31.md`; este último no se incluye ni se toma como prueba de certificación.

| Rama o PR encontrado | Decisión y evidencia |
|---|---|
| `feat/siii-r1-r2-institutional-architecture` / #157 | Incorporado por squash; `git diff origin/main origin/feat/siii-r1-r2-institutional-architecture` vacío al iniciar. No repetir merge. |
| `chore/siii-css-dead-rule-audit-20261031` | Conservar. Cadena anterior a #154/#155, sin PR abierto al iniciar; sus commits no son prueba de cambios pendientes después del squash. No reproducir eliminaciones sobre la cascada actual. |
| `fix/siii-personal-density-and-home-fetch-20261031` | Conservar. Trabajo reconciliado en la línea #153; no reintroducir su base antigua. |
| `fix/companion-hmac-safe-rollover-20261031` / [#158](https://github.com/ErickRFM/Siii/pull/158) | Trabajo independiente y activo. Primer head observado: fallo en `signs the outgoing event with the successor after promotion` (`retryable` frente a `accepted`). El head cambió durante la auditoría; sus checks y configuración externa requieren evaluación propia. No se modifican credenciales ni se fusiona desde este incremento. |

Se ejecutó `git fetch --all --prune`; solo se retiraron referencias locales a ramas ya eliminadas en el remoto. No se eliminaron ramas remotas, locales ni worktrees.

## Hallazgos y correcciones

| Prioridad | Hallazgo confirmado | Resultado |
|---|---|---|
| P1 | `SiiDataTable` repetía la búsqueda, ordenación, paginación y representación móvil de `PersonalTable`. La nueva implementación no tenía consumidores de producto. | Una implementación en `src/components/ui/sii-data-table.tsx`, consumida por los portales mediante los exports compatibles de `personal-table.tsx` y por el kit institucional. Sin dependencia del shell ni ciclo de imports. |
| P1 | `pageSize=0`, `NaN` o `Infinity` mostraba un estado vacío aunque existían registros. | Tamaño finito y entero normalizado antes de calcular páginas y segmentos. Pruebas reproducidas en rojo y luego verdes; 20 es el valor de respaldo. |
| P2 | En Windows, el auditor CSS comparaba rutas `/` con rutas `\`, procesaba dos veces 17 hojas y reportaba 36 archivos. | `path.join` unifica el inventario: 19 hojas únicas, 257842 bytes. La prueba de regresión falló con 36 frente a 19 antes de la corrección. |
| P2 | Documentación histórica presentaba fases pendientes o certificaciones globales que no describen el árbol actual. | Se enlaza este corte de evidencia desde los registros de integración y UX; se preserva el historial. |
| P1 | El helper de navegación volvía a buscar «Abrir navegación» durante el cierre del drawer; el cambio de nombre accesible y `aria-hidden` podían hacer que omitiera las esperas antes de axe. | Se captura el modo móvil antes de abrir. Se mantienen las comprobaciones de desaparición del diálogo y retiro de `aria-hidden`, sin excluir reglas de accesibilidad. |
| P2 | Dos referencias docentes compartidas no correspondían al render actual de Windows. | Control independiente de `main@f19d8a0e` reproduce ambos fallos. Se añaden únicamente variantes `-win32`, revisadas visualmente; compartidas/Linux y comparador sin cambios. |

La tabla mantiene filtros por acentos, orden numérico estable, valores ausentes al final, anuncios de paginación, encabezados semánticos, controles de teclado y registros móviles. Se reutiliza `SiiEmptyView` para evitar otra presentación paralela del estado vacío. No hay cambios de schema, migraciones, API, permisos, F2 ni contratos con Compañero.

## Auditoría de superficies y límites

- Inventario de fuente: 80 módulos `route.ts` y 26 páginas `page.tsx`. Estos números no equivalen a 80 operaciones certificadas ni a disponibilidad de cada módulo.
- Los portales usan su contexto/capacidades existente y los handlers continúan decidiendo autorización en servidor. No se introducen permisos en cliente ni datos de muestra en producto.
- Búsqueda estática de `NEXT_PUBLIC` con claves/base de datos y de `createClient(` en `src`: sin coincidencias. Esto no sustituye una auditoría de secretos del historial o del entorno remoto.
- Otros componentes del kit R1–R2 siguen siendo una API de presentación disponible; no hay evidencia de una migración completa de todas las pantallas a `SiiPageLayout`, `SiiPanel` o `SiiFilterBar`. La integración de #157 no acredita por sí sola el cierre R3–R6/UX09.
- CSS: 19 hojas; presupuesto global de `audit-css` de 254140 bytes normalizados a LF, 432 `!important` y 437 selectores repetidos. El inventario de 257842 bytes mide los archivos físicos con CRLF en Windows; no representa un aumento de CSS. Los selectores repetidos incluyen contextos distintos; no son automáticamente reglas redundantes.
- Gate de duplicados exactos: cero dentro de archivo y cero entre hojas globales. Gate de propietarios: 17 selectores y 34 propiedades, sin errores. Hay 17 candidatos a clases sin uso; se conservan porque la búsqueda textual no acredita ausencia de uso dinámico.

## Validación local

Entorno: Windows, PostgreSQL 17, bases nuevas `siii_audit_test` y `siii_audit_ui_test` en loopback. Migraciones aplicadas únicamente a esas bases desechables. Las pruebas usan fixtures sintéticos y un rol de aplicación restringido.

| Comprobación | Evidencia de este incremento |
|---|---|
| `npm run typecheck` | Aprobado, sin errores. |
| `npm run lint` | Aprobado, sin errores. |
| `npm test -- --reporter=dot` | 86 archivos, 1051 pruebas aprobadas. |
| Regresiones de tabla | 20 pruebas dirigidas aprobadas tras reproducir el fallo. |
| Regresión CSS | Incluida en la batería completa; reproducido antes el conteo incorrecto. |
| `node scripts/audit-css.mjs` | Aprobado, sin aumentar presupuesto. |
| `node scripts/css-cleanup.mjs --check` | Aprobado; inventario corregido, cero duplicados exactos. |
| `node scripts/css-owner-gate.mjs` | Aprobado. |
| `git diff --check` | Aprobado. |
| `npm run test:integration` en desarrollo | Ejecución interrumpida para diagnóstico tras dos timeouts de 30 s en `applicant-registration-http.test.ts`: autorización API/SSR y `api-session`. La traza registra un SSR de admisiones de 67547 ms. No se declara aprobada esta ejecución ni se aumenta el timeout. |
| Reproducción de admisiones en producción | Los 18 casos de ese archivo aprobados, sin cambiar límites ni aserciones, usando `SIII_HTTP_TEST_PRODUCTION=1` y el mismo harness. |
| Build de producción | Aprobado mediante el setup estándar de UI; compilación, tipos y 32 páginas generadas. JS compartido: 103 kB. |
| QA de navegador, primera ejecución | 81/83 aprobadas; dos fallos de referencias docentes Windows reproducidos después en main intacto. Los resultados iniciales se conservan, no se presentan como una suite verde. |
| QA dirigida tras correcciones | Nueve ejecuciones aprobadas: accesibilidad móvil y comparaciones docentes clara/oscura, cada una repetida tres veces. Se reutilizó el build de producción con un config local que cambia solo el setup para evitar recompilar. Tres unitarias de protección de gates visuales y lint también aprobados. |
| Revisión independiente | Sin hallazgos accionables en los seis archivos de implementación/pruebas revisados. Revisión estática; no sustituye CI ni QA visual. |

CI del código `4459d2d44869644b9bc62092efd01d9868198a38`, PR [#159](https://github.com/ErickRFM/Siii/pull/159): ambos jobs `verify` aprobados en los runs [41262955897](https://github.com/ErickRFM/Siii/actions/runs/41262955897) y [41262938194](https://github.com/ErickRFM/Siii/actions/runs/41262938194). El primero registra 1051 unitarias; 697 integraciones aprobadas y 35 omitidas en 49 archivos; luego 100 contratos aprobados y uno omitido en cuatro archivos con outbox habilitado. Las omisiones siguen siendo omisiones, no evidencia de ejecución. Ambos jobs `Companion live contract` aprobados; sus receptores/servicios son de laboratorio y no acreditan sincronización de producción.

El job UI del run `41262955897` registró 214/215 aprobadas: falló `personal home honors increased contrast in both themes` por `aria-hidden-focus` tras el cierre móvil. Ese fallo motivó la corrección del helper anterior. El estado del head final se consulta en el PR; los resultados de `4459d2d4` no se atribuyen a un SHA posterior.

### Control de referencias Windows

Se exportó `origin/main@f19d8a0e` mediante `git archive` a un directorio ignorado, sin modificar el checkout de trabajo. Se ejecutaron las dos pruebas docentes con las mismas dependencias, Chromium 156.0.8078.4, reloj y fixtures: ambas reprodujeron la altura 2413 px frente a 2426 px esperados. Las capturas de control y las de esta rama tienen dimensiones idénticas y una diferencia sin máscaras de 0,0471 % (oscuro) y 0,0606 % (claro), incluidos identificadores sintéticos variables.

Se inspeccionaron las imágenes completas antes de añadir `teacher-dark-390-win32.png` y `teacher-light-390-win32.png`, copiadas del control main. Muestran los paneles inferiores completos; la referencia compartida oscura dejaba grandes áreas fuera del primer viewport sin pintar. El selector por plataforma ya existía. No se cambió el comparador, su exigencia de dimensiones, su 5 %, las referencias compartidas/Linux ni la imagen canónica de diseño. La revisión independiente validó la procedencia y el contenido. Esto no acredita dispositivos físicos.

La revisión independiente comprobó el SHA del ZIP, la igualdad byte a byte de sus 812 archivos con la exportación y la coincidencia SHA-256 de ambos PNG nuevos con las capturas de control. La suite dirigida posterior pasó 9/9. No se presenta ese subconjunto como una repetición completa de las 83 o 215 pruebas.

El primer intento unitario dentro del sandbox no ejecutó pruebas: el sistema impidió renombrar la caché temporal de Vitest (`EPERM`). La ejecución autorizada fuera de esa restricción produjo las 1051 aprobadas anteriores; no se alteró la configuración de pruebas para ocultarlo.

## Producción y pendientes

Inspección de solo lectura con Vercel: deployment `dpl_DpZqCD88CUZmSY2gZj4JkwaYbfZi`, target `production`, estado `READY`, alias `siii-three.vercel.app`, fuente `main@f19d8a0e`. A las 19:51 del 31 de octubre, hora de México, `/api/health` y `/api/ready` devolvieron 200; readiness informó `database=connected` y `Cache-Control: no-store`. Ambas respuestas incluyeron CSP, `X-Frame-Options: DENY` y `X-Content-Type-Options: nosniff`.

La salud pública y la coincidencia de SHA acreditan publicación de esa base, no la ejecución completa de admisiones, Caja, expedientes, actas o sincronización de identidades reales. No se ejecutó SQL ni se cambiaron variables o claves productivas.

- **P1:** finalizar por separado #158 y validar su rotación, receptor y despliegue. La comprobación Vercel de su head observado reportó cuota de builds; no se contrata un plan ni se fuerza despliegue.
- **P2:** nueve avisos moderados en herramientas de desarrollo, relacionados con la cadena ESLint/TypeScript/minimatch. `npm audit --omit=dev --audit-level=moderate`: cero vulnerabilidades. No se aplicó `npm audit fix --force`, que propone cambios mayores/regresivos.
- **P2:** continuar la adopción de componentes institucionales por pantallas, con QA por flujo; evitar otra capa de componentes sin consumidores.
- **Aceptación institucional:** lector de pantalla humano, dispositivos físicos, reglas oficiales, respaldo/restauración cloud y configuración de servicios externos requieren su propia evidencia vigente. Las notas antiguas de `docs/BLOCKERS.md` no acreditan que un bloqueo de base siga presente ni que se haya resuelto.

Entrega: PR [#159](https://github.com/ErickRFM/Siii/pull/159). La comprobación Vercel de este PR también reporta `Deployment rate limited — retry in 24 hours`. Se conserva sin merge mientras no estén aprobados los checks del head final. No se declara cierre productivo global ni se ocultan los fallos iniciales.
