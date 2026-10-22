# Gradebook navigation memory implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline; independent whole-branch review before completion.

**Goal:** Preserve private unsent grade revisions across dashboard SPA navigation while restoring them only after current actor and section authorization.
**Architecture:** Move the existing draft Map/revision operations into a domain context inside persistent SiiAppShell, outside its tenant-keyed capability subtree. Keep snapshots in TeacherGradebook; reuse auth/me, grading sections/snapshot, assurance signal and generation cancellation.
**Tech Stack:** Next15 App Router, React context, existing real Playwright/PostgreSQL fixtures.
**Spec:** Coordinator-approved in-chat design, 22 October2026, with assurance changes invalidating/hiding and revalidating rather than deleting valid step-up drafts.

## Constraints
- Base4ad4d326, isolated next-security-patch worktree; no changes to #85 worktree, F2, backend, SQL, storage APIs, router/history internals or throttling policy.
- Only memory, actor/tenant/section/student/component scope; no cached roster or singleton. No promise of session generation or unobserved other-tab logout detection.
- Logout/current actor mismatch/401 clear actor data;403 clears affected context. Restore only after real authMe+sections+snapshot. Late responses cannot undo invalidation.
- Exclusive synthetic siii_gradebook_navigation_test on localhost55439/HTTP3210; existing migrations only. Local commit, no push/PR.

## Review focus
- Leaving during save must acknowledge only its original revision after real success, without repopulating revoked data.
- Multi-institution security route must not remount the memory owner.
- Invalidated data stays hidden during offline/revalidation; a valid assurance renewal preserves the draft.
- Existing excluded/publication behavior and accessible native departure warning remain effective from other modules.
- Current actor, not a cached layout name, controls restoration.

## Task1 — Real failing navigation regressions
- [x] Extend tests/ui/gradebook-drafts.spec.ts using its real teacher/MFA/two-student fixture: back/forward, CtrlK Enter, newer revision after returning, tenant isolation, logout/401/403/revocation outside, late read, assurance renewal and beforeunload outside grading.
- [x] Create ignored config importing original harness with baseURL3210, own synthetic DB, existing migrations. Run new representative negatives against original source and preserve RED artifacts before product changes.

## Task2 — Domain memory and authorized restoration
- [x] Refactor src/components/teacher-gradebook-drafts.ts into one private provider+consumer, maintaining revision comparison; preserve only captures/selection in memory. Move native warning/logout handling to provider lifetime.
- [x] Pass public actorId from src/app/dashboard/layout.tsx to SiiAppShell and place provider before tenant-keyed InstitutionCapabilitiesProvider. Observe pathname/visibility/assurance for invalidation and current identity checks.
- [x] TeacherGradebook revalidates authMe, section list, snapshot before exposing stored captures, cancels stale work and clears correct scope on denial. Internal navigation copy must describe memory retention truthfully.
- [x] Re-run focused real tests until all navigation and15 existing regressions pass; no arbitrary waits or mocks replacing authority.

## Task3 — Gates, evidence and local commit
- [x] Coordinate CPU; run lint/typecheck/unit/build and real focal UI/axe. Review changed TSX against React checklist.
- [x] Append docs/audits/SIII_GRADEBOOK_NAVIGATION_MEMORY_2026-10-22.md, operation matrix and engineering audit with exact RED/GREEN and limits; preserve history.
- [x] Request independent review; fix findings with evidence; conventional local commit only when gates/review pass.

## Ledger
- Branch created from4ad4d326; worktree was clean. Existing gradebook suite clears auth_throttle in beforeEach; no new cleanup or policy change will be introduced while coordinator clarifies that inherited fixture.
- RED observed against unchanged4ad product: quick-switch returned empty instead of8.32; reload from security emitted no beforeunload. Original3-case run also exposed a missing commit wait in the history test helper; that failure is not counted as a product failure.
- Helper now waits the actual selected link URL before returning. Repeated back/forward alone against the unchanged production bundle: expected8.21, receivedempty (1 functional RED). Logs navigation-red.log and navigation-back-red.log/results preserved separately; no timeout relaxed.
- Host execution was interrupted/delayed during build; retained logs ultimately produced the above actual test results. No interruption is counted as approval.
- Coordinator paused product changes pending comparison of externally-createdPR92 withPR85. Only plan and test changes exist; no product edits, commit or push. Existing per-case throttle cleanup is retained only in this exclusive synthetic fixture, not claimed as throttle-security evidence. Seven new cases written; tenant/actor/late-response coverage remains to complete after reconciliation decision.

- Coordinación autorizó continuar tras confirmar igualdad funcional de85/92, posteriormente94; no se mezcla/rebase esta rama con esos PR. Implementación terminada exclusivamente en shell/hook/consumidor UI.
- Se completaron33casos (15previos+18nuevos), con RED deACK/focus/denegación tardía y controles de revisión posterior/proveedor nuevo. Revisión independiente cerró ImportantACK tras añadir navegación duranteGET y assurance mismaURL. Sin nuevos hallazgos; EOF de2archivos corregidos.
- Gates secuenciales finales: lint/typecheck0, migration-safety5/5,826unitarias, buildNext15.5.28/31páginas y33/33UI(10.2m),2Axe poblados0. Fallo inicial825/826,23/25UI e instrumentaciones fallidas conservados en informe; no se relajan tiempos ni throttle.
- Informe y anexos históricos actualizados sin sustituir contenido previo. Commit local previsto al concluir diffcheck; no push/PR/merge ni cierre globalUX01.
