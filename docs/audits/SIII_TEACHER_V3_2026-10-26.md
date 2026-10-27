# SIII V3 — Portal docente y rectificaciones configurables

## Base y alcance
- SHA inicial remoto: `7359662a7c042ce8b79e8e60715601c3cd187248` (`main`, PR #117). Verificado nuevamente durante la ejecución.
- Rama: `codex/siii-docente-v3-20261026`, worktree aislado. El checkout original de solicitudes estudiantiles se conserva sin incorporar sus cambios.
- La política de rectificación procede de la instrucción explícita del usuario en esta conversación. **Es una propuesta configurable; no acredita aprobación oficial de UPTlax.**

## Inventario y clasificación
| Módulo | Infraestructura previa | Entrega | Clasificación de alcance |
|---|---|---|---|
| Identidad/vínculo docente | teacher_account_links, institutional_teachers, sesión y capacidades | Reutilizados; consulta de número de empleado y datos institucionales | Implementado y validado local; CI final pendiente |
| Grupos propios | portal/teacher/groups, section_teachers, paginación y relación viva | Inicio, filtros por periodo/estado/materia, contador real y estado de captura | Implementado y validado local; CI final pendiente |
| Lista oficial | roster autorizado del gradebook | Vista de consulta mínima, sin edición de inscripciones ni exportación no autorizada | Implementado y validado local; CI final pendiente |
| Evaluación | Componentes ponderados, scores con revisión exacta, auditoría | Formularios adaptables por alumno, persistencia confirmada, revisión ponderada, cierre transaccional | Implementado y validado local; CI final pendiente |
| Publicación/resultados | grade_publications y final_grades | Resultados finales separados de captura, versiones e identidad de publicación | Implementado y validado local; CI final pendiente |
| Acta certificada/documentos | No se encontró emisor documental docente | Consulta institucional; no se genera un PDF pretendidamente certificado | Parcial; certificación institucional pendiente |
| Rectificación | No había procedimiento | Solicitud, evidencia privada, revisión, resolución, aplicación separada, devolución auditada a borrador | Infraestructura implementada; activación real bloqueada por configuración |
| Perfil editable/trámites/tutorías | Sin contratos docentes autorizados de autoservicio | Perfil de consulta y seguridad; sin acciones fabricadas | No implementado: requiere contratos y asignaciones institucionales |
| Horario personal docente | Presentación combinada alumno/docente | Retirado de presentación y solicitudes de datos docentes | Eliminación implementada |
| Compañero | Contratos, horarios institucionales y servicios existentes | Se conservan; no se toca QR, asistencia ni sesiones operativas | Integración existente preservada; no se certifica E2E externo nuevo |

El grupo no tiene un programa institucional propio en el contrato actual. No se infiere a partir del programa de sus alumnos ni se inventa un filtro de programa.

## API y datos
- `GET grading`: ampliación compatible con `section` y `results` publicados; mantiene `components/scores/publications/roster`.
- `POST grading`: verifica sección abierta y periodo activo bajo locks; los periodos inactivos permiten consulta y rechazan escrituras/publicación con `GRADE_PERIOD_CLOSED`.
- Grupos personales: agregados reales de componentes, ponderaciones y capturas de alumnos inscritos.
- `GET/POST grading/corrections`: lista paginada, detalle, fuente oficial y comandos validados. `DRAFT → SUBMITTED → IN_REVIEW → APPROVED / REJECTED → APPLIED`. La devolución auditada a `DRAFT` invalida aprobación/revisión y exige un nuevo ciclo.
- `GET/POST grading/corrections/:id/evidence`: evidencia privada, PDF/PNG/JPEG validado por firma, máximo 2 MiB, lectura autorizada con auditoría, descarga attachment/no-store/nosniff/CSP sandbox.
- Migración aditiva `0026_grade_corrections`: solicitudes con revisión optimista, unicidad de solicitud activa, evidencia e historial inmutables para siii_app; FK compuestas y RLS forzada, sin permisos anon/authenticated.
- La aplicación crea una nueva publicación y copia los resultados efectivos de los demás alumnos. Nunca actualiza una nota final anterior ni modifica documentos ya emitidos.

## Autoridad y configuración
La bandera `SIII_GRADE_CORRECTIONS_ENABLED` es `false` por defecto. La nueva UI muestra preparación hasta activación. El código puede desplegarse con la bandera ausente sin consultar tablas nuevas.

`SIII_GRADE_CORRECTION_POLICIES` es JSON **sólo servidor**, indexado por UUID de institución. Cada política requiere `reference` y listas explícitas de roles institucionales vigentes: `reviewerRoles`, `approverRoles`, `executorRoles`, `closedAuthorityRoles`. Sólo se admiten roles institucionales existentes: Control Escolar, coordinación, admin o super_admin; **ninguno recibe esta autoridad automáticamente**. Los ámbitos de programa/campus se deniegan porque el grupo no dispone de esa relación inequívoca.

Valores conservadores por defecto: `approved:false`, `requireEvidence:true`, `allowExecution:false`, `allowClosedRequests:false`, `allowClosedExecution:false`; listas vacías. La resolución exige `approved:true`; ejecutar requiere además `allowExecution:true`. Un periodo cerrado requiere habilitación extraordinaria, aprobación explícita y autoridad adicional tanto al resolver como al ejecutar. El solicitante nunca aprueba o ejecuta su propio cambio. Resolución, devolución y aplicación exigen MFA/step-up vigente.

Los fixtures configuran autoridades sólo dentro del servidor local de pruebas. No se copian a Vercel.

## Migración y reversa
Se ensayó 0026 en una base sintética poblada después de 0025 y la cadena completa en otra base local vacía. No se ejecutó una migración productiva.

Antes de activar institucionalmente: el responsable debe aprobar la política y autoridades, preparar respaldo/ventana de migración y aplicar el procedimiento de cambio de esquema del proyecto. AGENTS prohíbe ejecutar `db:migrate` contra producción desde esta tarea. Para revertir aplicación, desactivar la bandera y volver al bundle anterior conservando tablas, publicaciones y evidencias; no destruir el historial para hacer rollback.

## Verificación en curso
- Baseline: 926 unitarias.
- Incremento: 931 unitarias y lint sin errores.
- Contratos combinados finales docente/estudiante/solicitudes/rectificación: 43/43 HTTP reales.
- Recuperación, contexto de lectura y reglas extraordinarias: 16 HTTP de rectificación (incluye aprobación obsoleta devuelta a borrador y nuevo ciclo).
- Migración en base limpia: `MIGRATIONS_APPLIED`.
- `npm audit`: 0 vulnerabilidades.
- Integración integral local: 653 aprobadas y 35 omitidas; cinco expectativas históricas de total de migraciones/tablas detectadas y corregidas. Repetición PostgreSQL de ambos módulos: 45/45 aprobadas, conservando controles de datos, permisos, RLS, hash/perfil e idempotencia.
- Regresión UI focal: 54 escenarios aprobados y repetición final de los tres ajustados, 3/3 aprobados. Incluye recorrido completo de rectificación con MFA y actores distintos, captura no guardada, retiro real y ambos temas.
- Después de reconciliar: 29 escenarios UI aprobados y repetición del recorrido de ambos temas, 2/2 aprobados. Se desactivó la interpolación de color en las pestañas para conservar contraste durante el cambio de tema.
- Reconciliación: se incorporó `main@8d7cc7d6` (solicitudes estudiantiles, PR #118). Se conservaron ambos flujos y se resolvieron cuatro conflictos semánticamente. El CI del resultado combinado sigue siendo el gate final.

## Revisión independiente
Se corrigieron los casos detectados: capturas ocultas tras cierre; selección de otro grupo al solicitar uno no autorizado; aprobación obsoleta sin recuperación; envío de una solicitud con cambios visibles sin guardar. Los cuatro tienen regresiones aprobadas. Una prueba HTTP adicional reprodujo la revocación de asignación entre páginas: el contexto opaco ahora incluye vínculos, asignaciones, grants y política vigentes, comprobados antes y después de leer; el cliente descarta páginas de contextos diferentes. No se utiliza ese hash como autorización.

PR de entrega: [#119](https://github.com/ErickRFM/Siii/pull/119). El informe refleja la evidencia previa al gate final de CI; el cierre debe confirmar el SHA integrado y el despliegue.

## Producción e integración
Vercel confirmó producción READY en `7359662a` al auditar, antes de estos cambios. No hay variables de rectificación en preview/production (sólo se inspeccionaron nombres). El SHA final, PR, CI, merge y despliegue se completarán en el cierre verificable. No se utilizarán expedientes reales para las pruebas.

## Referencias funcionales
- [Oracle: Entering Grades Through Self-Service](https://docs.oracle.com/en/applications/peoplesoft/campus-solutions/9.2.039/campus-self-service/entering-grades-through-self-service.html): captura, revisión y acceso diferenciado a publicación.
- [Ellucian Banner Self-Service](https://www.ellucian.com/assets/emea-ap/brochure/emea-brochure-learn-more-about-ellucian-banner-self-service.pdf): listas y autoservicio académico.
- [Workday: Academic Records](https://doc.workday.com/workday-education/en-us/course-manuals/student-records-and-advising-for-administrators/academic-records.html): periodos de evaluación y reglas institucionales.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): grants y políticas se aplican conjuntamente. Se reutiliza el patrón backend privado del proyecto.
