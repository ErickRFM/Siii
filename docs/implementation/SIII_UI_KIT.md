# Kit institucional SIII

El kit vive en `src/components/ui`. Su configuración reproducible está en `components.json`, `tailwind.config.ts` y `postcss.config.mjs`; no depende de una galería externa en runtime.

## Uso

- `Button`, `Input`, `NativeSelect` y `Textarea` conservan los atributos HTML, eventos y referencias DOM. Usar `NativeSelect` en formularios existentes con FormData/required; `Select` de Radix queda disponible para composiciones que implementen explícitamente su contrato de valor.
- `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead` y `TableCell` conservan semántica nativa. Dentro de `SiiScrollRegion`, pasar `scrollable={false}` para mantener un único viewport horizontal accesible.
- `SiiPageIntro`, `SiiSectionHeader`, `SiiMetricTile`, `SiiStatusPill`, `SiiModuleTile`, `SiiEmptyView` y `SiiSkeleton` componen las vistas institucionales.
- `Sidebar`, `Dialog`, `Command`, `Sheet`, `Tabs`, `Badge`, `Card`, `Alert`, `Avatar`, `Tooltip` y demás primitivas permiten reutilizar composición, teclado y foco. Los portales conservan el tema y la tipografía.

Los colores semánticos y sus variantes claro/oscuro se definen en `src/app/sii-tailwind.css`. Las variables `--sii-*` y `--sii-kit-*` de las pantallas anteriores apuntan a esa misma paleta. Las superficies de operación, formularios y tablas permanecen mate. El reset global de movimiento reducido incluye los portales.

## Conexión operacional

La migración conserva los handlers, FormData, campos, validaciones, referencias, confirmaciones, estados de carga/error y llamadas HTTP de los módulos existentes. No añade permisos al cliente ni rutas ficticias. Admisiones se enlaza a su pantalla existente solo con `admissions.manage`; la página y los endpoints vuelven a autorizar en el servidor.

Los proveedores de capacidades y borradores de calificaciones mantienen sus límites por actor/institución. El drawer móvil cierra al navegar o cambiar de breakpoint y ofrece cierre explícito; la búsqueda devuelve el foco a su control de apertura.

## Verificación

- Contratos nativos: `tests/unit/native-ui-controls.test.tsx`.
- Navegación por capacidad/ruta: `tests/unit/consolidated-navigation.test.ts`, `tests/unit/dashboard-location.test.ts`.
- Componentes SIII: `tests/unit/premium-ui-kit.test.tsx`, `tests/unit/dashboard-shell-contract.test.ts`.
- Flujos reales con PostgreSQL sintético: suites de `tests/integration` y `tests/ui`; incluyen paginación, ediciones, MFA, borradores, ámbitos, admisiones y accesibilidad/temas/viewports.

El merge y las pruebas con fixtures no acreditan por sí mismos disponibilidad productiva, configuración de correo o finalización de integraciones externas. Registrar SHA y CI del PR para el cierre.

## Evidencia de integración — 2026-10-23

Lint, TypeScript, 847 pruebas unitarias, build de producción y auditoría completa (0 vulnerabilidades) verificados. El parser transitivo de selectores CSS está fijado en 7.1.6 para corregir GHSA-rj75-hqrm-r3gf conservando Tailwind 3.

Playwright recorrió 122 casos: 119 aprobados en la corrida completa y los tres restantes aprobados en repetición tras corregir contraste de acciones en tema oscuro/cambio de tema y distinguir el enlace Inicio del enlace de marca. Se comprobaron pantallas públicas, todos los módulos existentes, permisos, MFA, borradores entre rutas, estados offline, tablas y paginación reales. No se debilitó ninguna comprobación funcional o de accesibilidad.

Las suites HTTP usan PostgreSQL desechable: 577/578 en la corrida local y el único fallo de preparación de migración aprobado en repetición aislada; CI también completó 578/578 en el primer commit. Las comprobaciones del último SHA, revisión y merge se registran en [PR #106](https://github.com/ErickRFM/Siii/pull/106), que es la referencia definitiva del cierre.
