# Consolidación SII — 2026-10-15

## Estado y alcance
Main inicial: c7334cdfe524fe02d7c7090e0862884743008720. Checkout original integrate/sii-v1 en c07d22c6 con merge académico abierto; se conservó sin cambios. Trabajo aislado en codex/sii-consolidation-20261015. La rama remota integration/sii-consolidation-20261015 partía de main.

Ascendencia verificada, sin fusionar por número: académica #9(3e6a6fef) → #14(8950c54b) → #15(f5a3922f) → #16(fb0a54fe) → #18(fdbcef5a); seguridad #19(755a4bb9) → #20(ee6c39ec) → #21(8c824769) → #22(d300ba75) → #23(24209285) → #24(e2180879) → #25(dff8c2d9). Los dos HEAD finales incluyen sus respectivas cadenas. Ningún PR individual se fusionó a main.

## Cambios
- Migraciones académicas renumeradas 0011–0014. SQL0013 evita recrear el índice compuesto de campus que P0 ya define. SQL0000–0010 conserva exactamente los blobs de dff8c2d9.
- SQL0015: RLS forzada, políticas deny para anon/authenticated, propietario siii_migrator y DML mínimo siii_app en las 18 tablas académicas nuevas.
- Fechas de calendario reconciliadas con P0. Esquemas de ambos stacks y journal secuencial unificados.
- Todas las escrituras académicas adquieren el contexto institucional y revalidan permisos/sesión/MFA antes de confirmar; auditoría con request_id. Notas sensibles de tutoría también auditan lectura sin copiar notas al evento.
- Grupos docentes se filtran por relación real. Administración puede consultar su libro institucional; publicación exige step-up reciente e idempotencia. Matrículas no cambian después de publicar el acta.
- Inscripción y asignación docente revalidan colisiones sobre ocurrencias; horarios comparan términos superpuestos.
- Servicio Compañero rechaza instituciones suspendidas y credenciales de runtime inseguras. Se conservan DTOs de AcademicProvider. No se modificó Compañero, ni se afirma E2E Ktor, sincronización de notas, outbox o replay S2S.
- Navegación por capacidades para estudiantes/docentes, grupos/inscripciones, calificaciones, horarios/aulas y servicios. Catálogos de formularios siguen cursores. Etiqueta accesible del selector de programas corregida.

## Evidencia incremental
Instalación npm ci --ignore-scripts y rebuild nativo correctos, audit inicial0. Primer conjunto:707 unitarias,279 PostgreSQL/HTTP, tipos/lint; tres Chromium adicionales pasaron después de sincronizar la prueba con la respuesta de permisos y corregir la etiqueta del selector.

RED→GREEN reales:18 tablas sin RLS/runtime →18/18; libro docente y auditoría →6/6; seis hallazgos de revisión →13/13, incluyendo último cupo concurrente, acta inmutable, aislamiento, conflictos, auditoría sensible y suspensión S2S. Prueba de selector con61 programas falló antes de seguir cursores; luego alta persistente, móvil oscuro y axe pasaron. No se ampliaron timeouts ni se eliminaron aserciones.

Validación final: 708/708 unitarias (30 archivos), typecheck, lint y audit0. La suite completa PostgreSQL/HTTP confirmó285/285 (22 archivos,467.06s) en el laboratorio inicial. Al verificar bytes físicos se detectó que0000/0001 conservaban CRLF del checkout original pese a la nueva regla eol=lf. Se preservó ese laboratorio y su ledger; se restauraron los11 SQL canónicos desde Git, sin cambios de contenido, y se creó p0_sii_consolidation_lf_test. En esta base nueva el migrador canónico pasó dos veces y41/41 pruebas verificaron baseline poblado, base vacía, RLS y handlers de consolidación. No se reescribió ningún ledger. CI del PR debe repetir toda la suite con bytes LF del checkout Linux.

Chromium final:43/43 en2.9min, sobre build de producción correcto. Copia/restauración local verificada:41 tablas,16 entradas del ledger,406ms para copia y398ms para restauración; esquema, políticas, ACL, propietarios y datos coinciden (SII_CONSOLIDATION_RECOVERY.json). Los intentos con Next dev revelaron esperas por compilación fría; precargar75 rutas y retenerlas consumió la memoria disponible, por lo que esa alternativa se descartó. El globalSetup UI ahora compila y ejecuta el bundle de producción con el rol DML sintético. No cambia la aplicación ni relaja permisos, tiempos o aserciones. La prueba nueva exige la cookie __Host-siii_session con Secure, HttpOnly, SameSite=Lax y Path=/. Login y PATCH institucional validan además sus respuestas HTTP reales. Los intentos anteriores no se cuentan como suite completa verde.

## Revisión independiente
Revisión de fuente de /root/consolidation_review, sólo lectura: seis hallazgos materiales. Todos aceptados y cubiertos con regresiones: roster de acta, altas que introducen conflictos, S2S tras suspensión, términos superpuestos, cursores en selectores y lecturas sensibles. Se corrigieron sin invocar una segunda revisión que repita el diff.

## Estado cloud comprobado
Consultas de metadata sólo lectura: producción kkjzbqsaummyralqjqrb sigue con12 tablas public sin RLS y sin ledger Drizzle. Proyecto staging vsnrbjexusidlvhkhmqg activo, public de su base postgres vacío; conserva p01_empty_rehearsal y p01_legacy_rehearsal. Ninguna escritura de producción ni migración cloud en esta operación.

Vercel recuperó acceso tras reconexión. Proyecto prj_5OMS0EPuwS3cuQF4ICqBYBF6UNlT, equipo team_yJjgpau6x2SsEeKXBw09sE4a: DATABASE_URL sólo configurada para production, sin credencial Preview. No se reutilizó producción para Preview.

El bloqueo canónico0003 se reprodujo localmente con migrador sin SUPERUSER (42501 incluso al pedir NOSUPERUSER redundante). La revisión automática rechazó cambiar el SQL histórico por riesgo de drift. Se restauraron sus bytes originales y se preservaron bases/ledgers. Propuesta y prueba pendiente en docs/operations/proposals/P0_MANAGED_ROLE_NORMALIZATION.md. Esa prueba pendiente NO se cuenta entre las suites en verde. No se intentó evadir el rechazo ni registrar hashes manualmente.

## Módulos y límites
Catálogos, expedientes básicos de estudiantes/docentes, grupos, matrículas a grupo, asignaciones, libro/actas iniciales, aulas/recurrencias/ocurrencias y avisos/solicitudes/talleres disponen de APIs y pantallas integradas. Usuarios, roles, MFA, invitaciones, recuperación y administración se conservan del stack P1.

Siguen parciales: tutorías tiene API sensible auditada pero no workspace completo; vinculación de identidad docente carece de flujo UI completo; listados de dominio aún muestran límite explícito200; estado académico e historial ampliado, prerrequisitos/lista de espera, rectificaciones, documentos oficiales, outbox/S2S firmado, Ktor E2E y recepción/scheduler de correo no están completos. No se consideran fases terminadas.

## Promoción y reversa
PR de consolidación debe permanecer borrador mientras estén abiertas las puertas cloud, backups/reversa cloud, hosting/HTTP y lector de pantalla humano. SQL0011–0015 es aditivo: reversa de aplicación al stack de seguridad conservando tablas privadas y datos; no eliminar tablas/ledger. Ensayo local de copia/restauración en scripts/rehearse-consolidation-recovery.mjs preserva fuente y copias y compara esquema, políticas, ACL, ledger y conteos/checksums sintéticos; no equivale a backup portable o restauración Supabase.

Pendientes obligatorios antes de main: CI/revisión sobre el HEAD, una solución aprobada para migración cloud sin falsificar ledgers, backup/restore/reversa staging, Preview con cuenta DML mínima y claves MFA separadas, cuentas reales sintéticas por rol, smoke/login remoto y accesibilidad humana. Producción no cambia.

Decisión explícita del usuario: conservar SQL histórico y entregar PR en borrador. No ejecutar la propuesta. Vercel confirma producción READY sobre7070a461bc9480bd34bb26902959188cfcbde35a, rama feat/sis-foundation, sin promoción.

## Publicación del borrador

PR26: https://github.com/ErickRFM/Siii/pull/26, base main, rama integration/sii-consolidation-20261015. Primer HEAD38b9d046. Vercel Preview READY: https://siii-p8sn3erps-er-i1.vercel.app; GET /login200 con protección autenticada y CSP/HSTS/nosniff/frame-deny. Esto sólo valida hosting; no login de cuenta sin base Preview. CI38840610927 pasó instalación, lockfile, tipos, lint y708 unitarias; falló la migración del PostgreSQL puro antes de integración/UI. SQL0015 requiere los roles API que Supabase aporta, ausentes en PostgreSQL puro. Se añade preparación de fixtures anon/authenticated NOLOGIN y sin atributos elevados antes del migrador, limitada por isolatedDatabaseUrl a loopback y nombre de pruebas. No se cambia ningún SQL ni ledger. La nueva ejecución de CI debe confirmar el resultado.
