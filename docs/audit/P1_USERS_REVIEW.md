# P1 — revisión de gestión de usuarios y recuperación (F06)

Base: 638307fdede9512a033d8dfe12d968c34fd108c7, rama dependiente codex/p1-user-management. La revisión independiente no ejecutó SQL, servidor, navegador ni pruebas y no leyó secretos.

## Revisión temprana de primitivas

Paquete SHA256 6C3B00D7B4569BBB0F99CC46E6E610FFBE15846E9F6F93A8922D20B188DD7ECB: extracción MFA, AES-GCM compartido, propósito/keyring separados de recuperación y namespace de idempotencia. Sin hallazgos accionables; compatibilidad de invitaciones y cuerpos originales de MFA conservados. Este dictamen no cubre handlers ni schema completos.

## Primera pasada integral de backend

Paquete SHA256 D4BD1B273DE74ECCAF72DCA10898C1DF9E244E023B5336CD024B034B65A0BF65. SQL0009 aplicada y congelada: A7CA5A54C19A7370248E753BDE04581CA48F24AC5E25AE0B12A10D73B825C099. Dos hallazgos P2 pendientes de comprobación de correcciones:

1. PATCH heredado cambia el estado y audita, pero el historial nuevo consulta solo membership_events. Debe registrar el mismo evento en la transacción y probar historial/rollback.
2. La divulgación evalúa users.restore con status active; la política exige suspended/inactive. Debe divulgarse con estado elegible y comprobarse con assurance vigente.

La prueba deleted+teacher esperaba una concesión revocada tras la baja. El contrato es filtro de perfil vigente: corregir la expectativa para mostrar el eliminado sin filtro de rol y excluirlo con el rol revocado. Se conserva liveGrant.

La revisión pidió ampliar pruebas de presupuestos concurrentes públicos/administrativos, reutilización TOTP/recovery entre login y reset, rollback completo del reset ante fallo de auditoría, lease vencido/reclamado y límite de intentos, aceptación de invitación para membresía eliminada y assurance administrativa tras espera. No identificó cruce de tenant, bypass MFA ni consumo múltiple en el paquete examinado. El test de integración cambió durante la revisión y deberá releerse con el siguiente paquete.

## Evidencia inicial de ejecución

El implementador reprodujo un error PostgreSQL22P02 de array interpolado con ANY; lo corrigió mediante inArray. La primera suite dirigida terminó20/20 en49,23s; se amplía antes de congelar backend. La suite unitaria inicial pasó605/605 y typecheck pasó. Estos resultados no sustituyen la QA final, Chromium, segunda revisión, CI o merge.

La UI y las correcciones siguen en ejecución. P0 y P1 permanecen abiertas; no se han enviado correos reales ni ejecutado cambios de producción.

Segunda pasada backend: ambos P2 corregidos y comprobados por revisión de paquete91F0E2742115E58A77CB0C8751CF3097B89389824D3B4DD581A94701973AE9BD, sin nuevos hallazgos materiales. Las ampliaciones cubren los seis grupos de pruebas solicitados. El implementador confirma33/33HTTP y62/62regresionesMFA/F08; la QA global y revisión UI aún siguen pendientes. SQL0009 mantiene A7CA5A54C19A7370248E753BDE04581CA48F24AC5E25AE0B12A10D73B825C099.

## Revisión UI y compatibilidad final

Primera revisión UI sin hallazgos P1/P2; paquete final 7BA3838426BC098DBE6B8446CA2DB5D328E5B065B736A4B4EC8DC86FBE0425B2 favorable tras comprobar etiquetas accesibles y prueba de selección concurrente A→B. Evidencia dirigida: 7/7 Chromium; bootstrap de reset separado, token solo en memoria y generaciones de respuesta verificadas.

La primera QA global detectó cinco regresiones de contrato F07: ante pérdida de autoridad durante listado se devolvía 403 en vez de 200 con lista vacía. Se corrigió únicamente la salida del control final de listUsers, conservando visibilidad SQL, revalidación, descarte de DTO/cursor y no-store. Preflight y detalle conservan 403. Los tests existentes no cambiaron. Revisión independiente favorable de esa diferencia; handler SHA256 0274254ADFA461EBD1548061AF19A6383EE43C6B79E9C91A91FF32CB137D310B. Regresión dirigida F07/F06: 60/60.

Repetición global posterior: typecheck y lint verdes, 678/678 unitarias y 216/216 integraciones, migrador repetido sin drift. La etapa final de Chromium/build/audit sigue en ejecución; CI y merge aún pendientes. No cambia la condición abierta de P0/P1.
## QA global final del ejecutor principal

Sobre la fuente final revisada: npm ci, typecheck y lint con salida0; 678/678 unitarias; migrador real repetido MIGRATIONS_APPLIED; 216/216 integraciones (270,73s); 32/32 Chromium (4,5min); build, npm audit (0 vulnerabilidades) y diff-check con salida0. Dos bloques temporales de ejecución liberados. No cambió la fuente tras estas comprobaciones. Revisiones independientes backend/UI y corrección final de compatibilidad favorables; CI del commit y merge pendientes. Resultado consolidado: P1_USERS_REPORT.md. Se mantienen las puertas de BLOCKERS.md, entrega externa de correo y validación humana pendientes.