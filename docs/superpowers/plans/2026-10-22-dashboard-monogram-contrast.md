# Contraste del monograma institucional durante entrada

Base main809c526d. CI39813643250 falla axe color-contrast en sii-institution-monogram al terminar recuperación con MFA. Se descartó interpolación directa mediante8controles de cambio de tema; la causa reproducida es opacidad de los ancestros durante entrada. Conservar cuatro regresiones catálogo14RAF y añadir cuatro axe sobre frameCSS43ms, ambos temas y1440/390, con jerarquía real .sii-page>.sii-content-grid>panel>item>monograma y todas las animaciones de ancestros congeladas.

Reutilizar sii-v4-rise posicional existente para content-grid e institution-item, conservando duración/easing/delays/colores finales/reducedmotion. No tocar backend, MFA, CSS de otros componentes ni relajar axe. Repetir8UI focales y flujo real de recuperación, lint/tipos/unit/build; revisión independiente yCI antes de integrar el parche de estabilización de main. Preservar fallo original y RED del arreglo incompleto señalado por revisión.
