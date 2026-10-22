# INT-04A — productor de asignación y retiro docente

Incremento local desde main5cb49f75, rama fix/academic-assignment-outbox-20261022. Sólo conecta POST/PATCH assignments con el outbox académico existente; no crea otro outbox, wrapper, contrato, endpoint o migración.

## Cambio

En src/app/api/v1/institutions/[institutionId]/assignments/route.ts, ambas mutaciones conservan authorizeInstitution/academic.manage, origen, validación, comprobaciones de dominio y domainTransaction. Tras la mutación y teacher.assign/teacher.unassign se llama a enqueueAcademicSection dentro de la misma TX, con row.sectionId devuelto por SQL. Un requestId del request actual se comparte entre auditoría de negocio y academic.snapshot.queued. Middleware continúa generando el identificador; no se confía en el header suministrado por el cliente.

El enqueue existente bloquea academic_sections antes del contador y del snapshot; domainTransaction también serializa por institución y revalida autoridad antes de commit. No se cambian estos helpers. La operación es upsert con todos los docentes activos no revocados: retirar el último produce teachers vacío sin eliminar la sección. Evento/version/auditorías/mutación revierten juntos si falla el enqueue o la autoridad final. No hay red en la transacción.

## TDD y fixture

DB nueva y exclusiva siii_assignment_outbox_20261022_test en127.0.0.1:55439, migraciones existentes0000..0025; HTTP3211. No se usa la DB claim anterior. Se reutilizan vitest.integration.config.ts, http-setup.ts y server.mjs. Sesiones/factores sintéticos legales siguen el patrón de financial-write-authority-http; los handlers de negocio se ejecutan por HTTP real y PG real. No se certifica el flujo de login/MFA ni resistencia a throttle; no hay limpiezas nuevas ni alteración de políticas.

RED funcional antes del arreglo, assignment-red.log: alta201 y audit existente, eventos0 frente a1; retiro200 tras snapshot basal real de PATCH sections, eventos1 frente a2. Se seleccionaron sólo esos dos casos para RED; los25 no seleccionados de la primera versión no se cuentan como ejecución. Los39 casos finales corren sin skips en ambos modos.

Intentos previos conservados y NO contados como RED: nombre inicial de DB sin sufijo_test rechazado por guard; se renombró sólo la DB recién creada sin conexiones, manteniendo guard intacto. Un fixture empleaba códigos minúsculos incompatibles con snapshot y esperaba el requestId enviado, aunque middleware lo sustituye; se corrigieron datos y se compara el header real de respuesta. Primera ON completa37:31pasan/6fallan sólo porque pg devuelve bigint como string; se corrigieron expectativas, no runtime. Logs assignment-red-setup-failed.log, assignment-red-fixture-failed.log y assignment-green-on-dev.log.

## Cobertura nueva

- Alta201/retiro200, requestId generado por servidor compartido, segundo docente conservado y último docente vacío, operación upsert/grupo intacto.
- Ambos verbos deniegan student, admin sin MFA, miembro suspendido, password obligatorio, usuario inactivo, sesión vencida o ausente. Origen, payload, no membresía, docente/sección/asignación extranjeros y duplicados preservan403/422/409 sin eventos/versiones/auditorías nuevas. Estado institucional inactivo y docente inactivo/sección archivada conservan sus rechazos actuales.
- Fallo de auditoría de negocio, auditoría queued y escritura de outbox: rollback completo ON; OFF no escribe evento/versión/auditoría queued y conserva comportamiento anterior. Snapshot con501 matrículas históricas se rechaza entero ON sin truncar ni confirmar el retiro.
- SQL advisory barrier real en auditoría permite revocar grant o esperar caducidad después de la mutación antes del check final:403 y rollback de captura/evento/contador/audit.
- Duplicados concurrentes generan201/409 o200/409 y un evento como máximo. Dos actores y dos altas/retiros diferentes bajo barrera SQL observan dos waits reales y luego versiones1/2; el payload de MAYOR versión coincide con docentes finales SQL, incluyendo vacío tras ambos retiros. No se usa respuesta HTTP inventada ni sleep para fabricar aprobación.

## Harness y CI

Cuando el flag del proceso sintético está ON, http-setup genera SIEMPRE claves nuevas bajo fixture después de isolatedDatabaseUrl, reemplazando cualquier heredada. Conserva/restaura los dos valores previos en teardown/finally y en catch de startup. OFF no modifica claves. Sin imprimir valores ni introducir servidor/config paralelo.

Integración estándar conserva OFF. Único paso CI nuevo, después de Handler and baseline integration tests y antes de Production build, establece SIII_ACADEMIC_OUTBOX_ENABLED=true sólo para npm run test:integration -- tests/integration/academic-assignment-outbox-http.test.ts. El mismo archivo ejecuta todos los casos, con modo identificado ON/OFF. Comparación YAML/deepEqual frente5cb confirma todos los jobs originales idénticos tras quitar ese paso; no cambia timeout, retries, comandos previos, UI, legacy ni gate receptor.

## Evidencia final

| Gate local | Resultado observado | Log ignorado .p0-local |
|---|---|---|
| npm ci / migraciones existentes |exit0 / MIGRATIONS_APPLIED0000..25 en DB propia nueva |assignment-npm-ci.log / assignment-migrate.log |
| RED focal ON, producto intacto |2fallos esperados por eventos faltantes; selección explícita |assignment-red.log |
| ON desarrollo completo |39/39, exit0, sin skips |assignment-green-on-dev-final.log |
| npm run lint / npm run typecheck |exit0 / exit0 |assignment-lint.log / assignment-types.log |
| npm test estándar, dos ejecuciones previas |825/826 ambas: timeout5000ms del primer child migration-safety; resultados fallidos conservados |assignment-unit.log / assignment-unit-final.log |
| migration-safety aislado |4/5: mismo timeout; sin cambio de plazos |assignment-unit-isolated.log |
| Diagnóstico child exacto fuera de Vitest |910ms, status1 esperado, guard correcto, sin ECONNREFUSED; no sustituye npm test |assignment-migration-child-diagnostic.log |
| npm test estándar, control B por coordinación sobre esta rama |56archivos/826 de826, exit0,8.17s; sin cambios de fuente/opciones/tiempos |assignment-root-controlled-unit.log |
| npm run build |exit0, Next15.5.28/31páginas |assignment-build.log |
| ON bundle producción |39/39, exit0, sin skips,6.30s observados |assignment-green-on-production.log |
| OFF mismo bundle producción |39/39, exit0, sin skips,6.34s observados |assignment-green-off-production.log |
| Ciclo real claves en harness original |exit0: ON genera/restaura, OFF no modifica, fallo de startup intencional restaura |assignment-key-lifecycle.log |
| Contrato YAML comparado con5cb |exit0: sólo nuevo paso ON, todos los jobs previos idénticos |assignment-ci-contract.log |

Son39 casos distintos repetidos por modo:78 ejecuciones HTTP de producción y39 de desarrollo; no se suman como117 escenarios únicos. Duraciones no son benchmark. Coordinación ejecutó control A en árbol limpio equivalente a main5cb:826/826 en13.45s, además5/5 focal. Control B en esta rama:826/826 en8.17s con npm test estándar, Node24.18.0 C:\Program Files\nodejs\node.exe, Vitest4.1.12 y Next15.5.28. En el mismo comando comprobó las cinco variables ENABLED/HTTP_TEST_PRODUCTION/NODE_ENV/TEST_PORT/NODE_OPTIONS unset y corpus unitario/config/migrador/lock sin diff. No hubo cambios de fuente entre fallos y B; la intermitencia NO está explicada y no se atribuye a CPU/caché ni mejora. El gate local actual queda aprobado por esta corrida fresca; coordinación autorizó commit local. Reconciliación con mainfc65, publicación y CI exacta siguen pendientes.

Los archivos .p0-local conservan logs y no están versionados. Se conservan dos unitarias completas825/826 y un aislado4/5 por timeout5000ms de migration-safety, sin cambio de test/migrador; no se atribuye causalidad ni se relajan límites. La inspección adicional de entorno no encontró .env ni diferencia observable de flags; no reconstruye el ambiente histórico de procesos ya terminados.

Revisión independiente de fuente por review_mfa_metadata_wait: sin Critical/Important/Minor; verificó scope/TX/autoridad/keys/CI/barreras y RED guardado, sin ejecutar suites ni DB. Sus resultados no sustituyen gates del implementador ni CI remota.

## Límites

INT-04 permanece PARCIAL. El snapshot existente limita500 docentes,500 matrículas incluidas históricas,3000 ocurrencias y1MiB. ON puede abortar también un retiro con500 si no puede congelar un snapshot completo: no se omite evento ni se confirma una mutación sin él. OFF mantiene el comportamiento anterior. No se habilita ningún flag fuera del proceso sintético.

Este productor no cubre cambios de perfil/estado docente, teacher-links ni otras revocaciones. Los lectores académicos legacy que escogen un docente mediante limit1 no se cambian. Enqueue no acredita transporte operativo; accepted sólo representa recepción autenticada, no APPLIED ni consumo móvil. El receptor fijado y sus21 casos previos de #101 no se cuentan como ejecutados aquí. Sin F2, Compañero, schema/SQL/migraciones fuente, otros productores, datos reales, producción, push/PR/merge. Reconciliación e integración del SHA final corresponden a coordinación y CI verde.
