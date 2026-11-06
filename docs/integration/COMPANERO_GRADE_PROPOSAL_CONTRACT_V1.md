# SIII ↔ Compañero — propuesta de calificación V1 (contrato preparatorio)

El PR del contrato **no** habilita recepción, modifica expedientes ni publica calificaciones. SIII sigue siendo la fuente de verdad; Compañero mantiene su libro de clase privado/autónomo. El endpoint actual `/grading` de SIII es autenticado por usuario web y **no acepta HMAC**; nunca reutilizarlo como API de integración.

## Envelope propuesto
`companero.grade_proposal.v1`, `operationId` UUID, `sourceVersion` entero incremental, `sourceDigest` SHA-256 del borrador de origen, `institutionId` y `sectionId` UUID oficiales, `academicPeriodId` UUID, `nativeClassroomId`, `teacherExternalId`, `gradingPeriod`, escala `MX_0_TO_10_HUNDREDTHS`, y hasta 500 alumnos con `nativeStudentId`, `studentSourceId` y `gradeHundredths` (0..1000, sin Double).
La validación Zod comprueba forma, escala y duplicados; no verifica por sí sola matrícula, firma, vinculación ni periodo.

## Requisitos de la entrada futura
1. Crear un canal exclusivo **Ktor → SIII** con clave por tenant y propósito `grade:propose`, diferente del secreto de salida, HMAC-SHA256 sobre método/ruta/timestamp/nonce/hash del cuerpo, verificación constante, antirreplay persistente y límites de longitud/tasa.
2. No confiar en IDs oficiales enviados por Android. Ktor debe demostrar correspondencia de alumno y docente; SIII debe revalidarla en PostgreSQL con secciones abiertas, matrícula vigente, grado y término activos, pertenencia institucional y conflictos de publicación.
3. Persistir una propuesta inmutable con operación idempotente, versión, hash, identificadores, estados `RECEIVED/VALIDATED/REQUIRES_REVIEW/REJECTED/APPLIED`, errores auditables sin datos personales y receipt idempotente.
4. El docente propone; **solo el operador autorizado** con `grades.manage` revisa; la publicación formal usa `grades.publish` y las reglas existentes de actas, correcciones, cierre y concurrencia. El backend nunca interpreta 202 como nota oficial.
5. Compañero muestra `pendiente de revisión`, `rechazado` o `aplicado` desde acuses verificables; no enviar `synced` prematuramente.
6. Probar identidad cruzada, suplantación, nonce repetido, cambios de matrícula, docente revocado, periodo cerrado, alumno ajeno, 409 concurrente, reintentos y tenants QA-UNIV/SII-001.

**Estado de esta entrega:** contrato estructural y pruebas sintéticas; receptor, persistencia, secreto dedicado, aprobación humana y sincronización bidireccional siguen pendientes. La aplicación y el servicio continúan sin activar su gateway de calificaciones.
