# Afinado final de layout SIII — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Preserve the integrated kit from PR #106.

**Goal:** Afinar los siete módulos del encargo con contenido dominante, mejor densidad y evidencia visual comparable.

**Architecture:** Conservar Next.js, componentes shadcn existentes, permisos, handlers y contratos. Ajustar composición JSX y reglas del kit existente; no añadir otra hoja global de overrides. Grid de 12 columnas: 8/4 para listado y formulario, 7/5 cuando el detalle exige más ancho; una columna cuando el espacio real no admite ambos.

**Tech Stack:** Next.js/React/TypeScript, kit SIII, Tailwind/CSS existentes, Playwright y PostgreSQL sintético local.

**Spec:** Encargo del usuario «SIII — AFINADO FINAL DE LAYOUT, DISTRIBUCIÓN Y JERARQUÍA VISUAL», continuación de main/PR #106.

## Global Constraints

- No rehacer la migración ni abrir otro rediseño; mantener paleta y arquitectura.
- No cambiar APIs, auth, MFA, permisos ni reglas de formularios.
- Capturas con datos sintéticos y mismo tamaño de viewport antes/después.
- Sticky solo para paneles que caben; formularios largos conservan scroll natural y foco visible.
- Reutilizar empty states, botones, tablas y encabezados del kit.

## Review Focus

- Formularios largos en desktop de poca altura: acciones y foco alcanzables sin clipping.
- Usuarios sin selección: listado a ancho completo; detalle seleccionado legible sin perder sus operaciones.
- Mobile y tablet: sin overflow del documento; solo tablas con scroll horizontal local.
- Listados vacíos o filtrados: contexto, explicación y CTA real sin simular resultados.
- Admisiones: filtros locales sobre solicitudes autorizadas; detalle informativo real sin inventar dictámenes.

## Tasks

- [x] Capturar baseline de los siete módulos con fixture aislado y registrar medidas responsive.
- [x] Usuarios: filtros compactos, listado dominante, detalle 7/5 al seleccionar; preservar formularios e historial.
- [x] Invitaciones: 8/4, alta suficientemente ancha, campos y ayudas compactos, empty state con acceso al alta.
- [x] Cuenta y seguridad: MFA y contraseña equilibrados; resumen de cuenta compacto, formularios verticales correctamente asociados.
- [x] Estudiantes/docentes: 8/4, filtros y tabla más compactos, alta/edición proporcionadas y estado vacío útil.
- [x] Servicios: 8/4, toolbar coherente, contenido principal dominante, formularios y empty state.
- [x] Grupos/inscripciones: 8/4 para oferta; inscripciones y asignaciones equilibradas, listados de filas claros y acciones alineadas.
- [x] Admisiones: header compartido, listado dominante, filtros por texto/estado/programa, estados en español, selección y detalle, CTA de portal real.
- [ ] Capturas finales, teclado/axe, regresiones funcionales, lint/typecheck/unit/build/audit verificados; completar integración y CI del SHA final.
- [ ] Documentar comparación, revisión independiente y PR con CI verde; merge conforme al encargo vigente.

## Baseline

Main remoto verificado: `8731c6da4ee28af0fa7da09707a55455aaebe397`; único PR abierto ajeno #101 (Compañero). Se usa la misma copia de trabajo en una rama desde main para continuar el diseño integrado y conservar la infraestructura local de capturas. Sin dependencias nuevas ni cambios de esquema previstos.

## Registro de ejecución

- Baseline: 35 capturas en cinco anchos; 6/7 pruebas iniciales correctas y un hallazgo de teclado en la tabla anterior de Admisiones. Se conservan las capturas originales.
- Primera verificación del pulido: 8/8 casos de layout/axe/foco correctos. Lint/typecheck, 847 unitarias y audit 0.
- Revisión independiente: programas homónimos y retorno de foco al limpiar vacíos corregidos, con regresiones que fallan sobre el build previo. Revisión posterior aprobada condicionada a CI verde.
- Suite completa: 135/135. Tras el último afinado de Invitaciones/estados vacíos: build de producción y 18/18 casos focales correctos; se corrigió el selector de una prueba para usar el combobox y su nombre accesible real. Capturas finales en los cinco anchos y oscuro móvil; comparativa en `.artifacts/layout-polish/index.html`.
- Integración HTTP y CI del SHA final siguen en curso; el cierre remoto se registra en el PR, sin inferirlo a partir de capturas únicamente.
