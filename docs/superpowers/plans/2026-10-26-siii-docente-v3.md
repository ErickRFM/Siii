# Portal docente SIII V3 — Implementation Plan

**Goal:** portal institucional docente separado del alumno, sin agenda, conectado al libro existente.
**Architecture:** conservar contratos de identidad y consulta; proyección docente independiente; ampliar GET grading de forma aditiva con sección y resultados publicados; escrituras existentes con cierre transaccional.
**Tech Stack:** Next.js, React, Drizzle, PostgreSQL, Vitest y Playwright.
**Spec:** petición completa adjunta del usuario «PROMPT MAESTRO — SIII V3: PORTAL DOCENTE PREMIUM Y FUNCIONAL».

## Auditoría y diseño
Base remota: 7359662a7c042ce8b79e8e60715601c3cd187248. No había PR abierto según consulta del conector. Checkout original contiene cambios estudiantiles sin confirmar: preservar íntegramente.

| Superficie | Hallazgo | Gravedad | Decisión |
|---|---|---|---|
| Portal docente | Agenda personal y presentación combinada con estudiante | Alta | Componente independiente; Inicio, Grupos, Evaluaciones y Perfil |
| Listas | Solo recuento sin vista conectada desde portal | Alta | Vista oficial usando roster autorizado de grading |
| Evaluación | Concurrencia y borradores servidor ya presentes | Conservar | Reutilizar; resumen de persistencia, revisión ponderada y resultados oficiales |
| Cierre | Escrituras no comprueban estado de periodo/sección | Alta | Bloqueo dentro de transacción y lectura informativa |
| Actas | Publicaciones y notas finales existentes, sin emisor documental | Media | Historial versionado y resultados; no certificar PDF |
| Rectificaciones | Sin esquema, autoridad de aprobación ni contrato actual | Alta | Pendiente institucional explícito; no inventar procedimiento |
| Perfil/trámites/tutorías | Sin contratos docentes de autoservicio | Media | Perfil de consulta, sin acciones ficticias |

## Global Constraints
DENY BY DEFAULT; no asistencia ni QR; conservar infraestructura de horarios e integración; no modificar auth F2; no secretos; datos sintéticos locales; no migración productiva.

## Review Focus
- Cambios de institución/actor y respuestas tardías no reutilizan filas anteriores.
- Docente inactivo o desvinculado no obtiene lista ni notas.
- Cierre de periodo concurrente no permite guardar/publicar.
- Publicaciones muestran resultados finales, nunca capturas como notas oficiales.
- Cambios locales no desaparecen al navegar ni se publican sin guardar.

### Task 1: Contratos y cierre
- [ ] Añadir pruebas HTTP de resultados autorizados, campos mínimos, cierre y auditoría inalterada al denegar.
- [ ] Ejecutar RED; ampliar grading GET y bloquear escrituras bajo locks; ejecutar GREEN.
- [ ] Ampliar grupos con termStatus y datos agregados reales; conservar contratos de horarios.

### Task 2: Portal y gradebook
- [ ] Crear portal docente independiente con filtros por periodo/estado/materia, listas oficiales y perfil.
- [ ] Retirar presentación docente de personal-portal; mantener portal estudiante.
- [ ] Conectar evaluación con navegación interna lista/captura/resultados; revisión ponderada, estados y guardado confirmado.
- [ ] Añadir pruebas Playwright de navegación, privacidad, persistencia, estados y responsive/axe.

### Task 3: Validación y entrega
- [ ] Lint, typecheck, unit, integración completa, Playwright focal y regresión estudiante, build y audit.
- [ ] Revisión independiente, correcciones, commit y PR; verificar CI y no fusionar sin revisión aprobada.
- [ ] Actualizar matriz de operaciones e informe con SHA, límites y estado productivo real.

## Ampliación autorizada — Rectificaciones configurables
El usuario definió el procedimiento en esta conversación: BORRADOR → SOLICITADA → EN_REVISIÓN → APROBADA/RECHAZADA → APLICADA, con separación de solicitante y aprobador; autoridades configurables, evidencia privada cuando la política la exige y autorización adicional para periodos cerrados. Es una propuesta, no reglamento UPTlax aprobado.

### Task 4: Infraestructura segura de rectificación
- [ ] Migración aditiva 0026: solicitudes con revisión optimista, evidencia privada binaria limitada e historial; FK compuestas, índices de solicitud activa y RLS deny para Data API.
- [ ] Política servidor por institución en SIII_GRADE_CORRECTION_POLICIES; bandera SIII_GRADE_CORRECTIONS_ENABLED desactivada por defecto; sin autoridades predeterminadas ni aprobación automática por admin.
- [ ] API única de comandos y lecturas, evidencia privada; transacciones con locks institucionales/sección/periodo, MFA y step-up para resolución/aplicación; fuente versionada, ejecución separada e idempotencia.
- [ ] Formularios docentes y bandeja institucional de revisión/resolución, historial de estados e identificación de actores; ejecución bloqueada salvo política aprobada explícita.
- [ ] Pruebas de roles, autoaprobación, tenant, evidencia/tamaño/tipo, rechazo, fuente obsoleta, cierre, aplicación y duplicados; UI y migraciones en base limpia y baseline.
- [ ] Producción mantiene funciones nuevas apagadas hasta migración y aprobación institucional. No ejecutar db:migrate en producción.
