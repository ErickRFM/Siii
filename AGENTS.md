# Siii — Reglas persistentes de implementación

Antes de cualquier tarea lee `docs/agent/MASTER_PROMPT.md`.

## Producto
SIS universitario multitenant, backend institucional en Next.js/TypeScript + Drizzle + PostgreSQL alojado en Supabase. Compañero Android/iOS y Ktor son servicios separados.

## Código de referencia
- GitHub: `ErickRFM/Siii`.
- Compañero: `ErickRFM/Compa-ero-de-esc`; conservar providers y contratos vigentes.

## Invariantes
- No usar las claves de Supabase en UI. DATABASE_URL solo servidor.
- Datos institucionales privados por tenant, usuario, permiso, recurso y estado; DENY BY DEFAULT.
- Registrar operaciones sensibles en auditoría.
- Pantallas NO representan acciones hasta tener endpoints reales y tests. No datos de producción inventados.
- Cada fase: schema, migración, API, permisos, pruebas, UI accesible y documentación.
- No hacer merge sin CI verde y revisión; no cambiar F2 en paralelo desde dos ramas sin reconciliación.

## Rama de trabajo y estado verificable
- Trunk **real**: `main`; antes de empezar, verificar el HEAD remoto y los PR abiertos. Nunca basarse en el SHA histórico de esta documentación.
- Rama predeterminada de GitHub corregida a **main** y verificada el 2026-10-22; origin/HEAD local apunta a origin/main. La referencia a feat/sis-foundation en la auditoria del 2026-10-19 es historica. Verificar nuevamente el HEAD remoto y los PR antes de trabajar.
- `docs/agent/MASTER_PROMPT.md` conserva contexto histórico (2026-10-13). Las afirmaciones de progreso antiguas no prevalecen sobre `main` ni las pruebas actuales.
- Admisiones F01 (#50), vínculo de expediente F02 (#51), Caja F03 (#52), elegibilidad/matrícula F04 (#54), permisos posteriores a MFA (#53) y correcciones C00/C01 (#56) constaban integrados al revisar `main`. **Código fusionado no acredita disponibilidad productiva ni flujo completo E2E**.
- PRs #40 (paginación), #48 (invitaciones) y #49 (roadmap) aparecían abiertos; comprobar su estado nuevamente y reconciliarlos, no duplicar.
- UX/UI V3: ejecución por fases UX00–UX09 descrita en `docs/implementation/SIII_UX_V3_PROGRESS.md`. Cada componente debe mantener acciones, permisos, identidad institucional mate, estados y accesibilidad actuales.
- La integración académica con Compañero permanece en un repositorio distinto; no inventar endpoints, credenciales ni sincronización completa.

## Comandos
`npm ci`, `npm run db:migrate` (desarrollo), `npm run bootstrap:admin`, `npm run dev`, `npm run typecheck`, `npm run test`, `npm run test:integration`, `npm run build`.
