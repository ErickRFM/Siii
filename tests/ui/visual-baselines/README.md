# Referencias visuales V5

Estas capturas se revisaron a partir de sesiones y datos sintéticos aislados. Las capturas de portal fijan fecha y fuente, y las de login conservan su contenido real. El comparador exige las mismas dimensiones y permite como máximo un 5 % de píxeles distintos con umbral de color 0,1, sin máscaras. Las diferencias se escriben en los artefactos de Playwright. El umbral no convierte el porcentaje en una medida de fidelidad visual; ante cambios intencionales se revisan la captura y el diff antes de sustituir una referencia.

La referencia original de composición sigue siendo `docs/design/reference/siii-glass-approved.png` y conserva su comparador independiente. La fotografía de campus continúa omitida por indicación del usuario.

Las referencias con sufijo `-linux` se revisaron desde la ejecución real de GitHub Actions: su altura puede diferir de Windows por la composición tipográfica. Se comparan sin recortes y con el mismo umbral; las demás capturas usan la referencia compartida.

## Control Windows — 31 octubre 2026

`teacher-{dark,light}-390-win32.png` proviene de una exportación intacta de `main@f19d8a0e`, con Chromium headless 156.0.8078.4 (Playwright 1.64.0), reloj y fixtures de la suite. Ambas referencias compartidas fallaban también en ese control: 2426 px frente a 2413 px reales. Las capturas compartidas dejaban paneles inferiores sin pintar; las de Windows muestran el contenido completo. Se revisaron las imágenes antes de añadir la variante de plataforma.

El control de main y la rama de limpieza tienen dimensiones idénticas; difieren un 0,0471 % (oscuro) y un 0,0606 % (claro) de píxeles, incluidos identificadores sintéticos variables. Se mantienen las referencias compartidas/Linux, las dimensiones estrictas, la comparación sin máscaras y el máximo de 5 %. Evidencia y límites en `docs/audit/SIII_INTEGRATION_CLEANUP_2026-10-31.md`.
