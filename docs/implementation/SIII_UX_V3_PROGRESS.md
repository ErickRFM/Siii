# SIII UX/UI V3 — Plan de ejecución y registro de evidencia

> Auditoría de arranque: 2026-10-19. **No usar esta fecha ni los SHA como estado perpetuo**: actualizar después de cada merge y confirmar siempre `origin/main`.
> El propósito es mejorar UX/UI sin duplicar lógica ni alterar garantías de autenticación, MFA, permisos, pagos o matrícula.

## Base de trabajo
- Repositorio: `ErickRFM/Siii`.
- Trunk validado al inicio: `main@50b713eeac159213c8c5be6e41931c38c4354e52`.
- Configuración detectada: la rama **predeterminada** seguía siendo `feat/sis-foundation`; corregir vía GitHub Settings tras revisar protecciones/workflows.
- Ya integrado: PR #53 (revalidación de permisos y contexto institucional tras MFA). **No implementar un segundo proveedor de permisos**.
- PRs abiertos detectados: #40 (paginación), #48 (invitaciones) y #49 (roadmap). Revisar diff efectivo y CI antes de resolverlos.
- Módulos F01–F04 presentes, pero su integración productiva es un proyecto funcional distinto: UX no debe fabricar datos ni declarar endpoints completos.
- `AGENTS.md` obliga a utilizar endpoints reales, autorización de servidor, pruebas y CI en verde.

## Trabajo y dependencias

| Fase | Alcance | Rama / evidencia inicial | Estado |
|---|---|---|---|
| UX00 | Higiene Git, baseline y actualización de instrucciones | `docs/ux00-current-main-guidance-20261019` | Parcial: documentación; default branch por corregir |
| UX01 | Tipografía de campos móvil, viewport, safe areas, scroll de drawer, touch targets | PR #58 `fix/ux01-mobile-foundations-20261019` | PR abierto: validar CI y dispositivos |
| UX02 | Registro único de navegación, roles, barra inferior, iconos SVG | — | Pendiente |
| UX03 | Tokens, `@layer`, consolidación CSS gradual y contraste | — | Pendiente |
| UX04 | Formularios y tablas responsivas compartidas | — | Pendiente |
| UX05 | Gradebook móvil y agenda por día, misma API existente | — | Pendiente |
| UX06 | Portales aspirante/estudiante/Caja/administración | — | Pendiente; sujeto a endpoints reales |
| UX07 | Errores de ruta, estados, skeletons y movimiento reducido | — | Pendiente |
| UX08 | Playwright móvil/WebKit, capturas y verificación física | — | Transversal, pendiente de resultados |
| UX09 | Corte V3, PRs validados, SHA productivo y regresión | — | Pendiente |

## Reglas de entrega
1. Cada PR parte de `main` vigente y aborda una superficie concreta; no mezclar cambios de API y UI sin justificación.
2. Conserva componentes, permisos, rutas y contratos actuales; elimina CSS antiguo únicamente después de validar todas las pantallas consumidoras.
3. Reconciliar PR #40 antes de modificar listados de alumnos/docentes, y PR #48 antes de renovar formularios de invitaciones.
4. No copiar capacidades al cliente como fuente de autorización; `/capabilities` y las API siguen decidiendo permisos.
5. Mantener navegación por teclado, foco, Escape, salto al contenido, `aria-current`, `prefers-reduced-motion`, contraste y CSP/nonce.
6. Verificar 320/360/390/430 px, 768/1024 px y 1280/1440 px; claro y oscuro, zoom 200%, sin overflow global ni controles diminutos.
7. Cambios de alta criticidad (calificaciones, horarios, matrícula, Caja) requieren comprobación de datos, idempotencia y roles además de apariencia.
8. No se declara “hecho” por haber abierto un PR, superado typecheck o mostrado una Preview. Cierre = CI del head SHA + tests aplicables + QA específico + merge auditado.

## QA / comandos del repositorio

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:ui
```

Estas pruebas requieren el entorno de PostgreSQL/browser de CI. La inspección de código **no sustituye** las pruebas. Registrar por cada PR: SHA, trabajo cubierto, pruebas ejecutadas/omitidas, diff, problemas conocidos y capturas cuando existan.

## UX01 — evidencia inicial
- PR: https://github.com/ErickRFM/Siii/pull/58
- Archivos: `src/app/sii-v2.css`, `src/app/sii-ux-refinement.css`, `src/components/sii-app-shell.tsx`, `tests/ui/p0-accessibility.spec.ts`.
- Cambios: `svh`/`dvh`, 16 px para campos móviles, safe areas, objetivos táctiles ≥44 px en controles seleccionados, bloqueo/restauración del scroll detrás del cajón, cierre al cambiar breakpoint, prueba Playwright.
- **Estado al crear este registro:** branch/PR creados; CI y comprobación física pendientes. No afirmar despliegue en producción.

## Orden de trabajo siguiente
1. Finalizar UX01 mediante CI y pruebas.
2. Preparar UX02 con registro central de rutas y permisos *sin* reescribir PR #53.
3. UX03/UX04 en PRs pequeños con comparaciones visuales y preservación de tablas y formularios.
4. UX05 y UX06 una vez garantizada la compatibilidad de datos/servicios.
5. UX07/UX08 de forma transversal; UX09 exclusivamente sobre la versión validada.

## Actualización del kit institucional — 2026-10-23

La tabla anterior conserva el registro inicial de 2026-10-19 y no describe por sí sola el árbol actual. La integración de shadcn/Radix, controles nativos tipados y tokens comunes para las pantallas institucionales y públicas se entrega en [PR #106](https://github.com/ErickRFM/Siii/pull/106). Admisiones se enlaza a su página existente con `admissions.manage`; no se añaden permisos ni endpoints ficticios.

Guía y evidencia local: [SIII_UI_KIT.md](SIII_UI_KIT.md). El PR registra el CI del SHA final y el merge. Esta ampliación de componentes y coherencia visual no certifica por sí sola un cierre productivo global UX09 ni la configuración de servicios externos.
