# Auditoría de ingeniería SIII — 21 octubre 2026

## Alcance y evidencia de base

Se leyeron AGENTS.md y MASTER_PROMPT completo. `git fetch origin --prune` y `git merge --ff-only origin/main` actualizaron el checkout de `6e6c00c3` a **e494f651b011d8567f999eac0a4103b0eac01c76**. Los directorios locales no versionados `.artifacts/` y `.idea/` se conservaron.

GitHub Actions [39655481360](https://github.com/ErickRFM/Siii/actions/runs/39655481360) terminó SUCCESS para ese SHA. El status separado de Vercel falla por `build-rate-limit`; CI verde no acredita despliegue vigente. GitHub sigue configurado con `default_branch=feat/sis-foundation`; no se cambió la configuración.

La consulta de PR abiertos devolvió únicamente [#61](https://github.com/ErickRFM/Siii/pull/61), que renombra una prueba de schemas mal presentada como E2E. No duplicar ese parche. #40, #48 y #49 ya están integrados; también los incrementos #62, #64, #66–#71. Existe rama de gate DB asociada a #72: reconciliar antes de ampliar preflight.

La auditoría del código incluye seguridad, frontend y sincronización independientes. Los defectos descritos como estáticos se confirmaron por flujo de código; no se presentan como explotación productiva. No se consultaron secretos ni se ejecutaron escrituras en Supabase. La evidencia productiva citada en el reporte de reconciliación existente no se volvió a ejecutar aquí.

## Inventario priorizado

P0 = incidente o bloqueo crítico demostrado en un ambiente activo; P1 = seguridad/integridad alta; P2 = mantenibilidad, robustez o rendimiento pendiente. **No se confirmó un incidente P0 productivo**; sí hay P1 que bloquean declarar el sistema listo.

| ID / prioridad | Evidencia en base auditada | Causa raíz y riesgo | Intervención y prueba necesaria |
|---|---|---|---|
| SEC-01 P1 | `src/app/api/v1/institutions/[institutionId]/admissions/applications/route.ts:57`; `admissions/login/route.ts:38` | POST confía en applicantId del body sin sesión/titularidad; login no emite sesión de aspirante. Escrituras anónimas sobre otro aspirante y ciclos sin validar. | Sesión separada, identidad derivada del servidor y validación transaccional de ciclo/programa/campus. Negativos sin sesión, otro titular, correo no verificado y convocatoria cerrada. Requiere diseño de contrato compatible; no parchear aceptando un UUID como credencial. |
| SEC-02 P1 | `financials/orders/route.ts:24`; `admissions/applications/route.ts:24`; `src/app/dashboard/institutions/[institutionId]/admissions/page.tsx:19` | `institutions.read` permite listar finanzas y PII de terceros; SSR comprueba solo membresía. El permiso general pertenece incluso a guest/student. | Reutilizar autorización central administrativa con MFA para los dos listados y SSR; luego capacidades específicas y consultas propias. Regresión HTTP por rol, MFA, tenant y estado. Primer incremento del plan adjunto. |
| SEC-03 P1 | `financials/orders/route.ts:57`; `financials/fee-types/route.ts:47`; `admissions/cycles/route.ts:26`; `admissions/applications/[applicationId]/decision/route.ts` | Escritores usan can() directamente y omiten privilegedAssuranceAllows y revalidación dentro de transacción. | Adoptar límites existentes authorizeCapability/lockWriteCapability o domainTransaction, con MFA y revocación concurrente. No crear otra jerarquía de permisos. |
| SEC-04 P1 | `db/schema/financials.ts:32`; `financials/orders/route.ts:79`; JOIN `:44` | payerStudentId tiene FK simple y el POST no verifica tenant; JOIN devuelve identidad del estudiante de otra institución. | Lookup y FK compuesta en migración aditiva, preflight para filas históricas y join por tenant. DB y HTTP deben rechazar cruce. Revisar payerUserId por membresía. |
| SEC-05 P1 | `src/app/api/v1/admissions/register/route.ts:43`; `src/components/admissions-portal.tsx:61` | Token de verificación devuelto al registrante y auto-consumido por UI; no acredita posesión del buzón. | Transporte de correo durable con token secreto, caducidad y consumo atómico. Cambiar pruebas que actualmente exigen el token público. UI debe comprobar resultado real. |
| SEC-06 P2 | `admissions/applications/[applicationId]/decision/route.ts:44`; `financials/orders/route.ts:83`; `student-links/claim/route.ts:67` | Dictámenes, deudas y vínculos se escriben sin auditoría institucional transaccional. | Audit con actor/tenant/recurso/requestId/antes-después en la misma transacción; prueba de rollback si falla auditoría. |
| UX-01 P1 | `src/components/teacher-gradebook.tsx:49,63,99,123` | Inputs defaultValue y refresh que desmonta tabla: guardar una celda pierde otras capturas sin guardar. | Borradores controlados por sección/alumno/componente, conservación al refrescar y advertencia al salir; UI de dos celdas. Estático, falta reproducción de navegador. |
| UX-02 P2 | `scheduling-studio.tsx:45,111`; `university-services.tsx:38,99` | Peticiones sin cancelación/identidad permiten que respuesta antigua sobrescriba semana/pestaña nueva. | AbortController y generación por contexto; respuesta retrasada A/B y escritura con cambio de pestaña. |
| UX-03 P2 | `teacher-gradebook.tsx:38,48,91` | Reintentar solo refresca sección; si falló cargar secciones, retorna sin consultar. | Loader reutilizable y reintento real de la consulta fallida; fallo de red inicial seguido de recuperación. |
| UX-04 P2 | `src/app/sii-system-coherence.css:86,112`; `sii-ux-refinement.css:77` | Regla global posterior devuelve campos públicos a 14px entre 601–840; corrección16px solo llega a600. | Unificar breakpoint840, medir computedStyle a768 y verificar móvil/zoom sin alterar identidad mate. |
| PERF-01 P2 | `academic-operations.tsx:33,81,100`; `shared/client/read-collection.ts:4` | Siete colecciones se recorren completas antes de mostrar datos; búsqueda .find por fila y DOM completo. Paginación servidor no limita coste cliente. | Medir peticiones/bytes/DOM/tiempo con205/1000/10000 filas; carga diferida de selectores y páginas visibles. No retirar recuperación de filas de #40 sin alternativa compatible. |
| INT-01 P2 | `api/internal/companion-snapshot-delivery/route.ts:11,26`; `outbox/worker.ts:36`; `outbox/transport.ts:6` | Lote secuencial10×timeout30s excede maxDuration120s; corte puede dejar lease sin resumen. | Presupuesto global con margen DB, no reclamar después del deadline; prueba de lote estancado. |
| INT-02 P2 | `outbox/write-hook.ts:16`; `enrollments/route.ts:69` | Hook inventa requestId y pierde correlación con auditoría de la mutación original. | Propagar ID HTTP, comprobar mismo ID en ambos eventos y conservarlo en intentos. |
| INT-03 P2 | `outbox/signed-transport.ts:53` | Límite4096 solo comprueba Content-Length; response.json acepta stream arbitrario. | Lectura acotada y cancelación de stream; prueba grande sin cabecera y chunked. |
| INT-04 P1 de habilitación | `assignments/route.ts:55`; `registry/[resource]/route.ts:96`; runbook Companion:26 | Faltan productores de revocación docente/identidad/institución y tombstones. Pendiente explícito previo, no regresión nueva. | Completar autoridad/revocación y prueba handlers→proyección receptora. Mantener flags OFF hasta aceptación real. |
| INT-05 P2 | `outbox/worker.ts:24,35`; `ACADEMIC_OUTBOX_FOUNDATION.md:27` | accepted acredita recepción durable, no PROJECTED; falta reconciliación y replay operativo de failed. | Contrato de estado, reconciliación tenant/sección/versión y reproceso auditado; no inferir compatibilidad receptora sin su prueba. |
| ARCH-01 P2 | `institution-users.tsx`25,344B/54líneas; `institution-invitations.tsx`19,766B/49; `shared/users/handlers.ts`17,115B/123 | Código comprimido mezcla estado/formularios/efectos o varios casos de uso; eleva coste de revisión. | Formatear y extraer unidades con propiedad clara por dominio, preservando contratos y pruebas. Evitar división cosmética masiva. |
| ARCH-02 P2 | `src/app/layout.tsx` importa siete CSS globales; `sii-v2.css`22,473B y `sii-motion-polish.css`13,586B | Estilos superpuestos dependen de orden/especificidad; UX-04 muestra regresión concreta. | Inventario selector/token/consumidor y consolidación incremental con regresiones visuales por rol/viewport. |
| QA-01 P2 | `tests/integration/full-university-lifecycle.test.ts`; `tests/unit/ux-maturity-contract.test.ts:13,24`; `tests/ui/consolidated-modules.spec.ts:114` | Schemas/texto/fixtures vacías no prueban flujo completo, publicación ni preservación de borradores. | #61 ya corrige nombre; añadir flujos reales de datos y negativos. CI verde actual no cubre SEC-01..05 ni UX-01. |
| OPS-01 P1 de release | `docs/audits/SIII_PRODUCTION_READONLY_RECONCILIATION_2026-10-21.md` | Reporte existente indica producción en0017, sin0018 ni tablas posteriores sondeadas; app main espera esquema nuevo. | Reconciliar hashes/roles/backup/ensayo restaurado y aprobación antes de migrar; reutilizar trabajo #72. No ejecutar db:migrate contra producción. |
| GIT-01 P2 | GitHub get_repo21-oct; ramas remotas comparadas | Rama predeterminada histórica y ramas divergentes pueden inducir base incorrecta. | Cambiar configuración a main mediante proceso administrativo; revisar equivalencia por archivos/contratos antes de cualquier integración. |
| DEP-01 P2 / bloqueo CI | `package.json` vitest4.1.11; npm audit21-oct devuelve2moderadas | @vitest/mocker acepta registro inseguro y tiene bypass Windows de allowlist; herramientas de desarrollo, no dependencia runtime. Advisory actualizado21-oct: [inyección](https://github.com/advisories/GHSA-qxg6-89mg-rqv8), [Windows](https://github.com/advisories/GHSA-xp26-3454-mjgp). | Actualización puntual exacta a4.1.12 y lockfile en PR separado, repetir suites y audit; no rebajar gate ni ejecutar npm audit fix indiscriminado. |

## Arquitectura y datos que sí existen

- Límites útiles actuales: `shared/auth/session.ts`, `write-access.ts`, `modules/consolidation/domain-boundary.ts`, políticas puras de capacidades, contexto/auditoría HTTP y repositorios de invitaciones/outbox. El problema de los módulos nuevos es no utilizarlos; no hace falta reescribir el backend completo.
- Migración0023 fuerza RLS, quita grants Data API y entrega propiedad a siii_migrator en las once tablas nuevas. La política privada de siii_app es deliberadamente amplia; la autorización del servidor sigue siendo necesaria. [Supabase distingue grants y RLS](https://supabase.com/docs/guides/api/securing-your-api).
- Outbox ya conserva atomicidad de enqueue/version/auditoría, payload cifrado congelado, versión por sección, backoff limitado, leases y CAS/fencing. Hay pruebas específicas. No duplicar infraestructura ni afirmar entrega E2E a Android.
- Catálogos, secciones, expedientes e inscripciones/asignaciones ya tienen paginación. Los índices compuestos institucionales existen en múltiples entidades; SEC-04 es una excepción concreta. No se ejecutó EXPLAIN con datos reales ni se afirma un N+1 medido.

## Mediciones de mantenimiento y dependencias

Análisis local de250 archivos TS/TSX/MJS/CSS versionados y763 aristas de imports estáticos: una componente fuertemente conexa entre email/templates.ts y email/transactional.ts. **Una arista es import type y se elimina al compilar: no es un ciclo runtime demostrado.** Extraer el contrato de correo es una mejora opcional de límites, no incidente.

Mayores archivos de código: rehearse-cloud-schema.ts42,870B/306líneas; institution-admin.tsx29,822B/290; institution-users.tsx25,344B/54; academic-catalog.tsx23,055B/290; mfa.ts22,185B/276. Las líneas incluyen vacías; el tamaño por sí solo no justifica refactorizar lógica segura.

Stack actual: Next15.5.27, React19.3, Drizzle0.45.4, pg8, zod4, Vitest4 y Playwright1.64. No se actualizaron dependencias por antigüedad. CI tiene instalación reproducible, lint, tipos, unit, PostgreSQL, navegador, build y audit; no se encontraron test.skip/describe.skip/it.skip/test.fixme en tests con la búsqueda realizada.

Build baseline local fuera del sandbox: compilación13.1s, First Load JS compartido103kB, academic116kB, grading112kB, admissions113kB. Son tamaños de build y tiempo de compilación, **no** latencia del usuario ni benchmark SQL. La corrección de autorización no se presenta como optimización.

## Validación basal y próximos incrementos

`npm ci`:375 paquetes instalados; lint/typecheck aprobados; unit808/808; build aprobado fuera del sandbox. Vitest dentro del sandbox falló por EPERM de caché; build dentro del sandbox no resolvió aliases. Repeticiones escaladas corrigieron ambos sin modificar el producto. Integración se negó a arrancar sin SIII_DATABASE_ENV=test/base local y db:preflight se negó sin DATABASE_URL. Son protecciones conservadas.

Secuencia: SEC-02 (API+SSR) → identidad/verificación aspirante SEC-01/05 → escritores MFA/auditoría SEC-03/06 → integridad de referencias financieras SEC-04 → notas UX-01 → asincronía/CSS → revocación y reconciliación Companion → medición/paginación. Cada incremento necesita sus negativos y revisión independiente. No se declara completada ninguna fase integral ni el ciclo universitario E2E.

La clasificación detallada de ramas está en `SIII_BRANCH_INVENTORY_2026-10-21.md`; la evidencia final del primer incremento se añadirá después de ejecutar las pruebas.

## Cambio remoto observado durante QA

Un nuevo fetch detectó `main@f75d488288af068fa0f20461598b7ddef934d545`, PR73. Añade el kit premium en18archivos, dos CSS y pruebas propias. Se comparó `git diff e494f651..f75d4882`: no toca los tres accesos de SEC-02 ni la autorización del servidor. Los cambios de grading, agenda y servicios son de encabezados/presentación: UX-01/02/03 y PERF-01 siguen vigentes; las nuevas hojas tampoco corrigen los campos públicos601–840px de UX-04. La deuda de CSS pasa de siete a nueve hojas globales importadas.

La corrida local inicial está anclada a e494f651 más la corrección; no acredita la nueva capa visual. Actions de f75d4882 estaba QUEUED al consultarse (`39725976675`), así que no se afirma CI verde del nuevo main ni se hizo merge de esta corrección.

**QA-02 P2 confirmado en el delta:** `tests/unit/premium-ui-kit.test.tsx` contiene cinco pruebas, pero `vitest.config.ts` solo incluye `tests/unit/**/*.test.ts`. `npm test -- tests/unit/premium-ui-kit.test.tsx` terminó con `No test files found`, exit1. Corregir descubrimiento y verificar las cinco pruebas realmente, dentro del incremento separado de herramientas. No contar esas pruebas como aprobadas por el CI previo.

La rama de seguridad se reconcilió con f75d4882 mediante merge normal, sin conflictos. Build posterior aprobado: compartido103kB, admissions115kB y grading114kB. El aumento respecto a113/112kB pertenece al kit remoto; no es una optimización ni un coste atribuible a los guards. No hay benchmark de latencia comparable.

Actualización de publicación: PR79 corrige DEP-01 y QA-02 en una rama independiente; instalación reproducible y813unitarias verificadas, audit0. PR75 incorpora ese prerrequisito para su gate y mantiene separado el diff de autorización. La consulta reciente de abiertos también devuelve PR72 y PR76–78 (sidebar, movimiento y patrones UI), además del61 histórico. Se conservan sin merge y sin duplicar su alcance. Las cifras del inventario de ramas siguen siendo la instantánea inicial identificada por su SHA, no una afirmación sobre ramas creadas después.

## Consolidación verificada — 22 octubre2026

Actualización añadida sin reemplazar la instantánea histórica anterior. El coordinador verificó integración en orden PR79 → PR81 → PR75 y `main@2be56cd1647b0feecf6649628f1bf8381b928833` con [CI39734285341 SUCCESS](https://github.com/ErickRFM/Siii/actions/runs/39734285341). SEC-02, DEP-01 y QA-02 quedan resueltos en esa base integrada: CI de75 ejecutó813unitarias,387integraciones PostgreSQL y79UI, build y audit0; evidencia local del coordinador27HTTP/79UI y preflight. La excepción humana se limitó al preview Vercel de79/81 por cuota;75 tuvo todos los checks verdes, incluido Vercel. No implica despliegue ni disponibilidad productiva.

El incremento financiero del [reporte específico](SIII_FINANCIAL_WRITE_AUTHORITY_2026-10-22.md) aporta defensa API parcial a SEC-03/04/06: dos escritores con MFA/revalidación/auditoría y JOIN por tenant, con22HTTP locales. No añade FK ni migración; la defensa DB de SEC-04 requiere una futura0025 después de0024 de PR80. Permanecen abiertos SEC-01/05 en80, SEC-03/04/06 globales, UX-01, integración Compañero y las puertas de operación/producción. Estos resultados no acreditan completar todas las funciones del sistema.

## Nota de reconciliación — 22 octubre 2026

Se conserva íntegro el informe histórico anterior. Según la coordinación recibida, PR80 se integró en main8b2bd2c6 con el árbol de95f9252c; premerge39736372668/39736367431 SUCCESS (818 unitarias/404 PostgreSQL/84 UI), Vercel SUCCESS; postmerge39738330828 seguía pendiente al comunicarse. Esto no acredita disponibilidad productiva de SEC01/05: siguen las puertas de sender/scheduler, roles efectivos, ledger y publicación. PR82 finanzas a08c39f sobre8b2bd2c6 tenía67 HTTP/818 unitarias/build local verdes y revisión aprobada, con CI pendiente y cuota Vercel24h; no se afirma un merge de82.

Incremento local SEC-03/SEC-06: sólo POST convocatorias/dictámenes, autoridad admissions.manage/MFA y auditoría TX,30 HTTP focales de producción local y826 unitarias tras corrección de revisión. Revisión independiente aprobada; estado PARCIAL, claim y demás escritores siguen pendientes. Evidencia, límites y CI pendiente del commit exacto: [informe de escritores de admisiones](SIII_ADMISSIONS_WRITE_AUTHORITY_2026-10-22.md). No hay acciones productivas ni cambios a migraciones/F2/UI.

Estado al reconciliar esta rama: PR80 quedó integrado en8b2bd2c6 y su CI postmerge39738330828 terminó SUCCESS. PR82 quedó integrado en9b472c30 tras ambos Actions39738454424/39738449179 SUCCESS (818unitarias,426integraciones,84UI), revisión aprobada y excepción humana exclusivamente de cuota Vercel. Main9b472c30 coincide con el árbol probado a08c39f6; CI postmerge39741008118 pendiente al redactar. La defensa DB de SEC-04, claim y UX-01 continúan abiertos; no se ha modificado producción.

## Seguimiento acotado SEC06 — claim (22 octubre2026)

El incremento local de [claim de estudiante](SIII_STUDENT_CLAIM_AUTHORITY_2026-10-22.md) consume el helper común revisado935f2220 con institutions.read, sin modificar F2 ni Admisiones. Impide auto-vínculo basado solo en correo textual y hace atómicas ambas ramas con auditoría y revalidación final. Prueba positiva de buzón mediante aceptación real de invitación; RED21/29 y GREEN29/29 HTTP en base local sintética exclusiva. Lint y826unitarias aprobadas. No se promueve la composición privada a integración main ni se declara cerrado SEC06 global: claim/me, otros consumidores y puertas de operación siguen pendientes. Revisión independiente, prerrequisito integrado y CI del SHA final continúan siendo gates; no se ejecutaron escrituras productivas ni sincronización Compañero.

## CI posterior de main — contraste durante entrada (22 octubre2026)

Main809c526d tuvo CI39813643250 FAILURE por color-contrast en monograma institucional al completar recuperación con MFA (83/84UI). Se detuvieron otras integraciones. Causa reproducida: opacity0→1 de item y content-grid ancestrales;4negativos axe por frame→GREEN8con controles previos,15flujos UI reales y826unitarias/lint/tipos/build locales verdes. Revisión independiente detectó y cerró un arreglo incompleto; reparación final sólo cambia animation-name a desplazamiento existente. [Informe de causa y evidencia](SIII_DASHBOARD_ENTRY_CONTRAST_2026-10-22.md). CI del SHA publicado e integración pendientes; no se aplica excepción de cuota a este fallo ni se declara main estable.

## Seguimiento DEP-02 — Next runtime (22 octubre 2026)

Nuevo hallazgo independiente de DEP-01/PR79: `main@a1c6e8c4` fija Next15.5.27 y el audit del22-oct devuelve un paquete crítico con GHSA-2464-fhr4-w9xw (optimización de imágenes/SVG sobre Linux glibc) y GHSA-p3m5-59mp-jv5r (DoS con Server Actions). No se demuestra un incidente productivo ni se infiere exposición solo por instalar Next. La búsqueda focal no encontró imports `next/image` ni directivas `use server` en la app. Parche puntual exacto15.5.28, env/SWC alineados y Sharp0.35.5 conservado; no hay upgrade mayor, `audit fix`, cambio de gate ni mezcla de MFA/PR88. RED audit exit1 → GREEN exit0/cero; instalación reproducible, lint, tipos,826unitarias y build31/31 locales verdes. Revisión independiente sin hallazgos Critical/Important/Minor; CI del SHA publicado conserva su gate. [Informe DEP-02 y límites](SIII_NEXT_SECURITY_PATCH_2026-10-22.md). Este añadido conserva íntegra la instantánea y el historial anteriores.

## QA — navegación real después de logout MFA (22 octubre2026)

El job39815790688 de #86 reprodujo goto/login interrumpido por el303 del logout final del caso MFA. Incremento sólo de test registra espera de navegación antes de Salir y exige auth/me401 antes de reingresar; no cambia F2 ni relaja límites/aserciones. Tres suites aisladas4/4 cada una,826unitarias/lint/tipos/build verdes y revisión independiente sin hallazgos; los intentos de repetición con throttle compartido se documentan como fallidos. [Evidencia y límites](SIII_MFA_LOGOUT_NAVIGATION_TEST_2026-10-22.md). CI/reconciliación/integración pendientes; no se acredita main estable por este incremento.

## SEC-04 — integridad financiera local (22 octubre 2026)

Se conserva íntegra la instantánea histórica y ambos apéndices anteriores. Rama reconciliada con main809c526d, que integra PR82/83/84; según coordinación,84 tuvo826unitarias/485integraciones/84UI y preview verdes, y postmerge39813643250 de main809c seguía pendiente al último informe. No acredita despliegue productivo.

0025 añade FK compuestas de alumno/tenant y usuario/membresía/tenant, SET NULL sólo payer, índices hijos y preflight readonly PRE/POST0025; falla ante históricos inválidos sin borrar/null/backfill. [Reporte SEC-04](SIII_FINANCIAL_TENANT_CONSTRAINTS_2026-10-22.md):36DB +114HTTP=144/144 conjuntos,19 migrador/perfil con ejecutor sin superusuario, legacy24 HTTP1/1 separado,826unitarias y lint/tipos/build/audit0. Preflight finalVERIFIED_0025,0/0 inválidas; revisión sin Critical/Important y Minor indimmediate resuelto/confirmado. Sólo ensayos locales sintéticos; la DB histórica financiera no se modificó.

El hueco DB financiero de SEC-04 queda implementado y verificado localmente. CI de esta rama, release/ledger/backup/operación productiva y demás pendientes globales permanecen abiertos. CI incorpora un gate legacy24 explícito posterior al bundle UI, sin omitir ni duplicar descubrimiento; no se afirma todavía su ejecución remota.

## SEC-04 — revalidación incremental tras PR87 (22 octubre 2026)

Merge normal local516f374f reconcilia47f8ae82 con maina1c6e8c, preservando íntegros la historia y los dos apéndices.0025/journal/manifest y SQL histórico permanecen idénticos. Según coordinación, PR87 tuvo dos Actions826/485/88UI y preview verdes; postmerge39821829240 seguía en curso.

Evidencia repetida: lint/tipos/build0,826unitarias;144/144 conjuntos=36DB+108HTTP y legacy24 separado1/1; preflight VERIFIED_0025,0/0 inválidas,26ledger/hashSQL exacto y harness restaurado. Aclaración del apéndice previo:114HTTP era error aritmético;22+27+30+29=108HTTP, y el total144 se mantiene. [Detalle incremental](SIII_FINANCIAL_TENANT_CONSTRAINTS_2026-10-22.md). CI propia y delta MFA/logout pendientes; sin publicación ni operación productiva.


## SEC-04 — composición preparatoria PR88/89, NO main (22 octubre 2026)

Merge normal local68f07622 integra0834b352 sobre f702: prueba MFA/logout revisada y Next15.5.28, todavía pendientes de integración real en main. npm ci/audit0, lint/tipos/build0 y826unitarias;144/144=36DB+108HTTP, legacy24 separado1/1. Preflight VERIFIED_0025,0/0 inválidas,26ledger y hash0025 intacto; migrador/preflight/SQL sin diff y19managed no repetidos. [Evidencia preparatoria](SIII_FINANCIAL_TENANT_CONSTRAINTS_2026-10-22.md). Se conserva toda la historia; no sustituye CI89/88/main ni CI financiero. SIN PUSH ni operación productiva.
