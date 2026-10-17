# Reconciliación de PR históricos — 2026-10-17

Comparación de árboles contra `origin/main` en `c70adc40f16f5269b27f2971029156443b9cd773`. Cada PR se comparó con su dependencia inmediata para separar sus cambios propios de los heredados. Sus heads no son ancestros de main; eso no equivale a que falte su código.

| PR | Head revisado | Evidencia de incorporación en main |
|---|---|---|
| 9 | `3e6a6fef1e128e806130e8c5a62b3514c476eb32` | Schema de expedientes, validación y pruebas base idénticos; migración `0002_school_registry` renumerada a `0011_school_registry` con blob idéntico `f3a4ebcefe1c8bad233a2e4ec7fad08d1c363770`. Cuatro contratos API conservados. |
| 14 | `8950c54b77427f1a02bfb9d1826c61a8107c254b` | Schema, validación y pruebas unitarias de evaluación idénticos; migración `0003→0012` con blob idéntico `97cc90c70e79e121ee7f2cd43b9f1b5a1a706a75`. Tres rutas conservadas. |
| 15 | `f5a3922f6b46864c3bf9dc395284e6dcc5827883` | Schema, validación y pruebas unitarias de horarios idénticos; migración `0004→0013` conserva el DDL y añade `IF NOT EXISTS` al índice de campus. Tres rutas conservadas. |
| 16 | `fb0a54fe5bee0fe73a66314b5de70aaec9eedda4` | `academic.ts`, `guard.ts`, contrato Compañero y prueba unitaria idénticos; cinco rutas conservadas y envueltas con verificación de institución activa y rol de base. |
| 18 | `fdbcef5a33673122d67256ff44fd3e6735865be8` | Schema, validación, UI y pruebas originales de servicios idénticos; migración `0005→0014` con blob idéntico `e21102560c941a7d0d77f45739074b6eb735c156`. Cinco rutas conservadas. |
| 25 | `dff8c2d9573e2aa3a337afaa09114195051a8088` | Handlers, acceso, política, UI administrativa, migración `0010`, cuatro rutas y pruebas backend idénticos. La prueba de navegador conserva y refuerza la validación de respuesta. |

Los cambios posteriores en rutas académicas añaden revalidación transaccional de permisos, `request_id` y restricciones de conflictos; no se detectó una operación histórica perdida. El journal contiene `0010–0014` bajo sus nombres reconciliados. No se identificó implementación exclusiva pendiente de rescatar en los deltas revisados.

Esto permite documentar los PR como incorporados/sustituidos tras revisión. No autoriza por sí solo su cierre ni declara que todos los dominios estén listos para producción. La auditoría fue de solo lectura: Git local, sin llamadas a API, consultas de producción, merges ni cierres.

Siguiente deuda compartida observada: `sections` aún utilizaba `limit(200)` aunque sus consumidores seguían cursores mediante `readCollection`; la corrección se desarrolla separadamente con pruebas HTTP y de selectores de más de 200 registros.
