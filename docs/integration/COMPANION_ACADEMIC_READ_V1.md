# Siii ↔ Compañero — API de lectura institucional (primera etapa)

## Contrato real revisado
Fuente: `ErickRFM/Compa-ero-de-esc`, `services/api/.../integrations/academic/AcademicProvider.kt` y `dto/ExternalAcademicDtos.kt`.
Compañero continúa bajo el diseño **Android → Ktor → AcademicProvider → Siii**; ninguna llamada directa del teléfono a Siii.

## Endpoints bajo /api/integrations/companion/v1
- `GET /students/{externalId}`: ExternalStudent.
- `GET /students/{externalId}/academic-load`: ExternalAcademicLoad { student, enrollments, schedule }.
- `GET /courses`: ExternalCourse[].
- `GET /teachers`: ExternalTeacher[].
- `GET /schedules/{externalId}?weekOf=YYYY-MM-DD`: ExternalScheduleSlot[]. Por ahora weekOf se valida pero **no filtra excepciones fechadas**; el contrato de recurrencia no representa cancelaciones.

IDs: matrícula = student.externalId; código de sección UUID = course.externalId y schedule.courseId; docentes = employeeNumber. Días de la semana LUNES...DOMINGO en vocabulario aceptado por ExternalWeekdays, y horas HH:mm. Ningún dato proviene de mocks.

## Seguridad
Variables de entorno de servidor solamente:
- `SIII_COMPANERO_INSTITUTION_ID`: UUID de la institución permitida.
- `SIII_COMPANERO_TOKEN_SHA256`: hash hex SHA256 de un token aleatorio secreto base64url de más de 32 caracteres.
La API compara el hash en tiempo constante. El token original se suministra exclusivamente a Ktor mediante un secreto; nunca se almacena en Git ni se envía al móvil.

No habilitar endpoints institucionales sin HTTPS, permisos de despliegue y variables correctamente provisionadas. En caso de configuración incompleta responde 503; autenticación inválida responde 401.

## Semántica de datos incompletos
- Alumno no encontrado: 404.
- Falta de docente asignado a sección: 409; no se inventa un profesor genérico.
- Demasiadas inscripciones/cursos para este contrato inicial: 409; no se corta silenciosamente una carga oficial.
- Los cursos sin horario pueden aparecer inscritos con schedule vacío.
- Los datos son de lectura: esta entrega NO implementa IdentityProvider, SyncProvider de deltas ni GradeSyncGateway de escritura.

## Gates pendientes antes de integración real
1. Crear un proveedor Ktor que consuma estos endpoints y traduzca errores a IntegrationException.
2. Comparar DTOs con tests de contrato real y fixtures sanitizados (curso/docente, matrículas, sábado).
3. Registrar provider configurable sin desactivar protección contra mocks staging/producción.
4. Probar timeouts, 401/403/404/409/503 y reconexión; nunca ocultar errores con contenido fabricado.
5. Mejorar soporte de cancelaciones y reprogramaciones fechadas usando ClassOccurrence, y sync incremental.
6. Implementar autenticación service-to-service por IntegrationClient por institución para uso multi-tenant general; el esquema de variables actual permite solo **una** institución.
7. Verificar la conexión real de Siii staging con Ktor staging; las pruebas actuales de CI son unitarias/de integración de PostgreSQL, no pruebas entre servicios desplegados.

No afirmar integración móvil completa antes de todos estos gates.
