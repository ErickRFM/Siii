# Contraste de pestañas durante el cambio de tema

Fecha: 2026-10-22. Base: `68feeacdafb86da42951e2ca060dbb8a988238fa`.

## Cambio

La pestaña activa cambiaba inmediatamente el color del texto, pero interpolaba
el fondo durante 180 ms. Al pasar a oscuro aparecía texto `#f090ae` sobre el
fondo claro `#fcecf0`: contraste 1.9768, inferior a 4.5. También fallaba el
cambio inverso. Este comportamiento originó el fallo de axe en
`consolidated-modules.spec.ts:32` del run CI `39729087125`.

Se incluye `.sii-catalog-tab` en la regla existente de cambio atómico de colores.
Se conservan las transiciones de transformaciones, bordes y sombras.
No cambia lógica, permisos ni datos institucionales; no hay migración.

## Regresión y evidencia local

`tests/ui/catalog-tab-theme-contrast.spec.ts` carga las hojas CSS reales en el
orden del layout sobre una fixture visual sintética. Inspecciona los colores
computados antes del cambio, en el mismo task del cambio y durante los siguientes
14 frames, con movimiento normal. Comprueba contraste >= 4.5 en ambas direcciones
y a 1440/390 px. No espera a que el defecto desaparezca ni desactiva animaciones.
La fixture no pretende acreditar el flujo institucional completo.

- Antes del CSS: 4/4 pruebas fallaron. En el instante del cambio: contraste 1.9768
  hacia oscuro y 1.7592 hacia claro; los frames intermedios también fallaban.
- Después del CSS: 4/4 pruebas pasaron.
- `npm ci --ignore-scripts`: 375 paquetes, 0 vulnerabilidades.
- `npm rebuild argon2 esbuild`: exit 0.
- `npm run lint`: exit 0.
- `npm run typecheck`: exit 0.
- `npm test`: 53 archivos, 813 pruebas aprobadas.
- `npm run build`: exit 0, compilación 21.0 s y 28/28 páginas generadas.
  Conserva el aviso existente de Next sobre el plugin ESLint no detectado.

La ejecución local no abrió servidor/puertos ni consultó PostgreSQL. Para repetir
sin el setup institucional, crear `.p0-local/contrast-playwright.config.ts`
(ignorado) con:

```ts
import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'../tests/ui', testMatch:'catalog-tab-theme-contrast.spec.ts',
  workers:1, reporter:'line', outputDir:'./contrast-results',
  use:{browserName:'chromium', headless:true, locale:'es-MX'},
});
```

Ejecutar `npx playwright test --config .p0-local/contrast-playwright.config.ts`.
La configuración normal de CI descubre igualmente estos cuatro casos.
El flujo institucional original con axe conserva todos sus checks; no se repitió
localmente para evitar el setup que crea roles en el cluster compartido.
