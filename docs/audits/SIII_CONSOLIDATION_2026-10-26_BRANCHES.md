# Inventario final de consolidación — 2026-10-26

Base remota original: `a59dfc5313dbfaf978cfd25006e7e78bb5316f8b`. 46 ramas iniciales incluyendo main; 47 tras observar #114; ningún PR abierto al consultar. Este manifiesto precede a cualquier eliminación; la ejecución queda registrada en el informe de consolidación.

Se distinguen ascendencia, equivalencia de parches y preservación del árbol en el commit de integración. El árbol completo de #26 (`095884071aa5ce48a4fdf2eeec571e5537632acd`) es idéntico al squash `f53512195a60c936aaa068885e9699ee94389646`; las ramas R1–R5 son ancestros de ese origen. No reaplicar sus migraciones con numeración anterior.

Inventario detallado (SHA completos, fechas, commits exclusivos, rutas, migraciones/configuración/permisos, PR y decisión): [JSON](SIII_CONSOLIDATION_2026-10-26_BRANCHES.json). Copia recuperable de todos los refs: `.p0-local/consolidation-20261026/remote-before-cleanup-v2.bundle`. No elimina worktrees, ramas locales ni etiquetas.

| Rama | SHA | PR origen → integración | Decisión / evidencia |
|---|---|---|---|
| chore/companion-pilot-connection-preflight-20261021 | `079b6b0843815bdb3489203a8add056a30cfe764` | 70 → 70 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #70. |
| chore/hmac-expiry-guard-20261025 | `33332a0c3ed195ab54c1e73020f0febdec856c20` | 110 → 110 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| chore/siii-readonly-prod-schema-gate-20261021 | `eae643594ff5e2cce1ff4741b5581747ac3e8fac` | 71 → 71 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| codex/academic-rosters-pagination-20261017 | `ca2e4460e990c9f76c9d9d5e134cdb2e28146fa4` | 40 → 40 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #40. |
| codex/p1-institution-admin | `dff8c2d9573e2aa3a337afaa09114195051a8088` | 25 → 26 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #26. |
| codex/sii-production-rescue-20261015 | `d563730b514e5d2ba0abebb6aa77285e294bb458` | 29 → 29 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #29. |
| docs/roadmap-university-lifecycle-20261018 | `2e5c6b99444f2473bead111c2e8d2e521c89ebb8` | 49 → 49 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| feat/companion-transactional-section-outbox-20261021 | `e5df1a36bc0765de85add7017d7141f26386ce46` | 68 → 68 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #68. |
| feat/kit-interactions-accessibility-20261021 | `8c969adc40ce332b20203982395703ffa1dc60af` | 78 → 97 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| feat/r1-r2-academic-operations | `3e6a6fef1e128e806130e8c5a62b3514c476eb32` | 9 → 26 | delete-after-consolidation-ci: Registry/sections/enrollments: ancestor of the complete #26 source snapshot. Migrations 0002→0011; retain current authorization/outbox. |
| feat/r3-grading-drafts | `8950c54b77427f1a02bfb9d1826c61a8107c254b` | 14 → 26 | delete-after-consolidation-ci: Grading: ancestor of #26 source snapshot. Migrations 0003→0012; current published-grade and authorization controls supersede old routes. |
| feat/r4-companion-academic-read-api | `fb0a54fe5bee0fe73a66314b5de70aaec9eedda4` | 16 → 26 | delete-after-consolidation-ci: Companion AcademicProvider read API: ancestor of #26 source snapshot; current DTO/security contracts supersede old routes. |
| feat/r4-schedules-occurrences | `f5a3922f6b46864c3bf9dc395284e6dcc5827883` | 15 → 26 | delete-after-consolidation-ci: Schedules: ancestor of #26 source snapshot. Migrations 0004→0013; current conflicts and occurrence routes retain the feature. |
| feat/r5-university-services | `fdbcef5a33673122d67256ff44fd3e6735865be8` | 18 → 26 | delete-after-consolidation-ci: University services: ancestor of #26 source snapshot; migration 0005→0014. Services schema/validation/tests preserved. |
| feat/siii-branded-email-delivery-20261018 | `548f8dff17697e42826ffe360d2c28352d691c9c` | 45 → 46 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #46. |
| feat/siii-email-production-ready-20261018 | `2373334963f28902178c7123658967ba011b81e2` | 46 → 46 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| feat/siii-matte-glass-ui-20261017 | `05161acad15dbf64ccc9bcc9edf8b75e1f806fd3` | 34 → 44 | delete-after-consolidation-ci: Matte UI: sii-glass.css identical; replacement layout only adds sii-ux-refinement.css. No missing feature. |
| feat/siii-pilot-readonly-database-gate-20261021 | `95e0c009b3a59e94201ad3bb9b8ee853ce44e3db` | 72 → 96 | delete-after-consolidation-ci: Pilot gate replaced by #96. Three files identical, package adds newer tests/security versions, SQL fixes invalid grant/column_acl aliases. |
| feat/siii-premium-ui-kit-overhaul-20261021 | `6f8e025d15bd084caa1a81647af3f77949a0ba43` | 73 → 73 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #73. |
| feat/siii-systemwide-coherence-20261021 | `769824330932c0e2419ac64425720ee6ae22e369` | 67 → 67 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #67. |
| feat/siii-v4-motion-matte-refinement-20261021 | `b0a91e4969c8c538fd54980df74d74107cbb33c7` | 66 → 66 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #66. |
| feat/sis-foundation | `7070a461bc9480bd34bb26902959188cfcbde35a` | — → — | delete-after-consolidation-ci: Commit is an ancestor of original main. |
| feat/ui-motion-foundation-20261021 | `b2d0c88877b7e0f1e523bf3a580f70880f55903f` | 77 → 98 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| feat/ux-ui-maturity-20261018 | `3005bec740b6f11be9940d8cca0d79ff729029c2` | 44 → 44 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #44. |
| fix/invitation-email-username-20261026 | `2d2d651c059363edc22ec3a712df267ec441c771` | 112 → 112 | delete-after-consolidation-ci: Commit is an ancestor of original main. |
| fix/invitation-expiry-guardrails-20261017 | `20e06292f9e9988f3b575e49df8af9a58a9603c9` | 41 → 41 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| fix/invitation-new-user-onboarding-20261019 | `f53a58455dbef0b59575f335ee7aeda27c6b4518` | 48 → 48 | delete-after-consolidation-ci: New-account onboarding preserved. Replacement adds the existing inline MFA browser regression; no removed tests. |
| fix/invitations-inline-mfa-step-up-20261019 | `5a4f62248367bc41872cdc67b5ffb3d4af493e7c` | 47 → 47 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #47. |
| fix/login-balanced-layout-20261024 | `2bf5a7006411613aaebe6228ea345f5247409f7d` | 108 → 111 | delete-after-consolidation-ci: Login CSS fully preserved in #111/current main: only one blank line removed. No lost visual behavior. |
| fix/mobile-sidebar-keyboard-focus-20261021 | `6d0b3a3bd454970005bf71527afd92aebc2820be` | 76 → 95 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| fix/production-migration-gate | `f8b3421044edf06ff499d1982cd9cbe47279ccbf` | 27 → 26 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #26. |
| fix/sii-postmerge-ci-20261016 | `759e50ac4a5b5333a6a0044dbcd95c30a667f063` | 28 → 28 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| fix/siii-ci-diagnostics-20261019 | `61d63214d2579f99293193b8557fb1215f414433` | 61 → 62 | delete-after-consolidation-ci: Only difference is honest schema-only test naming. Recovered in this consolidation; no runtime code was missing. |
| fix/siii-mobile-catalog-search-20261020 | `298428f4903eb4ae790f3400c067952933fc8bbc` | 64 → 64 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| fix/siii-new-module-rls-and-ci-20261020 | `1473811efd57a82850342194133e657d6e83bedb` | 62 → 62 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #62. |
| fix/student-link-read-authority-20261022 | `3d9a7e41d97d95416a76e20aad6076a4cc3d73b0` | 86 → 91 | delete-after-consolidation-ci: Own student record authority route, HTTP test and audit identical to main. Remaining delta is historical plan/matrix/report prose; runtime preserved by #91. |
| fix/ux-persistent-dashboard-navigation-20261017 | `f6c102da2b06d3b1e8c8d5149e423527f7eecfe3` | 42 → 42 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #42. |
| integration/gradebook-drafts-20261022 | `70d10d62e65ceeee1451059a5331f4cb58456d0f` | 92 → 94 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| integration/mobile-sidebar-focus-20261022 | `c1a4cca760a7a5eea72a1796f891faa2c4523698` | 93 → 95 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| integration/pilot-db-gate-20261022 | `be4f21c552dc4ec82642ef8dbb0b5c04c868b3f9` | 90 → 96 | delete-after-consolidation-ci: Every non-merge patch is equivalent to a patch already in main. |
| integration/sii-consolidation-20261015 | `095884071aa5ce48a4fdf2eeec571e5537632acd` | 26 → 26 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #26. |
| integration/student-links-authority-20261022 | `eeae238a466f7afd343fe9e9b615fc256ca9f1d4` | 91 → 91 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #91. |
| integration/ui-motion-final-20261022 | `949edb455cf2b3b31fd253a3c8957bdd85983110` | 103 → 98 | delete-after-consolidation-ci: Every changed path matches the integrated snapshot in PR #98. |
| main | `a59dfc5313dbfaf978cfd25006e7e78bb5316f8b` | — → — | protect: Verified repository default branch. |
| merge/supabase-into-identity | `dff99c966be8cce52a0752e4c45c8eec943b48b1` | 6 → 6 | delete-after-consolidation-ci: Post-merge cleanup commit only anchors .idea ignore and removes tracked tsconfig.tsbuildinfo. Current main ignores both and does not track tsbuildinfo. |
| test/companion-live-contract-probe-20261022 | `eb3e2755574674ab812b29d76622ac275adf4ba4` | 101 → 104 | delete-after-consolidation-ci: Probe, unit test and live-contract report identical to main. Modern workflow adds source PostgreSQL/outbox/full-chain/receipt tests and pins newer receiver; audit prose extended. Closed before this session. |

## Reconciliación concurrente

Main avanzó a `19df36d5a2af621d4084c1104f956d6b11b0c16e` mediante [#114](https://github.com/ErickRFM/Siii/pull/114) durante las pruebas. La rama se reconcilió por fast-forward sin sobrescribir las correcciones. Se añadió un candidato ancestral, `feat/login-verified-email-20261026@d0e5a7ad414a0485267378adf1a654adce745a50`, al manifiesto. Total previo a limpieza: 47 ramas, 46 candidatos. Bundle v2 actualizado y verificado antes de eliminar.
