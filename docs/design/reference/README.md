# Referencia visual aprobada — SIII Smoked Glass

Imagen aprobada: `siii-glass-approved.png`

- No sustituir ni modificar esta imagen.
- Debe usarse como referencia para todas las capturas y comparaciones.
- Composición, proporciones, fondo cálido, cristal mate sin bordes luminosos, espaciados, tipografía, medidores y distribución deben coincidir con esta referencia.

## Estado
- Guardada permanentemente en este repositorio.
- PR #120 no acreditó la fidelidad requerida. La corrección posterior conserva este PNG y compara capturas autenticadas a 1344×896, geometría y materiales, además del diff completo sin máscaras.

## Recursos de implementación

- `public/visuals/siii-campus-reference.png`: fondo decorativo reconstruido con `image_gen` a partir de esta referencia. Instrucción: retirar toda la interfaz, textos e iconos, conservar encuadre y paleta del campus desenfocado. No contiene controles ni datos de la aplicación; no es el original del fondo y su reconstrucción sigue siendo una diferencia revisable.
- `public/fonts/siii-inter.woff2`: Inter Variable v4.1, fuente local para estabilizar capturas; licencia en `public/fonts/INTER-LICENSE.txt`, procedencia [Inter v4.1](https://github.com/rsms/inter/tree/v4.1).
- `scripts/compare-approved-reference.mjs`: verifica el hash inmutable, exige dimensiones idénticas y genera diff, overlay y métricas. El porcentaje de píxeles distintos no se presenta como porcentaje de fidelidad. El umbral de comparación completa no se modifica para aceptar una captura nueva.
