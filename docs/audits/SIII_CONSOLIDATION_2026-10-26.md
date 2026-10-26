# Consolidación de SIII — 26 octubre 2026

## Estado y alcance

Base remota original: `a59dfc5313dbfaf978cfd25006e7e78bb5316f8b`. Rama de ejecución: `codex/consolidation-20261026`. La consolidación incluye correcciones verificadas de invitaciones y recuperación del diagnóstico honesto de #61. Este documento registra evidencia previa a la publicación; el resultado del SHA publicado, merge, limpieza y producción se adjunta al PR y al informe final de ejecución.

Durante la ejecución se integró externamente [#114](https://github.com/ErickRFM/Siii/pull/114), `main@19df36d5a2af621d4084c1104f956d6b11b0c16e`. La rama se reconcilió por fast-forward, preservando su login por correo verificado. La regresión de invitaciones comprueba tanto el usuario elegido como el correo de destinatario verificado, incluso cuando son distintos.

No se modifican esquema, migraciones históricas, permisos, MFA, HMAC ni datos productivos. Los dos scripts locales `SIII-limpieza-segura-ramas-v2.ps1` y `SIII-limpieza-segura-ramas-v3.ps1` permanecen sin seguimiento y no forman parte del cambio.

## Git y recuperación

- Repositorio y rama predeterminada verificados: `ErickRFM/Siii`, `main`. No había PR abiertos al consultar las 101 entradas históricas disponibles. `main` no tiene protección clásica de rama; esto no elimina la exigencia de revisión y CI del proyecto.
- [#112](https://github.com/ErickRFM/Siii/pull/112) ya estaba fusionado al comenzar; [#101](https://github.com/ErickRFM/Siii/pull/101) ya estaba cerrado. No atribuir esas operaciones a esta ejecución.
- [Inventario de 46 ramas](SIII_CONSOLIDATION_2026-10-26_BRANCHES.md), con [SHA completos, commits, archivos, permisos/migraciones/configuración y decisiones](SIII_CONSOLIDATION_2026-10-26_BRANCHES.json).
- 45 candidatos de eliminación, condicionados al CI/merge de esta consolidación y a nueva comprobación del SHA remoto y ausencia de PR activos. `main`, ramas locales, worktrees y etiquetas quedan protegidos.
- Tras observar #114: 47 ramas y 46 candidatos; manifiesto ampliado y bundle completo `remote-before-cleanup-v2.bundle` verificado. La rama nueva es ancestro de main. La rama de esta consolidación se conserva mientras su PR esté abierto.
- Antes de eliminar: bundle completo verificado, 27.9 MB, `.p0-local/consolidation-20261026/remote-before-cleanup.bundle`, cuyos 46 refs coinciden con el manifiesto. Recuperación: `git fetch <ruta-al-bundle> refs/remotes/origin/<rama>:refs/heads/<rama-recuperada>`. La copia es local; no se presenta como respaldo productivo de datos.
- R1–R5 son ancestros del origen de #26; su árbol completo es idéntico al squash integrado. Las migraciones antiguas renumeradas no se deben reaplicar. Las demás ramas se contrastaron por ascendencia, parches equivalentes o contenido exacto en su snapshot integrado. Las excepciones se explican individualmente en el inventario.
- Recuperado de #61: `full-university-lifecycle.test.ts` vuelve a describirse como contratos de esquemas, no como E2E. Sus aserciones no ejecutan el ciclo universitario. Ninguna función se fabrica para completar una etiqueta.

## Invitaciones y autenticación

Se reprodujeron dos fallos antes de corregirlos:

1. HTTP: cuenta inválida devolvía `INVITATION_UNAVAILABLE` con 422 en vez de error de formulario. La prueba RED falló exactamente por ese código.
2. Móvil: `bad..dots@example.test` pasaba la expresión simplificada del cliente y era rechazado por el esquema de correo del servidor. La prueba RED mostró el mensaje genérico de invitación.

`invitationAccountBody` es ahora el mismo esquema de nombre corto/correo, nombre/apellidos y contraseña en cliente y servidor. El cliente asocia errores con campos y enfoca el aviso; limpia la invalidez al cambiar de modalidad/invitación. Una referencia impide dos envíos simultáneos aun antes de renderizar `busy`. Se conservan ayuda de formato, botones accesibles de visibilidad, límites de contraseña y confirmación, consentimiento explícito y tratamiento del bearer exclusivamente en memoria.

`VALIDATION_ERROR` depende sólo de la entrada; no consulta ni divulga existencia de invitación o cuenta. Los fallos de bearer, emisor, propiedad y estado siguen siendo indistinguibles. La interfaz explica que puede haber caducado, sido revocada o consumida. No se añaden códigos públicos que permitan distinguir cuentas existentes o adivinar estado institucional. El token permanece pendiente tras errores de formulario.

La transacción existente conserva identidad, verificación de correo, membresía, rol, consumo y auditoría atómicos. No hay SQL de alta de destinatarios para saltarse el registro. Las pruebas existentes cubren rollback de auditoría, revocación concurrente y consumo único. La nueva prueba HTTP corrige tres entradas inválidas, registra un estudiante con correo como usuario y verifica login real; la nueva prueba de navegador hace lo mismo a 360 px y comprueba que dos `requestSubmit()` producen una sola solicitud.

## Compañero

Los cinco archivos de #101 fueron comparados contra main. Probe, unitarias e informe de contrato son idénticos; el workflow moderno añade PostgreSQL de origen, outbox, cadena completa y recibos, además de un receptor más reciente. [#104](https://github.com/ErickRFM/Siii/pull/104) y [#109](https://github.com/ErickRFM/Siii/pull/109) sustituyen su composición. No se reintroduce el workflow antiguo.

Se conserva el receptor fijado `127e7dfa1c6ac760652859f78df226b47d01f08e`. El job `Companion live contract` exige cinco XML con **27 casos**, cero fallos/errores/omisiones: entrega firmada 1, cadena completa 1, proyección 9, inbox 11 y recibos 5. Su resultado del SHA final se comprueba en CI. Esto cubre servicios sintéticos reales; no acredita funcionamiento Android/iOS físico ni credenciales/flags productivas.

## Calidad registrada antes de publicación

| Comprobación | Resultado local observado |
|---|---|
| Instalación reproducible | `npm ci --ignore-scripts`, seguido de `npm rebuild argon2 esbuild`, aprobado |
| Lint | `npm run lint`, sin errores |
| TypeScript | `npm run typecheck` (`tsc --noEmit`), sin errores |
| Unitarias | 922 aprobadas, 68 archivos |
| HTTP de invitaciones | 39 aprobadas; 422 específico, reintento, login, rollback, tenant, MFA y carreras |
| Playwright de invitaciones | 9 aprobadas; navegador real, 360/390 px, oscuro, teclado/foco, axe, login y bearer |
| Build de producción | Ejecutado por el setup real de Playwright; compilación y generación aprobadas |
| Dependencias | `npm audit --audit-level=high`: 0 vulnerabilidades |
| Migración desde vacío | 26 migraciones aplicadas exclusivamente en PostgreSQL 17 local desechable |
| Integración completa, outbox ON, legacy financiero y UI completa | Registrar resultado definitivo en PR; no inferir de los gates focales |

Logs locales: `.p0-local/consolidation-20261026/`. La revisión independiente inspeccionó fuente, pruebas, snapshots, excepciones y bundle: cero hallazgos críticos/importantes; se corrigió el hallazgo menor de reinicio de `invalidFields` antes de publicar. Ningún test fue eliminado o relajado.

La primera integración completa local registró **598 aprobadas, 8 fallidas y 35 omitidas** (641 en 41 archivos). Las omisiones corresponden al contrato condicionado a outbox ON. Se investigaron los ocho fallos: dos regresiones de delivery de contraseñas consultaban un evento todavía no elegible en la precisión de PostgreSQL; seis de operaciones Compañero usaban dos sesiones cuyo factor sintético figuraba posterior a la prueba MFA (delta mínimo medido −3.942 ms). Una medición de 100 consultas devolvió PostgreSQL por delante del `Date.now()` receptor en 98 casos, máximo 1.151 ms.

Se corrigieron exclusivamente fixtures: el reset por probar se marca explícitamente vencido para su siguiente intento, y el factor sintético se crea un minuto antes de la prueba de sesión. No se altera el worker, su calendario real, expiraciones, MFA, permisos ni timeouts. La repetición completa de los tres archivos afectados y de invitaciones reconciliadas pasó **87/87**; las unitarias finales volvieron a pasar **922/922**, lint y tipos sin errores. La suite completa del SHA publicado sigue siendo obligatoria en CI; no se presenta la primera corrida como aprobada.

## Producción: evidencia de sólo lectura

Vercel Production `siii-three.vercel.app` resolvía al deployment `dpl_7pFiFYzuoDiNWCNfUVVSpNQnN8h8`, estado READY, `main@a59dfc5313dbfaf978cfd25006e7e78bb5316f8b`. El despliegue de esta consolidación se debe verificar por separado después de fusionar.

Comprobación pública sin cuentas ni escrituras: `/api/health` y `/login` 200; `/dashboard` 307 a `/login`; `/api/v1/auth/me` 401; `/invitations/accept` 200. CSP, HSTS y `nosniff` presentes en las cinco respuestas. No se prueba un flujo institucional autenticado con estos GET.

Supabase Primary, proyecto Siii `kkjzbqsaummyralqjqrb`, consultas exclusivamente de metadatos:

- **26 migraciones**, 0000–0025; los 26 hashes y timestamps coinciden con `readReleaseMigrations('supabase-v1')`, incluidos perfil administrado y apéndice. No se sustituyeron hashes por la variante canónica.
- **56 tablas**, todas con RLS y FORCE RLS; cero tablas con SELECT de `anon` o `authenticated`.
- Existen outbox/versiones académicas, invitaciones, órdenes de pago, solicitudes de admisión y vínculo de expediente.
- `siii_app` y `siii_migrator`: NOLOGIN, NOSUPERUSER, NOBYPASSRLS. Asesor de seguridad: sin avisos.

Estos resultados actualizan las observaciones históricas de [24 octubre](SIII_COMPANION_DATABASE_READINESS_2026-10-24.md), que entonces tenían 18 migraciones. **Esta sesión no aplicó DDL productivo ni acredita quién/cuándo lo aplicó, respaldo reciente, restauración independiente, todas las ACL heredadas o el rol efectivo del runtime.**

## Límites de cierre

La funcionalidad de backend se acredita mediante las suites y contratos indicados, no por compilar. La producción autenticada con usuarios reales, entrega de correo al destinatario real, sincronización HMAC con credenciales productivas, flags efectivas y pruebas físicas Android/iOS no se dan por comprobadas. No se crean invitaciones ni datos institucionales reales para aparentar ese cierre. La consolidación de Git y el despliegue del código no sustituyen esas puertas.
