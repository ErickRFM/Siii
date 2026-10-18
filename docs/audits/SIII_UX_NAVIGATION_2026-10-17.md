# SIII — Auditoría UX/UI sénior incremental (17-10-2026)

**Base inspeccionada:** main `7cf7aba3629d0a51c9ba5778213f23d138c5a16c`. Revisión de código, sin sesión autenticada de producción ni pruebas físicas de navegador.

## P0 · Sidebar parpadeante y falso «Restringido»
Cada página montaba `SiiAppShell` y su propio `InstitutionCapabilitiesProvider`; al navegar, `data` partía en null y la barra presentaba «Restringido» hasta recibir GET /capabilities. También el breadcrumb dependía temporalmente del resultado de permisos.

**Implementado:** shell persistente en `/dashboard/layout.tsx`, ruta activa por URL con `usePathname`, proveedor que conserva la misma instancia al cambiar de módulo de la misma institución, y reinicialización con `key` al cambiar de institución. Durante la verificación se usa «Verificando…» en lugar de una denegación. 401/403/error invalidan los permisos en el proveedor; la API continúa aplicando autorización en cada petición.

## P1 · Detalles de interacción
Sidebar con scroll propio en escritorio, foco de teclado evidente, área de botones secundarios de 44px, espacios de encabezado uniformes, feedback hover de 160 ms sin cambios de identidad, y movimiento reducido.

## Matriz de verificación
- Inicio → Catálogo → Personas → Grupos → Horarios → Calificaciones → Servicios → Usuarios → Roles → Invitaciones → Administración sin desmontar sidebar.
- Roles de docente, coordinación y administración; múltiples instituciones; permisos revocados mientras la sesión permanece abierta.
- Simular latencia, 401/403/500 y pérdida de red al cargar permisos; observar mensajes y evitar permisos cruzados.
- Revisión visual con tema claro/oscuro a 360, 390, 768, 1024 y 1440 px; teclado, Escape, contraste, tablas, formularios y paginación.

## Trabajo relacionado
PR #34 (matte glass) está abierto y reportado con conflictos; no se sobreescribe `sii-glass.css` ni se hace merge silencioso. PR #40 de operación académica permanece independiente. No declarar verificación de producción hasta ejecutar CI y pruebas en navegador autenticado.

Validación sugerida: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:ui`.
