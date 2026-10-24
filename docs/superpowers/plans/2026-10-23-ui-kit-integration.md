# Integración operacional del kit SIII

**Objetivo:** integrar el kit existente en las pantallas institucionales y públicas, conservando los flujos reales, y fusionar mediante PR revisado con CI verde.

**Arquitectura:** shadcn/Radix para composición y navegación; controles nativos tipados para formularios que dependen de FormData, validación HTML y referencias DOM. Los endpoints, autorización, auditoría y contratos de Compañero siguen siendo los vigentes.

**Alcance autorizado:** completar el rediseño local, reutilizar sus componentes en los módulos existentes, corregir regresiones de integración y realizar merge. Las capacidades sin backend no se convierten en acciones aparentes. No se requieren cambios de esquema ni migraciones para esta fase visual.

## Tareas

- [ ] Completar controles compartidos (select nativo, textarea, tabla sin segundo scroll) y probar semántica, validación y atributos.
- [ ] Migrar los controles de catálogos, expedientes, operación académica, horarios, calificaciones, servicios, administración, usuarios, roles, invitaciones, admisiones y seguridad sin cambiar sus handlers.
- [ ] Unificar tokens del kit y estilos anteriores; mantener superficies mate, temas, foco, movimiento reducido y tamaños móviles.
- [ ] Corregir navegación del shell: enlaces válidos, landmarks, cierre del drawer al navegar/cambiar breakpoint y foco de búsqueda.
- [ ] Ejecutar lint, typecheck, pruebas unitarias, integración con PostgreSQL desechable, build y Playwright con datos sintéticos.
- [ ] Revisión independiente, documentación de evidencia, commit, push, PR, CI del SHA final y merge a main.

## Riesgos a verificar

1. Los selectores conservan name, value/defaultValue, required, disabled y eventos; FormData llega sin cambios al endpoint.
2. Las referencias siguen apuntando al elemento nativo para foco y retorno desde edición/confirmación.
3. Las tablas mantienen semántica y un único viewport horizontal accesible.
4. El drawer móvil se cierra al navegar y libera scroll; el shell conserva borradores y capacidades por identidad/institución.
5. Las capas CSS anteriores no fuerzan colores contradictorios ni superficies translúcidas en formularios/tablas.

## Registro

- Baseline remoto: main b4412296c6de8b2a3dd472c424dcfcfb88c2f65a; CI previo verde. PR abierto #101 pertenece al contrato de Compañero y no se duplica.
- Se trabaja en la rama existente feat/ux-redesign-shadcn-20261023 para conservar los cambios locales que el usuario pidió integrar.
- La disponibilidad productiva se reportará únicamente hasta donde exista evidencia; un merge no acredita configuración de servicios externos.
