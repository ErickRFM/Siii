# V25: archivo académico Compañero → SIII

## Comportamiento

La migración 0027 añade archivo append-only de revisiones de asistencia y cierres operativos. Cada resultado se valida contra la publicación original cifrada del outbox (tenant, sección, versión, matrícula, padrón, docente y ocurrencia), incluso después de revocar una inscripción o cerrar el periodo. Una revisión antigua nunca sustituye una corrección posterior; la cancelación conserva el historial y se excluye del porcentaje.

El proceso SIII usa una credencial independiente attendance:archive, jobs separados por alumno/docente, paginación y recorridos completos repetidos. Los trabajos docentes retienen clases sin registros de alumnos. Leases y auditoría se confirman con los resultados; ocho fallos llevan a una recuperación institucional auditada. Un fallo del proveedor nunca significa ausencia.

Las páginas de alumno/docente muestran filtros, paginación, decisiones y clases realizadas/pendientes/abiertas/canceladas. Una clase realizada necesita cierre confirmado por docente; un administrador cerrando el pase no cuenta. La UI retira datos al cambiar sesión/permisos o perder foco/conexión y revalida acceso al recargar. No se exportan dispositivos, QR, notas privadas ni identidades nativas.

La recuperación de publicación puede materializar ocurrencias desde patrones oficiales, con autorización académica adicional, conflictos y capacidad revalidados. Conserva cancelaciones y publica versión/outbox/auditoría en una sola transacción. No reprovisiona cuentas SIII ni cambia sus contraseñas.

## Validación ejecutada

- 1060 pruebas unitarias; TypeScript, ESLint y build de producción aprobados.
- 49 pruebas focalizadas PostgreSQL/HTTP, recuperación cifrada y perfil de liberación administrado aprobadas; incluyen respaldo/restauración de las cuatro tablas nuevas y recuperación docente con MFA.
- 9 pruebas PostgreSQL/HTTP con migración fresca y rol runtime restringido: revisiones, deduplicación, aislamiento, autorización/revocación, fuente histórica, clase sin asistencia, cierre/cancelación y RLS.
- Gate de siete suites nativas con ocho casos de historial; receiver fijado a c0ccd27b0eec9bd1a0f583be5e0b0fd484e8a00b. La cadena real local y CI del SHA final se registran aparte cuando concluyan.
- Revisión independiente de clases/archivo/jobs: RETURNING de recuperación docente corregido. El receiver conserva continuación durable del cierre antes de exportar una clase realizada.

## Activación pendiente

Activar solo después de migrar mediante el proceso autorizado y configurar SIII_COMPANION_RESULTS_TARGETS_JSON con la credencial de archivo exclusiva; SIII_COMPANION_RESULTS_ENABLED permanece deshabilitado por defecto. No se ejecutó migración sobre producción ni se publicaron datos QA remotos. QA-UNIV conserva los usuarios existentes y requiere alta/verificación/vinculación nativa oficial con MFA. FCM y dispositivos físicos siguen sin certificar.

## Estado de evidencia verificable (2026-11-03)

- **Verificado (CI de `main`):** run `verify.yml` `41586201078` sobre `1d7d799` — jobs `verify`, `ui` y `Companion live contract` en verde; artefacto `companion-live-contract` adjunto. El gate de 7 suites nativas reportó `tests=1,1,9,11,5,8,4` con `failures=0 errors=0 skipped=0`.
- **Verificado (local):** `npm run typecheck`, `npm run lint`, `npm test` (1060 unitarias) en verde; `npm run db:drift` (gate schema↔migraciones) en verde.
- **No verificado:** los conteos "49 focalizadas" y "9 PostgreSQL/HTTP" de la sección *Validación ejecutada* no se re-ejecutaron aquí; quedan **PENDIENTES** de evidencia de integración contra base real. La aplicación de 0027 en producción y la certificación E2E remota permanecen **NO VERIFICADAS**; ver `docs/operations/SIII_MIGRATION_0027_RUNBOOK.md`.

Contraparte: https://github.com/ErickRFM/Compa-ero-de-esc/pull/243. El rollout exige bandera global y destino attendance:archive válido del tenant: otras instituciones mantienen su consulta existente. La cadena real de 39 casos pasó en CI con el backend previo equivalente (4b18d63e); el receiver fijado añade únicamente traducciones y una prueba accesible. La ausencia de las intervenciones remotas impide afirmar certificación E2E remota.
