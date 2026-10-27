# P0.1 — revisión del harness cloud

Dos pasadas independientes de fuente revisaron el ensayo restringido a siii-staging-p01 (vsnrbjexusidlvhkhmqg), sin ejecutar SQL ni leer secretos. La revisión final sobre SHA256 353472280868837F3C9E0ADE45668DE24184D4166503DF700E0B23F010588715 fue favorable y no encontró hallazgos materiales pendientes.

La primera corrección evita persistir probes y permisos temporales: transacción, savepoints y rollback en éxito y error. La segunda conserva el grafo mínimo de PostgreSQL17 sin devolver ADMIN al grantor. La corrección del replay añade USAGE/CREATE solamente a dos propietarios sintéticos dentro del mismo batch; valida límites únicos de transacción y restaura ACL capturadas antes del COMMIT. No modifica exporter ni SQL histórico.

Las regresiones locales reales cubren repetición sin objetos residuales, fallo después de crear probes, SQL abortado, el error original42501 con ejecutor no superusuario, rollback completo por error22012 al final del replay y firma exacta del baseline de12tablas. La revisión de fuente no certifica su resultado cloud.

QA final del coordinador (2026-10-15): npm ci, typecheck, lint, 121/121 unitarias, migrador repetido, 94/94 integraciones, 10/10 Chromium, build, audit con cero vulnerabilidades y diff check terminaron con exit0. Se liberó la solicitud temporal de ejecución; no se cambió el plan de energía. La migración histórica 0003 y las restantes puertas de BLOCKERS.md siguen abiertas. Véase P0_1_STAGING_RESULT.md para el ensayo real, sus objetos, permisos y resultados parciales.
