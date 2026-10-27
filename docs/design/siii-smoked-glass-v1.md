# SIII — Smoked Glass UI v1

> **Referencia visual inalterable:** captura de Estudiante aprobada el 27 de octubre de 2026. No sustituir el estilo por otra plantilla.

## Reglas de diseño
- Fondo cálido grafito / café humo; modo oscuro principal y modo claro Cream Glass. No usar neón, brillo perimetral ni trazos luminosos.
- Cristal mate semitransparente con desenfoque moderado. Paneles exteriores con radio consistente de 17 px; evitar blur anidado.
- Sidebar de shadcn/ui expandible y compatible con móvil; buscador Ctrl+K, identidad institucional y controles de tema.
- Gradiente ambiental discreto. Jerarquía: navegación, bienvenida, resumen en cuatro métricas, calificaciones/finanzas/trámites, progreso y columna lateral.
- Las tres secciones centrales contienen información real. La derecha muestra calendario informativo, avisos, accesos y próximas fechas solo si existen en los contratos.
- Mantener accesibilidad WCAG AA, foco visible, modo alto contraste, movimiento reducido y superficies opacas cuando se solicita reducción de transparencia.
- Optimizar para pantallas 320, 360, 390, 768, 1280 y 1440 px. Sin desbordamiento horizontal, ni doble scroll evitable.

## Reutilización
- `src/components/ui/siii-glass-kit.tsx` ofrece la métrica de cristal común para Estudiante y Docente.
- `src/components/ui/sii-kit.tsx` reúne tarjetas, encabezados, vacíos y métricas utilizadas por otras pantallas institucionales.
- `src/components/ui/sidebar.tsx`, Radix, Lucide y CSS variables son la base compartida.
- `src/app/sii-glass.css` es la última capa de estilos; no implementar temas paralelos por perfil.
- Toda lógica de roles, capacidades y permisos permanece en sus servicios, no en el CSS.

## Fuente de verdad y límites
- Nunca inventar promedio general, créditos totales oficiales, fechas académicas ni pagos.
- El promedio mostrado sobre calificaciones publicadas **no** equivale al promedio general oficial.
- El aro académico refleja cobertura de publicaciones entre las inscripciones consultadas, **no** porcentaje oficial del plan.
- SIII no sustituye el pase de lista y los horarios operativos de Compañero de Clase.
- No inventar botones que no ejecuten la acción real; usar estados vacíos explícitos cuando un módulo no esté habilitado.

## Release gate
- GitHub CI con lint, typecheck, unitarias, navegador/accesibilidad y contratos institucionales en verde.
- Vercel Preview `READY` para el mismo commit que aprueba CI.
- Comparación visual autenticada por perfil antes de integrar a main. Nada de afirmar un 100 % basándose solo en build.
- Verificar navegación y acciones relevantes de Estudiante, Docente, Admisiones, Caja, Servicios Escolares, Dirección, Coordinación, Admin y Superadmin.

## Transversalidad cerrada en código
El selector `siii-glass-workspace` aplica el material compartido a Admisiones institucionales, catálogos, operación académica, registro escolar, Caja, roles, usuarios, administración, invitaciones, programación de clases, calificaciones y portales personales. La lógica, las consultas y las autorizaciones de cada módulo siguen en sus implementaciones originales.

El tema oscuro se puede activar desde la barra superior y queda guardado. Para conservar el comportamiento del sistema y sus pruebas de navegación preexistentes, el estado inicial sin preferencia guardada sigue siendo claro. En cualquiera de los dos temas las superficies utilizan los mismos componentes y jerarquía de interfaz.

El fondo `public/visuals/siii-warm-architecture.svg` es una composición vectorial original, estática y deliberadamente desenfocada; el diseño aprobado sigue siendo referencia de proporciones y materialidad, no un screenshot embebido.
