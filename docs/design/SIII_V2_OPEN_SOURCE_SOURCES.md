# SIII V2 — Fuentes de UI abiertas y decisiones de migración

## Criterio de integración
Este trabajo rediseña SIII sin sustituir su dominio académico, autenticación, autorización, modelos institucionales o contratos con Compañero. La composición y los componentes visuales son reemplazables; los datos y servicios permanecen propios.

| Fuente | Código | Licencia | Uso |
| --- | --- | --- | --- |
| Kiranism Next Shadcn Dashboard | https://github.com/Kiranism/next-shadcn-dashboard-starter | MIT | Adaptación de `src/components/layout/page-container.tsx` a `src/components/ui/siii-workspace-frame.tsx`, con encabezado, acciones y estado de carga |
| shadcn/ui | https://github.com/shadcn-ui/ui | MIT | Base de primitivas UI y accesibilidad; SIII ya utiliza su arquitectura de componentes |
| Tabler | https://github.com/tabler/tabler | MIT | Referencia de jerarquía, densidad operativa, tarjetas y tablas; sin importar Bootstrap, JS, ApexCharts ni librerías ajenas |
| Origin UI | https://github.com/shadcn/originui | MIT en ese repositorio | Referencia de controles de formularios; componentes ajenos no incorporados aún |

### Licencia conservada de la adaptación Kiranism

MIT License

Copyright (c) 2023 Kiranism

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Nueva arquitectura de experiencia (SIII V2)
1. **Marco de aplicación**: navegación contextual autorizada, búsqueda global y acceso a sesión.
2. **Página de módulo**: encabezado, alcance de la consulta, acción primaria, barra de filtros y cuerpo.
3. **Lista y tabla**: búsqueda/filtrado/ordenación consistentes, columnas con jerarquía y tarjetas en móvil.
4. **Detalle y trámite**: formulario progresivo con revisión, folio y seguimiento visible.
5. **Estados**: cargando, acceso no disponible, sin datos, datos parciales, errores y reintento.
6. **Roles**: alumno, docente, registro/servicios, finanzas, administración y super administración conservan capacidades individuales pero comparten gramática visual.

## Auditoría visual y gates de liberación
- Capturas sintéticas autenticadas en día/noche y móvil/escritorio, sin datos de usuarios reales.
- E2E de teclado, lectores de pantalla, contraste, estado vacío, estados de carga y desbordamiento.
- La referencia previa `siii-glass-approved.png` corresponde a un diseño **retirado**. Debe reemplazarse mediante nuevas capturas revisadas por humanos; no se permite desactivar el gate de capturas ni elevar tolerancias.
- `main` y producción permanecen intactos hasta pasar las validaciones.
