# Entrega P0.1 + P1 — ejecución y límites

Fecha: 2026-10-15. Estado general: PARCIAL. P0 permanece BLOQUEADA por puertas externas; P1 tiene capacidades funcionales en PR dependientes, sin merge ni promoción de producción. No equivale a la definición COMPLETO de F13.

## Git y preservación

Main verificado: c7334cdfe524fe02d7c7090e0862884743008720. Se preservó el checkout original merge/supabase-into-identity/dff99c966be8cce52a0752e4c45c8eec943b48b1 sin cambios locales. Trabajo aislado en worktrees. Se descargaron referencias remotas y se reconciliaron bases por merges normales, sin reset, force-push ni reescritura de SQL/ledgers.

| Bloque | Rama / commit revisado | PR | CI y merge |
| --- | --- | --- | --- |
| P0 endurecimiento | feat/p0-hardening / 755a4bb9 | [19](https://github.com/ErickRFM/Siii/pull/19) | Draft; puertas P0 abiertas. |
| P0.1 evidencia y ensayo | chore/p0-1-release-gates / ee6c39ec | [20](https://github.com/ErickRFM/Siii/pull/20) | CI verde38797574280/38797579552; sin merge. |
| F05 MFA | feat/p1-mfa / 8c824769 | [21](https://github.com/ErickRFM/Siii/pull/21) | CI verde38800083684/38800089423; sin merge. |
| F07 RBAC/ámbitos | feat/p1-permission-scopes / d300ba75 | [22](https://github.com/ErickRFM/Siii/pull/22) | CI verde38801469956/38801478648; sin merge. |
| F08 invitaciones | feat/p1-invitations / 24209285 | [23](https://github.com/ErickRFM/Siii/pull/23) | CI verde38802516329/38802525366; sin merge. |
| F06 usuarios/recuperación | codex/p1-user-management / e2180879 | [24](https://github.com/ErickRFM/Siii/pull/24) | QA local y CI verde38804502406/38804508679; sin merge. |
<<<<<<< HEAD
| F09 administración | codex/p1-institution-admin desde e2180879 | [25](https://github.com/ErickRFM/Siii/pull/25), dependiente de24; SHA final en entrega exportada | Dos revisiones favorables y QA local verde; CI por SHA en el PR; sin merge. |
=======
| F09 administración | codex/p1-institution-admin desde e2180879 | PR dependiente de24; referencia y SHA finales en entrega exportada | Dos revisiones favorables y QA local verde; CI por SHA en el PR; sin merge. |
>>>>>>> integrate/sii-v1

Las reconciliaciones finales d300ba75 y24209285 conservan sus árboles funcionales previamente verificados y añaden ascendencia compatible. Los PR dependen secuencialmente de la base anterior; no se fusionarán evitando las puertas de P0.

## P0.1 — evidencia real

Staging Free aprobado siii-staging-p01 (vsnrbjexusidlvhkhmqg), PostgreSQL17.11. Se crearon exclusivamente p01_empty_rehearsal y p01_legacy_rehearsal desde template0, siete roles mínimos y fixtures sintéticos. El LOGIN sólo hereda siii_app NOLOGIN. Inventario y operaciones registrados antes/después. No se eliminaron recursos ni se modificaron producción o esquemas internos de Supabase. Secretos sólo en archivos locales ignorados.

Preparación, replay representativo corregido, firma exacta, rechazo BASELINE_REQUIRED, adopción hashes0–1 e idempotencia del baseline original pasaron. Migración canónica vacía falló42501/alter_role en SQL0003 porque la cuenta administrada no es superusuario. La legacy falló CLOUD_CLI_FAILED después del baseline, sin SQLSTATE capturado. No se repitió el mismo migrador ni se alteraron SQL, hashes o ledger para forzar paso.

El hardening cloud posterior, idempotencia canónica0–5, RLS/grants/RPC/defaults futuros, CRUD/auditoría de runtime y reversa siguen NOT_RUN. El guard de runtime pasa en empty y falla cerrado en legacy por el RPC sintético deliberadamente abierto. La legacy conserva12 tablas baseline con RLSfalse; no es un esquema endurecido. Un hash de metadata seleccionada permaneció idéntico antes/después; no constituye respaldo completo. Véase [resultado staging](P0_1_STAGING_RESULT.md), [inventario/evidencia](P0_1_STAGING_RESULT.json) y [revisión](P0_1_STAGING_REVIEW.md).

Argon2id: se ejecutó una sola vez el laboratorio Linux aprobado, Node24/1CPU/1GiB, sin red durante medida, 384muestras/16casos,0errores,RSSmáximo344,58MiB. Se mantuvo65536/3/1. No certifica la capacidad HTTP ni el hosting real. [Informe y percentiles](P0_1_ARGON2_LAB.md). No se repitió por aprobaciones duplicadas.

Axe, teclado y Chromium aportan evidencia automática. Falta una persona verificando lector de pantalla en login/cambio de contraseña/catálogos, y permanecen hosting/HTTP, mecanismo administrativo soportado para SQL0003, respaldo/reversa y promoción controlada. Se conservan en [BLOCKERS](../BLOCKERS.md).

## P1 — capacidades funcionales

- MFA real TOTP, recuperación de un uso, secretos cifrados, protección replay, bloqueo compartido y step-up; revocación/versionado de sesiones. [Informe MFA](P1_MFA_REPORT.md).
- RBAC con29 capacidades,11 perfiles, ámbitos institución/programa/campus, delegación temporal, jerarquía y último administrador permanente. No hay root global implícito. [Informe ámbitos](P1_SCOPES_REPORT.md).
- Invitaciones consentidas, un uso/caducidad/revocación/reenvío, autoridad vigente después de esperas; outbox cifrado y worker real. Bearer sólo en fragmento/memoria. [Informe invitaciones](P1_INVITATIONS_REPORT.md).
- Usuarios/membresías con búsqueda, filtros, cursor, perfil institucional, suspensión/activación, baja, rehabilitación e historial; recuperación elegida por el titular y MFA preservado. [Informe usuarios](P1_USERS_REPORT.md).
- Administración institucional F09: implementada sobre base F06, revisada y verificada localmente con QA global verde. Reutiliza catálogos, roles, invitaciones y usuarios; agrega gestión de configuración/estado propio y auditoría paginada, sin crear autoridad global ni formularios académicos ficticios.

Todas las capacidades incorporadas usan API y persistencia reales, permisos backend, validación estricta, auditoría y UI accesible. El correo externo no está configurado en el runtime de prueba: no se afirma envío o recepción, ni se implementa un éxito simulado. Schedulers y recepción real siguen pendientes.

## Seguridad, correcciones y QA

Se ejercitan tenant/IDOR, scopes, mass assignment, expiración/revocación concurrente, sesión/MFA tras espera, CSRF, CSP/XSS y bearer fuera de history/Flight/storage, rollback de auditoría, rate limiting, RLS/grants, leases e idempotencia. Las revisiones independientes tienen dos pasadas con correcciones y regresiones documentadas por bloque. No se copiaron datos personales reales.

F06 final local: npm ci/typecheck/lint verdes,678 unitarias,216 integraciones,32 Chromium, migrador repetido,build y audit0. El primer pase global encontró cinco regresiones del contrato de listado al perder autoridad; se corrigió la respuesta final vacía compatible conservando visibilidad/revalidación, sin cambiar esos tests. Pruebas y revisión posterior verdes. F09 final local: instalación reproducible/typecheck/lint verdes,682unitarias,243integraciones,40Chromium en una ejecución (5,2min), migrador repetido, build con50rutas de fuente comprobadas en manifest, audit0 y diff-check/lockfile intactos. Dos pasadas independientes de fuente y dos revisiones puntuales de fixtures favorables. CI final se verifica sobre el SHA publicado y se registra en el PR y la entrega exportada; no se modifica el commit para insertar su propio SHA.

## Estado final por puerta

| Requisito | Estado |
| --- | --- |
| P0.1 staging representativo/baseline | PARCIAL, evidencia real conservada. |
| P0.1 hardening cloud y reversa | BLOQUEADO por prerrequisito administrativo del SQL histórico. |
| Argon2 Linux aprobado | EJECUTADO; hosting/HTTP pendiente. |
| Accesibilidad humana | PENDIENTE; automatización no la sustituye. |
| MFA/RBAC/invitaciones/usuarios | IMPLEMENTADOS Y VERIFICADOS en ramas dependientes; integración/merge pendiente. |
| Administración F09 | IMPLEMENTADA Y VERIFICADA localmente; CI por SHA publicado en PR dependiente; merge pendiente. |
| Entrega externa/schedulers de correo | PENDIENTE de entorno operativo. |
| Producción y main | Sin escrituras ni promoción; PR sin fusionar. |

SQL0010 publicado: SHA256 canónico LF E082937CD0326A2376E74E11505E8EFD0DCBFE1B6D8B89BAF095579947E7DD49. Cadena/journal completos de Git verificados mediante dos CLI reales sobre p1_institution_admin_lf_test nueva:11/11 ledger exacto; base anterior Windows/ledger preservados. La huella raw Windows1B9C…602 es distinta y no debe usarse para validar checkout LF. Detalle y límites en el informe F09.
<<<<<<< HEAD


Primera CI F09 c07d22c6: push38811760203 verde682/243/40/build/audit0; PR38811807434 verde682/243 y39/40UI, fallo en esperaDOM inicial de detalle de usuario F06. Correctivo del helper verificado mediante respuesta real retenida y suite7/7 de usuarios, typecheck/lint0; fuente de aplicación y schema intactos. CI del nuevo SHA se registra en PR25/entrega exportada; merge pendiente. Véase revisión F09 para límites de evidencia y reproducción controlada.
=======
>>>>>>> integrate/sii-v1
