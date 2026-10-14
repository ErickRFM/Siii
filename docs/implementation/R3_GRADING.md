# R3 — Evaluaciones, notas y actas

**Base apilada**: `feat/r1-r2-academic-operations`. Nada de este PR se aplica directamente a Supabase producción.

## Implementado
- Migración aditiva `0003_grading_drafts.sql` (docentes vinculados a membresías, componentes, notas, publicaciones y calificaciones finales).
- Una calificación se guarda como entero entre 0 y 1000, equivalente a 0.00–10.00; los pesos son porcentajes enteros y suman 100 para publicar.
- Endpoint `POST /api/v1/institutions/:institutionId/teacher-links` para vinculación por administrador, exigiendo membresía y rol docente vigente.
- Ruta `GET /api/v1/institutions/:institutionId/grading/sections` restringida a secciones asignadas al docente realmente vinculado.
- Ruta `GET/POST /api/v1/institutions/:institutionId/grading` para definir componentes, guardar borradores y publicar la **primera acta**.
- Al publicar: bloqueo transaccional de sección, idempotency UUID institucional, pesos=100%, inscripción activa y todas las notas presentes; notas finales se materializan en la misma transacción con auditoría.
- Una publicación no puede sobrescribirse mediante el mismo endpoint. Las rectificaciones oficiales requieren comando distinto (pendiente).
- UI inicial de docente con componentes, captura individual, revisión y confirmación. No se simula aprobación de actas.
- Pruebas unitarias y de integridad multiinstitución sobre PostgreSQL CI.

## Puertas abiertas
- Pruebas HTTP de autenticación con múltiples usuarios y roles (incluyendo rol revocado durante operaciones).
- QA de accesibilidad y responsive del gradebook.
- Manejo explícito de permisos de lectura de calificaciones por alumno y kárdex (NO exponer ahora).
- Workflow de rectificación versionada con autorización y motivo.
- Políticas de cierre de periodo, rubricas, importación segura CSV/XLSX.
- Ejecución en staging con migraciones verificadas y baseline Supabase reconciliado.
- Revisión de concurrencia con múltiples docentes y doble solicitud de publicación.
- Adaptador oficial GradeSyncGateway en Compañero Ktor y contrato de idempotencia con proveedor real.

## Seguridad
Un rol `teacher` **no basta**: se comprueba la membresía institucional vigente, vínculo docente, docente activo y asignación activa a la sección. Los alumnos no consultan notas ajenas ni pueden escribirlas.

**No promover a producción todavía.** La rama depende del PR de alumnos y secciones, y de que se resuelva el historial de migraciones Supabase/Drizzle.