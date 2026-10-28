# Verificación de composición y entrada por perfil

La referencia permanece inmutable: `docs/design/reference/siii-glass-approved.png`, SHA256 `756e6503bc292936fa507a5f3ad19d0abf2e313cfa053576820cd99f6104dcd3`, 1344×896.

- La entrada personal comprueba roles, ámbitos compatibles y contraseña obligatoria. Las páginas y API conservan su autorización independiente. Los contextos ambiguos requieren elección.
- Los expedientes y grupos se prueban mediante fixtures SQL aislados y login real. No se rellenan respuestas de API para producir las capturas de referencia.
- `tests/ui/approved-reference.spec.ts` captura Estudiante/Docente, claro/oscuro, 1344×896/390×896, perfiles sin vincular y navegación; verifica contraste, desbordamiento, ámbito, contraseña y preferencia de tema.
- La captura dedicada `student-approved-1344.png` y su SHA no se sobreescriben por la matriz. El comparador guarda `reference-diff.png`, `reference-overlay.png` y `reference-comparison.json` sin máscaras. La geometría tolera 2 px; las muestras de material admiten un delta medio máximo de 20 por canal. La comparación completa conserva umbral de color 0,1 y máximo de píxeles distintos 10 %.
- Superar geometría/materiales no certifica reproducción completa. Deben revisarse también el diff completo, la tipografía, la ausencia temporal de la fotografía, los datos reales y las diferencias restantes antes de liberar.
- CI publica estas evidencias en `synthetic-ux-matrix`. Ejecuta lint, typecheck, unitarias, integración PostgreSQL/recuperación, outbox, contrato real Ktor/MongoDB, Playwright, build y auditoría de dependencias.
- CSS se descubre automáticamente en `src`, incluyendo la hoja personal. Los presupuestos revisados usan bytes con LF y máximos exactos por archivo. La ampliación neta sustituye reglas personales antiguas y cubre ambos perfiles, temas, móvil y accesibilidad; no hay excepciones de inventario.

Las cifras del diseño ilustrativo —promedio general, avance oficial de créditos y áreas del plan— no se presentan como datos institucionales cuando esos modelos no existen. Los indicadores publicados llevan etiquetas y descripciones que identifican su fuente y alcance. Los totales parciales o desconocidos se ocultan.

La aprobación de CI o el estado READY de Vercel no equivalen a aprobación visual. Los resultados y SHA ejecutados se conservan con los artefactos de cada corrida.
