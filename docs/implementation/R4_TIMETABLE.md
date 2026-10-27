# R4 — Horarios institucionales y ocurrencias

## Lo implementado
- Aulas con capacidad y campus, aislamiento por institución y claves compuestas.
- Patrones semanales con lunes=1 ... domingo=7, horas como minutos locales (0–1440) y restricciones de base.
- Regla de bloqueo de escritura: `pg_advisory_xact_lock` por institución/periodo en cada creación de patrón. Comprueba solapamientos de la propia sección, aula, docentes activos compartidos y alumnos inscritos compartidos antes de insertar.
- Generación fechada de ocurrencias **persistidas** para el término (máximo 370 días), con identidad por `pattern_id + on_date`. Las consultas semanales devuelven los mismos UUID después de reinicios.
- Cancelación o modalidad en línea con motivo y auditoría (no habilitar reprogramación sin conservar el historial del cambio).
- Pantalla inicial para aulas, recurrencia, detección de conflictos y semana visible.
- Pruebas de validación de fechas ISO, sábado de 07:00 a 09:00 y constraints de aislamiento institucional.

## API
- GET/POST `/api/v1/institutions/:id/rooms`
- GET/POST `/api/v1/institutions/:id/schedule-patterns`
- GET/PATCH `/api/v1/institutions/:id/occurrences?weekOf=YYYY-MM-DD`
Se requiere `academic.manage` y contexto institucional válido. No exponer listado general de personas ni horarios privados a roles alumno.

## Pendientes para cerrar R4
- [ ] QA de concurrencia de solicitudes HTTP y cambios de asignación docente posteriores a crear horarios.
- [ ] Operación versionada de reprogramación preservando estado anterior y notificación de cambios.
- [ ] Excepciones de calendario, festivos, suspensiones, cambios de zona horaria y horarios extraordinarios.
- [ ] Verificación de asistencia en días no regulares y reconcilación de recurrencias tras actualización de periodo.
- [ ] Enlaces con `ClassOccurrence` del Ktor actual, comprobados con tests de contrato; no inventar mapeo de UUID.
- [ ] Vista avanzada grid (por aulas, grupo y profesor), filtros, exportación y QA accesibilidad.
- [ ] Staging PostgreSQL, pruebas reales de múltiples instituciones, respaldo/reconciliación Supabase→Drizzle.
- [ ] Pruebas E2E autenticadas navegando por la UI y confirmación en Vercel.

**Nota:** las ocurrencias de un patrón no deben cambiar su ID al volver a consultar. No crear un QR de clase distinto ni duplicar presencia de campus. Las evidencias/QR siguen en Compañero.

**Estado:** implementación inicial verificada únicamente hasta las pruebas completadas en CI. No lista para operación académica real ni desplegada a producción.