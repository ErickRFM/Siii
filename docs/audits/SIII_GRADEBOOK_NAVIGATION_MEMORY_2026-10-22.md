# UX-01 parcial: memoria privada durante navegación del dashboard

Implementación local en fix/gradebook-navigation-memory-20261022 desde 4ad4d326. El incremento base de capturas de #85 fue reconciliado funcionalmente como #92 y después #94 según coordinación; esta rama añade exclusivamente continuidad de memoria y no publica ni duplica esos PR. No se declara integración en main ni disponibilidad productiva.

## Cambio y autoridad

El Map original de capturas y su revisión monotónica vive ahora en GradebookDraftsProvider dentro de SiiAppShell, antes del subtree de capacidades identificado por institución. El layout aporta exclusivamente actorId público; la vida del proveedor separa actores. Cada captura conserva institución/sección/estudiante/componente y sólo su valor local/etiqueta/revisión; roster, componentes, puntuaciones oficiales y snapshots continúan en TeacherGradebook y se consultan de nuevo.

Atrás/Adelante SPA, Ctrl+K Enter y cambio de institución conservan la captura sin interceptar router/history ni escribir localStorage. Al volver se exige auth/me real del actor y después secciones/snapshot autorizados. Pathname, focus, visibility y assurance invalidan la vista; los datos privados permanecen ocultos durante la comprobación. Un step-up válido conserva la revisión. El foco de celda se restaura sólo tras snapshot vigente y si el usuario no eligió otro control.

Logout propio,401 y actor distinto purgan la memoria del actor;403 retira el contexto institucional. La reconciliación de grupos elimina capturas de secciones que ya no están autorizadas. Generaciones/abort y epoch de vista impiden aplicar lecturas/notices tardíos. El éxito HTTP200 de un guardado reconoce exclusivamente la revisión enviada en su proveedor original aun al salir durante POST o su GET posterior. El contador no se reutiliza tras purgas; una respuesta del proveedor desmontado no alcanza el nuevo proveedor tras logout/relogin. Editar después del envío conserva la revisión nueva. Un403 de POST tardío también retira el contexto original.

Se conservan los contratos/endpoints/MFA del servidor, revisión previa a publicación, actas publicadas inmutables, capturas excluidas de acta/roster y descarte confirmado. beforeunload permanece activo desde otras vistas del dashboard; el aviso de links internos explica la memoria temporal.

## Dependencias y coste observado

Dirección runtime: SiiAppShell importa GradebookDraftsProvider; el módulo de memoria sólo importa React, Next/navigation y assurance-events. ConfirmationOptions es import type. No importa TeacherGradebook ni el shell, no hay ciclo runtime ni envío de roster/snapshots al shell.

La comprobación auth/me ocurre en el montaje/cambio de pathname y en focus/visibility/assurance aun con Map vacío y fuera del libro; online sólo consulta cuando identidad no está verificada. Es tráfico adicional real del dashboard; no se deduplica por hipótesis. El build original registra grading9.19kB/FirstLoad115kB y el final6.28kB/118kB, compartido103kB en ambos: parte del código pasa al shell persistente. Estas cifras no acreditan optimización ni benchmark de latencia.

## TDD real y evidencia conservada

DB exclusiva sintética siii_gradebook_navigation_test en localhost55439, migraciones existentes0000..0024; HTTP3210, fixture docente con MFA real y actores únicos. El harness UI original construye Next15.5.28 en producción. No se modifican backend, F2, SQL, schema, contratos, CSS, timeouts, retries ni política de throttle.

| Negativo/control | Evidencia anterior al arreglo correspondiente |
|---|---|
| Ctrl+K y aviso al recargar fuera de grading | navigation-red.log: captura8.32 vacía y sin beforeunload. El fallo adicional de history por espera insuficiente del helper no se cuenta como RED funcional |
| Atrás/Adelante con helper que espera URL real | navigation-back-red.log: esperado8.21, recibido vacío contra producto4ad intacto |
| POST comprometido y entrega200 retenida tras abandonar vista | navigation-delivery-red.log: DB750 antes del release, revisión seguía pendiente; control con edición posterior6.25 y frontera logout/relogin6.39 pasaron |
| Navegación después del POST200 mientras GET snapshot está retenido; assurance válido en misma URL | navigation-ack-windows-red.log: ambos guardados comprometidos seguían pendientes |
| Focus tras invalidación autorizada | navigation-focus-signal-red.log: valor8.68 presente, foco perdido antes del arreglo |
|403 real entregado fuera de grading | navigation-late-denial-red.log: captura8.91 reaparecía tras restaurar autoridad |

La retención usa route.fetch/fulfill con status/body/SQL reales: sólo se retrasa la entrega. Se comprueba DB750 antes de liberar cada guardado exitoso. No se fabrica respuesta ni autorización. Lecturas privadas/revalidación pendiente usan locks reales en tablas de la DB propia.

Intentos fallidos conservados: lock de auditoría durante POST bloqueó también SSR e impidió navegar; no se cuenta como RED de navegación. Un intento posterior tuvo error de sintaxis del propio test. bringToFront/CDP no generaron la notificación esperada en Chromium headless: instrumentación fallida, no defecto de producto. Playwright fuerza focus emulation por página; el caso definitivo entrega explícitamente FocusEvent después de cambiar de pestaña y verifica los GET reales y el foco DOM. No acredita foco físico del sistema operativo.

Primera suite ampliada25:23 pasaron y2 fallaron. Uno descubrió que revalidar automáticamente al volver online desmontaba el botón de recuperación403; el producto ahora revalida online sólo cuando identidad no está verificada. El otro detectó falta de espera del cambio de institución en el helper; se espera URL y link reales sin aumentar plazos. Primera unitaria:825/826 por timeout5000ms del subproceso migration-safety; se conserva navigation-unit.log, sin atribuir causalidad a CPU ni modificar plazos. Repetición aislada de ese archivo5/5 y completa826/826 aprobadas secuencialmente.

## Verificación final

| Gate final secuencial | Resultado observado | Evidencia local ignorada |
|---|---|---|
| npm run lint | exit0 | navigation-final-lint.log |
| npm run typecheck | exit0 | navigation-final-types.log |
| npx vitest run tests/unit/migration-safety.test.ts |5/5, exit0 | navigation-migration-isolated.log |
| npm test |56 archivos,826/826, exit0 | navigation-final-unit.log |
| npm run test:ui -- --config .p0-local/gradebook-navigation-final.config.ts |33/33, exit0;15 previas+18 nuevas,10.2m observado | navigation-final-green.log; JSON .p0-local/.p0-local/navigation-final-green-results.json |
| Build original globalSetup UI | Next15.5.28, compilación13.3s,31/31 páginas, continuó a33UI verdes | navigation-final-green.log |
| Axe poblado/teclado |2 análisis .sii-academic sin violaciones, claro1440/oscuro390 | caso populated drafts retain focus… y2PNG ux-matrix-gradebook-drafts-* |
| git diff --check |exit0 tras corregir2EOF vacíos | revisión local final |

La ejecución final se realizó secuencialmente después del aviso del coordinador de fin de gates pesados ajenos; no se atribuye el timeout anterior a CPU. Duraciones observadas no constituyen benchmark. La lectura inicial del JSON buscó por error fuera del directorio de config; la ruta anidada del reporter se verificó y conserva el resultado33/33. No hubo cambio de producto después de este bundle salvo dos líneas vacías finales.

Los logs, resultadosJSON, traces y capturas quedan en .p0-local, ignorado. Las capturas pobladas claro1440 y oscuro390 fueron inspeccionadas: mantienen notas/pendiente/foco; no se certifica estabilidad de la fotografía fullPage ni se amplía a auditoría estética. Axe conserva las reglas y alcance .sii-academic originales.

## Revisión y límites

Revisión independiente de fuente por review_mfa_metadata_wait: Important de ACK durante POST/GET/assurance cerrado; sin Critical/Important/Minor funcionales nuevos. Señaló dos EOF vacíos, eliminados; git diff --check exit0. El revisor no ejecutó estos gates ni DB.

UX-01 permanece PARCIAL. Memoria se pierde al recargar/cerrar/desmontar dashboard y no representa persistencia ni guardado oficial. No hay API pública de bloqueo de navegación Next empleada; la continuidad sólo dura la vida del shell. No se promete detectar generación de sesión ni logout en otra pestaña sin rechazo observado. Revalidación exige red; los borradores quedan ocultos durante fallo de consulta. No se certifican lector de pantalla/zoom manual ni seguridad global del módulo. El beforeEach heredado limpia auth_throttle exclusivamente en esta DB sintética; no se añadió limpieza y los resultados no prueban resistencia a throttle. No hay datos reales, sincronización, producción, push/PR/merge ni CI remoto del incremento. Reconciliación con el PR base integrado y gates del SHA final corresponden a coordinación.


## Composición única del PR94 sobre main4614 (22 octubre2026)

El PR94 remoto3c7bc10f conserva exactamente los tres archivos base hook/libro/spec del padre4ad4d326 probado; se verificó igualdad byte a byte antes de resolver los commits equivalentes de #85/#92. El merge normal7bb136be integra f85370f sin reimplementar capturas; c4a452c7 incorpora main4614/PR99. Los cinco archivos de producto/UI (layout,shell,memoria,libro,spec) son exactamente los de f85370f que pasó33/33UI,826unitarias,lint/tipos/build y2Axe; el workflow es exactamente main4614. No se atribuye una repetición de esas suites a la composición de historial.

Se conservaron íntegros el prefijo de auditoría de main y cada sección de la rama local; el reporte base de #94 es prefijo intacto del consolidado. La actualización corresponde al mismo PR94 mediante fast-forward de su rama pública, sin force-push ni PR paralelo. El CI completo del nuevo SHA publicado y revisión de composición son gates pendientes antes del merge; las capturas históricas no representan regresión visual premium del futuro main. Se mantienen los límites de memoria, consultas adicionales y +3kB FirstLoad documentados arriba.
