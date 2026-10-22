# UX-01: reproducción de borradores del libro de calificaciones

Actualización de implementación: corrección local revisada sobre main809c526d2deedff99b6425f07ddab7a514bb7f19; lint/tipos,826 unitarias, build y15UI focales reales aprobados. UX-01 sigue PARCIAL por los límites de navegación descritos al final. No acredita CI del futuro commit ni disponibilidad productiva.

## Registro histórico de la reproducción original

Base9b472c30d126fe542a3cac995d28b4b2e4ffa4fc; rama fix/gradebook-drafts-20261022. Sólo reproducción: no producto corregido, commits, push, PR ni acciones productivas.

## Entorno y evidencia real

Nueva base sintética siii_gradebook_test, PostgreSQL127.0.0.1:55439, migraciones EXISTENTES0000–0024. Chromium real sobre build de producción y servidor exclusivo3204. Config local ignorada `.p0-local/gradebook.playwright.config.ts`: importa la original y define testDir/globalSetup absolutos y baseURL3204; no modifica harness. npm ci:375 paquetes/audit0; los dos builds de reproducción aprobaron.

La fixture crea un docente, vínculo y asignación vigentes, dos alumnos inscritos y dos evaluaciones50%+50%. Login y MFA usan la UI real; componentes/notas y step-up usan endpoints reales con las cookies del navegador. No se insertan sesiones ni se simulan scores, auth o respuestas del backend. La espera del segundo caso se produce con un bloqueo PostgreSQL real de la auditoría en esta base exclusiva.

| Caso y expectativa | Resultado observado | Persistencia comprobada |
|---|---|---|
| A=9.00 y B=8.75, guardar sólo A; B debe conservarse | POST200 y refreshGET200; B queda vacío. RED funcional en `gradebook-drafts.spec.ts:70` | Exactamente una fila, sólo alumno/componente enviado,900. B no se guardó ni sobrescribió |
| Enviar A=7.50; durante la espera editar A=6.25 y mantener B=8.25 | Tras el200+refresh, A vuelve a7.50 y B queda vacío. RED funcional en`:85` | Exactamente una fila750; la edición posterior6.25 y la nota ajena no llegaron a DB |
| Persistir A=(8,6), B=(7,9); editar A/P1=9.50 sin guardar e intentar publicar | MFAstep-up200; botón permite confirmar; publicaciónPOST201, UI publicada. RED funcional en`:105` porque se creó1acta y se esperaba0 | grade_publications versión1; finalGrades A=700/B=800, calculados desde las notas persistidas anteriores. El9.50 local no se guardó |

Primera corrida: tres casos fallidos; los dos primeros por los valores perdidos y el tercero agotó60s en una lectura diagnóstica `response.json()` de Playwright aunque la pantalla ya mostraba acta publicada. Se conservó toda esa evidencia. Se retiró únicamente esa lectura diagnóstica y se repitió el tercer caso: un fallo funcional por la publicación comprobada en DB. No se relajó ninguna comprobación del producto ni se amplió el timeout.

Comandos (con SIII_DATABASE_ENV=test, ambas URLs a la base local y SIII_TEST_PORT=3204):

```text
npm run test:ui -- --config .p0-local/gradebook.playwright.config.ts
npm run test:ui -- --config .p0-local/gradebook.playwright.config.ts --grep publication --output .p0-local/ux01-publication-results
```

Capturas antes/después, JSON de scores y traces:

- `.p0-local/ux01-first-results.json`: primera corrida preservada.
- `.p0-local/ux01-results/gradebook-drafts-saving-on-bc5e9-sts-only-the-submitted-cell/`: dos borradores, pérdida de B y trace.zip.
- `.p0-local/ux01-results/gradebook-drafts-a-newer-e-25471-ives-the-subsequent-refresh/`: edición mientras guarda, regresión y trace.zip.
- `.p0-local/ux01-publication-results/gradebook-drafts-publicati-c250f-local-draft-remains-unsaved/`: borrador previo, acta emitida, scores/finales y trace.zip.
- `.p0-local/ux01-results.json`: repetición focal del caso de publicación.

## Causa raíz

`teacher-gradebook.tsx:50` activa loading en cada refresh. El render condicional de`:99` desmonta la tabla. Los inputs sólo usan defaultValue (`:124`), por lo que su estado vive en el DOM y desaparece al montar de nuevo desde DB. Cada comando llama refresh (`:64`); no identifica la revisión local enviada ni conserva cambios posteriores. Publicar (`:81-85`,`:130`) sólo comprueba pesos/roster/saving/publicación previa y desconoce borradores. El backend valida correctamente los datos que sí recibió; no conoce notas que nunca se enviaron.

## Diseño acotado propuesto, pendiente de autorización

1. Inputs controlados mediante borradores en memoria por institución/sección/alumno/componente, con revisión local. Separar captura pendiente del snapshot servidor; sin localStorage, sesiones paralelas ni almacén global.
2. Guardar captura clave+valor+revisión enviados. Tras confirmar, retirar sólo esa revisión de esa celda; si se editó mientras esperaba, conservar la nueva. No enviar otras notas. Mantener borradores al fallar guardado/validación.
3. Refresco de la misma sección actualiza el snapshot sin desmontar tabla ni inputs y conserva foco. Respuestas tardías se descartan mediante generación/cancelación por sección. Al cargar otra sección no mostrar el snapshot anterior. Ante401/403 ocultar y retirar datos privados de la autoridad perdida, sin conservarlos como fallback visible.
4. Bloquear publicación en cliente mientras queden borradores pendientes de la sección que se publicará, comprobar de nuevo antes de confirmar/enviar y conservar intacta la autoridad del servidor. Cubrir edición mientras el diálogo está abierto o mientras otro guardado espera.
5. Cambio de sección controlado: conservar el mapa separado por sección y recuperar sus borradores sólo cuando su lectura vuelva a estar autorizada; nunca mezclar filas o valores. Si se requiere confirmación al cambiar, reutilizar ask y mantener la selección al cancelar. Salida de la página descarta memoria sólo con aviso explícito.
6. Enlaces internos: guard local al ciclo de vida del gradebook, reutilizando ask para el enlace Institución y enlaces de navegación existentes; cancelar mantiene ruta/foco/datos y confirmar continúa navegación normal. Sin reemplazar router/history ni crear un sistema global. Recarga/cierre: beforeunload nativo sólo mientras hay borradores. No se encontró un guard beforeunload reutilizable en los componentes actuales; sí existe useInstitutionConfirmation. No se promete interceptar Atrás/Adelante de SPA mediante parches de historial.

Negativos para la implementación: las tres reproducciones anteriores deben pasar; navegar/cancelar/conservar, salir/confirmar, diálogo nativo al recargar/cerrar, cambio entre dos secciones sin mezcla, edición posterior al envío y durante confirmación de publicación, rechazo401/403 real sin snapshot privado viejo. No añadir CSS/layout ni nuevos flujos estéticos.

El producto y harness originales permanecen sin diff. La evidencia acredita UX-01 y su efecto sobre la publicación local; no acredita reparación ni disponibilidad productiva. El servidor3204 finalizó y el PostgreSQL compartido permanece activo.

## Implementación autorizada y revisión

El diseño de seis puntos anterior fue aprobado después de la reproducción. La rama se actualizó primero a main63c237fa (teacher-gradebook idéntico al baseline9b) y, tras cerrar los negativos y gates locales, se reconcilió por ff-only con main809c526d (#84 integrado). Se conservaron los apéndices existentes de seguridad. El incremento sólo cambia `teacher-gradebook.tsx`, añade el hook local `teacher-gradebook-drafts.ts`, las pruebas focales y documentación; no modifica CSS/layout, endpoints, F2, contratos, schema, migraciones ni el harness original.

Los inputs son controlados por capturas en memoria con clave institución/sección/alumno/componente y revisión monotónica. Cada guardado envía una sola nota; una lectura autorizada posterior retira exclusivamente la revisión confirmada, sin perder otra celda ni una edición más reciente. El refresco de la misma sección conserva la tabla y el foco. Generación/AbortController y scope descartan lecturas y operaciones tardías;401/403 retiran snapshots, metadatos y capturas privadas. El reintento vuelve a consultar los grupos autorizados cuando se perdió esa autoridad. Logout nativo retira la captura local y permite completar la salida sin una advertencia cancelable que retenga la pantalla privada.

Publicar queda bloqueado por capturas pendientes y vuelve a comprobarlas después de ask. Mientras el POST de publicación está enviado se deshabilita la captura; durante el guardado de una celda sigue permitida la edición. Si otra operación legítima publica, las capturas excluidas permanecen identificadas como locales y separadas de las notas oficiales. Si un retiro elimina un alumno del roster, su captura tampoco desaparece: conserva matrícula/evaluación/valor y ofrece descarte explícito por revisión con confirmación. Ninguno de esos casos habilita guardar una nota fuera del roster o modificar un acta publicada.

La revisión independiente detectó dos Important: selector perdido tras403 y captura huérfana después de retiro. Ambos se reprodujeron y corrigieron; la segunda revisión fue aprobada, sin Critical/Important pendientes, antes del commit local.

## Verificación final de la composición

PostgreSQL sintético exclusivo `siii_gradebook_test` en127.0.0.1:55439, migraciones existentes0000–0024, Chromium real sobre build de producción y HTTP3204. Sin mocks de auth/scores/backend, sesiones insertadas ni acceso productivo. Los bloqueos de auditoría/componentes se producen en PostgreSQL real y siempre se liberan en finally. Los logins de cada caso aíslan auth_throttle en esta base de pruebas, como las suites UI existentes; no se cambia el throttle del producto.

| Gate ejecutado sobre809c526d + este diff | Resultado real |
|---|---|
| npm run lint | Exit0, sin errores ni advertencias |
| npm run typecheck | Exit0 |
| npm test |826/826,56 archivos |
| Build exclusivo dentro del globalSetup UI original | Aprobado; compartido103kB, grading115kB; sin benchmark de rendimiento |
| npm run test:ui -- --config .p0-local/gradebook.playwright.config.ts --output .p0-local/ux01-composed-green-results |15/15 Chromium,2.5min incluyendo build |
| Axe sobre el área poblada modificada |0 violaciones en claro1440 y oscuro390 |
| Teclado/foco | Tab a Guardar, Enter, edición durante guardado conserva foco, cancelación de enlaces restaura foco; diálogos nativos de recarga/cierre cancelados y recarga confirmada |

Los15 casos comprueban: las tres regresiones originales; edición durante confirmación; bloqueo de inputs durante publicación con lock real y finales oficiales800; publicación externa con captura recuperable; links cancelados/confirmados; recarga/cierre; dos secciones con GET anterior bloqueado y descartado; revocación403; logout/API auth401 y grading403 reales; refresh403 y recuperación del selector; salida nativa real; retiro mediante segundo administrador con login+MFA, audit enrollment.withdraw y descarte cancelado/confirmado; matriz poblada/axe/teclado. Se verifica en DB que sólo se persiste la celda enviada y que los valores locales excluidos no se convierten en notas oficiales.

El contrato actual del grading devuelve403 también cuando falta identidad; el401 real se acredita en auth/me después de logout. No se fabricó un401 de grading ni se cambió el contrato servidor. No se ejecutó una suite global de integraciones en este incremento de UI; los15 flujos sí consumen endpoints y DB reales.

Las iteraciones intermedias quedan conservadas: una espera de page.reload después de cancelar beforeunload agotó el timeout; el disparador se cambió a location.reload real, manteniendo las aserciones de cancelación y datos. Otra ronda terminó13/14 por429 de login del entorno compartido antes de aislar auth_throttle por caso. Los intentos de inspección durante navegación nativa quedaron como diagnósticos y no se cuentan como pruebas funcionales de borrado previo al303. La prueba final de logout acredita destino login, ausencia de advertencia cancelable, ausencia de tabla y auth/me401.

Artefactos locales conservados, sin sobrescribir los RED originales:

- `.p0-local/ux01-withdrawal-red-results/`: retiro real con captura invisible antes de corregir el Important.
- `.p0-local/ux01-external-publication-red-results/`: publicación externa con pérdida local sobre el bundle original.
- `.p0-local/ux01-recovery-red-results/` y `ux01-logout-final-red-results/`: reproducción de recuperación y salida; sus intentos diagnósticos anteriores permanecen aparte.
- `.p0-local/ux01-reviewed-fifteen-green-results.json`:15/15 antes de reconciliar809; `.p0-local/ux01-composed-green-results/` y `ux01-results.json`:15/15 de composición final, screenshots/JSON/traces.
- `.p0-local/ux-matrix-gradebook-drafts-light-desktop.png` y `ux-matrix-gradebook-drafts-dark-390.png`: dos alumnos, nota persistida9.10 y borrador8.70, foco visible. Inspeccionadas visualmente; usan el prefijo de artifacts ya existente, sin modificar workflow.

## Límites y estado

UX-01 PARCIAL: el guard local cubre enlaces internos activados normalmente y beforeunload nativo para recarga/cierre mientras hay capturas. No intercepta Atrás/Adelante de SPA ni toda navegación programática; no parchea router/history ni instala un almacén global. Confirmar salida o recarga descarta la memoria local; no hay persistencia entre recargas, dispositivos o sesiones. Lector de pantalla y zoom manual no están certificados; axe y capturas no sustituyen esas revisiones. No se afirma accesibilidad global ni cierre de toda la auditoría UX-01.

Revisión y gates locales aprobados; commit local autorizado, sin push/PR/merge/despliegue ni operaciones productivas. El servidor3204 terminó con el teardown original y PostgreSQL compartido sigue activo.

## Reconciliación con maina1 — 22 octubre2026

Se incorpora por merge normal maina1c6e8c4117a477c2d0d75f5233e7f96870a9f80 (#87, árbol66ffac0c) sobre040a3bc4, conservando ambas historias. El único conflicto fue el apéndice de ingeniería: se retuvieron íntegros sus77 originales, la nota UX-01 y la nota de contraste de main. OPERATION_MATRIX conserva sus filas y evidencia previas. TeacherGradebook, su hook y `gradebook-drafts.spec.ts` permanecen idénticos a040a3bc4; el CSS y las ocho pruebas de contraste entrantes coinciden con maina1, sin modificaciones adicionales.

Verificación nueva de esta composición, sobre la misma base sintética `siii_gradebook_test`55439 y servidor exclusivo3204: lint/typecheck Exit0,826/826 unitarias en56 archivos y build producción aprobado. La configuración ignorada `.p0-local/gradebook-a1.playwright.config.ts` importa la anterior y selecciona las dos suites existentes:23/23 casos aprobados en2.1min incluyendo build, compuestos por15 UI reales de calificaciones y8 de contraste (4 pestaña/tema durante14RAF +4 monograma durante cuadro de entrada, incluido content-grid). No se modificó el harness original ni se añadieron mocks o migraciones. Evidencia separada en `.p0-local/ux01-a1-results.json` y `ux01-a1-results/`, con traces y capturas.

Las dos fotografías pobladas previas se preservaron en `.p0-local/ux01-pre-a1-captures/`. Se repitió su método original, sin cambiar scroll/foco ni aplicar la estabilización QAe927. La observación del coordinador de topbar/aside a mitad del fullPage es compatible con focus/input auto-scroll previo; no acredita un fallo CSS persistente. Normalizar scroll0 sin perder foco y separar una captura de foco, si corresponde, queda para después de integrar85 y reconciliar el QA separado. Lector de pantalla/zoom manual y los límites SPA de UX-01 siguen sin certificar.

Según coordinación, #87 tuvo ambos Actions826/485/88UI y Vercel verdes; su postmerge39821829240 estaba en curso al comunicarse. Estos datos no acreditan CI del nuevo commit de composición ni disponibilidad productiva. La prueba MFA/logout def927/31cb se valida en otra rama y todavía no se incorpora aquí; debe integrarse antes de la reconciliación final de tests/docs y CI. QAe927 permanece intacto en admissions-write-authority. Este incremento sólo reconcilia main y añade evidencia por append; sin push, PR nuevo, despliegue ni operaciones productivas. El teardown liberó3204 y conservó PostgreSQL compartido.
