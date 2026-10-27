# R5 — Servicios institucionales operativos (incremento 1)

Este incremento está apilado sobre la integración de lectura del PR #16, a su vez sobre horarios (#15), actas (#14) y control escolar (#9).

## Módulos implementados
1. **Avisos institucionales**: borrador → publicado → archivado; lectura general de avisos publicados únicamente para cuentas de la institución, con vencimiento; edición reservada a coordinación autorizada.
2. **Solicitudes de alumnos**: constancias, modificaciones, justificantes y otros; creación de solicitudes sobre alumnos activos del mismo tenant, revisión/aprobación/rechazo/cierre con motivo. La solicitud desde cuenta del propio alumno aún requiere vinculación real de identidad.
3. **Tutorías**: expedientes de seguimiento con alumno y docente válidos, notas privadas, estados OPEN → RESOLVED → CLOSED; lectura de información sensible limitada al permiso `users.manage`, no al rol general de estudiante/coordinador.
4. **Talleres**: catálogo, facilitador activo, borrador/publicación/cancelación, cupos y periodos; altas y bajas de participantes con transacción que bloquea fila de taller para evitar sobrecupos.

## Interfaces y seguridad
`GET/POST/PATCH /api/v1/institutions/{id}/announcements`
`GET/POST/PATCH /api/v1/institutions/{id}/requests`
`GET/POST/PATCH /api/v1/institutions/{id}/tutoring-cases`
`GET/POST/PATCH /api/v1/institutions/{id}/workshops`
`GET/POST/PATCH /api/v1/institutions/{id}/workshop-enrollments`

Todas las mutaciones validan Zod, sesión, CSRF/origen y tenant, realizan cambios con auditoría transaccional y retornan errores verificables. `GET` de avisos y talleres permite a los miembros de la institución consultar publicaciones vigentes, no borradores. Se implementó pantalla inicial de servicios académicos (avisos, solicitudes y talleres).

## Criterios pendientes
- [ ] QA E2E autenticado y UI responsive/accesible.
- [ ] Paginar 200+ filas mediante cursor y filtros de servidor.
- [ ] Vinculación matrícula ↔ cuenta de alumno para autoservicio de solicitudes y talleres.
- [ ] Tutor académico con grant explícito por caso y notas privadas protegidas; por ahora solo administración.
- [ ] Talleristas invitados externos con tokens de acceso temporal y verificación institucional.
- [ ] Calendarios institucionales integrados con EventsProvider en Ktor.
- [ ] Archivos/trámites documentales, firma y emisión de constancias verificadas.
- [ ] Becas, cuotas, facturación institucional y conciliación de pagos **sin simular operaciones de dinero**.
- [ ] Indicadores BI con periodos, procedencia y control de permisos.
- [ ] Reconciliar migraciones Supabase/Drizzle, staging, backup y permisos antes de cualquier cambio productivo.

**Estado:** backend/UI inicial de servicios; no representa operación administrativa completa ni release de producción.
