# Cierre visual V11 y saneamiento de ramas — 2026-10-31

## Evidencia visual revisada
- Producción previa al cierre: `83ce33f8e79cca665efc481f93db8cba2c4739c3` (READY en `siii-three.vercel.app`).
- Motivo del bloqueo de PR #151: las capturas PNG de los 8 escenarios personales representaban la interfaz anterior **con bordes**. Eran incompatibles con el rediseño V11 autorizado **sin bordes** y provocaban diferencias de entre 5% y 6.6%, además de alturas móviles distintas.
- La captura sintética reproducible de GitHub Actions `41218745821` regeneró los 8 PNG: Estudiante/Docente, Día/Noche, 1344/390 px. Todos se inspeccionaron para comprobar cabeceras, métricas, contenido, controles y barra móvil. Son fixtures de prueba, no datos de personas reales.
- Los 8 `tests/ui/visual-baselines/*-linux.png` y los 8 fallback `*.png` son ahora la referencia de la nueva composición. Las imágenes anteriores se conservan íntegramente en el historial de Git.
- `docs/design/reference/siii-glass-approved.png` **no se modifica**. Sigue siendo la referencia editorial; los datos simulados de las pruebas pueden diferir de los números del diseño conceptual.

## Barreras de calidad conservadas
- `expectVisualBaseline` continúa comparando con `pixelmatch` **sin máscaras y sin aumentar el presupuesto de 5%**.
- Se comprueban las dimensiones completas de cada captura, presencia de métricas, límites horizontales, geometría de las superficies, ausencia de borde y sombra elevados, `backdrop-filter`, navegación por perfil y Axe WCAG.
- `compareApprovedReference` y su puerta de composición continúan activos.
- El flujo temporal de captura se retiró tras guardar las referencias. Ninguna automatización periódica debe actualizar PNGs para aprobar diferencias sin revisión.

## Auditoría de ramas
Se observaron 33 ramas remotas, incluida `main`: 17 ya completamente contenidas en `main` y 15 con commits de historia única (incluida la rama de este PR).

La tarea `.github/workflows/siii-branch-closeout.yml`, que se activa con un push a `main`, tiene lista explícita de las 32 ramas verificadas:
- Omite cualquier rama con un PR abierto y cualquier rama cuyo SHA haya cambiado entre comprobación y eliminación.
- Elimina directamente solo ramas sin commits propios por delante de `main`.
- Para ramas divergentes crea primero una etiqueta de respaldo bajo `archive/siii-20261031/<rama>`, verifica que apunte al SHA original y **solo entonces** elimina la rama.
- No actúa sobre ramas nuevas fuera de la lista ni sobre `main`. Las etiquetas conservan el código antiguo para revisión o recuperación posterior.
- El resultado efectivo de esta limpieza depende del permiso `contents:write` que GitHub conceda a Actions y debe comprobarse tras el merge.

## Aceptación del cierre
Fusionar el PR únicamente si el HEAD exacto obtiene `verify`, `ui` y `Companion live contract` verdes, sin obviar los tests visuales ni alterar umbrales. Confirmar en Vercel Production READY y verificar el SHA desplegado. Confirmar la ejecución del flujo de saneamiento y los refs restantes; informar cualquier fallo sin ocultarlo.
