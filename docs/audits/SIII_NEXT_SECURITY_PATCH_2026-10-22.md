# DEP-02 — Parche de seguridad de Next.js (22 octubre 2026)

## Base y alcance

Rama `fix/next-security-patch-20261022`, creada desde `origin/main@a1c6e8c4117a477c2d0d75f5233e7f96870a9f80`. Se verificaron el HEAD remoto y los PR abiertos antes de modificar dependencias. DEP-01/PR79 ya está integrado; este incremento es DEP-02 y no reproduce aquel cambio. PR88 conserva su corrección de navegación MFA por separado.

Plan ejecutado: reproducir el audit negativo; fijar Next 15.5.28 y regenerar solo su árbol necesario; verificar instalación, audit, lint, tipos, unitarias y build; solicitar revisión independiente antes de entregar el commit al coordinador. No se usa `npm audit fix`, no cambia el gate de CI y no hay upgrade mayor.

## Causa y fuentes primarias

El audit detectado el 22 de octubre devuelve dos avisos sobre el mismo paquete Next 15.5.27: [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), crítico, relacionado con optimización de imágenes/SVG y una biblioteca nativa sobre Linux glibc; y [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), alto, por consumo de CPU con App Router y al menos una Server Action. Ambos señalan Next 15.5.28 como versión corregida en la línea 15.5. La [release oficial v15.5.28](https://github.com/vercel/next.js/releases/tag/v15.5.28) incluye ambas correcciones.

Las páginas del repositorio upstream y la release muestran 14 de octubre; la observación del audit en esta tarea es del 22 de octubre. No se infiere la fecha de publicación upstream a partir de su detección en el registro.

La búsqueda focal en `src` y `next.config.mjs` no encontró imports de `next/image`, directivas `use server`, configuración `dangerouslyAllowSVG` ni `serverActions`. La única coincidencia `_next/image` es la exclusión del matcher del middleware; no acredita uso del optimizador. Son límites de una búsqueda estática, no una prueba de ausencia de toda exposición ni un incidente productivo demostrado. Se actualiza el runtime contra los avisos sin ejecutar un PoC de RCE.

## Cambios y compatibilidad

- `package.json`: Next exacto 15.5.27 → 15.5.28.
- `package-lock.json`: Next, `@next/env` y ocho paquetes opcionales SWC, todos 15.5.27 → 15.5.28. No cambia ningún otro paquete resuelto.
- La dependencia opcional de Next ajusta el rango de Sharp de `^0.34.3 || ^0.35.4` a `^0.34.3 || ^0.35.5`; el lockfile ya resolvía Sharp 0.35.5 y se conserva. Esa versión ya satisface el workaround upstream del aviso de imágenes/RCE: no se acredita exposición real a ese vector. El audit por versión de Next y el backport para Server Actions justifican el parche puntual.
- Node engines y peers de React/React DOM permanecen iguales. La validación local usa Node 24.18.0; CI usa Node 22. Se conservan App Router, rutas tipadas, middleware Node, CSP/nonce, cookies/headers y el uso de `after` para entrega de correo.
- No cambian componentes, rutas, permisos, MFA, esquema, migraciones, configuración de despliegue, variables de entorno ni flags de Compañero.

## Evidencia RED → GREEN y gates locales

Los logs locales se guardan en `.p0-local/dep02-*`, ignorado por Git. La regresión pertinente es el audit completo contra el registro; no se agrega un test que simplemente codifique la versión esperada.

| Comando | Resultado |
|---|---|
| `npm audit --json` antes del parche | exit 1; 1 paquete crítico (`next`), con los dos advisories citados en `via` |
| `npm install next@15.5.28 --save-exact --package-lock-only --ignore-scripts` | exit 0; resolución acotada y audit sin vulnerabilidades |
| `npm ci --ignore-scripts` | exit 0; 375 paquetes instalados, 376 auditados, 0 vulnerabilidades |
| `npm rebuild argon2 esbuild` | exit 0 |
| `npm audit --json` después del parche | exit 0; 0 vulnerabilidades en todas las severidades |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0; 826/826 pruebas en 56 archivos |
| `npm run build` | exit 0; Next15.5.28, compilación19.5s, 31/31 páginas generadas |

La instalación conserva avisos deprecados ya presentes de `@esbuild-kit/*` y ESLint 9.39.5; el rebuild también imprime el aviso de npm sobre scripts pendientes de allowScripts. El build conserva el aviso existente de Next sobre el plugin ESLint no detectado. No se cambian dependencias adicionales ni políticas de scripts para ocultar esos avisos.

## Límites y entrega

No se ejecutaron PostgreSQL, migraciones ni pruebas HTTP/UI institucionales locales: este parche de dependencias se valida localmente con los gates anteriores y conserva los checks completos de integración y navegador en CI del SHA publicado. No se abrieron puertos ni se consultaron bases, secretos o entornos productivos. El build local no acredita despliegue ni disponibilidad productiva.

Revisión independiente completada: sin hallazgos Critical, Important o Minor. Confirmó el diff de cuatro archivos, los diez paquetes resueltos, compatibilidad y evidencia RED/GREEN/unitarias/build; no repitió instalación/rebuild ni suites pesadas. Publicación, PR y merge quedan a cargo del coordinador; no se ejecutan desde este incremento. Orden de integración: proponer DEP-02 en un PR independiente e integrarlo primero si su revisión y CI del commit exacto están verdes. Después actualizar PR88 con ese prerrequisito y repetir sus gates; su corrección de navegación no es un prerrequisito de DEP-02. No se relaja audit.

## Seguimiento DEP-02 — Esperar el commit de metadata antes de Axe (22 octubre 2026)

PR89 publicó `01a595626f97a2b399892d03aeaf08bba80e5396`. Su [primera corrida CI39826467050](https://github.com/ErickRFM/Siii/actions/runs/39826467050) pasó 826 unitarias y 485 HTTP, pero terminó 87/88 UI: Axe detectó `document-title` ausente en el caso de guía MFA tras verificar200 y mostrar diez códigos. La [segunda corrida CI39826478550](https://github.com/ErickRFM/Siii/actions/runs/39826478550), del MISMO SHA, terminó SUCCESS con826/485/88. Ambos resultados se conservan. GitHub registra después el squash de89 en `main@7e2b867`; no se reabre ni se modifica el PR cerrado. Coordinación incorporará este incremento de pruebas a PR88 antes de publicar su nuevo SHA. La causa directa del título vacío en el primer CI NO se reprodujo; no se acredita una regresión de Next15.5.28 ni un bug de producto corregido por este cambio.

La asunción incorrecta de espera sí se confirmó: el componente muestra los códigos y deja de estar ocupado antes de que termine el refresh RSC. El caso existente ahora captura el nodo title previo y arma la espera del GET RSC real de `/dashboard/security` antes de activar; excluye prefetch, exige200 y espera que el nodo anterior deje el DOM. Después exige exactamente `SII · Sistema Institucional Integral` y ejecuta el MISMO Axe completo WCAG2A/AA/2.1AA/2.2AA. El título no es un fallback: su ausencia, un título incorrecto o falta de commit siguen fallando. No hay retries, ampliación de timeout, supresión de reglas ni cambios en producto, metadata, autoridad, F2 o dependencias.

Se descartó usar `response.finished()` como condición de commit: en la corrida normal sin rutas/preload, el servidor terminó la respuesta y Chromium reportó `net::ERR_ABORTED`; esa promesa no resolvió dentro de60s aunque el DOM sí se actualizó. El candidato EOF dio12/13UI y NO se cuenta como validación aprobada. La retención parcial de frames también alteró el comportamiento de finalización y se conserva sólo como diagnóstico descartado para este gate. La prueba final espera la actualización DOM observable, sin forzar un contrato de EOF que no se cumple en ese navegador.

Negativo controlado sobre el caso original, con `route.fetch()` y `route.fulfill({response:real})` reteniendo1000ms la respuesta completa REAL: Axe inició a1792694345582 con metadata pendiente; entrega real6608, fin6615. El mismo ensayo con el caso actualizado pasó: entrega1792694370971, requestfinished0982, Axe1007 con metadata actualizada y título exacto. Se ejecuta el análisis Axe real también en el negativo; la aserción adicional comprueba la fase en que comenzó. No se inventa contenido ni autenticación. Ese retardo fijo sólo existe en el diagnóstico ignorado, no en el test versionado.

Validación local de este incremento exclusivamente test/documentación, Node24.18.0/Next15.5.28 y Chromium, servidor original del harness en3208, base sintética NUEVA `siii_metadata_wait_test` con0000–0024 (25 migraciones), sin limpiar throttles. Se conserva el build de producción ya validado de01a; no se repiten unitarias826/integración485/build porque no cambia código ejecutable del producto. CI del futuro SHA integrado debe ejecutar sus gates completos bajo Node22; la evidencia local no sustituye ese resultado ni acredita E2E receptor/móvil o disponibilidad productiva.

Evidencia ignorada: `.p0-local/metadata-diagnostic/` guarda `diagnosis.md`, `wait-validation.md`, configs/spec observador, logs RED/GREEN, timelines JSON, trazas y resultados. Ejecución desde el worktree next-security-patch con `SIII_DATABASE_ENV=test`, `DATABASE_URL`/`INTEGRATION_DATABASE_URL` apuntando sólo a PostgreSQL loopback55439/base citada y `SIII_TEST_PORT=3208`; el setup ignorado reutiliza `tests/support/http-setup.ts` y `server.mjs` originales en producción.

| Gate de este incremento | Resultado |
|---|---|
| Diagnóstico controlado original, RSC completo real retenido | RED: Axe inició antes del commit de metadata; no reproduce título vacío |
| Mismo diagnóstico con espera DOM actualizada | GREEN:1/1,10.0s; metadata/título actualizados antes de Axe |
| Guidance normal, sin route/preload | GREEN:1/1,9.8s |
| Guidance +4 MFA reales +8 contraste, sin route/preload/retries | GREEN:13/13,32.9s |
| `npm run typecheck` | exit0, después del ajuste final |
| `npm run lint` | exit0 |
| `git diff --check` | exit0 |

El puerto3208 quedó liberado; se conserva la base sintética para trazabilidad. Revisión independiente y commit local se reportan al coordinador; no se ejecuta push desde este incremento.
