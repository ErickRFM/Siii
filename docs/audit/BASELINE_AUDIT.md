# BASELINE AUDIT

## Repositorio
https://github.com/ErickRFM/Siii

## Branches
- feat/sis-foundation (remote)
- feat/sis-identity-rbac (local/remote)
- feat/supabase-core-and-portal-shell (remote - contains auth, tenancy, portal shell)

## Estado verificado
- Typecheck: errores menores en rutas typed (no bloqueantes para runtime)
- Tests: 6/6 unitarios verdes
- Build: presente
- APIs: auth/login, auth/logout, auth/me, password/change, institutions, memberships

## Conservado
Trabajo de supabase-core-and-portal-shell reutilizable (identidad multiinstitución, sesiones, RBAC base).
