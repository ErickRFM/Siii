# Overview

## Arquitectura objetivo
- Monolito modular (dominio/aplicación/infra/transporte)
- Next.js App Router para APIs
- PostgreSQL + Drizzle
- Worker separado para outbox/reintentos/sync
- Adaptador institucional hacia backend Ktor de Compañero

## Límites
- SIS = autoridad académica oficial (matrículas, periodos, secciones, calificaciones, horarios)
- Compañero = experiencia móvil, QR, sesiones propias
- Nunca acceso directo móvil -> DB escolar
- Idempotencia + transaccionalidad en operaciones críticas