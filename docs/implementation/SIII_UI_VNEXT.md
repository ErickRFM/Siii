# SIII — UI/UX VNext

Inicio: 2026-10-25. Verificación: 2026-10-26. Rama: `codex/ui-ux-vnext-20261025`.
Base remota comprobada: `main@1699415748b71fad8f11a8754096e2ccc52d6b69`.

## Alcance implementado

| Área | Cambio | Contrato conservado |
|---|---|---|
| Sistema visual | Dimensiones, espaciado, ancho por vista, paneles y formularios comunes; controles y pestañas con colores semánticos claros/oscuros | Colores HSL institucionales, shadcn/Radix, CSS dinámico existente |
| Shell | Preferencia de sidebar desde cookie leída en servidor, topbar que redistribuye sus acciones al ampliar texto/zoom | Navegación por capacidades, enlaces, sesión y logout actuales |
| Operación académica | Pestañas Secciones/Inscripciones/Asignaciones, contadores de colecciones completas, búsqueda, filtros, tablas y drawers | POST existentes; PATCH de estado, retiro y revocación; auditoría en servidor |
| Formularios académicos | Búsqueda por nombre/clave con select nativo, validación compartida, errores en el panel, guardado, conservación de valores y confirmación al descartar | Zod y FormData; ninguna autorización se decide en el cliente |
| Horarios | Semana al frente, listas por día, agenda responsive, patrones en pestaña, aulas/clases en drawers | Verificación de conflictos, capacidad y docente en servidor; cancelación con motivo auditado |
| Servicios | Listado de ancho completo y alta contextual con borrador, bloqueo durante guardado y confirmación al descartar | Estados, decisiones con motivo y endpoints actuales |
| Administración | Navegación interna a configuración, estado e historial, columnas según espacio del contenedor | Versionado optimista, step-up, motivos, auditoría y permisos actuales |
| Usuarios, roles, invitaciones, seguridad, registro, admisiones y calificaciones | Unificación transversal de ancho, paneles, cabecera y controles; conservación de sus componentes especializados | Providers, validaciones, paginación y borradores vigentes |
| Login | Reconciliación exacta del CSS aditivo de #108 | Contraseña, recuperación y MFA actuales |

Las API académicas vigentes no permiten editar materia/cupo de una sección ni sustituir participantes de una inscripción/asignación. El drawer de detalle ofrece los cambios de estado realmente soportados; cambiar otros datos sigue requiriendo una ampliación funcional independiente. No se representa una acción sin endpoint.

## Seguridad y compatibilidad

- No hay cambios de schema, migraciones, handlers, secretos ni integraciones con Compañero. Las fases de datos/API/permisos son verificación de compatibilidad en esta entrega de presentación.
- Pérdida de capacidades: se ocultan colecciones/drawers, se abortan lecturas y se cancela cualquier confirmación pendiente. Los handlers siguen validando cada escritura.
- Los formularios evitan solicitudes duplicadas mientras guardan. Los errores conservan sus valores.
- La semana solicitada y la mostrada usan el mismo lunes; se abortan consultas anteriores y una escritura consulta el loader vigente.
- `readCollection` conserva la paginación existente y propaga `truncated:true`. Horarios advierte los límites heredados de 200 patrones/500 ocurrencias; sus cifras representan registros consultados.
- La cookie `sidebar_state` sólo conserva presentación. No contiene identidad ni concede acceso.
- No se eliminaron selectores antiguos por búsqueda textual. Se verificaron los consumidores de las nuevas reglas y se conservaron las hojas históricas por sus consumidores dinámicos y públicos.

## Reconciliación de ramas

Consulta remota inicial: abiertos #108 (login), #101 (contrato Companion) y #110 (alerta de caducidad HMAC). Los históricos #40/#48/#49 no aparecían abiertos. Esta entrega incorpora el diff de estilos de #108 sin fusionar ni cerrar ese PR; su cierre deberá coordinarse después de integrar este trabajo. #101/#110 permanecen fuera de alcance.

## Evidencia y reproducción

Entorno: PostgreSQL 17 desechable en loopback `127.0.0.1:55441`, base `siii_vnext_test`; todos los usuarios e instituciones son fixtures sintéticos. Las credenciales de prueba no corresponden a producción.

Línea base real sobre la rama recién creada: 65 archivos/907 unitarias y 7 recorridos de layout con capturas, teclado y axe. Capturas previas: `.p0-local/layout-polish/before-*.png`. El primer intento de Vitest en sandbox falló al importar por EPERM en su caché temporal; la repetición con acceso de ejecución pasó.

Pruebas nuevas y adaptadas:

- `tests/ui/layout-polish.spec.ts`: creación real y auditoría, validación de duplicado con valores conservados, descarte, calendario y conflicto reales, fecha no lunes, pérdida/recuperación de permisos, seis anchos y dos temas en diez áreas, zoom CSS 200%, foco y tabulación dentro de drawers.
- `tests/ui/academic-rosters-pagination.spec.ts`: consulta y modificación más allá de 200 inscripciones/asignaciones, confirmación, persistencia y auditoría.
- `tests/ui/sections-pagination.spec.ts`: todas las opciones de sección siguen disponibles en los drawers.
- `tests/ui/p0-accessibility.spec.ts`: persistencia de sidebar mediante cookie.
- `tests/unit/academic-week.test.tsx`: cambio de año, domingo, clases concurrentes y cancelación.
- `tests/unit/read-collection.test.ts`: recorrido de cursor, ciclo y metadatos de consulta parcial.

Matriz: **390, 768, 1024, 1366, 1600 y 1920 px**, claro/oscuro, diez áreas. Capturas en `.p0-local/vnext/`; CI las conserva como parte de `synthetic-ux-matrix`. Axe AA se ejecuta a 390/1366 en ambos temas; las pruebas históricas añaden 360 px y otros flujos. Zoom probado mediante `body.style.zoom='2'`, adicional a la matriz responsive; no equivale a una comprobación manual del zoom de todos los navegadores.

Revisión independiente de fuente: corrigió pérdida de permisos, respuestas de semana antiguas, límites silenciosos, carrera entre pestañas de servicios y solicitudes redundantes. Última revisión sin hallazgos concretos pendientes; no sustituye CI ni revisión humana del PR.

### Resultados finales

- `npm run lint` y `npm run typecheck`: correctos, repetidos tras los últimos cambios.
- `npm test`: **67 archivos, 911 pruebas correctas**.
- UI: **148/149** en la ejecución completa inicial; el único fallo buscaba los formularios de servicios antes de abrir el nuevo drawer. Tras adaptar esa navegación se repitieron ese caso y el nuevo flujo real de alta/publicación de servicios: **2/2 correctos**. La edición real desde el drawer (cerrar, abrir y archivar, con persistencia y auditoría) pasó después **1/1**, reutilizando la compilación de producción recién verificada. Total: **151 recorridos distintos cubiertos**, con CI completo del SHA publicado todavía por confirmar.
- Capturas VNext: **134 PNG**, además de la línea base y las capturas históricas. Inspección visual de operaciones de escritorio, drawer móvil, zoom y calendario con una clase real de fixture.
- `npm audit`: **0 vulnerabilidades**.
- Revisión independiente de fuente: sin hallazgos concretos pendientes en la última pasada.
- `npm run test:integration`: **41 archivos correctos, 605 pruebas aprobadas y 35 omitidas por flags** en la configuración normal de desarrollo. CI ejecuta además el grupo habilitado de outbox/Compañero.
- `npm run build`: correcto, **31 rutas generadas**; advertencia previa sobre el plugin Next de ESLint.
- `npm run test:financial-legacy`: **1/1 correcta**, con base heredada desechable propia.
- Un intento de integración usando `SIII_HTTP_TEST_PRODUCTION=1` se interrumpió al detectar 23 fallos en `mfa-security.test.ts`: esos fixtures esperan cookies de desarrollo. La repetición con la configuración normal del repositorio y otra base desechable pasó con los resultados anteriores; no se modificó autenticación para acomodar las pruebas.

El SHA final, enlace del PR y resultado remoto se entregan en el cierre y en la descripción del PR para evitar introducir un commit documental posterior al SHA verificado.

## Límites reales para liberación

- Pendiente revisión humana y aprobación de integración/despliegue; esta tarea no hace merge ni promoción productiva.
- No se ejecutó comprobación física en Android/iOS ni recorrido manual con lector de pantalla. Axe, semántica DOM y teclado automatizado aportan evidencia parcial.
- La configuración de navegador del repositorio usa Chromium. No se declara cobertura de WebKit/Safari ni Firefox sin ejecución.
- Capturas de regresión verifican composición y overflow; no existe un golden aprobado que certifique igualdad píxel a píxel de todo el producto.
- Persisten los límites de API documentados y la edición de campos que aún no tiene contrato. No se certifica disponibilidad productiva de servicios externos por la apariencia de la UI.

## Archivos de la entrega

- `.github/workflows/verify.yml`
- `docs/implementation/SIII_UI_VNEXT.md`
- `docs/implementation/SIII_UX_V3_PROGRESS.md`
- `docs/superpowers/plans/2026-10-25-ui-ux-vnext.md`
- `src/app/dashboard/institutions/[institutionId]/scheduling/page.tsx`
- `src/app/dashboard/layout.tsx`
- `src/app/layout.tsx`
- `src/app/sii-tailwind.css`
- `src/app/sii-workspaces.css`
- `src/components/academic-operations.tsx`
- `src/components/academic-week.tsx`
- `src/components/institution-admin.tsx`
- `src/components/scheduling-studio.tsx`
- `src/components/sii-app-shell.tsx`
- `src/components/sii-confirmation.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/sii-workspace.tsx`
- `src/components/university-services.tsx`
- `src/shared/client/read-collection.ts`
- `tests/ui/academic-rosters-pagination.spec.ts`
- `tests/ui/consolidated-modules.spec.ts`
- `tests/ui/layout-polish.spec.ts`
- `tests/ui/p0-accessibility.spec.ts`
- `tests/ui/sections-pagination.spec.ts`
- `tests/unit/academic-week.test.tsx`
- `tests/unit/read-collection.test.ts`
