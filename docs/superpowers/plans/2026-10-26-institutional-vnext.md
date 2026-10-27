# SIII VNext: integración institucional

> Ejecución nativa, continua, autorizada por el encargo integral del 26 de octubre. Base: `origin/main@19df36d5a2af621d4084c1104f956d6b11b0c16e`. El PR #115 de invitaciones conserva su rama y alcance; reconciliarlo si cambia main.

## Diseño y dependencias

Reutilizar el modelo actual: membresía → vínculo estudiantil/docente → matrícula/sección → horarios/publicaciones y órdenes/transacciones. La falta principal es la consulta personal integrada y el registro transaccional de abonos; no requiere recrear identidades ni migrar tablas existentes. Las capacidades nuevas de autoservicio no conceden administración.

Toda consulta personal debe validar autoridad vigente en el mismo SQL que los datos: sesión, membresía, institución, grant, ámbito y vínculo no revocado. No aceptar studentId/teacherId desde el navegador. Calificaciones: solamente final_grades con publicación, última versión del alumno en cada sección; nunca assessment_scores ni desaparición de notas de alumnos ajenos a una publicación posterior. Docentes de un alumno: nombre institucional y asignación, sin email/teléfono. No inferir semestre, promedio oficial o aprobación si no existe reglamento. Listas con cursor determinista, sin topes silenciosos. Respuestas privadas no-store.

Caja conserva `institutions.manage` como autoridad vigente (no crear rol Caja sin definición institucional). Registrar efectivo/transferencia externa con operationId, bloqueo de orden, clave única existente, comprobación de saldo/estado y auditoría atómica. La misma operationId no puede acreditar dos órdenes ni admitir distinto contenido. No activar pasarela inexistente.

UI: componentes actuales, vino/rosa mate, claro/oscuro, navegación personal separada de gestión. Estados cargando/vacío/error/sin permiso/sin conexión; limpiar datos al cambiar contexto o perder autorización. Una persona multirrol ve ambos espacios sin cambiar identidad ni elevar permisos. Historial descargable rotulado consulta informativa. Cuenta y MFA enlazan la seguridad existente.

## Trabajo

1. **Consultas personales.** Añadir capacidades `student.self.read`, `teacher.self.read`; endpoints `/portal/student/[resource]` y `/portal/teacher/[resource]` para perfil, materias/grupos, docentes, horario, historial publicado, órdenes y movimientos propios. Fixtures HTTP prueban dos tenants/dos alumnos/docentes, borradores privados, revocación y cursor. Esquema/migración: reutilizar tablas 0011–0025; sin DDL.
2. **Abonos reales.** Endpoint POST `/financials/orders/[orderId]/payments`, GET paginado de movimientos para Caja, validación compartida y operaciones atómicas. Tests HTTP: autorización/MFA/origen/tenant, replay idéntico, clave reutilizada con otro contenido/orden, pago parcial/completo, sobrepago y carrera concurrente, rollback de auditoría. Endurecer consultas financieras con la autoridad SQL vigente.
3. **Portales y navegación.** Páginas estudiante/docente/Caja; inicio personal con datos persistidos, pestañas de materias/docentes/calificaciones/horario/estado de cuenta/perfil; grupos docentes y acceso al evaluador existente. Caja: conceptos/órdenes existentes, registro de abonos y movimientos. Pruebas navegador desde login real y comprobación HTTP→UI. Matriz de viewports 360/390/768/1024/1366/1600/1920 y ambos temas.
4. **Consolidación y cierre.** Revisar catálogo y criterios de configuración; registrar matriz de cobertura del encargo y contratos externos faltantes. Ejecutar lint, tipos, unitarias, integración, financiero legacy, build, audit, migraciones aisladas y navegador. Revisión independiente del cambio. Publicar PR, comprobar CI sobre SHA definitivo, merge sólo con revisión/CI y verificar main/Production por SHA.

## Contratos externos y alcance comprobable

Inspeccionar Compañero/Ktor para asistencia de sólo lectura. No inventar proveedor ni endpoint, no transformar outbox académico en asistencia. Rectificaciones oficiales, promedios reglamentarios, documentos certificados, devoluciones/conciliación y edición de PII requieren revisar contratos/modelos reales antes de activarlos. Documentar cualquier parte no implementada; el encargo integral no autoriza simularla.

## Investigación de referencia (26 octubre 2026)

- [Banner Self-Service, Ellucian](https://www.ellucian.com/assets/en/brochure/brochure-learn-more-about-ellucian-banner-self-service.pdf): separar tareas de autoservicio de administración institucional.
- [Student Center, Oracle](https://docs.oracle.com/cd/G23040_01/cs92pbr34/eng/cs/lsss/UnderstandingSelf-ServiceStudentCenter-ab40b7.html): entrada personal para vida académica y financiera.
- [Workday Student](https://www.workday.com/content/dam/web/en-us/documents/datasheets/datasheet-workday-student.pdf): navegación móvil y registro conectado al contexto académico.
- [User report, Moodle](https://docs.moodle.org/502/en/grade/report/user/index): reporte individual y separación de vista docente; SIII no adopta funciones LMS.
- [SIAE, UNAM](https://www.cch.unam.mx/estudiantil/node/5): consulta autenticada de asignaturas/calificaciones propias y distinción de los trámites de certificación.
- [Gestión Escolar / SAES, IPN](https://www.ese.ipn.mx/estudiantes/gestion-escolar.html): acceso personal a horario y calificaciones junto con trámites escolares. En SIII, los trámites oficiales sólo se habilitan con contratos de autorización reales; no se simulan certificados.

## Review Focus

- Revocar vínculo, rol, membresía o sesión impide la siguiente lectura, aunque la UI conserve el contexto.
- Dos alumnos de la misma institución no leen datos personales, borradores ni movimientos ajenos.
- Dos cobros concurrentes no exceden saldo; replay no duplica transacción/auditoría.
- Listados paginados no pierden registros con timestamps iguales y no aceptan cursores de otro recurso/actor.
- Cambios de institución/reintentos/offline no muestran datos viejos como si fueran del contexto nuevo.
