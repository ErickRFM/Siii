# Siii R1/R2 — Control Escolar y Operación Académica

## Punto de partida
Base `main@7070a46` (catálogos F3 y acceso institucional). Esta rama añade:
- Alumnos por matrícula e institución, asociados a un programa activo.
- Docentes institucionales por número de empleado.
- Secciones por periodo y materia, con cupo y estado.
- Inscripciones con validación del estudiante y capacidad serializada mediante `FOR UPDATE`.
- Asignaciones docentes con revocación no destructiva.
- Auditoría transaccional y API scoped `academic.manage`.
- Pantallas de control escolar y coordinación conectadas con las API, sin fixtures falsos.

## Invariantes
- Todas las escrituras comprueban `institutionId` del servidor, acceso de sesión y permiso.
- Unicidad institucional de matrícula y número de empleado, unicidad de sección por periodo.
- Claves foráneas compuestas `(resource_id, institution_id)` impiden referencias a otra universidad incluso si un handler falla.
- La inscripción comprueba estudiante y sección activos, y serializa escrituras concurrentes por sección para evitar sobrecupos.
- Inscripciones retiradas permanecen en historial; se permite una nueva inscripción posterior como registro nuevo, sin reescribir la anterior, siempre que el cupo siga disponible.
- Revocar un docente no destruye su asignación; registra `revoked_at`.
- Estas cuentas académicas son registros institucionales, **no credenciales de acceso**: la vinculación con cuentas de Siii/Compañero requiere otra fase con evidencia.

## APIs (autorización `academic.manage`)
```
GET/POST/PATCH /api/v1/institutions/{id}/registry/students
GET/POST/PATCH /api/v1/institutions/{id}/registry/teachers
GET/POST/PATCH /api/v1/institutions/{id}/sections
GET/POST/PATCH /api/v1/institutions/{id}/enrollments
GET/POST/PATCH /api/v1/institutions/{id}/assignments
```
GET retorna hasta 200 registros e indica `truncated`. PATCH de una inscripción permite únicamente retirarla.

## Estrategia de migración
**No usar `npm run db:migrate` directamente contra Supabase producción**. La base fue creada con el historial de migraciones de Supabase; el journal local de Drizzle no está reconciliado con esa historia. La migración `0002_school_registry.sql` debe pasar primero en PostgreSQL efímero de CI y luego en una base staging, usando un método revisado y un respaldo reciente para producción. La aplicación DDL y la promoción productiva son decisiones independientes del merge en Git. No generar datos falsos ni copiar registros reales hacia entornos de prueba.

## Criterios todavía abiertos
- [ ] CI verde para el SHA más reciente de este PR.
- [ ] Pruebas de endpoints autenticados multiinstitución (incluyendo 403 y cambios de roles).
- [ ] Concurrencia real de inscripción mediante peticiones HTTP paralelas.
- [ ] Identificación de alumno duplicado entre secciones equivalentes y reglas de prerequisitos.
- [ ] Paginación/búsqueda desde servidor y QA móvil/TalkBack.
- [ ] Backup, reconciliación de migraciones y despliegue seguro a staging.
- [ ] Sincronización con `AcademicProvider` en Ktor y correspondencia con ClassOccurrence.
- [ ] Calificaciones, horarios y expedientes históricos.
- [ ] QA producción sobre registros institucionales autorizados.

**Estado:** PR de implementación en curso. No equivale a sistema universitario completo ni listo para producción.
