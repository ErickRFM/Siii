# SIII V4 — Baseline de auditoría

Fecha: 2026-10-27T17:20:00Z  
Rama actual: codex/siii-smoked-glass-ui-v1-20261027  
PRs abiertos: #120 (DRAFT), #121 (OPEN)  

## Git
- HEAD local: 8fdc6416
- Branch up-to-date con origin
- Ramas remotas relevantes: origin/main, origin/codex/siii-smoked-glass-ui-v1-20261027, origin/codex/hmac-rotation-runbook-20261027

## PR #120 — Smoked Glass v1
Estado: DRAFT  
Resumen: Consolidación UI glass, Estudiante con datos publicados, componentes reutilizables SiiiGlassPanel/SiiiGlassMetric, fondo SVG, correcciones de controles nativos.  
Evidencia: Verify/UI en proceso en commit histórico; Preview READY.  
Pendiente: cotejo visual autenticado por perfil vs referencia docs/design/reference/siii-glass-approved.png.

## PR #121 — Seguridad HMAC
Estado: OPEN  
Resumen: runbook + mejoras al workflow de expiración HMAC (metadata, alertas escalonadas, deduplicación). Sin rotación automática.

## Hallazgos iniciales
- Imagen aprobada guardada en docs/design/reference/siii-glass-approved.png
- Tests release-profile ajustados (59 tablas)
- CSS audit con baseline
- Múltiples ramas de feature presentes (docente, estudiante, v3 institucional)

## Clasificación inicial
| Módulo | Estado | Notas |
|---|---|---|
| Shell institucional/Glass | PARCIAL/CERCA | PR #120 en progreso |
| Estudiante | PARCIAL | Datos publicados, finanzas/solicitudes conectados parcialmente |
| Docente | PARCIAL | Presente en ramas, requiere consolidación |
| Caja/Admisiones/Servicios | PARCIAL | Superficies glass, datos reales según PR #120 |
| Seguridad/MFA/HMAC | PARCIAL/MEJORANDO | PR #121 |
| Compañero integración | PARCIAL | Contratos existentes, no mezclar features |
