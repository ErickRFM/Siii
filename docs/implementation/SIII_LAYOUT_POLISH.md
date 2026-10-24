# Afinado final de layout SIII

Continuación de `main@8731c6da4ee28af0fa7da09707a55455aaebe397` y PR #106. Conserva el kit shadcn/Radix integrado, los proveedores de estado y los contratos institucionales.

## Composición por módulo

| Pantalla | Afinado |
|---|---|
| Usuarios | Tabla a ancho completo hasta seleccionar una membresía; composición 7/5 para lista y detalle. Filtros agrupados, filas más legibles, paginación compacta y formularios de perfil/acceso conservados. |
| Invitaciones | Listado y alta 8/4 (7/5 con menor espacio). Estado y entrega juntos, acciones breves con nombres accesibles completos, política de reenvío desplegable y formulario con ayudas compactas. |
| Cuenta y seguridad | MFA y recuperación 7/5 respecto a contraseña y resumen de cuenta. Campos en una columna, jerarquía clara y panel informativo con altura propia. |
| Estudiantes y docentes | Lista dominante 8/4; búsqueda, edición/alta y paginación alineadas. Empty state con acceso al formulario o limpieza de búsqueda y retorno de foco. |
| Servicios universitarios | Lista y formulario 8/4, toolbar de actualización, título de alta según aviso/trámite/taller y estado vacío accionable. |
| Grupos e inscripciones | Oferta y alta 8/4; inscripción y asignación en dos paneles equilibrados. Filas con acción alineada y estados vacíos orientados a los formularios existentes. |
| Admisiones | Lista a ancho completo, filtros por folio/nombre/correo, estado y programa. Estados en español y detalle informativo 7/5 con foco de apertura/cierre. Programas identificados por ID y código para distinguir homónimos. |

Los headers reutilizan `SiiPageIntro`; el breadcrumb compacto del shell se mantiene. La presentación operacional se concentra en la sección `.sii-workspace` del CSS de componentes existente. No se añadió otra hoja global ni dependencias. Los selectores heredados conservan consumidores en otros módulos y permanecen intactos.

## Responsive y accesibilidad

- Grid de 12 columnas determinado por el ancho real del contenedor: una columna por debajo de 800 px útiles, 7/5 desde 800 px y 8/4 desde 1000 px para listas/formularios.
- Capturas a 1440, 1024, 768, 390 y 360 px; altura de viewport 1000 px. El detalle de Usuarios incluye captura adicional a 1440 px.
- Scroll horizontal confinado al componente accesible de tablas; sin overflow horizontal del documento. Admisiones utiliza ahora `SiiScrollRegion`, corrigiendo el hallazgo inicial `scrollable-region-focusable`.
- Campos y acciones alcanzables con scroll natural. Sticky únicamente en el detalle breve de Admisiones, con espacio y altura suficientes; los formularios largos no se recortan.
- Comprobaciones axe de WCAG 2/2.1/2.2 AA en claro y oscuro. CTA de limpieza que se desmonta devuelve foco al buscador; cerrar detalle devuelve foco a su acción de apertura.

## Evidencia reproducible

`tests/ui/layout-polish.spec.ts` crea exclusivamente fixtures PostgreSQL aislados y usa login/MFA y operaciones reales. Produce capturas en `.p0-local/layout-polish/after-*.png`; CI las incorpora al artefacto `synthetic-ux-matrix`.

Se guardaron 35 capturas iniciales antes de modificar producto; Usuarios e Invitaciones se repitieron con datos representativos y se añadió el detalle de membresía. El generador local `.p0-local/create-layout-report.cjs` reúne las capturas en `.artifacts/layout-polish/index.html`, con selección de viewport y comparación antes/después. Los archivos de evidencia contienen datos sintéticos, no datos institucionales reales.

Verificación local: lint y TypeScript correctos, 847/847 unitarias, build de producción correcto y audit 0. Playwright completó 135/135 casos; después de los últimos ajustes visuales se recompiló y aprobaron nuevamente 18/18 casos de composición, invitaciones y operaciones reales. La suite final incluye nueve casos de afinado. La revisión independiente detectó y comprobó las correcciones de programas homónimos y retorno de foco; no dejó hallazgos pendientes.

La suite HTTP completa y CI del SHA final son puertas previas al merge; su estado definitivo y los enlaces de las ejecuciones se registran en el PR de este afinado. Las pruebas usan datos sintéticos y no acreditan por sí solas operación productiva ni integraciones externas.

## Alcance preservado

No hay migraciones ni cambios en APIs, auth, MFA, permisos, auditoría o reglas de negocio. La consulta de Admisiones conserva el mismo límite institucional y autorización del servidor; solo añade ID/código del programa ya relacionado para presentar un filtro inequívoco. El detalle es informativo y no simula dictámenes ni acciones administrativas nuevas. La paginación del backend de Admisiones y la de Servicios siguen fuera de este pulido; no se presenta una paginación ficticia.
