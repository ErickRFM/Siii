# P1 — revisión de administración institucional (F09)

Fecha: 2026-10-15. Base e2180879aef284239997e3769e450d7a288893b4, rama dependiente codex/p1-institution-admin. Las revisiones de fuente no ejecutan SQL, servidor o correo y no leen credenciales.

## Alcance y decisiones

Contexto de gestión propia separado de institutionAccess/readVisibility/lockInstitutionContext de negocio. Sólo concesión institucional admin/super_admin vigente, membresía activa y MFA verificada permiten metadata, estado y auditoría propia, incluso con unidad inactiva/suspendida. Archived conserva lectura y prohíbe mutaciones. No se introduce autoridad global ni creación de instituciones desde el rol institucional.

Migración0010 ya aplicada y congelada: 1B9C2C7BEF3C193D09956E2D249FA9463B58C92846C7FC6B77902B29C00FE602, admin_version y CHECK>=0. SQL0–9 intactos. Índice existente de auditoría por institución/created_at y límite100; no se añadió otro índice sin evidencia de plan/carga. No hay afirmación de capacidad a gran escala.

## Inspección temprana del coordinador y correcciones

- Comparación lexicográfica de fechas ISO de distinta precisión podía rechazar un intervalo válido o aceptar su inverso. RED unitario confirmado; normalización temporal antes de comparación y del vínculo de cursor. Tres unitarias finales verdes cubren además la frontera de proyección.
- Se añadió comprobación final de visibilidad de settings y UUID del helper server antes de SQL; evita DTO tras pérdida de autoridad y PG22P02/500 por ruta inválida.
- Una escritura podía esperar al índice único, outbox o auditoría después del último chequeo de step-up. Se añadió comprobación temporal posterior a la última escritura/auditoría que lanza excepción para revertir toda la transacción; no devuelve un error confirmando cambios previos. RED real: auditoría demorada devolvía200 en vez de403; repetición corregida verde.
- UI: límites coherentes con backend, acceso explícito a confirmación de identidad/retorno, key por institución, comprobación del id del DTO, abort al salir y preservación de borrador/recarga explícita ante409. Proyección de auditoría propia, sin reutilizar historial de perfil que incluye contacto institucional.

## Evidencia dirigida backend

Primer RED de endpoint404 antes de implementar. Suite inicial14/14 verde. Tanda ampliada26:21 verdes y5 fallos de fixtures (clave institucional constante, tres variantes sin mutación y key sintética ausente para transporte inyectado). Se corrigieron las fixtures; no se interpretaron esas variantes como cobertura hasta ejecutar la mutación real. Repetición final26/26 verde,51,19s;3/3 unitarias,typecheck y lint dirigido salida0. API key de fixture restaurada en finally y worker siempre con transporte sintético, sin red. Se liberó3107 antes de la verificación UI.

Cobertura: tenant/scope/MFA; revalidación tras mutex de revocación, caducidad, versión de sesión, factor, membresía y step-up; versión comparada después de espera; rollback completo por auditoría; token revocado tras reactivación; cola/lease cancelados y respuesta tardía incapaz de resucitar entrega; identidad/concesiones conservadas; metadatos de mensaje ya aceptado conservados; auditoría proyectada, filtros normalizados/cursor y privilegios del schema existente.

## Primera pasada independiente integral

Paquete F0AFDA1B51FCA53CDD5FC6321861BBDFE2223A61E2CD798F992535A20495DA93 incluye backend, SQL/Drizzle, rutas, UI, shell/discovery y pruebas. Resultado en ejecución. La única diferencia posterior informada al revisor es quitar un binding username sin uso en una fixture; producción permaneció estable.

UI dirigida, segunda pasada, QA global y CI siguen pendientes de registro. No se declara F09/P1 completa y no se modifica el estado abierto de [BLOCKERS](../BLOCKERS.md).

## Resultado de primera revisión y Chromium inicial

Primera pasada independiente del paquete F0AFDA…95DA93: un P2 de validación, sin otros P1/P2 confirmados. El año0000 supera z.iso.datetime pero PostgreSQL lo rechaza al construir el filtro; debe responder INVALID_PAGE400 antes de SQL. Defecto identificado también por el implementador; corrección y negativos coordinados tras liberar el navegador, sin mutar código durante pruebas.

Chromium inicial:7/8 verdes,3,0min. El único fallo reprodujo que la lista segura de retorno en Cuenta y seguridad no admitía /admin (tampoco /users de F06): el step-up real pasaba pero faltaba el enlace de retorno. Se autorizó y aplicó una corrección puntual para añadir ambos segmentos conservando la expresión UUID anclada y el rechazo de URLs externas; prueba focal en curso. No se aumentaron timeouts. También se retiró copy obsoleto que presentaba recuperación de cuenta como futura.

## Segunda pasada independiente

Paquete corregido 7642D97573661EABA2F31CF4CD53F442267B7942D2422C050978320AE3D87BD7 verificado, cero discrepancias entre manifest y archivos al cierre. P2 del año0000 cerrado en código y cobertura: mínimo año1 para from/to antes de Date.parse; RED unitario y HTTP500 reproducidos, luego4/4 unitarias y1/1 HTTP focal verdes (27casos totales,26 omitidos por selección). Ambas variantes from/to exigen INVALID_PAGE400. SQL0010 conserva su hash congelado.

Retorno de seguridad: segundo examen confirma que se añadieron únicamente admin|users a la lista existente con prefijo institucional fijo, expresión anclada y nueva autorización en el destino. Se conservan el rechazo de URL externa/protocolo/barras invertidas/segmentos arbitrarios y la fuente previa de access/handlers/UI fuera de ese cambio. Focal Chromium corregido1/1 verde20,5s; el conjunto completo se valida en QA global.

Dictamen independiente favorable, sin nuevos P1/P2 identificados, condicionado a QA global, CI y merge approved. El revisor no ejecutó pruebas/SQL/servidores/escrituras; comprobó fuente y cobertura, distinguiendo la evidencia ejecutada por el implementador.

## QA global, primera etapa

El coordinador ejecutó npm ci, typecheck y lint con salida0,682/682 unitarias (24archivos), migrador real repetido MIGRATIONS_APPLIED y243/243 integraciones (15archivos,322,35s). Solicitud temporal de ejecución liberada. Chromium40, build, manifest de rutas, audit y diff-check siguen en ejecución sobre la misma fuente congelada.

## Regresión global MFA: fixture de caducidad

La primera etapa global UI terminó39/40 verdes (5,6min). Sólo falló el test anterior de activación MFA vencida, sin cambios de implementación MFA frente a e2180879. Se conservaron captura/contexto/trace ignorados antes de repetir. Los registros reales demostraron que la fixture expires_at=21:17:12.505Z todavía estaba1194ms en el futuro respecto al now usado por Next (factor.enabled_at/consumed_at=21:17:11.311Z); la auditoría PostgreSQL marcó21:17:13.577Z. El proceso web mostró un desfase transitorio de2266ms; las mediciones pareadas posteriores Node-worker/DB dieron0–1ms. No se cambió el reloj ni se extrapoló este dato al hosting.

La fixture anterior usaba now() de DB menos un segundo y no comprobaba la fila modificada. Se corrigió exclusivamente tests/ui/mfa-flows.spec.ts: esperar enrollment201, usar su id y usuario exactos, fijar una fecha inequívocamente pasada, comprobar RETURNING/rowCount1/expiración DB y Node, y exigir401 MFA_ENROLLMENT_EXPIRED antes del mensaje/foco UI y nueva clave. MFA de producción permanece idéntico; no hay sleeps, timeouts aumentados, skips ni bypass.

Correctivo focal1/1 verde14,7s, typecheck/lint0. Revisión independiente puntual favorable, sin hallazgos: diff533D5D646E23D4A6551C853536BD6C4D533A5C2BEE44B802EB737065B6C6D78D; test2AF3F186E09D34180FBFC342B1F720C4D08600A85E455E24E9D379EDBF1AB0EB; manifest final65DD9786A6F9F27DD11DEB475E850771BFEA7DE67F87FDCD1174BABC514630A3 sin discrepancias. Se repite la etapa completa40UI/build/audit;682unitarias y243integraciones previas siguen correspondiendo a la misma implementación sin cambios.

## Segunda regresión global: secuencia de revocación UI

La repetición global terminó39/40 verdes (6,2min); el MFA corregido pasó. Falló únicamente el test de revocación de administración al intentar pulsar un botón ya deshabilitado. La traza demostró GET auditoría403 y capabilities403 mientras la consulta inicial seguía pendiente; el403 de auditoría llegó antes de terminar actionability del clic. Hubo cero PATCH/POST settings/status. La UI retiró el historial y bloqueó correctamente las acciones conservando el borrador.

La fixture administrator esperaba sólo el encabezado antes de revocar roles, sin esperar la carga inicial de auditoría. Se coordina corrección exclusiva de prueba: esperar GET auditoría200 y región no ocupada/botón habilitado antes de revocar; después comprobar PATCH403 FORBIDDEN y los mismos efectos de UI. Sin cambiar producción, sleeps, skips ni timeouts. Copia previa SHA5762969ABF48811CF1602428284A63000752E290EE4466D861C1B73D9AD81FA5 y evidencia privada preservadas para revisión puntual.

Corrección de sincronización completada: focal1/1 verde25,9s, typecheck/lint0. Revisión independiente puntual favorable: conserva GET200 inicial, fin de carga y botón habilitado antes de revocar; luego exige PATCH403 real y conserva borrador/controles bloqueados/historial oculto/archivo. No cambia producción ni seguridad. DiffB6AD0303C1B0145F79BD18A2D970946E5F66D514EC354F75B18802FC215EE5B5; testAAE7C59E6241A1C85C61DB29D6DCEAD1D9138140BC04BCFCD17DFE68CFD87B13; manifest de release2BCE2931E8E9BC9D7E02A01154209035899EFBB5C8B905BE7458957BDC0589BC con cero discrepancias. Última etapa completa40UI/build/audit iniciada con estas dos fixtures corregidas; la implementación coincide con la segunda revisión y con682unitarias/243integraciones ya verdes.

## Cierre de QA local del coordinador

La última ejecución completa pasó40/40 Chromium (5,2min), incluyendo8/8 F09. Build salida0; se compararon todas las páginas y handlers de src/app con el manifest compilado:50rutas presentes. Audit0vulnerabilidades; diff-check y lockfile intactos. Junto con npmci/typecheck/lint,682unitarias, migración repetida y243integraciones de la primera etapa, queda verificada la misma implementación revisada. Se liberó la solicitud temporal de ejecución. No se incrementaron timeouts ni se cambiaron contratos productivos para corregir las fixtures.

Resultado de fuente favorable tras dos pasadas y dos revisiones puntuales adicionales. CI se comprobará sobre el SHA publicado y se registrará en el PR y la entrega exportada, evitando crear otro commit sólo para insertar su propio hash. Merge/P0/producción siguen sujetos a las puertas externas documentadas.

## Artefacto SQL LF publicado y evidencia Windows

La huella1B9C2C7BEF3C193D09956E2D249FA9463B58C92846C7FC6B77902B29C00FE602 citada arriba identifica los bytes del archivo Windows ensayado (un CRLF), no el blob canónico publicado. La regla histórica .gitattributes sql eol=lf convierte ese separador a LF al preparar Git; SHA256 del blob0010: E082937CD0326A2376E74E11505E8EFD0DCBFE1B6D8B89BAF095579947E7DD49. El SQL lógico es idéntico, pero el migrador compara hashes crudos: no son checksums intercambiables.

Se conservó p1_institution_admin_test y su ledger sin cambios. No debe reutilizarse con checkout LF: el guard devolvería correctamente MIGRATION_LEDGER_DRIFT. Para validar el artefacto publicable, se registró el inventario y creó exclusivamente otra base local p1_institution_admin_lf_test desde template0. Se extrajeron los once SQL y journal completos de los blobs staged de Git a carpeta ignorada, y se ejecutó el CLI db/migrate.ts original desde ese cwd, sin modificarlo. Primera aplicación y repetición devolvieron MIGRATIONS_APPLIED; ledger exacto11/11 hashes+fechas contra Drizzle, y columna integer NOT NULL DEFAULT0 verificados. Resultado2026-10-15T21:40:42Z. Ninguna reescritura de SQL histórico, hash/ledger existente o guard; sin operaciones cloud. Usar la nueva base LF para futuras pruebas del checkout canónico.

Revisión independiente de esta区分 favorable, sin P1/P2 adicionales, condicionada a ese ensayo LF ya ejecutado. La CI verificará además el checkout LF fresco. El control de fuente previo sigue identificando los bytes Windows revisados; el checksum Git publicado queda identificado separadamente aquí.

## Primera CI de F09 y espera del detalle de usuarios

Commit inicial F09 c07d22c6c8b45c60c6c38fdaa5e969d13974097b, PR25 dependiente de24. La CI push38811760203 pasó682unitarias/243integraciones/40Chromium/build/audit0. La CI PR38811807434 pasó682/243 y39/40 Chromium; falló sólo el primer detalle de usuario F06 al esperar5segundos su username visible. Los ocho casos F09 y los dos MFA pasaron en ambas. El workflow no conservó artefactos de traza o servidor de esa CI; el log permite identificar la aserción fallida, pero no demostrar el estado HTTP o la duración exacta de esa petición. La compilación inicial de rutas Next development es una hipótesis, no una causa observada concluyente.

La inspección no encontró un reset de selección por las cargas normales de listado/capacidades: detalle e historial conservan sus guards por id/generación y abort. Se prepara una reproducción controlada reteniendo una respuesta GET real200 y una mejora exclusivamente del helper open: registrar la petición exacta antes del clic, esperar HTTP200, validar id de membresía y username, y conservar después la misma aserción DOM. Sin sleeps, aumentos de timeout, retries, skips ni cambios de producto. Resultados corregidos y CI del nuevo commit se registran posteriormente.
Correctivo posterior: suite original de usuarios7/7 verde (1,8min), typecheck/lint0, puerto3107 libre y solicitud temporal liberada. La implementación/schema/config siguen idénticos a c07d22c6, que tiene QA local682/243/40 y CI push completa verde. El único cambio de prueba se verificó además con RED controlado y GREEN1/1 (41,8s) de una respuesta real retenida. Métricas finales, ampliadas con la suite7 y la infraestructura separada: C9061CBBB12F6DE347C9C3279C1EAF1D21A2D5ADCF52D17AFF75EBB148D6E3D2. El SHA anterior de métricas identifica el corte previo a incorporar esa ejecución; no cambia la fuente congelada C64D36…D26C. CI del nuevo SHA se comprobará y registrará en PR25/entrega exportada. No se afirma una causa temporal concluyente del fallo inicial CI ni se modifica ningún guard para ocultarlo.
