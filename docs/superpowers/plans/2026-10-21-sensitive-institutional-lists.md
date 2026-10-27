# Listados institucionales sensibles — plan de corrección

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** impedir que la lectura general de una institución permita consultar aspirantes y órdenes de terceros, también desde SSR.

**Architecture:** reutilizar `authorizeCapability` con `institutions.manage`, la capacidad que ya requieren los escritores administrativos de estos módulos. Mantener 401 sin sesión, 403 sin autoridad, rutas y proyecciones JSON. Aplicar la misma decisión antes de consultar datos en la página de Admisiones. No añadir un segundo sistema de permisos.

**Tech Stack:** Next.js 15, TypeScript, Drizzle, PostgreSQL 17, Vitest HTTP.

**Spec:** misión del usuario; hallazgo SEC-02 de `docs/audits/SIII_ENGINEERING_AUDIT_2026-10-21.md`.

## Global Constraints

- Base remota verificada: `main@e494f651b011d8567f999eac0a4103b0eac01c76`.
- DENY BY DEFAULT. MFA y estado institucional se comprueban en servidor.
- Sin migraciones, credenciales de producción, cambios en Compañero ni cambios cosméticos.
- La política temporal conserva acceso de admin/super_admin institucional con MFA. Los permisos específicos y la consulta propia de aspirantes requieren otro incremento.

## Review Focus

- Alumno, invitado, participante y docente pendiente: 403 sin `data` ni datos SSR.
- Administrador sin MFA, sesión revocada o membresía suspendida: rechazo.
- Administrador A: sin acceso al listado ni página B, aunque conozca sus UUID.
- Administrador con MFA: misma proyección y filas del tenant autorizado.
- Página SSR: redirección antes de consultar o serializar PII; registro público independiente sin cambios.

## Task 1 — regresión y corrección del límite de lectura

**Files:**
- Modify: `src/app/api/v1/institutions/[institutionId]/financials/orders/route.ts` (GET solamente).
- Modify: `src/app/api/v1/institutions/[institutionId]/admissions/applications/route.ts` (GET solamente).
- Modify: `src/app/dashboard/institutions/[institutionId]/admissions/page.tsx`.
- Create: `tests/integration/sensitive-institutional-lists-http.test.ts`.
- Update: `docs/operations/OPERATION_MATRIX.md` y reporte de evidencia.

**Interfaces:** reutiliza `authorizeCapability(institutionId, 'institutions.manage')`; no cambia contratos exitosos. La página conserva presentación y formulario para los administradores autorizados.

- [x] Crear fixtures sintéticas con dos instituciones, solicitudes y órdenes distinguibles; identidades y sesiones reales.
- [x] Ejecutar negativos HTTP/SSR y observar 200 indebido antes del arreglo (15/24fallos; nueve controles pasan).
- [x] Reutilizar autorización central antes de las consultas sensibles (GREEN24/24; cobertura ampliada27casos pasa dentro de integración completa).
- [x] Ejecutar pruebas dirigidas, integración completa, UI, lint, tipos, unitarias, build y preflight local; resultados y límite de la primera corrida en `docs/audits/SIII_SEC02_EXECUTION_2026-10-21.md`.
- [x] Revisión independiente del diff y compatibilidad; commits convencionales, push y PR75 en borrador; sin merge mientras falte un gate.

**Ruling:** ejecutar autónomamente el incremento acotado dentro de la autorización explícita del usuario. Las fases restantes se mantienen como trabajo pendiente verificable, no como completadas.
