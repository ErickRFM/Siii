# Auditoría CSS y fidelidad SIII Glass UI v1 — 27 de octubre de 2026

## Alcance confirmado
- `main` en `f16275e` no contiene el dashboard definitivo; la referencia aprobada se implementa en la PR #120.
- El árbol de la PR contiene **14 archivos CSS**: 12 importados en `src/app/layout.tsx` y dos hojas de componentes para administración/usuarios. Los imports activos deben mantenerse hasta verificar su uso.
- `src/app/sii-glass.css` supera los 52 KB y posee capas de reglas acumuladas; tamaño, duplicación y uso de `!important` implican deuda de cascada, **no** demuestran por sí solos que una regla sea borrable.
- `src/app/globals.css` contenía el login y dashboard anteriores, además de componentes todavía necesarios para el cambio de contraseña.

## Depuración ejecutada
Se analizaron las 96 páginas/componentes TSX de `src/` para buscar las clases del CSS global antiguo. No aparecieron referencias a `login-shell`, `dashboard-shell`, `module-grid`, `module-card`, etc.; sí aparecieron referencias a `primary-button` y `password-form` en flujos de cuenta. Se retiraron los bloques clásicos sin referencias y se conservaron los resets, variables transicionales y los estilos de contraseña. La hoja global pasó de 7,851 a 1,477 caracteres (reducción de 6,374, aproximadamente 81.2 %).

Se añadió `scripts/audit-css.mjs` al job de verificación, que lista tamaño, número de reglas, candidatas sin referencias literales, duplicación de selector y `!important` de cada CSS. Es deliberadamente conservador; las clases generadas dinámicamente requieren revisión adicional. Se añadió un contrato unitario para evitar que regresen los estilos clásicos.

## Conflictos arquitectónicos que aún merecen trabajo
1. **Cascada**: identificar qué selectores de `sii-v2.css`, `sii-premium-kit.css`, `sii-tailwind.css` y `sii-glass.css` se pisan. Consolidar por componente y token, no añadir otra capa de `!important`.
2. **Variables**: separar tokens semánticos del material (superficie, texto, elevación) y variantes claro/oscuro sin duplicar estilos de cada rol.
3. **Accesibilidad y desempeño**: paneles mates sin halos, contraste medido, limitación de blur en móvil, alternativas de movimiento y transparencia reducidos, foco visible.
4. **Reutilización**: `SiiiGlassPanel`, `SiiiGlassPanelHeading`, `SiiiGlassMetricsRow`, `SiiiGlassMetric` y kit institucional deben seguir siendo la fuente común para módulos.
5. **Datos**: no inventar total de créditos curriculares, avances por área, parciales, hitos, avisos con emisor ni pasarela de pagos. La captura es especificación visual; las cifras de muestra no son registros oficiales.
6. **Navegación**: mantener accesos por capacidad y no duplicar las tareas operativas de Compañero de Clase.
7. **Certificación**: un Preview READY no reemplaza Playwright, comparativa visual autenticada ni flujo real de pagos/notas/roles; verificar exactamente el SHA que será fusionado.

## Estrategia segura para el resto de hojas
- Ejecutar inventario CSS en CI y revisar los resultados frente a JSX, TS, clases dinámicas, temas, componentes de terceros y páginas públicas.
- Suprimir selectores verdaderamente huérfanos en lotes que se puedan revertir, manteniendo pruebas de snapshot, contrastes y estados de formularios.
- Si dos reglas se solapan, conservar la versión semántica y eliminar la antigua solo después de validar los cuatro estados: claro, oscuro, móvil y accesibilidad.
- No fusionar esta PR a `main` ni afirmar fidelidad pixel-perfect hasta que Verify SIS, UI, contrato Companion y Preview del mismo commit estén aprobados y haya capturas comparadas.

**Resultado de esta entrega:** limpieza real del CSS global antiguo y auditoría de cobertura instalada. El resto de CSS aún necesita poda selectiva; no está certificado como libre de estilos muertos.
