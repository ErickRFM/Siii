# SEC06: lectura propia de vinculación

Base: main809c526d, posterior a #84. Alcance: sólo GET student-links/me y sus pruebas existentes; sin F2, schema, migraciones, UI ni cambios al claim.

1. Reproducir acceso a expediente propio con membresía suspendida, tenant inactivo, grant revocado/caduco, cambio de contraseña pendiente y MFA privilegiado ausente. Conservar401,404 NO_MEMBERSHIP y proyección200 de autoservicio.
2. Reutilizar authorizeCapability e institutionVisibility en la consulta final; validar actor/membresía/tenant/estado y unir vínculo y estudiante por tenant. No crear motor de política adicional ni imponer MFA a estudiantes.
3. Probar revocación/caducidad mientras la consulta espera un bloqueo real de PostgreSQL, vínculos revocados y aislamiento entre actores/tenants; usar sólo fixtures sintéticas y endpoints reales.
4. Repetir composición de claim/read, lint, tipos, unitarias y build; revisión independiente, documentación append, PR temático y CI global antes de merge.

El acceso propio sin membresía seguirá404. La membresía existente sin autoridad vigente dará403 y ningún dato privado. No se añade auditoría de lectura general ni acceso administrativo a expedientes ajenos.
