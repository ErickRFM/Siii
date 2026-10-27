# SIII V3 — ejecución y evidencia, 26 octubre 2026

## Punto de partida verificado

- Trunk remoto y checkout inicial: `954b4fed0253045a3ff4c6cc674dbed1ff28f038` (#116). `git fetch origin --prune` completado y rama predeterminada remota `main` comprobada con GitHub. No había PR abiertos. #40, #48 y #49 están fusionados; no se reconstruyen.
- Árbol inicial: dos scripts PowerShell ajenos sin seguimiento; se conservan intactos y fuera del commit.
- Vercel Production: `dpl_FAg4tMMAamySRTC6Vu3k5Ljs9yLG`, alias `siii-three.vercel.app`, `READY`, SHA `954b4fed…`. Este es el estado observado antes de la entrega, no el resultado del nuevo bloque.
- Compañero: main `55a1b99780ddef2cb2e9add7f82f6d6124965628`. Se mantiene el contrato inspeccionado en #116; no hay cambios de contratos ni credenciales.
- Inventario: 76 archivos de rutas API, 15 páginas institucionales, 26 migraciones históricas (0000–0025), 132 archivos de pruebas antes de este incremento. Son conteos de archivos, no cobertura funcional ni certificación productiva.
- Inspección productiva de **metadatos únicamente**, proyecto Supabase Primary `Siii`: ledger Drizzle con 26 entradas, 56 tablas públicas con RLS y FORCE RLS (56/56), cero grants a `anon`/`authenticated`/`PUBLIC`, roles `siii_app` y `siii_migrator` sin superusuario ni bypass RLS. No se leyó PII ni se ejecutó DDL. `/api/ready` productivo devolvió 200, `database:connected`, con no-store, CSP, HSTS y nosniff. Esto no acredita restauración ni flujos autenticados completos.

## Inventario de brechas con evidencia

| Área | Código existente | Clasificación y brecha real |
|---|---|---|
| Diseño y navegación | `sii-app-shell.tsx`, componentes Radix/UI, `sii-workspaces.css`, CSS institucional y capabilities | PARCIAL. Identidad mate, temas y shell existentes; faltaban cinco destinos móviles personales y el catálogo enseñaba instrucciones administrativas a alumnos |
| Expediente personal | `modules/portal/read-model.ts`, vínculos 0020 y perfil institucional | IMPLEMENTADO, PENDIENTE DE PRUEBA REAL productiva. Identidad/programa/estado/correo propios; no hay foto/domicilio/contacto editable acreditados en este esquema |
| Inscripciones | `sections`, `enrollments`, `assignments`, `portal/student/courses` | PARCIAL. Consultas propias reales; faltan ventanas/prerrequisitos y autoservicio de inscripción reglamentado |
| Calificaciones | `grading`, `grading/sections`, publicaciones/final_grades, borrador con versión | PARCIAL. Consulta de notas publicadas y captura docente existentes. Faltan rectificación con doble control y cierre académico institucional certificado |
| Inicio estudiantil | `personal-portal.tsx` incorporado por #116 | CORREGIDO EN ESTE BLOQUE: contenía próximas clases y calendario operativo contrario a V3. Se retiran del portal estudiantil; calendario docente y APIs fuente permanecen |
| Finanzas/Caja | conceptos/órdenes, pagos externos transaccionales de #116, FK de tenant 0025 | PARCIAL. Consulta propia y abonos idempotentes reales. Pasarela, conciliación, reversos, comprobantes oficiales y segregación institucional financiera aún no certificados |
| Admisiones/identidad | rutas `admissions`, claim, matrícula, invitaciones/correo/MFA | IMPLEMENTADO, PENDIENTE DE PRUEBA REAL integral con institución. Las suites existentes siguen en regresión; no se duplica su implementación |
| Servicios | tablas 0014, rutas requests/tutoring/workshops y workspace administrativo | PARCIAL. Existen operaciones administrativas; el estudiante todavía carece de creación/seguimiento de trámites, documentos emitidos y talleres personales |
| Documentos oficiales | no se localizó endpoint de emisión/verificación oficial en las rutas actuales | NO IMPLEMENTADO. CSV de historial es consulta informativa; no equivale a documento oficial |
| Trayectoria curricular | `curriculum_versions` y catálogo de materias | PARCIAL. No se acredita relación completa requisitos/equivalencias/aprobación reglamentaria; no inferir avance con conteos |
| Evaluación docente | sin endpoint funcional localizado | NO IMPLEMENTADO. Necesita periodos, población y privacidad institucional definidas |
| Seguridad | sesiones, MFA, step-up, scopes, `readVisibility`, RLS/migraciones y auditoría | PARCIAL en certificación global. No se relajan controles. Este bloque añade coherencia de contexto entre páginas personales y retiro de datos al cambiar autorización |
| Compañero | outbox/HMAC/authority/receipts, CI con Ktor/Mongo | PARCIAL. Contrato académico existente; historial estudiantil S2S no disponible en el contrato inspeccionado. La asistencia sigue en Compañero |
| Producción | Vercel Production por SHA y pruebas sintéticas CI | PENDIENTE del nuevo SHA. Sin usuario institucional real, restore auditado, dispositivo físico ni lector de pantalla manual acreditados |

Las referencias antiguas que dicen que no existían estos módulos no prevalecen sobre el código actual. Tampoco se eleva “implementado” a “flujo productivo completo”.

## Cambios del bloque institucional

El alumno navega Inicio, Académico, Finanzas, Servicios y Perfil. Inicio presenta situación oficial, órdenes pendientes reales y avisos publicados. Académico reúne inscripciones con docente, consulta de docentes y resultados publicados por periodos plegables, búsqueda/filtro y CSV informativo. La vista móvil usa tarjetas de registros y barra inferior con safe area. Los destinos de gestión se mantienen para usuarios multirrol.

El catálogo de consulta evita la preparación administrativa; inicia con registros activos y permite incluir inactivos/archivados explícitamente, respetando la autorización existente y sin modificar/borrar registros. Los responsables con capacidades de gestión conservan su guía y formularios.

La consulta personal carga sólo los recursos de la sección actual. La revalidación mantiene la vista y la búsqueda mientras el contexto sigue válido. Cada respuesta/página debe coincidir con un hash opaco de actor, sesión, institución, membresía, grants y perfil; el servidor fija las relaciones SQL al expediente resuelto. Cambios de contexto, denegación, desconexión o respuestas incoherentes retiran los datos. No hay caché persistente de expedientes. Volver a la página siempre revalida; los eventos simultáneos se agrupan sólo durante la solicitud activa.

No hay migraciones nuevas, cambios de claves, nuevas pasarelas ni modificaciones del contrato Compañero. Servicios sin contrato personal siguen indicando su preparación, sin controles que simulen operaciones.

## Verificación y revisión

Resultados intermedios observados: instalación reproducible/rebuild correctos; lockfile intacto; 26 migraciones en PostgreSQL 17 local desechable; suite personal HTTP 12/12; unitarias 926/926; primer navegador personal 13/13. Se preservan las corridas RED de las regresiones y la compilación detenida por seis imports sobrantes al extraer la tabla compartida; esos imports se retiraron antes de repetir.

La revisión independiente identificó P2: el cooldown de foco conservaba datos del expediente anterior tras un cambio de vínculo sin cambio de capabilities. La prueba `V3 focus revalidates an account relink immediately even after a recent load` reprodujo el fallo en el bundle anterior. Se eliminó ese cooldown; no se retoca autorización para resolverlo. La regresión definitiva, CI, PR, merge y SHA productivo se registrarán cuando se observen.

Regresión de navegador completa después de la corrección: **167/167 aprobadas, 11,5 minutos**, con el comando `npm run test:ui`. Incluye 15 recorridos personales/Caja, cambio de expediente inmediato, páginas con contextos diferentes, desconexión, revocación, conservación de búsqueda y catálogo de solo consulta. La matriz estudiantil añade 430 px a 360/390/tableta/escritorio. Unitarias definitivas: **926/926**; lint/typecheck aprobados; `npm audit`: **0 vulnerabilidades**. Se hará una comprobación focal adicional para el selector nativo y los colores de la barra inferior ajustados después de revisar capturas.

Se amplió el caso de pestaña oculta: una consulta anterior aún pendiente no debe impedir consultar el nuevo vínculo al regresar. La prueba adicional reprodujo el fallo; al ocultarse la página ahora se aborta esa consulta y el regreso revalida una sola vez. Su resultado GREEN y CI completo quedan pendientes de la siguiente ejecución.

La primera corrida integral se lanzó incorrectamente con `SIII_HTTP_TEST_PRODUCTION=1`: `mfa-security.test.ts` espera cookies de desarrollo `siii_session` mientras el servidor productivo usa `__Host-siii_session`. Se detuvo al identificar la diferencia (23 fallos en ese archivo) y se repite en una tercera base local vacía con la configuración estándar del workflow. No se cambiaron cookies, pruebas ni controles para acomodar el modo incorrecto. Los logs fallidos se conservan; no cuentan como evidencia verde.

Resultado estándar definitivo sobre `siii_v3_integration_test`, PostgreSQL 17 local recién migrado: **44 archivos aprobados, 636 casos aprobados y 35 omitidos (671), 806,62 segundos**. Las omisiones son las condiciones de los tests existentes, no nuevos skips. Después se ejecutaron los cuatro contratos ON del workflow: **100 aprobados y una omisión existente (101), 31,68 segundos**. No se modificaron políticas ni aserciones para obtener estos resultados.

### Cierre local del código final

| Control | Resultado observado |
|---|---|
| `npm ci --ignore-scripts` + `npm rebuild argon2 esbuild` | Aprobado; lockfile intacto |
| `npm run lint`, `npm run typecheck` | Aprobados |
| `npm test` después de la última corrección | 926/926, 69 archivos, 12,09 s |
| `npm run test:integration` estándar, base nueva | 636 aprobadas, 35 omisiones existentes, 44 archivos |
| Cuatro contratos de outbox ON | 100 aprobadas, una omisión existente |
| `npm run build` del código final | Aprobado |
| `npm run test:ui`, regresión completa anterior a los dos casos finales | 167/167, 11,5 min |
| Playwright sobre bundle final, portal + catálogo | 22/22, 50,5 s; incluye hidden/blur, relink, perfil de otra sesión/actor, segunda página incoherente, móvil/temas/axe |
| `npm run test:financial-legacy` sobre bundle final | 1/1 |
| `npm audit` | Cero vulnerabilidades |
| `git diff --check`, lockfile | Sin errores ni cambios de dependencias |

Se inspeccionaron las capturas finales estudiantiles claro/oscuro a 360 px después de usar NativeSelect y ajustar los colores de la barra inferior. La comprobación automatizada incluye 430 px. No se acredita dispositivo físico ni lector de pantalla humano. La regresión completa del último SHA, incluida la nueva cuenta de 169 casos de navegador, corresponde a CI antes del merge.

Reversión de aplicación: volver a desplegar el SHA anterior verificado `954b4fed…`; no se requiere rollback de datos para este bloque, porque no introduce DDL ni escrituras nuevas. Los clientes anteriores ignoran los nuevos headers; un cliente nuevo frente a un backend anterior falla cerrado y requiere recargar, sin reutilizar datos de otra sesión.

Evidencia local ignorada: `.p0-local/v3-portal/`; capturas sintéticas en `.p0-local/vnext-institutional/`. Los resultados locales no prueban disponibilidad de servicios externos ni datos académicos oficiales de producción.
