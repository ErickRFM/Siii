# SIII — Premium UI Kit · implementación transversal

## Objetivo
Renovar el shell y todas las superficies principales de SIII con diseño institucional mate/glass, interacción moderna y componentes compartidos, sin modificar autorización, datos, transacciones, contratos de red, MFA ni flujos de trabajo.

## Referencias y decisión de arquitectura
Se adoptan **patrones** de shadcn/ui (componentes transparentes y accesibles), Radix/command palette (teclado, foco, overlays) y dashboards como Tremor (métricas, estados, tablas). No se ha instalado shadcn, Radix ni Motion como dependencia: actualmente SIII no usa Tailwind; añadir esas bibliotecas de golpe introduciría migraciones de CSS y lockfile innecesarias. Los componentes creados en este PR son originales, editables y del proyecto; no declarar que son implementaciones oficiales de esos kits. Si se incorpora código externo posteriormente, mantener avisos de licencia y no mezclar varias implementaciones del mismo control.

## Componentes implementados
- \`SiiAppShell\`: sidebar compacto/expandido (preferencia local y adaptación móvil); drawer móvil con Escape, trampa de foco y bloqueo de scroll; título de página basado en la ruta.
- \`SiiNavIcon\`: iconos SVG y sin glifos dependientes de fuentes externas.
- \`SiiQuickSwitch\`: navegación por teclado Ctrl/Cmd+K. Solo muestra rutas proyectadas desde las capacidades cargadas; los endpoints siguen autorizando.
- \`SiiPageIntro\`, \`SiiSectionHeader\`, \`SiiMetricTile\`, \`SiiStatusPill\`, \`SiiEmptyView\`, \`SiiModuleTile\`, \`SiiSkeleton\`: componentes reutilizables compartidos para presentación. No procesan datos ni permisos de negocio.
- \`sii-premium-kit.css\`: tokens UI, superficies, formularios, tablas, botones, estados de interacción, modo oscuro y presentación responsive.
- \`sii-kit-components.css\`: estilos específicos de esos componentes, sin crear nuevos mecanismos de autenticación.

## Pantallas integradas
Dashboard; directorio de módulos; Cuenta y seguridad; catálogo y módulos de Registros/Control Escolar, Inscripciones y grupos, Libro de calificaciones, Planificador semanal y Servicios Universitarios. Las pantallas de admisiones, invitaciones, login y administración reutilizan la capa visual transversal sin modificar los formularios existentes.

## Reglas de diseño
1. Mantener el vino institucional, marca SII, temas claro y oscuro, superficies mate y tipografía legible.
2. Los iconos decorativos son \`aria-hidden\`; controles y enlaces tienen nombres accesibles.
3. Módulos sin permiso jamás son enlaces, y el buscador rápido no ofrece privilegios adicionales.
4. Acciones críticas usan confirmaciones y autorización existentes; jamás reemplazar MFA o auditoría con modales cosméticos.
5. Respetar \`prefers-reduced-motion\`, \`prefers-reduced-transparency\`, contraste alto, \`focus-visible\` y tamaños táctiles.
6. En pantallas pequeñas, las tablas permanecen nativas dentro de \`SiiScrollRegion\` desplazable: nunca cortarlas silenciosamente.
7. Priorizar componentes compartidos; evitar nuevas hojas globales por cada vista y consolidar CSS heredado solo con pruebas visuales completas.

## Evidencia mínima antes de merge
\`npm ci && npm run lint && npm run typecheck && npm test && npm run test:integration && npm run build && npm run test:ui\`

Matriz manual: 320, 360, 390, 430, 768, 1024, 1280 y 1440 px; temas claro/oscuro; 200% zoom; teclado; lector de pantalla; contraste; animación reducida; formularios guardando datos reales sintéticos; permisos por rol, MFA y estados de error.

No anunciar como desplegado ni QA físico final hasta contar con el resultado del CI del último commit y revisión visual por dispositivos.
