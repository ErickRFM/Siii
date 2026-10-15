# F06 — UI de usuarios y recuperación: evidencia local

Fecha: 2026-10-15. Rama dependiente: codex/p1-user-management; base reconciliada 04c448b5. Estado: implementación UI lista para revisión y QA global; no se declara F06 ni P1 completo.

## Comportamiento implementado

- Usuarios por membresía: búsqueda, filtros de estado/perfil vigente y paginación del servidor; identidad global de solo lectura, perfil institucional editable y acciones divulgadas por backend.
- Suspensión, activación, baja lógica y rehabilitación con motivo y confirmación. La baja revoca concesiones; la rehabilitación no las restaura automáticamente. Historial institucional paginado y solicitud administrativa de recuperación al correo verificado del titular.
- La alta utiliza Invitaciones y las concesiones se administran en Roles y ámbitos. Navegación y resumen de institución muestran Usuarios mediante users.read.
- Recuperación pública: solicitud con respuesta genérica; contraseña elegida por el titular; TOTP/código de recuperación si el backend declara MFA. Completar no crea una sesión. El contacto institucional no sustituye al correo verificado de la cuenta.
- Bootstrap específico de reset, con nonce y beforeInteractive junto al bootstrap de invitaciones. Bearer en fragmento, retirado antes de inicializar Next, handoff consumible solo en memoria y ref; nunca se renderiza ni persiste. Reabrir otro enlace limpia contraseñas/pruebas anteriores. Las respuestas y decisiones quedan vinculadas al contexto/generación actuales.

## Verificación ejecutada

- Chromium: **7/7 GREEN, 1.7 minutos**, salida 0, usando PostgreSQL local sintético p1_users_test y LOGIN de aplicación restringido. Puerto 3107 liberado al terminar.
- Unitarias dirigidas: **16/16 GREEN** entre ambos bootstraps (9 reset y 7 invitación). Reset comenzó RED por módulo ausente; incluyen coexistencia de handoffs separados, captura inicial, reapertura, consumo único, duplicados/formato inválido y anchors accesibles.
- Typecheck y lint: salida 0 sobre fuente final.
- Primera corrida: 5/6 Chromium pasaron; el filtro tenía un nombre accesible que incorporaba las opciones del select. Se corrigieron aria-label de estado/perfil y se repitió el conjunto ampliado. No se aumentaron tiempos para ocultar el fallo.

Los siete flujos prueban persistencia del perfil, ciclo de vida e historial; preservación de identidad global y otra institución; revocación sin restauración implícita; filtros/cursores y coordinador sin acciones administrativas; solicitud a correo verificado con respuesta pública genérica; reset sin sesión automática y con login real; privacidad de history/storage/URLs y headers Flight reales; recuperación MFA consumida; respuesta manual antigua A tras abrir B; y selección de membresía A retardada seguida de edición persistida exclusivamente en B. Los enlaces se extraen del outbox cifrado real de las fixtures y solo se traduce su origen HTTPS conocido al servidor local.

Axe WCAG 2A/AA, 2.1 AA y 2.2 AA pasa en los puntos cubiertos; se verifican móvil, tema oscuro, errores asociados, foco, confirmaciones, desconexión y controles deshabilitados. Esto no sustituye la auditoría humana con lector de pantalla.

## Pendiente del cierre global

Revisión independiente, suite completa de regresiones y build/CI del root, integración conforme a las puertas de BLOCKERS y validación de entrega de correo en entorno configurado. No se enviaron correos externos ni se tocaron Supabase o producción. Sin commits/push desde este subtrabajo.

## QA global final del ejecutor principal

Sobre la fuente final revisada: npm ci, typecheck y lint con salida0; 678/678 unitarias; migrador real repetido MIGRATIONS_APPLIED; 216/216 integraciones (270,73s); 32/32 Chromium (4,5min); build, npm audit (0 vulnerabilidades) y diff-check con salida0. Dos bloques temporales de ejecución liberados. No cambió la fuente tras estas comprobaciones. Revisiones independientes backend/UI y corrección final de compatibilidad favorables; CI del commit y merge pendientes. Resultado consolidado: P1_USERS_REPORT.md. Se mantienen las puertas de BLOCKERS.md, entrega externa de correo y validación humana pendientes.