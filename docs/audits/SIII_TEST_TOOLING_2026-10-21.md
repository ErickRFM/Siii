# Herramientas de pruebas — seguridad y descubrimiento

Base: `main@f75d488288af068fa0f20461598b7ddef934d545`. Rama independiente `fix/vitest-security-and-discovery-20261021`. No modifica componentes, permisos, API, SQL ni datos.

## Causa y cambio

`npm audit --json` fallaba con dos moderadas de @vitest/mocker, propagadas a Vitest4.1.11. [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) y [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp) indican4.1.12 como parche. Se fija esa versión exacta y se regenera el lockfile con npm; no se usa audit fix ni se rebaja el gate. El resolvedor también actualiza transitivamente Vite8.3.4→8.3.5, Rolldown1.2.13→1.2.15 y sus bindings/tipos. No cambian las dependencias de producción.

La prueba `tests/unit/premium-ui-kit.test.tsx`, incorporada por PR73, no coincidía con el include `tests/unit/**/*.test.ts`. Tras descubrir TSX, apareció un segundo defecto: tsconfig conserva JSX para Next y el runner Node no podía parsearlo. Vitestconfig ahora admite ts/tsx y configura el compilador OXC realmente utilizado por Vite8 con runtime JSX automático. No se altera tsconfig de Next ni se cambian componentes/aserciones para satisfacer tests.

## Evidencia

- RED: `npm test -- tests/unit/premium-ui-kit.test.tsx` devolvió `No test files found`, exit1.
- Con solo include corregido, falló import-analysis por JSX preserve. La configuración esbuild no era efectiva porque Vitest configura OXC; se descartó antes de guardar el cambio final y se verificó la API instalada de Vite/OXC.
- GREEN: la prueba dirigida ejecuta cinco casos y aprueba5/5.
- `npm test` aprueba813/813 en53archivos, frente a808/808 en52 antes del descubrimiento.
- `npm run lint` y `npm run typecheck`: exit0.
- `npm audit --json`: exit0, cero vulnerabilidades, frente a dos moderadas antes del parche.
- Una primera suite completa tuvo timeout de5000ms en el arranque del subproceso del test de migraciones, bajo ejecución simultánea de herramientas. La repetición estándar aislada pasó813/813 sin modificar ese test ni sus límites. No se atribuye ese resultado inicial a un fallo de seguridad del migrador.

Reinstalación final: `npm ci` agregó375paquetes en1min, sin vulnerabilidades; después `npm test` pasó813/813 en53archivos y `npm audit --json` volvió a exit0/cero. Revisión independiente sin observaciones Critical/Important/Minor: verificó lockfiles, paquetes dev:true y compatibilidad Node22 del CI. No se cambiaron los tests ni timeouts de migraciones.

CI del SHA publicado e integración/Playwright sobre la composición con PR75 permanecen como gates independientes; esta actualización de tooling no acredita el ciclo universitario, disponibilidad productiva ni resolución de los otros P1 auditados. No se permite merge con checks pendientes/fallidos.
