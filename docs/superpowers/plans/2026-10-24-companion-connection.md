# Conexión SIII ↔ Compañero — plan de ejecución

> **For agentic workers:** usar superpowers:executing-plans o superpowers:subagent-driven-development; pruebas RED→GREEN y revisión independiente antes de merge.

**Goal:** demostrar modificación académica autorizada → PostgreSQL/outbox → HMAC → Ktor/inbox → Mongo → lectura autorizada → Android, incluyendo bajas, revocaciones y recuperación.

**Architecture:** conservar los productores transaccionales, transporte firmado, inbox/proyector, `SiiiSectionReader`, identidades nativas verificadas y repositorios Android actuales. Conectar los límites faltantes; SIII conserva la autoridad académica y las proyecciones no conceden asistencia ni administración nativas.

**Tech Stack:** Next.js/TypeScript/Drizzle/PostgreSQL; Kotlin/Ktor/Mongo; Android/Room/WorkManager. Spec: prompt maestro del usuario, 24 octubre 2026, y `docs/operations/COMPANERO_PILOT_VARIABLES.md`.

## Restricciones y evidencia inicial

- Bases verificadas: SIII `2a3c8390062aefbb87dc8dc596620fee31ff8565`; Compañero `586ec206576349c9a0d96ce85c50bbb3cf0fb0b5`.
- No duplicar #101 (reconciliado por #104), #219 ni #220; no cambios visuales ni asistencia QR.
- Supabase productivo `kkjzbqsaummyralqjqrb`: ledger Drizzle con 18 entradas, tablas de outbox/versiones ausentes. Tablas públicas institucionales con FORCE RLS; sin grants directos a anon/authenticated. Hay que cotejar hashes con el perfil de release antes de preparar migraciones.
- Variables de outbox/cifrado/delivery presentes en Vercel Production; existencia no acredita estado efectivo ni funcionamiento. No regenerar ni publicar valores.
- No DDL productivo, flags, credenciales, datos institucionales ni envíos reales sin respaldo comprobado, validación sintética y autorización correspondiente.
- Ramas separadas y cambios locales conservados. Compañero se trabaja en checkout aislado; no ejecutar simultáneamente Gradle ni servidores sobre los mismos artefactos/puertos.

## Review focus

- Revocación durante una lectura o refresh: no reutilizar identidad, sesión o caché anterior.
- Institución/rol/identidad distintos con el mismo usuario: aislamiento y fallo cerrado.
- Cambios de horario fechados y zonas horarias: no convertir ocurrencias en recurrencias semanales ni truncar medianoche.
- Entrega aceptada pero proyección fallida: estado verificable y recuperación, sin declarar éxito con HTTP 202.
- Caída de red y expiración: reintentos duraderos y caché restringida con vigencia acotada, sin restaurar acceso denegado.

## Bloques ejecutables

- [x] Auditoría rápida de repositorios/servicios, matriz inicial y brechas concretas.
- [x] **1. Productores de estado académico (local; CI/merge pendiente).** En `registry/[resource]/route.ts`, fanout transaccional ordenado de secciones afectadas por cambios de alumno/docente, reutilizando `enqueueAcademicSection`; pruebas HTTP ON/OFF, tenant, múltiples grupos y rollback. Sin nuevo contrato ni migración.
- [ ] **2. Android: caché y calendario seguros.** En AcademicRepository/cache/claims/AuthRepository/ScheduleViewModel, impedir fallback ante denegaciones, purgar al logout/cambio de autoridad, aislar por contexto y acotar vigencia offline. En TodaySchedule respetar `recurrence/effectiveDate`; preservar agenda personal. Pruebas JVM primero; instrumentación posteriormente.
- [ ] **3. Ktor: lector a HTTP.** Descubrimiento inverso por vínculo nativo vigente, listado acotado por identidad en repositorio SIII y revalidación con reader. Conservar `/academic/load`, `/academic/schedule`, `/academic/schedule/v2`, providers y autoridad nativa; ocurrencias fechadas con zona del snapshot. Pruebas reales de rutas/Mongo y negativas de identidad/tenant/rol/estado.
- [ ] **4. Autoridad y revocaciones de origen.** Resolver explícitamente estados de institución, cuenta, vínculo y vigencia SIII, sin asumir que un snapshot antiguo es autoridad actual. Reutilizar contrato disponible o añadir el mínimo límite autenticado de autoridad; pruebas de suspensión, caducidad, cambio de rol y reactivación. No habilitar consumo hasta cerrar esta puerta.
- [ ] **5. Worker y operación.** Presupuesto acotado para lotes, scheduler compatible con plan desplegado, estados de entrega/proyección y recuperación/backfill auditados. Reutilizar endpoint protegido e idempotencia; pruebas de timeout, lease, duplicados, orden y reintentos. No habilitar scheduler productivo antes del piloto.
- [ ] **6. Cadena sintética reproducible.** PostgreSQL y Mongo desechables, APIs reales y firmado productivo; alta/modificación/baja de grupo/docente/alumno/horario, consultas autenticadas y negativos HMAC/replay/nonce/tiempo/tenant. Android consume los contratos reales; ejecutar instrumentación en emulador y separar validación física.
- [ ] **7. Preparación de base.** Cotejar ledger/perfil/hashes actuales; validar migraciones pendientes en orden y restauración de respaldo desechable; preparar runbook de backup/reversión y solicitud concreta de autorización para producción. No aplicar DDL sin cumplir las condiciones.
- [ ] **8. Integración de código.** Suites relevantes y completas, revisión independiente, PR por repositorio, CI obligatorio verde, merge y SHA final. Verificar despliegues y lecturas sin activar envíos ni provocar escrituras productivas implícitas.
- [ ] **9. Piloto y activación controlada.** Solo con puertas anteriores satisfechas y autorización requerida; confirmar proyección duradera, API y Android antes de flags institucionales. Si falta acceso externo, documentar el bloqueo exacto y continuar los bloques independientes.

## Continuidad

Ledger de esta ejecución: `.superpowers/sdd/2026-10-24-companion-connection/progress.md`. Registrar pruebas/commits/bloqueos al completar cada bloque. Tras cerrar el trabajo de integración ejecutable, auditar el resto de SIII con las mismas puertas, sin rediseño ni duplicación.
