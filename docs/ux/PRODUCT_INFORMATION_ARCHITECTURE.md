# Siii — Arquitectura UX/UI basada en operaciones académicas

## Principio
Un usuario visualiza exclusivamente instituciones a las que pertenece. Navegación dependiente de `auth/me` y grants verificados en el servidor; el menú oculto nunca constituye autorización.

## Roles y espacios
- Administración: instituciones, sesiones, membresías, auditoría, políticas.
- Control escolar: expediente, matrícula, inscripciones, bajas y documentos.
- Coordinación: materias, secciones, docentes, aulas, recurrencias y colisiones.
- Docente: grupos propios, listas, evaluación, actas y revisión.
- Estudiante: horario, trayectoria, calificaciones oficiales y solicitudes.
- Tutor académico: casos y estudiantes expresamente asignados.
- Tallerista: sesiones y participantes dentro de grant temporal.

## Patrones de referencia
- Banner / openSIS: procesos escolares y expedientes completos.
- UniTime: programación académica, conflictos y recursos.
- Workday Student: tareas y decisiones contextualizadas.
- SIIAU / SIAE: historial, créditos y documentos académicos mexicanos.
- Frappe Education: formularios basados en dependencias académicas.
No copiar diseños ni logotipos protegidos.

## Secuencias de alta criticidad
- Inscripción: búsqueda -> prerrequisitos y cupos -> previsualización -> transacción -> comprobante.
- Horario: seleccionar grupo -> verificar aula, docente y alumnos -> resolver conflicto -> publicar -> delta sync.
- Calificación: borrador -> validación -> previsualizar acta -> publicación oficial -> versión y auditoría.
- Identidad: inicio de sesión -> seleccionar institución explícita -> permisos de rol -> operación.

## Biblioteca recomendada
`InstitutionContextSwitcher`, `AcademicDataTable`, `StudentRecordWorkspace`, `AcademicScheduleGrid`, `ConflictResolutionPanel`, `GradebookGrid`, `OperationReview`, `AuditTimeline`, `IntegrationHealth`, `ImportWizard`.

## Visualidad
Institucional contemporánea: fondo gris cálido, superficies claras, azul profundo, estados semánticos no dependientes solo de color. Optimización desktop-first administrativa, responsive real; WCAG 2.2 AA como objetivo. Evitar glassmorphism sobre tablas densas. Etiquetas de estados honestas: módulos sin backend muestran "En preparación", jamás datos falsos.

## Condición de habilitación
Ningún botón de alta, baja, publicación o sincronización se activa sin endpoint real, scope validado y prueba de flujo. No exponer acceso directo del navegador a tablas institucionales o secretos Supabase.
