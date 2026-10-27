# Listados completos de inscripciones y carga docente

> Ejecución: superpowers:executing-plans, con pruebas antes de cambios.

Objetivo: eliminar el corte de 200 en los GET existentes de enrollments y assignments. Reutilizar parsePage, cursorTimestamp, cursorPredicate y pageEnvelope; sin cambios de esquema, escrituras ni permisos. AcademicOperations ya consume readCollection y seguirá todas las páginas.

Contrato: data y page.nextCursor, límite 1–100 (50 predeterminado), orden created_at DESC/id DESC con microsegundos. El cursor queda ligado a institución, recurso y filtro sectionId. sectionId opcional, UUID único; parámetros desconocidos o repetidos reciben 422. Assignments conserva la exclusión de vínculos revocados; enrollments conserva estados históricos. Ninguna página implica un snapshot inmutable entre peticiones.

- [x] Añadir fixture sintética y pruebas HTTP: más de 200 filas, empates de microsegundos, grupos/tenants/recursos separados, filtro inválido, sin sesión y revocación de permisos.
- [x] Ejecutar RED contra handlers actuales; implementar sólo los dos GET y comprobar GREEN con pruebas existentes de escritura.
- [x] Chromium: los listados de Operación académica incluyen las filas más antiguas, mantienen baja/revocación real y persisten tras recarga; axe sin infracciones.
- [x] Typecheck, lint, 767 unitarias, 339 integraciones completas, 58 UI completas, build y audit0; revisión independiente favorable.
- [ ] PR, CI del SHA publicado, merge y despliegue.

Archivos previstos: dos route.ts existentes; tests/support/academic-rosters-fixture.ts, tests/integration/academic-rosters-pagination-http.test.ts y tests/ui/academic-rosters-pagination.spec.ts nuevos; matriz operativa y evidencia compacta. Riesgos a comprobar: reutilizar cursor con otro filtro, exponer revocados, perder filas por precisión temporal, duplicar filas al paginar, introducir autoridad desde el cliente. Sin límites silenciosos nuevos.
