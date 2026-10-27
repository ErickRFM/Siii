# SIII V3 — solicitudes personales

> Ejecutar con superpowers:executing-plans. Especificación: fase 05 del encargo V3 y AGENTS.md. Reutilizar las tablas y transiciones administrativas actuales; sin inventar emisión oficial.

Dependencia inicial: PR #117, `0f217d7af3e3820cbd683fa4bba51b54460cebe0`. Esta rama no se publicará hasta reconciliar con su merge en el `main` remoto vigente. No hay cambios de F2 en la otra rama.

- [x] Pruebas HTTP RED de creación propia, lectura/historial, idempotencia/concurrencia, mass assignment, tenant/ámbito, revocación, estado, CSRF y rollback de auditoría.
- [x] Permiso `student.requests.create` con relación de propietario; POST obtiene estudiante del vínculo vigente en servidor. Transacción revalida actor, sesión, institución, grant y el mismo vínculo antes/después. Reutilizar UUID primaria como operación idempotente, sin tabla duplicada.
- [x] GET paginados requests/request-history con propiedad en SQL y los contextos de respuesta del portal. Timeline limita acciones y campos de solicitudes propias.
- [x] Formulario accesible con revisión, folio de seguimiento, estado, resolución e historial; estados honestos y sin emisión de documentos ni cambios de inscripción automáticos. Inicio muestra solicitudes reales pendientes.
- [ ] Regresión de contratos administrativos existentes, navegador/móvil/axe, tipos/lint/unit/build, revisión independiente, CI/merge/despliegue por SHA.

Esquema/migración: se reutilizan `student_service_requests` y `security_audit_log` de 0014/identidad; no DDL previsto. Tipos/transiciones existentes siguen siendo la autoridad. No se construye almacenamiento de adjuntos ni documentos certificados sin su contrato de emisión autorizado.

Revisión: replay de una solicitud ya resuelta; key ajena sin enumeración; relink/caducidad durante auditoría; lectura de historia sin exponer actor o eventos de otros módulos; formulario que cambia de identidad o pierde autorización mientras guarda.
