# SIII VNext institucional — 26 octubre 2026

## Base y decisiones

Rama `codex/vnext-institutional-20261026`, iniciada en `origin/main@19df36d5a2af621d4084c1104f956d6b11b0c16e` y reconciliada por fast-forward con `3bef93870b8399a7a8f0446aadb16da952052ae2` al fusionarse externamente #115. No se duplica ese PR ni se atribuye su merge a esta ejecución. Se conservan sus invitaciones, correo verificado, fixtures temporales y selección exacta de filas de paginación.

El encargo integral se contrasta con la implementación existente. Este incremento conecta autoservicio estudiantil, docencia y Caja; no declara completo todo el ciclo institucional por disponer de nuevas páginas.

## Datos y permisos

- No hay DDL ni migraciones nuevas. Se reutilizan las tablas institucionales, vínculos de cuenta, matrículas, asignaciones, ocurrencias, publicaciones, órdenes y transacciones existentes (0011–0025). No se reescriben migraciones ni hashes del perfil Supabase.
- `student.self.read` y `teacher.self.read` son capacidades de consulta personal. Estudiante/docente las reciben respectivamente; los administradores las contienen para conservar la delegación de esos roles. Tenerlas no permite escoger una identidad ajena: cada consulta exige su vínculo de cuenta vigente.
- El alumno puede tener ámbito de programa; se coteja el programa del expediente con el grant vigente dentro del SQL. Campus sin relación acreditable y docente con ámbito distinto de institución permanecen denegados; no se deducen relaciones de nombres, correo o matrícula.
- La navegación separa los portales personales de la gestión, conserva ambos para personas multirrol y utiliza el contexto institucional de la URL. Los endpoints verifican sesión, membresía, institución, grant, vigencia y vínculo; las proyecciones del menú no autorizan operaciones.
- Caja conserva `institutions.manage`, la autoridad del modelo vigente; no se inventa un rol Caja ni se eleva Control Escolar para presentar botones. La segregación de funciones financieras requiere una matriz institucional adicional.

## API y navegación

| Ruta | Contrato |
|---|---|
| `GET /api/v1/institutions/:id/portal/student/profile` | Expediente propio y programa, o `data:null` cuando no hay vínculo accesible |
| `GET …/portal/student/courses` | Inscripciones propias, sección, materia, créditos y periodo |
| `GET …/portal/student/teachers` | Nombres institucionales de docentes activos y asignaciones vigentes a sus materias; sin contactos privados |
| `GET …/portal/student/schedule` | Ocurrencias registradas de sus secciones inscritas, aula/campus, estado y motivo |
| `GET …/portal/student/grades` | Sólo `final_grades` de la última versión publicada para el estudiante en cada sección; una publicación que no contiene su nota no borra su resultado previo |
| `GET …/portal/student/announcements` | Avisos publicados y no vencidos de la institución, sin borradores ni autores privados |
| `GET …/portal/student/orders` y `/payments` | Órdenes y abonos del expediente vinculado; no revela notas internas del cajero |
| `GET …/portal/teacher/profile`, `/groups`, `/schedule` | Identidad docente propia, grupos asignados, total real de inscritos y ocurrencias |
| `GET …/grading/sections` | Cursor de grupos autorizados, sin antiguo tope silencioso de 200; consumidor sigue todas las páginas |
| `GET …/grading?sectionId=…` | Libro docente existente, con autoridad y relación vigentes en cada consulta SQL de datos privados |
| `POST …/grading`, `kind:score` | Requiere `expectedUpdatedAt:null` al crear o timestamp observado al actualizar. Conflicto devuelve 409 `GRADE_SCORE_CONFLICT`; preserva captura local |
| `GET …/financials/orders` | Órdenes administrativas paginadas con permiso vigente en el SQL |
| `POST …/financials/orders` | `operationId` opcional; los nuevos formularios siempre la envían. Replay idéntico 200, datos distintos 409. Conserva moneda del concepto activo |
| `GET/POST …/financials/orders/:orderId/payments` | Lectura de movimientos de Caja y registro de efectivo/transferencia externa |

Todas las colecciones nuevas usan `limit` 1–100, cursor determinista con precisión de microsegundos y contexto de recurso/actor. Parámetros desconocidos o cursores de otro contexto devuelven 422. Respuestas personales y movimientos: `Cache-Control:no-store`.

Páginas: `/dashboard/institutions/:id/student`, `/teacher`, `/financials`. El enlace docente al evaluador usa `sectionId` y se valida contra la lista autorizada. El historial CSV está rotulado **consulta informativa, no documento oficial** y protege prefijos de fórmulas. El calendario personal reutiliza la vista semanal sin acciones de modificación.

## Integridad financiera y de calificaciones

Las claves UUID de cargo y abono se normalizan a minúsculas antes de construir sus identificadores de texto. El replay con la misma UUID escrita en mayúsculas no crea un segundo movimiento. Este caso se reprodujo en RED y se corrigió tras la segunda revisión independiente.

El pago exige clave UUID de operación. Su número estable `PAY-<operationId>` reutiliza la unicidad institucional existente; una clave no puede abonar dos órdenes ni aceptar importe/medio/referencia/notas distintos. La transacción revalida autoridad, bloquea la orden, comprueba estado y saldo, registra el abono, actualiza saldo/estado y escribe auditoría antes/después con request ID. Un fallo de auditoría revierte todo. No hay simulación de tarjetas, exenciones, devoluciones ni pasarela.

La versión de captura usa el timestamp exacto de PostgreSQL. La actualización avanza de forma estricta al menos un microsegundo; dos solicitudes sobre la misma versión no ganan ambas. La UI conserva la captura que perdió, permite consultar el último guardado y exige actualizar antes de reintentar con la nueva versión. Publicación, MFA reciente e inmutabilidad existentes continúan vigentes; no se usa este comando para rectificar un acta.

## Compañero: límite comprobado

Inspeccionado `ErickRFM/Compa-ero-de-esc@55a1b99780ddef2cb2e9add7f82f6d6124965628`, fuente `services/api/src/main/kotlin/org/companerodeescuela/api/attendance/AttendanceRoutes.kt` y `SiiiAttendanceAuthority.kt`.

`/attendance/sessions/history` exige el proveedor de autenticación de la plataforma Compañero y rol docente; opera sobre `principal.subjectId()` y el actor nativo. El adaptador SIII verifica autoridad académica de identidades nativas; no es un endpoint S2S de historial para el portal SIII. El código inspeccionado no ofrece un contrato de consulta histórica estudiantil firmado con las credenciales SIII existentes. No se reutilizan JWT de usuario ni se inventa un endpoint.

Pendiente: contrato de lectura S2S por institución/identidad oficial, mapeo de registros, autorización vigente, paginación, timestamps/estado de actualización, límites y pruebas SIII↔Ktor↔Mongo. La UI identifica la conexión como pendiente. HMAC, nonces, outbox/inbox y captura QR se conservan.

## Cobertura del encargo y límites

| Área | Resultado de este incremento / pendiente |
|---|---|
| Estudiante | Portal, materias, docentes, horario, avisos vigentes, resultados publicados, historial informativo, perfil protegido con correo verificado propio y cuenta financiera. Falta fuente de semestre, promedio reglamentario, equivalencias, créditos aprobados, documentos certificados y datos adicionales editables |
| Docente | Grupos/asignación, lista oficial en evaluador existente, borradores con concurrencia, primera publicación existente. Rectificación con doble control y cierre académico reglamentario siguen pendientes |
| Control Escolar | Conserva admisión, expediente y operaciones vigentes; no cambia autoridad de matrícula ni inventa permisos. La ampliación de su matriz de operaciones necesita consolidación adicional |
| Caja | Conceptos/órdenes existentes conectados a UI, cargos idempotentes y abonos reales. Pendientes edición/estados de conceptos, conciliación, cancelaciones/devoluciones, comprobantes oficiales y segregación del rol |
| Catálogo | Conserva los cinco recursos, estados por ámbito, búsqueda, paginación y guía honesta de presencia. No interpreta “con registros” como configuración completa |
| Cuenta / roles | Conserva contraseña, MFA y sesiones existentes, consulta personal y navegación multirrol; no cambia secretos ni identidad global |
| Compañero | Contrato real inspeccionado; lectura de asistencia bloqueada por contrato S2S faltante. No se duplica captura ni QR |
| UX / accesibilidad | Reutiliza shell, componentes, tokens, calendario y scroll. Validación automatizada por viewport/tema; no sustituye una revisión humana con lector de pantalla |
| Producción | Requiere CI del SHA final, revisión, merge y verificación del deployment Production por SHA. Build/fixtures no certifican usuarios, pasarela ni integración productiva |

## Verificación

Evidencia de ejecución en `.p0-local/vnext-institutional/` (ignorado). Los resultados finales de suites/CI/PR/producción se registran después de ejecutarse. No se deben inferir de este diseño.

Pruebas nuevas: `personal-portals-http.test.ts`, `financial-payments-http.test.ts`, `grading-concurrency-http.test.ts`, `personal-navigation.test.ts`, caso scoped en `capability-disclosure.test.ts` y `personal-portals.spec.ts`. Los consumidores existentes de pruebas de captura se actualizan para enviar la precondición explícita; no se eliminan ni relajan sus aserciones.

La primera revisión independiente identificó cinco P2: navegación estudiantil scoped, selección del grupo por deep link, respuesta tardía de movimientos, retiro de datos al denegar a Caja y directorio multirrol. Cada corrección se verifica con su escenario. Se preserva el registro de corridas fallidas y las causas; la ejecución HTTP interferida por dos procesos Next no acredita un resultado funcional.

La primera batería completa registró **633 aprobadas, 2 fallidas y 35 omitidas** (670 casos/44 archivos). Los dos fallos pertenecían a fixtures de delivery de invitaciones que llamaban al worker antes de que el mensaje estuviera vencido para su reloj. Un sondeo de 100 SELECT locales midió PostgreSQL entre 10,478 y 11,966 ms por delante de Node. `issueForDelivery()` usa el helper `due()` existente exclusivamente para dar a esos casos su precondición explícita. No modifica worker, leases, reintentos, MFA, aserciones ni timeouts. Se conserva el resultado fallido y se exige repetir la verificación después de la corrección.

La repetición completa aprobó las invitaciones y registró **634 aprobadas, 1 fallida y 35 omitidas**: otro fixture de outbox académico intentaba reclamar un evento antes de su vencimiento para Node. Sus tres escenarios de reclamo inicial preparan ahora `next_attempt_at` explícitamente vencido; conservan intactas las aserciones de privilegios, fencing y agotamiento de reintentos. El archivo académico pasó **17/17** después de la corrección y el de invitaciones **39/39**. El resultado completo definitivo debe acreditarse en CI; estas corridas fallidas no se presentan como verdes.

La revisión independiente posterior comprobó también la normalización de UUID, la conservación de la última nota publicada por estudiante y la preparación explícita de mensajes vencidos en las pruebas de invitaciones, sin hallazgos bloqueantes. Es revisión de código; no sustituye la batería final ni la certificación productiva.

Se aplicaron las 26 migraciones vigentes desde cero en PostgreSQL 17 local aislado y se repitió el migrador sin cambios pendientes. La inspección de metadatos del proyecto Supabase Primary encontró esas 26 migraciones, 56 tablas públicas con RLS y FORCE RLS, los índices únicos financieros reutilizados y las columnas necesarias. No se aplicó DDL ni se consultaron registros institucionales productivos. Esta inspección no acredita una restauración de respaldo ni todos los recorridos autenticados de producción.

Base productiva antes de este incremento: `siii-three.vercel.app`, deployment `dpl_GBWZ5P1HXmKtctxGqeDC4UUUmyCT`, `target=production`, `READY`, SHA `3bef93870b8399a7a8f0446aadb16da952052ae2`. Smoke público: health/ready/login 200, dashboard redirige al login, auth/me 401; CSP, HSTS y nosniff presentes. La versión final debe verificarse de nuevo por SHA después del merge.

### Cierre local previo al PR

| Control | Resultado observado |
|---|---|
| Instalación reproducible y lockfile | `npm ci --ignore-scripts`, reconstrucción argon2/esbuild; lockfile sin cambios |
| Tipos / lint | Aprobados después de las correcciones de fixtures |
| Unitarias | 926/926, 69 archivos |
| Integración baseline completa | Última corrida 634 aprobadas, 1 fixture fallido y 35 omitidas; archivo del fixture corregido 17/17. La corrida completa definitiva corresponde a CI |
| Nuevos contratos HTTP | Personal 11/11, pagos 14/14, concurrencia docente 4/4; incluidos también en la baseline completa |
| Outbox habilitado | 100 aprobadas, 1 omitida, cuatro archivos |
| Build de producción / navegador | Build aprobado; 160/160 Playwright, incluyendo ocho casos nuevos |
| Financiero legacy0024 | 1/1 aprobado sobre el bundle productivo |
| Dependencias | `npm audit`: 0 vulnerabilidades |
| Migraciones | 26 aplicadas desde cero en PostgreSQL 17 aislado; repetición sin pendientes; sin migraciones nuevas |
| Revisión independiente | Sin bloqueos tras corregir cinco P2, UUID, nota por estudiante y fixtures temporales |

Capturas sintéticas: `.p0-local/vnext-institutional/{student,teacher,financials}-{light,dark}-360.png`. Se comprobaron 360/390/768/1024/1366/1600/1920 px en ambos temas y axe sin violaciones en las seis vistas móviles nuevas. Se inspeccionaron visualmente las capturas de estudiante y las de docente oscuro/Caja claro. Después se ajustó únicamente el placeholder compartido a “Escribe para buscar”, para no ofrecer criterios académicos dentro de Caja. CI verifica también ese texto final.

Los resultados de Actions, el SHA fusionado y la verificación de Production se registran en el PR de integración y en el informe de cierre. Este documento conserva los resultados locales originales y no atribuye éxito a una corrida fallida.
