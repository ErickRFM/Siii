# Inscripciones y carga docente completas

Los GET institucionales enrollments y assignments sustituyen el corte de200 por el contrato existente data/page.nextCursor, límite1–100 y orden created_at/id descendente con microsegundos. El cursor se liga a institución, recurso y sectionId opcional. Se rechazan filtros repetidos, UUID vacío/inválido y parámetros ajenos. La autorización se comprueba antes de interpretar el cursor en cada página.

Assignments mantiene únicamente vínculos no revocados; enrollments conserva inscripciones retiradas. POST y PATCH no cambian. AcademicOperations ya usa readCollection: ahora obtiene todas las páginas sin otro estado o componente duplicado. La paginación entre solicitudes no ofrece un snapshot inmutable. Sin migraciones ni nuevas dependencias.

Evidencia sintética local: RED19fallos/4aprobadas contra handlers anteriores; GREEN23/23 HTTP con208filas, filtros, precisión temporal, tenants, recursos, filas revocadas/históricas y revocación de autoridad entre páginas. Suite completa339/339 en27archivos (549.69s); 767unitarias; typecheck/lint/build correctos; audit0.

Chromium completo58/58 (3min). El caso nuevo carga208inscripciones y208asignaciones, encuentra filas antiguas, retira/revoca mediante los PATCH reales, comprueba persistencia SQL/auditoría/recarga y axe sin infracciones. Revisión independiente favorable del delta GET, sin cambios de permisos ni escrituras. CI/merge/publicación del SHA de este bloque pendientes.

Reconciliado con main7cf7aba3/PR38 sin conflictos funcionales:774unitarias y23HTTP dirigidas aprobadas contra la base local actualizada con0018. No se aplicó esa migración productiva.

CI inicial del heade1bdf45: ambas Verify fallaron en la autenticación de la nueva fixture (316pruebas aprobadas,23sin ejecutar), con FIXTURE_STEP_UP_FAILED. Reproducción local sembrando27peticiones en el bucket IP compartido: login/enroll/verify correctos y step-up429; el mismo error impidió los23casos. La fixture ahora aísla auth_throttle en la base desechable, como otras fixtures del proyecto; beforeAll conserva esa siembra como regresión y los23casos pasan. No se cambian límites, pruebas de throttle ni autenticación del producto. CI del nuevo SHA reconciliado pendiente.
