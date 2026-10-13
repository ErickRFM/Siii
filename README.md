# University SIS

Backend-first SIS con PostgreSQL + Drizzle + Next.js App Router. 
Orientado a integración con Compañero de Escuela (backend Ktor).

## Inicio rápido
1. cp .env.example .env
2. docker compose up -d postgres
3. npm run db:migrate
4. npm run dev

## Endpoints técnicos
- GET /api/health
- GET /api/ready