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

## Estado de implementación
F1/F2 con login y shell institucional. F3 empieza con 5 catálogos reales (programas, materias, planes, periodos y campus), pendiente de validación/productivización. Expedientes, grupos, horarios, calificaciones, pagos y resto de dominios aún pendientes. Ver README y docs/implementation/F3_ACADEMIC_CATALOG.md.

## Comandos
`npm ci`, `npm run db:migrate` (desarrollo), `npm run bootstrap:admin`, `npm run dev`, `npm run typecheck`, `npm run test`, `npm run test:integration`, `npm run build`.
