# SII F3 — Catálogo académico, primera entrega

## Alcance implementado
- Programas académicos: clave única por institución, nivel, modalidad, estado.
- Materias: clave única por institución, créditos de 0 a 30, estado.
- Planes: versiones de programa, restricción de clave única y FK compuesta que prohíbe programas de otra institución.
- Campus y periodos: uso de tablas fundacionales, creación, consulta y edición/archivo, claves únicas por institución.
- API /api/v1/institutions/:institutionId/academic/:resource (GET, POST, PATCH).
- Validaciones Zod; permisos academic.read / academic.manage; validación CSRF; auditoría transaccional de mutaciones.
- Vista autenticada /dashboard/institutions/:institutionId/academic y navegación condicionada por contexto.
- Pruebas de validación y restricciones con PostgreSQL en CI.

## Fuera de alcance (no simular)
- Docentes y alumnos con expedientes oficiales, grupos, horarios, actas, inscripciones y finanzas.
- Editor visual de seriaciones y materias de un plan (solo versión y asociación básica).
- Paginación de más de 200 registros (la interfaz indica el límite), búsquedas en servidor, exportaciones.
- Edición de fechas de periodos, niveles o créditos: requieren procesos administrativos y reglas de modificación propias.
- Sincronización con Ktor/Compañero.

## Reglas de despliegue
La instalación productiva original fue creada con Supabase migrations mientras `db/migrate.ts` utiliza el journal de Drizzle.
**No ejecutar npm run db:migrate directamente sobre producción**, pues Drizzle puede intentar ejecutar otra vez la migración 0000.

La migración `db/migrations/0001_academic_catalogs.sql` es aditiva y debe aplicarse por un procedimiento de producción revisado y con respaldo; confirmar que la tabla está vacía o conciliada antes de crear índices únicos.
No generar usuarios o programas ficticios en producción.
Mantener `anon` y `authenticated` sin privilegios sobre estas tablas; revisar grants y/o RLS antes de exponer cualquier integración de Supabase Data API.

## Seguridad y QA pendientes
- Pruebas E2E autenticadas de API y UI en staging.
- Revisión de concurrencia, permisos de roles y pruebas visuales en todos los breakpoints.
- Validación de despliegue en Vercel y revisión de errores reales.
- Se requiere una revisión de seguridad antes de promover cambios productivos.

Estados: API/UI IMPLEMENTED; unit/integration tests deben marcarse VERIFIED solo tras CI exitoso; staging y producción BLOCKED hasta verificación.
