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
