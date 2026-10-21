# SIII — UX coherente en todo el sistema (C37)

Auditoría sobre `main@c1a166e93d41`. PR #66 integró detalles V4 únicamente en acceso, dashboard y administración. Sin embargo, los módulos académicos y de gestión comparten `sii-catalog-*`, `sii-panel`, `sii-outline-button`, estados y design tokens. Por tanto **no debemos reimplementar cada pantalla**.

## Qué cambia
- `sii-system-coherence.css`, importada última, extiende los mismos tokens matte-light/dark y ritmos de bordes, tarjetas, tablas, formularios, pestañas y paginación a **académico, registro, operaciones, horarios, calificaciones, servicios, usuarios, roles, invitaciones**.
- Prioriza ancho usable en móvil; tabla con scroll local, controles con objetivos táctiles de 44px y estilos de foco.
- Nunca anima opacidad ni superficies cromáticas; se respeta movimiento reducido, transparencias reducidas y alto contraste.
- La consulta de instituciones administrables tiene **reintento accionable** en errores, no solo texto de alerta; no altera endpoints ni autorización.

## Gates de aprobación
1. Lint, TypeScript, unitarias, integración HTTP y PostgreSQL, Playwright, build y auditoría sin fallos.
2. Matriz Playwright de 10 rutas para superadministración, temas claro/oscuro, 390px y capturas adicionales a 1440px con reportes WCAG 2/2.1/2.2 AA y ausencia de scroll global.
3. Restricción y navegación de guest/teacher siguen protegidas por los tests de roles existentes; permisos siempre se comprueban en servidor.
4. **No confundir** CSS compartido con equivalencia visual perfecta de flujos: pago/Admisiones (issue #63) tienen pendientes de identidad y no pueden marcarse completos con esta fase.
5. No ejecutar migraciones ni desplegar una versión distinta de la aprobada; comprobar alias productivo y commit al finalizar.
