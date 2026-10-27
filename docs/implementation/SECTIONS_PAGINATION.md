# Paginación de secciones — Fase 05 acotada

El GET institucional de `sections` usa el contrato de cursores existente: `limit` entre 1 y 100 (50 por defecto), `page.nextCursor`, orden descendente por `created_at` con precisión de microsegundos y UUID como desempate. El cursor está ligado a la institución y al recurso `sections`. Parámetros inválidos, duplicados, desconocidos o cursores de otro ámbito se rechazan con `INVALID_PAGINATION` (422).

La autorización vigente se comprueba antes de interpretar el cursor. El filtro de tenant se conserva en cada página. El campo interno `cursorAt` no se publica. `POST` y `PATCH` no cambian; tampoco schema, migraciones, permisos ni reglas de evaluación.

`AcademicOperations` y `SchedulingStudio` ya consumían `sections` mediante `readCollection`, por lo que ahora siguen todas las páginas. Se retira únicamente el aviso obsoleto de los primeros 200 registros. La lectura de `TeacherGradebook` usa la ruta distinta `grading/sections` y queda fuera de este cambio.

El health check de `tests/support/http-setup.ts` respeta `SIII_TEST_PORT`, igual que `server.mjs`, conservando 3107 como valor por defecto. Esto permite aislar las pruebas nuevas en 3108.

## Evidencia

- Primero se escribieron `tests/integration/sections-pagination-http.test.ts`, `tests/ui/sections-pagination.spec.ts` y su fixture sintético independiente.
- RED real por HTTP: 7 fallos y 1 caso aprobado. El handler anterior devolvía 200 filas sin `page.nextCursor` e ignoraba límites y cursores inválidos. La denegación sin sesión ya pasaba.
- GREEN real por HTTP: 8/8 casos aprobados. Verifica 205 secciones sin duplicados/omisiones, empates de microsegundos, orden exacto contra SQL, separación de tenant/recurso, paginación inválida y acceso sin sesión. El administrador inicia sesión mediante MFA real de pruebas.
- `npm run typecheck`, `npm run lint` y `git diff --check`: salida 0.
- Pruebas unitarias relacionadas: `npm test -- --run tests/unit/registry.test.ts`, 5/5 aprobadas.
- `POST_AND_PATCH_UNCHANGED=True`: comparación directa del cuerpo de ambas funciones con el commit base.
- La ejecución usa únicamente PostgreSQL local `127.0.0.1:55417`, base separada `university_sis_sections_test`, migraciones canónicas y servidor 3108. Los configs temporales de Vitest/Playwright quedan ignorados en `.p0-local/`.
- Regresión real de Chromium aprobada (1/1): 205 filas, 206 opciones en ambos selectores de operaciones y en horarios, selección efectiva de un registro antiguo, ausencia del aviso obsoleto y persistencia tras recargar. Su setup ejecutó `next build` de producción correctamente.

## Estado de la entrega anterior

PR35 quedó integrado en main mediante `06166d90936fc939334a71ba600ec118c58b2586` y se revisó independientemente en el árbol exacto `4d87d61f83fa95b7869a7e0981a88f52a525804b` contra `c70adc40`, sin bloqueos restantes. Los archivos del ajuste de ámbito coinciden con `5e99941b`; se conserva el borrador después de un error temporal y recuperación del mismo ámbito.

La rama integradora reportó build/typecheck/lint correctos, 765 pruebas unitarias, 300 de integración, 54 de Chromium y ambas ejecuciones Verify SIS en SUCCESS (`39073966596`, `39073970270`) para ese head. Esta evidencia se registra aquí sin reabrir PR35 para cambiar solo metadatos. La paginación de secciones es un incremento separado.
