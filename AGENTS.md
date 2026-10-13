# University SIS - AGENTS.md

## Objetivo
Sistema de Información Universitaria (SIS) backend-first. Integración con backend Ktor de Compañero de Escuela, respetando contratos y autoridad de datos.

## Estado actual
Fase: F0-F1 inicial. Estructura base, configs, schema inicial, health/ready.

## Comandos
- npm run dev
- npm run build
- npm run typecheck
- npm run lint
- npm run test
- npm run test:integration
- npm run db:migrate
- npm run worker:dev

## Restricciones
- NO UI/UX aún
- No duplicar lógica/comportamiento de Compañero
- No modificar contratos públicos de Compañero sin justificación
- Uso exclusivo de este repo para SIS
- Tests obligatorios; no mocks permanentes para endpoints críticos
- Seguridad primero (RBAC + aislamiento institucional)