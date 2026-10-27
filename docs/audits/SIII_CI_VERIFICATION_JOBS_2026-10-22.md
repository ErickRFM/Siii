# CI — presupuestos independientes para verificación y UI (22 octubre 2026)

## Evidencia y causa observada

Base: `main@f34c76fe10f04d9d4bada2a5419c6c82eb5acdc4`, squash de PR88. Se verificó que su árbol `eaf3b4f55a1cada622ce378f3948f47a3c1507af` es idéntico a `2bda70f4`, que los cambios comienzan en una rama nueva y que el worktree reutilizado estaba limpio.

La [primera ejecución posterior de main, 39838544494 / job120033144535](https://github.com/ErickRFM/Siii/actions/runs/39838544494/job/120033144535), concluyó CANCELLED. Coordinación confirmó la anotación oficial de límite de25m0s. Los pasos ejecutados reportaron éxito:826 unitarias,485 integraciones,88 UI, build y audit0. No se encontró un test fallido que explique esa cancelación. El reintento del mismo SHA, iniciado por coordinación, es evidencia separada y no sustituye ni elimina el primer resultado.

Los logs originales se conservan ignorados en primary: `.p0-local/main-f34-cancelled.log` y `pr88-final-success.log`. La extracción local mide desde el inicio del comando Browser runtime hasta el inicio del siguiente paso UI:

| Ejecución original | Inicio runtime UTC | Inicio UI UTC | Intervalo observado |
|---|---|---|---|
| main f34, intento cancelado |19:23:29.2006203|19:35:20.3332503|711.133s,11m51.133s |
| PR88, ejecución aprobada |18:56:39.7688765|18:57:02.5764115|22.808s |
| Nuevo workflow separado | pendiente | pendiente | **Sin medición posterior; requiere CI real** |

El log lento muestra descargas de paquetes/fuentes desde el mirror Azure de Ubuntu durante la instalación de dependencias del navegador. Este intervalo externo consumió presupuesto del mismo job que ya había ejecutado unitarias e integración. Los dos logs identifican la imagen efectiva `ubuntu-24.04`; no se atribuye el problema a Ubuntu26. El aviso de una migración futura de ubuntu-latest justifica fijar la imagen ya observada, no una explicación retrospectiva del timeout.

## Cambio acotado y conservación

El workflow conserva triggers, permisos de sólo lectura, concurrencia y cancel-in-progress. Se divide en dos jobs independientes, sin `needs`, cada uno con `timeout-minutes:25`, Ubuntu24.04, Node22 y su propio servicio PostgreSQL17, entorno, instalación y base desechable. Compartir nombres/puerto5432 entre jobs no comparte datos: cada job usa una máquina alojada distinta.

- `verify`: instalación reproducible, rebuild de argon2/esbuild, integridad del lockfile, lint, tipos, **todas** las unitarias, roles sintéticos, migraciones, **toda** la integración, build y audit.
- `ui`: la misma instalación/rebuild/integridad y su propia preparación de roles/migraciones; conserva exactamente `npx playwright install --with-deps chromium` y `npm run test:ui` sin filtros. El harness original `ui-setup.ts` genera su propio bundle de producción antes de abrir el servidor; no consume un build de otro job.
- Sólo `ui` publica los dos artefactos originales: diagnósticos en `failure()` con missing=ignore, y matriz/capturas en `always()` con **if-no-files-found:error**. Se mantienen ambas rutas glob, nombres, hidden-files=true, retención de3 días y SHA de upload-artifact. No se copia la publicación de diagnósticos a verify.

La [matriz escrita antes de editar](../superpowers/plans/2026-10-22-ci-verification-jobs.md) enumera cada comando/acción y su ubicación. Los tres SHAs originales de checkout, setup-node y upload-artifact se conservan literalmente. No se amplía el límite de ningún job ni se añaden retries, filtros, exclusiones o comandos para ignorar errores. Duplicar setup y DB proporciona aislamiento de ejecución; no añade infraestructura de negocio. Ambos jobs deben concluir correctamente para considerar aprobada la verificación completa del nuevo SHA.

### Consumidor reservado SEC-04

La rama financiera `acc89` incorpora `npm run test:financial-legacy`, todavía ausente de este main. No se agrega aquí ese comando ni su package script. Al reconciliar SEC-04, su paso corresponde al job **ui inmediatamente después de `npm run test:ui` y antes de los uploads**, con `SIII_HTTP_TEST_PRODUCTION: '1'`. Reutiliza el bundle de producción generado por UI y requiere el cierre exacto de su servidor. Colocarlo en verify o ejecutarlo en paralelo con UI perdería esa dependencia. Un comentario en el workflow señala la reserva; el cambio actual no modifica tests, auth, backend ni SQL.

## Validación local estructural

Se ejecutó con Node24.18.0 local; CI mantiene Node22. La herramienta `js-yaml` ya estaba disponible en node_modules por el árbol existente, sin cambios a dependencias. El checker ignorado carga el YAML de la base exacta mediante git show y compara los metadatos del workflow y la forma completa de los dos jobs requeridos: exige la asignación prevista a verify/ui, la duplicación explícita del setup y el pin de ambos runners a24.04. Compara objetos completos de pasos, servicios, env y artefactos, no coincidencias sueltas de texto. No prohíbe jobs adicionales ni les impone restricciones implícitas: una composición positiva con un tercer job independiente pasa el contrato, para conservar la futura integración del probe receptor con su validador propio.

| Comando local | Evidencia |
|---|---|
| `node .p0-local/verify-ci-job-split.cjs` antes de editar | RED: esperaba jobs verify+ui; el original sólo tenía verify |
| Mismo comando después del cambio | GREEN: YAML válido, contrato completo conservado |
| Composición positiva en memoria | Un tercer job independiente se admite sin alterar el contrato verify/ui |
| Mutaciones negativas en memoria |23/23 rechazadas: omisiones de gates/preparación, UI parcial, retirada de with-deps, drift de runner/Node/PG/env/acción/permisos/triggers, dependencia serial, más timeout y relajación/traslado de artefactos |
| `node .p0-local/check-ci-step-syntax.cjs` | exit0;18 comandos originales pasan `bash -n`, sin ejecutarlos |
| `git diff --check` | exit0 |

Los logs, el checker, su resumen JSON y el extractor de tiempos quedan en `.p0-local/ci-split-*`, `verify-ci-job-split.cjs`, `check-ci-step-syntax.cjs` y `extract-ci-split-timings.cjs`, ignorados. No se ejecutaron nuevamente npm ci, unitarias, integración, UI o build locales: no cambia su código ni sus comandos; esta verificación comprueba estructura/preservación, sin abrir DB/puertos. Tampoco reproduce la disponibilidad o velocidad del mirror de paquetes Linux. El nuevo reparto y su duración posterior siguen pendientes de ejecución real de ambos jobs en CI.

Se conserva íntegro el histórico de la auditoría principal mediante anexo. No hay cambios de producto, permisos, credenciales, schema, migraciones, F2, guards de Docker/container API, repositorio Compañero ni flags. Commit y revisión locales se entregan a coordinación; no se ejecuta push, PR, merge en GitHub ni despacho de CI desde esta tarea. No se acredita despliegue, disponibilidad productiva ni E2E móvil.

Revisión independiente final:0 Critical,0 Important,0 Minor. El revisor reejecutó contrato YAML/control positivo/23 negativos, los18 bash-n y diff-check; inspeccionó la autonomía del build/teardown UI y la reserva financiera. La aprobación es local/estructural. Antes de integrar, coordinación debe comprobar que la protección de la rama incluya el nuevo check `ui`; esta tarea no cambia la configuración de GitHub ni presume su estado.
