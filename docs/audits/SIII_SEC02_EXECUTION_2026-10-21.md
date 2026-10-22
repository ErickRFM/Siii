# SEC-02 — evidencia de ejecución

## Cambio y base

Rama `fix/sensitive-institutional-lists-20261021`, [PR75](https://github.com/ErickRFM/Siii/pull/75). Base inicial e494f651; reconciliada por merge normal con main f75d4882. Dos GET sensibles y SSR de Admisiones reutilizan `authorizeCapability('institutions.manage')` antes de consultar PII. Se conservan las respuestas exitosas, rutas y códigos 401/403. No cambia esquema, migración, RLS, datos históricos ni contratos de Compañero.

## Comandos y resultados reales

Todos los datos SQL/HTTP pertenecen a una base nueva `siii_mission_test` en un clúster PostgreSQL17 separado, escuchando únicamente en127.0.0.1:55439. Nunca se cargó una conexión productiva.

| Verificación | Resultado |
|---|---|
| npm ci |375 paquetes instalados; lockfile sin cambios |
| npm run lint y npm run typecheck | exit0; repetidos después de reconciliar main |
| npm test |808/808 en52archivos; la prueba TSX omitida en main está identificada como QA-02, no se cuenta |
| npm run test:integration -- tests/integration/sensitive-institutional-lists-http.test.ts, antes del arreglo |15 fallos y9 controles correctos: APIs200 en lugar403 y SSR200 en lugar307 |
| Misma prueba después del arreglo |24/24; después se amplió a27 casos con tenantB poblado, super_admin y SSR cruzado |
| npm run test:integration completo |386/387, 33archivos,572.87s. Único fallo: ventana de observación del bloqueo en MFA consumida por compilación fría; nueva suite27/27 |
| npm run test:ui |73/73,9.1min, build de producción. Snapshot previo a incorporar el kit remoto f75d4882; no atribuir cobertura visual de ese kit a esta corrida |
| npm run build tras reconciliar f75d4882 | exit0; compartido103kB, Admisiones115kB; sin cambios de permisos visuales |
| SIII_HTTP_TEST_PRODUCTION=1 npm run test:integration -- tests/integration/sensitive-institutional-lists-http.test.ts |27/27,9.16s, build reconciliado. Sesiones reales, MFA, API y SSR; datos de dos instituciones |
| npm run test:integration -- tests/integration/mfa-security.test.ts tras preparar la ruta antes del gate |24/24,78.00s; permanece polling60×50ms, cambio concurrente de auth_version,403 y cero escrituras |
| npm run db:preflight, base local sintética | exit0;12tablas requeridas presentes,24entradas journal, ledgerDrizzle presente, sin grants directos Data API |
| npm audit --json | exit1; dos moderadas en Vitest4.1.11. Arreglo4.1.12 en PR separado; gate no rebajado |
| git diff --check | limpio |

Dentro del sandbox, Vitest falló por EPERM de caché y build no resolvió aliases; las repeticiones escaladas pasaron sin cambiar el producto para satisfacer esas restricciones.

La preparación MFA es un GET autenticado al módulo compartido por GET/POST antes de abrir el bloqueo. La primera corrida registró compilación2.8s y HTTP3.888s contra observación3s; no había alcanzado SQL al agotarse esa ventana. La revisión independiente confirmó que el GET solo prepara la ruta/refresca lastSeenAt: no altera authVersion, MFA, grants ni cookie. La aserción de revocación concurrente sigue íntegra. La suite antigua usa nombres de cookies de desarrollo; no se presenta su repetición como validación completa en producción. La nueva suite sí admite cookies __Host- y ejecutó el build de producción local.

## Revisión y límites

Revisión independiente sin hallazgos Critical/Important. Se corrigieron los Minor de cobertura: tenantB poblado y pruebas de super_admin/SSR entre instituciones. No se repitió la integración completa después de preparar el test MFA: el fallo se reprodujo, diagnosticó y verificó con su suite completa24/24; se conserva el resultado inicial386/387, sin presentarlo como una corrida completa verde. CI del SHA final sigue siendo gate independiente.

El acceso administrativo usa la capacidad ya existente; capacidades específicas de Caja/Admisiones y consultas propias necesitan otro incremento. Control escolar no recibe un permiso nuevo por inferencia. No se construyó la sesión del aspirante ni se corrigieron los escritores o FK financieras en este PR: están en SEC-01/03/04/05/06 del inventario. No se verificó lector de pantalla manual, Safari/dispositivos físicos, carga SQL, restauración productiva ni E2E a Compañero/Android.

## Riesgo y pendientes para el responsable

La lectura general de institución deja de dar acceso a PII/deudas ajenas; clientes que dependían de ese acceso indebido reciben403. Administradores institucionales con MFA mantienen la proyección. No hay migración ni riesgo de transformación de datos. Permanecen P1 abiertos y el gate de dependencias; PR75 continúa en borrador y sin merge mientras haya checks pendientes/fallidos. Confirmar la matriz futura de operadores de Caja/Admisiones antes de delegar capacidades nuevas.

## Composición con el prerrequisito de herramientas

[PR79](https://github.com/ErickRFM/Siii/pull/79) actualiza Vitest4.1.12, descubre TSX y configura OXC. Se incorporó por merge normal a la rama de PR75 y será su base de revisión mientras se integra por separado: el diff de autorización no duplica el parche de tooling. Tras npm ci, las herramientas solas verificaron813/813 y audit0. El fallo de dependencias descrito arriba es la medición previa al parche; el gate que queda pendiente es CI del SHA compuesto. Ninguno de los dos PR está fusionado.

Validación secuencial final de la composición: lint exit0; typecheck exit0;813/813 en53archivos; build exit0; nuevo HTTP/SSR contra ese build con Vitest4.1.12:27/27 en8.19s. Se conservan las limitaciones declaradas de la corrida completa inicial y del snapshot visual73/73; estos resultados dirigidos no los reemplazan por una certificación general de SIII.
