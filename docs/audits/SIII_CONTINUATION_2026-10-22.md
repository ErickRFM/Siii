# Continuación de ingeniería — 22 octubre 2026

Actualización acotada de los PR y sus consumidores. Se conserva íntegra `SIII_ENGINEERING_AUDIT_2026-10-21.md`; no se repite la auditoría general ni se promueven los resultados históricos a evidencia del nuevo código.

## Integración y gates observados

- `main` remoto sigue en `f75d488288af068fa0f20461598b7ddef934d545`. No se fusionó ningún PR en esta continuación.
- PR79, `68feeacdafb86da42951e2ca060dbb8a988238fa`: ambos jobs Verify SIS terminaron SUCCESS ([39728597733](https://github.com/ErickRFM/Siii/actions/runs/39728597733), [39728573816](https://github.com/ErickRFM/Siii/actions/runs/39728573816)). Tiene revisión independiente sin hallazgos críticos/importantes; no existe aprobación formal de GitHub. El status separado Vercel sigue FAILURE por `build-rate-limit`. No se considera elegible para merge con esa verificación fallida.
- PR75, SHA anterior `6393806ed494fdb54648004aee0cab601922b1eb`: integración PostgreSQL aprobó en CI, pero ambos jobs fallaron en accesibilidad UI ([39729087125](https://github.com/ErickRFM/Siii/actions/runs/39729087125), [39729091800](https://github.com/ErickRFM/Siii/actions/runs/39729091800)). No se ocultó ni se desactivó el gate.
- Causa reproducida: el kit de `main` cambia el texto de la pestaña a `#f090ae` antes de terminar la interpolación del fondo claro `#fcecf0`; axe observó contraste1.97, mínimo4.5. Es anterior a los guards de SEC-02.
- PR81, `35388c93d7e24447bcd6d64e51592f6166ec8faa`, corrige un selector en la regla existente de colores atómicos. Cuatro casos determinísticos fallaron antes y aprobaron después (dos anchos y ambas direcciones; mismo instante+14frames, sin sleeps). Lint, tipos,813unitarias y build aprobados en su worktree. Revisión independiente sin hallazgos críticos/importantes; no acredita interacción por teclado ni toda la regresión premium.
- Se incorporó **el mismo commit** de PR81 a la rama75 mediante merge normal `5511f0dbda3569eddb47ff9eb7a1277cf2ace38d`; no se duplicó su implementación ni se fusionó en main. PR81 está apilado sobre79. Después de resolver todos los gates e integrar79, retarget81/main e integrar solo si sigue verificado; entonces retarget75/main, revisar el diff restante y repetir gates antes de fusionarlo.

## Regresión local de la composición75

Base PostgreSQL sintética nueva `siii_sec02_test`, exclusivamente127.0.0.1:55439, migraciones0000–0023. No comparte la migración alternativa0024 ni el clúster de la otra tarea. Preflight de solo lectura:12tablas requeridas presentes, ledger Drizzle presente, sin grants directos Data API y sin ledger Supabase mezclado. No es preflight productivo.

`sensitive-institutional-lists-http.test.ts`: **27/27** por HTTP real en puerto3197; cubre roles, MFA, tenant, revocación, suspensión y SSR. Lint y813unitarias aprobaron. Al volver de otra rama había tipos generados de rutas ya ausentes; la primera comprobación de tipos no cuenta como aprobada. Un build solapado accidentalmente con Next dev falló por salida compartida `.next`; se descarta y se repite en exclusiva, sin cambiar código ni relajar tests. Build/tipos finales y regresión UI completa siguen pendientes al escribir este registro; su resultado se añadirá a la evidencia del PR.

La corrida anterior de Admisiones contra3107 se descarta: otro worktree ocupaba el puerto y el setup aceptó su health aunque su nuevo servidor falló EADDRINUSE. En adelante se usa3197 con verificación del listener y configuración explícita. No se detuvo el servidor de la otra tarea. El endurecimiento del handshake de pertenencia del servidor de test queda como seguimiento de herramientas; no se mezcla con SEC-02.

## SEC-01/SEC-05: una sola implementación

Durante esta continuación apareció PR80 de la tarea «Completar integración de Siii». El usuario autorizó expresamente la coordinación entre tareas. Se detuvo el incremento alternativo local y se preservó **sin publicar** en `archive/applicant-email-proof-20261021@680d3776`; su migración0024 no debe integrarse ni ejecutarse sobre el esquema de PR80.

La alternativa aporta negativos de ausencia de token público, caducidad, perfil ajeno, replay concurrente, generaciones, reclamación legacy, presupuestos, rollback de auditoría y fencing. Evidencia propia:18/18HTTP/DB en3197 y838/838unitarias; un primer intento unitario tuvo timeout de5s en el proceso del gate de migraciones, y la repetición completa aprobó sin modificar el gate. No se ejecutaron su build ni Playwright final. Es evidencia de reconciliación, **no validación de PR80**.

Revisión solo lectura de PR80 `08013e9dd68af4badc6b8fb4bf7da750f57c4fc7`: no se demostró takeover ni bypass de titularidad. Token+contraseña anterior impiden que el registrante ajeno active el perfil, pero bloquean la reclamación legítima del dueño del buzón. El autor confirmó que corregirá ese caso con reenvío por email, contraseña nueva elegida desde el enlace y revocación. Debe limitarse a perfiles sin prueba auténtica; nunca convertirlo en reset que evada MFA. Habrá que repetir revisión/tests sobre su SHA final y reconciliar `admissions.manage` con los guards de75. No hay dos escritores activos de F2 desde esta tarea.

## Límites y orden restante

Vercel por cuota y los checks pendientes impiden integrar. SEC-01/05 continúan en80; SEC-03/04/06, UX-01 y revocación/reconciliación Compañero conservan su estado abierto. No se ejecutaron migraciones productivas, envíos reales de correo, despliegues ni habilitación de sincronización. La regresión visual completa sobre un SHA finalmente integrado sigue pendiente; cuatro casos de contraste no la sustituyen.
