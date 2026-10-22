# CI de main: contraste del monograma durante entrada

Base main809c526d,22octubre2026. CI posterior39813643250 terminó FAILURE:826unitarias y485integraciones aprobadas,83/84UI. En user-management.spec.ts47, después del flujo real de recuperación con MFA, axe encontró color-contrast en .sii-institution-monogram. Build final/audit posteriores quedaron omitidos por ese fallo; no se declaran aprobados. Log original preservado en workspace primaria `.p0-local/main-809c526d-job.log`1193–1249 y en GitHub Actions. No se fusionaron otros dominios tras detectar el rojo.

## Causa reproducida y revisión

La hipótesis de interpolación directa se descartó:8controles por frame de cambio de tema pasaron antes de modificar CSS. La causa real es opacity0→1 del enlace institutional-item y su ancestro .sii-page>.sii-content-grid durante sii-kit-appear. El color computado directo del span no representa el color compuesto visible a través de sus ancestros.

Cuatro casos nuevos usan todas las hojas reales, la jerarquía de dashboard y axe sobre el monograma. Con movimiento normal, congelan todas las animaciones ancestrales a43ms para medir un frame real sin esperar su desaparición.1440/390 y claro/oscuro fallan4/4; el frame oscuro completo mide2.07:1 frente a4.5:1. Las cuatro regresiones previas de catálogo14RAF siguen verdes.

La primera propuesta corregía sólo el enlace; una revisión independiente Important detectó que la fixture omitía content-grid. Se amplió la jerarquía y el bloqueo ancestral: volvió a fallar4/4 con aquella reparación incompleta. La solución final reutiliza sii-v4-rise, ya existente, para ambos contenedores; conserva desplazamiento10px, duración430/440ms, easing, delays, colores finales y reduced-motion. Los únicos consumidores TSX de content-grid son dashboard/page.tsx42 y admissions/page.tsx47. No cambia layout, permisos, MFA ni datos. Segunda revisión sin Critical/Important/Minor, Important cerrado.

## Evidencia final local

Worktree financial-authority reutilizado limpio, rama nueva fix/dashboard-monogram-contrast-20261022 desde809c526d. PostgreSQL sintético nuevo siii_monogram_test en127.0.0.1:55439; sólo migraciones existentes0000–0024. Servidor exclusivo3206 y harness UI original con build de producción, login/invitaciones/reset/MFA reales. No se enviaron correos ni se usaron datos institucionales reales.

- npm ci:375paquetes,audit0; aviso basal de allow-scripts conservado.
- npm run lint y typecheck finales:exit0.
- npm test final:826/826,56archivos,6.80s.
- Build dentro de globalSetup original:exit0,31/31páginas.
-8/8contraste focal:4catálogo14RAF y4frames ancestrales con axe,4.9s.
-15/15UI sobre build final,1.7min:los8anteriores +7flujos completos existentes de user-management, incluido el caso MFA que falló en CI. Se mantienen todas sus aserciones de seguridad, bearer, consentimiento, consumo,401 y axe; ningún timeout se amplía.

Comandos: `npx playwright test --config .p0-local/dashboard-contrast.playwright.config.ts` y `npm run test:ui -- --config .p0-local/monogram-flow.playwright.config.ts`. La configuración ignorada importa la original y sólo acota archivos, rutas absolutas y puerto3206. Logs RED/GREEN y traces en `.p0-local/dashboard-*` y `monogram-*`; el fallo original no se sobrescribe.

CI global del SHA publicado sigue siendo requisito antes de integrar esta reparación. No se afirma main verde ni cierre de toda la regresión premium. La estabilización de fotografías de viewport es otro incremento de QA; no sustituye los frames con movimiento normal. Sin cambios de F2/schema/migraciones, sync, producción o reglas de rama.
