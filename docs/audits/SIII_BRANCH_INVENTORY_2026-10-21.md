# Inventario de ramas — 21 octubre 2026

Base remota: `e494f651b011d8567f999eac0a4103b0eac01c76`. Comparación mecánica con `rev-list --left-right --count` y `git cherry`. No se eliminó ni fusionó ninguna rama.

24 ramas son ancestros de main y seis equivalentes por parches. De las24 restantes, la revisión por archivos identificó cuatro obsoletas como ramas de integración, una bloqueada y19que todavía requieren reconciliación. Ninguna clasificación autoriza eliminar ramas/worktrees ni acredita ejecución productiva.

La rama fix/siii-ci-diagnostics-20261019 corresponde al PR abierto #61; no duplicar su renombrado de test. Las ramas pilot/read-only comparten dominio con #72 y deben compararse antes de modificar el preflight. Las ramas con worktree activo se conservan.

| Rama remota | SHA | Detrás | Delante | Parches no equivalentes | Clasificación |
|---|---|---:|---:|---:|---|
| origin/chore/companion-pilot-connection-preflight-20261021 | 079b6b08 | 2 | 7 | 7 | Obsoleta |
| origin/chore/p0-1-release-gates | ee6c39ec | 125 | 0 | 0 | Ya integrada |
| origin/chore/r0-supabase-baseline-audit | c43a3f1d | 137 | 0 | 0 | Ya integrada |
| origin/chore/siii-readonly-prod-schema-gate-20261021 | eae64359 | 1 | 1 | 0 | Ya integrada por equivalencia de parches |
| origin/codex/academic-outbox-foundation-20261017 | a043fab3 | 54 | 0 | 0 | Ya integrada |
| origin/codex/academic-rosters-pagination-20261017 | ca2e4460 | 53 | 4 | 2 | Obsoleta |
| origin/codex/mfa-enrollment-guidance-20261017 | dfbf5797 | 65 | 0 | 0 | Ya integrada |
| origin/codex/p1-institution-admin | dff8c2d9 | 103 | 1 | 1 | Obsoleta |
| origin/codex/p1-user-management | e2180879 | 104 | 0 | 0 | Ya integrada |
| origin/codex/portal-onboarding-and-registry-20261017 | 4d87d61f | 73 | 0 | 0 | Ya integrada |
| origin/codex/registry-profile-editing-20261017 | 1cf1e8cc | 60 | 0 | 0 | Ya integrada |
| origin/codex/sections-pagination-20261017 | 7ce3b5ea | 69 | 0 | 0 | Ya integrada |
| origin/codex/sii-production-rescue-20261015 | d563730b | 134 | 5 | 5 | Requiere reconciliación |
| origin/docs/roadmap-university-lifecycle-20261018 | 2e5c6b99 | 48 | 1 | 0 | Ya integrada por equivalencia de parches |
| origin/feat/companion-transactional-section-outbox-20261021 | e5df1a36 | 4 | 11 | 11 | Requiere reconciliación |
| origin/feat/f2-policy-and-build-cleanup | 5500990d | 171 | 0 | 0 | Ya integrada |
| origin/feat/f3-academic-catalog-foundation | ae52a7ce | 141 | 0 | 0 | Ya integrada |
| origin/feat/p0-hardening | 755a4bb9 | 133 | 0 | 0 | Ya integrada |
| origin/feat/p1-invitations | 24209285 | 105 | 0 | 0 | Ya integrada |
| origin/feat/p1-mfa | 8c824769 | 117 | 0 | 0 | Ya integrada |
| origin/feat/p1-permission-scopes | d300ba75 | 113 | 0 | 0 | Ya integrada |
| origin/feat/r1-r2-academic-operations | 3e6a6fef | 140 | 22 | 22 | Requiere reconciliación |
| origin/feat/r3-grading-drafts | 8950c54b | 140 | 37 | 37 | Requiere reconciliación |
| origin/feat/r4-companion-academic-read-api | fb0a54fe | 140 | 65 | 65 | Requiere reconciliación |
| origin/feat/r4-schedules-occurrences | f5a3922f | 140 | 52 | 52 | Requiere reconciliación |
| origin/feat/r5-university-services | fdbcef5a | 140 | 82 | 82 | Requiere reconciliación |
| origin/feat/sii-full-consolidation-20261016 | da60437c | 89 | 0 | 0 | Ya integrada |
| origin/feat/sii-v2-visual-auth-portal | 233b3a36 | 160 | 0 | 0 | Ya integrada |
| origin/feat/siii-branded-email-delivery-20261018 | 548f8dff | 53 | 18 | 18 | Requiere reconciliación |
| origin/feat/siii-email-production-ready-20261018 | 23733349 | 50 | 1 | 0 | Ya integrada por equivalencia de parches |
| origin/feat/siii-matte-glass-ui-20261017 | 05161aca | 83 | 2 | 2 | Requiere reconciliación |
| origin/feat/siii-pilot-readonly-database-gate-20261021 | 95e0c009 | 0 | 3 | 3 | Bloqueada |
| origin/feat/siii-systemwide-coherence-20261021 | 76982433 | 4 | 6 | 6 | Requiere reconciliación |
| origin/feat/siii-v4-motion-matte-refinement-20261021 | b0a91e49 | 5 | 7 | 7 | Requiere reconciliación |
| origin/feat/sis-foundation | 7070a461 | 140 | 0 | 0 | Ya integrada |
| origin/feat/supabase-core-and-portal-shell | 2438c4f6 | 186 | 0 | 0 | Ya integrada |
| origin/feat/ux-ui-maturity-20261018 | 3005bec7 | 51 | 4 | 4 | Requiere reconciliación |
| origin/fix/c00-c09-ci-lint-20261019 | 50b713ee | 24 | 0 | 0 | Ya integrada |
| origin/fix/ci-unused-enrollment-import-20261019 | 50b713ee | 24 | 0 | 0 | Ya integrada |
| origin/fix/cleanup-set-role-privilege-test-20261017 | 9a5d2ae8 | 84 | 0 | 0 | Ya integrada |
| origin/fix/invitation-expiry-guardrails-20261017 | 20e06292 | 53 | 1 | 0 | Ya integrada por equivalencia de parches |
| origin/fix/invitation-new-user-onboarding-20261019 | f53a5845 | 49 | 3 | 3 | Requiere reconciliación |
| origin/fix/invitations-inline-mfa-step-up-20261019 | 5a4f6224 | 49 | 3 | 3 | Requiere reconciliación |
| origin/fix/lifecycle-lint-20261019 | 50b713ee | 24 | 0 | 0 | Ya integrada |
| origin/fix/production-migration-gate | f8b34210 | 103 | 88 | 86 | Requiere reconciliación |
| origin/fix/show-all-institution-modules-20261017 | 19abc17c | 79 | 0 | 0 | Ya integrada |
| origin/fix/sii-postmerge-ci-20261016 | 759e50ac | 135 | 1 | 0 | Ya integrada por equivalencia de parches |
| origin/fix/siii-ci-diagnostics-20261019 | 61d63214 | 11 | 1 | 1 | Requiere reconciliación |
| origin/fix/siii-mobile-catalog-search-20261020 | 298428f4 | 7 | 1 | 0 | Ya integrada por equivalencia de parches |
| origin/fix/siii-new-module-rls-and-ci-20261020 | 1473811e | 8 | 5 | 5 | Obsoleta |
| origin/fix/ux-persistent-dashboard-navigation-20261017 | f6c102da | 53 | 5 | 5 | Requiere reconciliación |
| origin/fix/vercel-zod-peer-install | 4e06d657 | 188 | 0 | 0 | Ya integrada |
| origin/integration/sii-consolidation-20261015 | 09588407 | 103 | 87 | 85 | Requiere reconciliación |
| origin/merge/supabase-into-identity | dff99c96 | 150 | 1 | 1 | Requiere reconciliación |

## Comprobación de contenido para reclasificar

- `chore/companion-pilot-connection-preflight`: sus cuatro archivos cambiados (script, variables, unit y visual-motion-polish) son idénticos a main con `git diff main <rama> -- <archivos>`. El diff completo solo pierde SQL/reportes posteriores. Sin delta funcional por rescatar.
- `codex/academic-rosters-pagination`: implementación de paginación, fixtures y HTTP tests están incorporados. Sus diferencias restantes quitan hooks del outbox y confirmaciones accesibles posteriores. No integrar esa regresión.
- `codex/p1-institution-admin`: el helper open() del commit exclusivo dff8c2d9 ya está idéntico en main; el diff UI revierte alertdialog a diálogos nativos. El diagnóstico documental histórico no requiere merge de la rama.
- `fix/siii-new-module-rls-and-ci`:0023, journal, seguridad de módulos, workflow y documentación son idénticos. Solo falta en la rama la nueva aserción móvil del buscador ya presente en main.
- `feat/siii-pilot-readonly-database-gate`: contiene trabajo aprovechable, pero `scripts/siii-pilot-db-gate.ts:63–66` usa alias `grant` y referencia `acl_entry.privilege_type` fuera de su subconsulta. El commit95e0c009 arregla el primer alias y deja el segundo defectuoso. Bloqueada hasta corregir y probar el SQL real en base aislada; las unitarias actuales solo prueban objetos de assessOutboxGate.
- `feat/r3-grading-drafts`: schema, validación y unit grading coinciden; las rutas antiguas omiten límites/autorización actuales. Conserva37commits propios con migraciones renumeradas y documentos que no se revisaron exhaustivamente: se mantiene Requiere reconciliación.
