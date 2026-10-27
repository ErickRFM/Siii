# SEC06 parcial: autoridad de lectura del vínculo propio

Base: main809c526d,22octubre2026. Sólo cambia GET `/api/v1/institutions/:institutionId/student-links/me`, consumidor del claim integrado en #84. No modifica F2, helper de autorización, claim, schema, migraciones ni UI.

## Reproducción y causa

El handler verificaba identidad y la existencia de una membresía, pero no su estado, institución activa, grants vigentes, cambio de contraseña pendiente ni MFA privilegiado. El SELECT privado no revalidaba autoridad. Una membresía suspendida seguía recibiendo nombre, matrícula y correo institucional. La consulta también devolvía200 tras revocación/caducidad mientras esperaba un bloqueo real de la tabla de vínculos.

RED válido sobre la fuente original:18 casos nuevos,12fallos/6controles,16.93s. Incluye nueve estados sin autoridad y tres esperas SQL (grant revocado, membresía suspendida y sesión vencida). Un primer intento contenía una fixture de deleted_at incompatible con el CHECK que exige status suspended; se corrigió la fixture y un literal SQL antes de obtener el RED funcional anterior. Esos intentos no se cuentan como evidencia funcional completa.

## Corrección y compatibilidad

Se reutilizan authorizeCapability('institutions.read') e institutionVisibility en el SELECT final. La consulta parte de la membresía del actor, limita usuario/membresía/tenant, excluye baja lógica y une vínculo activo y estudiante por institución. El predicado común comprueba otra vez sesión/authVersion/estado/grants/MFA con clock_timestamp. LEFT JOIN conserva la diferencia entre acceso autorizado sin vínculo y denegación; no se crea otra política ni se amplía lectura administrativa de expedientes ajenos.

Se conservan401 UNAUTHORIZED,404 NO_MEMBERSHIP y200 `{data:{membershipId,studentRecord}}` con la misma proyección y null sin vínculo. Una membresía existente sin autoridad vigente ahora recibe403 FORBIDDEN sin data; es la corrección de seguridad deliberada. Un estudiante válido mantiene autoservicio sin MFA, y un administrador conserva MFA obligatorio sin exigir step-up crítico para una lectura. Todas las respuestas usan Cache-Control:no-store. Revocar el vínculo produce studentRecord:null, no expone una fila antigua.

## Ejecución verificable

Worktree reutilizado del #84, rama independiente fix/student-link-read-authority-20261022 desde809c526d. PostgreSQL17 local127.0.0.1:55439, base sintética siii_claim_test con migraciones existentes0000–0024; HTTP exclusivo3203. El harness original crea un rol LOGIN NOSUPERUSER/NOBYPASSRLS y comprueba la instancia. Los positivos conservan aceptación real de invitación/correo, login y claim HTTP; no hay mocks, correo enviado ni flags de identidad inventados.

- npm ci:375paquetes,0vulnerabilidades. Aviso de scripts argon2/esbuild no aprobados permanece sin modificar configuración; tests/build reales aprobaron.
- npm run lint:exit0.
- npm run typecheck antes y después del build:exit0.
- npm test:826/826,56archivos,10.96s.
- npm run build:exit0,compilación7.6s,31/31páginas; sin servidor dev concurrente. Aviso basal de plugin ESLint Next no detectado.
- Suite claim+lectura en desarrollo:47/47HTTP,38.94s.
- Composición sobre build de producción:126/126HTTP,44.22s,4archivos:47claim/lectura +27SEC02 +30escritores de admisiones +22finanzas. Repetición con SIII_HTTP_TEST_PRODUCTION=1 y SIII_TEST_PORT=3203; ambas URLs DB sólo al destino sintético anterior.
- Revisión independiente del delta:sin Critical/Important/Minor; el revisor inspeccionó fuente y18pruebas, no ejecutó gates.

Comando focal: `npm run test:integration -- tests/integration/student-claim-authority-http.test.ts`. Logs RED/GREEN, composición, build, tipos, lint y npmci conservados bajo `.p0-local/student-link-read-*`, ignorados. Se extiende la fixture ya existente en vez de duplicar el emisor o el flujo de prueba de correo.

## Estado y límites

REVISADO LOCALMENTE; CI del SHA publicado e integración pendientes. La validación local no incluyó toda la integración ni navegador porque no cambia UI; el CI global sigue siendo gate. Esta corrección cierra sólo la deuda de lectura propia documentada en #84. La aprobación manual de reclamaciones, seguridad global, regresión visual completa y E2E universitario siguen sin acreditarse por este incremento. Sin migraciones productivas, cambio de credenciales, habilitación de sincronización ni datos institucionales reales.
