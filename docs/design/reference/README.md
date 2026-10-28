# Referencia visual aprobada — SIII Smoked Glass

Imagen aprobada: `siii-glass-approved.png`

- No sustituir ni modificar esta imagen.
- Debe usarse como referencia para todas las capturas y comparaciones.
- Composición, proporciones, fondo cálido, cristal mate sin bordes luminosos, espaciados, tipografía, medidores y distribución deben coincidir con esta referencia.

## Estado
- Guardada permanentemente en este repositorio.
- PR #120 no acreditó la fidelidad requerida. La corrección posterior conserva este PNG y compara capturas autenticadas a 1344×896, geometría y materiales, además del diff completo sin máscaras.

## Recursos de implementación

- Por indicación del usuario se omite temporalmente la fotografía de fondo; el dashboard usa un fondo neutro. La imagen aprobada permanece como referencia inmutable.
- `public/fonts/siii-inter.woff2`: Inter Variable v4.1, fuente local para estabilizar capturas; licencia en `public/fonts/INTER-LICENSE.txt`, procedencia [Inter v4.1](https://github.com/rsms/inter/tree/v4.1).
- `scripts/compare-approved-reference.mjs`: verifica el hash inmutable, exige dimensiones idénticas y genera diff, overlay y métricas. El porcentaje de píxeles distintos no se presenta como porcentaje de fidelidad. El umbral de comparación completa no se modifica para aceptar una captura nueva.
- `public/visuals/siii-reference-ribbon.png`: cinta decorativa transparente generada a partir de la referencia aprobada; no contiene la fotografía ni texto de la interfaz.
