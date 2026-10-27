# Branch Reconciliation

## Estado
- feat/sis-foundation: base limpia (build+typecheck+2 tests)
- feat/sis-identity-rbac: limpia, preparada para F2
- feat/supabase-core-and-portal-shell: funcional (auth, tenancy, APIs, portal shell) con 6 tests. Tiene pequeños warnings TS de rutas typed.

## Estrategia
Preservar trabajo funcional de supabase-core-and-portal-shell (identidad + portal). Consolidar hacia línea estable sin destruir historiales.
