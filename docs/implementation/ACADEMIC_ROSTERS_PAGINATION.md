# Inscripciones y carga docente completas

Los GET institucionales enrollments y assignments sustituyen el corte de200 por el contrato existente data/page.nextCursor, límite1–100 y orden created_at/id descendente con microsegundos. El cursor se liga a institución, recurso y sectionId opcional. Se rechazan filtros repetidos, UUID vacío/inválido y parámetros ajenos. La autorización se comprueba antes de interpretar el cursor en cada página.

Assignments mantiene únicamente vínculos no revocados; enrollments conserva inscripciones retiradas. POST y PATCH no cambian. AcademicOperations ya usa readCollection: ahora obtiene todas las páginas sin otro estado o componente duplicado. La paginación entre solicitudes no ofrece un snapshot inmutable. Sin migraciones ni nuevas dependencias.

Evidencia sintética local: RED19fallos/4aprobadas contra handlers anteriores; GREEN23/23 HTTP con208filas, filtros, precisión temporal, tenants, recursos, filas revocadas/históricas y revocación de autoridad entre páginas. Suite completa339/339 en27archivos (549.69s); 767unitarias; typecheck/lint/build correctos; audit0.

Chromium completo58/58 (3min). El caso nuevo carga208inscripciones y208asignaciones, encuentra filas antiguas, retira/revoca mediante los PATCH reales, comprueba persistencia SQL/auditoría/recarga y axe sin infracciones. Revisión independiente favorable del delta GET, sin cambios de permisos ni escrituras. CI/merge/publicación del SHA de este bloque pendientes.
