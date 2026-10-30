# SIII · Piloto funcional controlado de perfiles

Fecha de preparación: 2026-10-28. Alcance: SIII web (Next.js), perfiles estudiante, docente y administración; el historial de asistencia se consulta desde Compañero, sin duplicar su pase de lista.

## Requisitos de inicio
- [ ] Último commit del PR verde: lint, typecheck, unit, integración, UI/Playwright, contratos SIII–Compañero y build.
- [ ] Despliegue Preview identifica el **mismo SHA** que pasó CI y responde correctamente.
- [ ] Roles de prueba autorizados, con institución/programa/expediente vinculados y datos **sintéticos o expresamente autorizados**.
- [ ] No se usan usuarios o cobros reales para pruebas de escritura sin autorización institucional.
- [ ] Preparados datos de prueba: 2 materias de periodos distintos, docentes con asignación, al menos 2 estudiantes, 2 órdenes y 2 movimientos de caja, un trámite y una calificación publicada.
- [ ] Confirmadas sesiones y acceso a la única base de datos productiva **solo para lecturas autorizadas**; pruebas de escritura en entorno efímero.
- [ ] Registrar captura y resultado de cada prueba con SHA, rol, navegador, ancho, entorno y folio de incidencia.

## Fase A: estudiante (sin escrituras)
- [ ] Acceso y cierre de sesión; usuario/correo verificado y contraseña correctos; sin revelar la existencia de cuentas ajenas.
- [ ] Portada muestra expediente oficial propio, sin cifras de ejemplo ni campos cruzados.
- [ ] Académico: inscripciones por periodo, grupo, docentes vinculados, calificaciones **solo publicadas**, historial y exportación CSV informativa.
- [ ] Finanzas: conceptos, importes, pagado, saldo, vencimiento y movimientos de Caja con importes consistentes.
- [ ] Ordenamiento ascendente/descendente por materia, fecha, monto, matrícula y nota; búsqueda con y sin acentos; paginación; limpiar búsqueda.
- [ ] Perfil, correo institucional, vínculo y seguridad (contraseña, MFA) consistentes.
- [ ] Servicios: ver trámites propios y sus estados; error explícito si una operación no está disponible.
- [ ] Asistencia: únicamente consulta de historial desde Compañero; si se cae el proveedor, mostrar indisponibilidad, no «sin asistencias».
- [ ] **No** mostrar pase de lista ni horario operativo de Compañero en el portal de SIII.

## Fase B: docente (lectura; escritura solo con datos de prueba)
- [ ] Login, permisos, perfil, asignaciones y materias correspondientes.
- [ ] Listas oficiales con matrícula y nombres ordenables, sin estudiantes de otros grupos.
- [ ] Componentes de evaluación con ponderación y estados válidos.
- [ ] Guardar borrador, recuperar tras recargar y verificar que el alumno **no ve** la nota privada.
- [ ] Publicar resultados **solo en entorno de prueba**, verificar que el alumno propio sí los ve.
- [ ] Probar rectificaciones autorizadas, trazabilidad, doble clic y control de publicación.
- [ ] Sin controles de pase de lista de Compañero.

## Fase C: roles y consistencia
- [ ] Administración: gestión de usuarios, invitaciones caducables, roles y límites institucionales.
- [ ] Control Escolar: grupos, inscripciones y vínculo correcto docente/alumno.
- [ ] Caja: conciliación de orden, abono, saldo y comprobante; **no afirmar cobro en línea** sin pasarela real habilitada.
- [ ] Acceso cruzado: estudiante A no consulta alumno B; docente A no edita grupo B; sesión revocada no sigue operando.
- [ ] Errores: 401/403/404/409 claros, 503 en proveedor caído, estado vacío sin datos inventados.

## Fase D: UX y accesibilidad
- [ ] Anchos 360, 390, 430, 768, 1024 y 1440 px, en modo claro y oscuro.
- [ ] Sin scroll horizontal **de toda la página**; scroll de tabla localizado y accesible por teclado.
- [ ] Tablas legibles en escritorio y tarjetas compactas en móvil, con valores y acciones idénticos.
- [ ] Contraste WCAG AA, foco visible, navegación teclado, etiquetas, orden de lectura y mensajes de estado.
- [ ] Formularios: validación en campos, errores no destructivos, estado de carga, botón deshabilitado durante operación y confirmación antes de cambiar datos.
- [ ] Sin texto cortado, modales fuera de pantalla, columnas desbordadas ni barras de navegación duplicadas.

## Evidencia y cierre
Para cada incidencia registrar ruta, rol, entorno, SHA, ancho/tema, pasos, resultado esperado, resultado real y captura. Se rechaza el pase a producción si hay fallos de autenticación/autorización, datos cruzados, pérdidas de escritura, errores de build/CI o desbordes críticos móviles. No confundir **PR verde**, **Preview lista** y **piloto real aprobado**: son tres puertas diferentes.
