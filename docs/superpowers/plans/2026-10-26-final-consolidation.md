# Consolidación final de SIII

**Objetivo:** recuperar diferencias útiles, completar el registro por invitación y limpiar únicamente ramas comprobadas, con CI y producción verificables.

**Base:** `origin/main@a59dfc5313dbfaf978cfd25006e7e78bb5316f8b`. Solicitud: prompt maestro de consolidación adjunto por el usuario el 2026-10-26. Ejecución directa autorizada, sin pausas de aprobación intermedias.

**Restricciones:** no alterar migraciones históricas, datos productivos, permisos, MFA, HMAC ni contratos de Compañero; no eliminar trabajo exclusivo. Conservar los scripts locales sin seguimiento. Sin merge antes de revisión y CI verde.

## Tareas y evidencia

- [ ] Comparar las 46 ramas remotas reales con main mediante ascendencia, `git cherry`, árboles, archivos y PR; documentar SHA, fechas, diferencias, dependencias y decisión. Proteger main y PR activos. Guardar manifiesto antes de eliminar.
- [ ] Completar invitaciones: esquema compartido cliente/servidor; error genérico de formulario independiente de existencia de cuenta; prueba HTTP de corrección sin consumir token, alta transaccional e inicio de sesión con correo; prueba móvil de validación, visibilidad de contraseña y prevención de duplicados. RED: el servidor actual devuelve `INVITATION_UNAVAILABLE` en lugar de `VALIDATION_ERROR`.
- [ ] Confirmar que #101 está sustituido por #104/#109 mediante comparación de sus cinco archivos, el probe, sus pruebas y el workflow actual; no restaurar el workflow viejo.
- [ ] Ejecutar instalación reproducible, lint, tipos, unitarias, PostgreSQL aislado, HTTP/permisos, outbox habilitado, Playwright/accesibilidad, legacy financiero, build y audit. Usar exclusivamente base local desechable. El contrato Ktor/Mongo debe contar con evidencia CI del SHA exacto.
- [ ] Revisar el diff, publicar PR, verificar todos los jobs y revisión, fusionar y verificar SHA/postmerge/despliegue productivo. Respetar protecciones existentes.
- [ ] Eliminar con condición de SHA sólo ramas cuya integración/sustitución esté probada; conservar las inciertas con motivo concreto. Inventario e informe final con enlaces y limitaciones.

## Revisión focal

Errores de formulario no deben consumir invitaciones ni revelar cuentas; validación de correo idéntica en cliente y servidor; clics repetidos producen una decisión; rollback ante fallo de auditoría; diferencias históricas de SQL/CI no autorizan reemplazar versiones modernas.

## Archivos e interfaces

`src/shared/invitations/validation.ts`: exportar `invitationAccountBody`, usada tanto por `invitationConsentBody` como por el formulario. `public-handlers.ts`: `acceptInvitation` conserva las transacciones y controles actuales; sólo cambia el código de error de entrada inválida. `invitation-accept.tsx`: consume el esquema común y serializa envíos mediante una referencia. Regresiones en `tests/integration/invitations.test.ts` y `tests/ui/invitation-flows.spec.ts`. Inventario y resultados en `docs/audits/SIII_CONSOLIDATION_2026-10-26*`.
