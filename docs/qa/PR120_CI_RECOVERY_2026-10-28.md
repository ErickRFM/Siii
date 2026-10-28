# PR #120: recuperación y cierre de CI

## Causas verificadas

Base remota `main`: `f16275e012c9a80908ccb0e6a56aea6085ee4a07`.
PR inicialmente Draft en `93d5d6044dcb6928996fcd885aed978ae526865a`.
Logs de Actions: [ejecución 40644364244](https://github.com/ErickRFM/Siii/actions/runs/40644364244).

- Recuperación: siete fallos reproducidos en PostgreSQL 17 local. El restaurador V2 devolvía `NOT_IMPLEMENTED`; el journal canónico tiene entradas 0000–0026 (27), no 28. El archivo incluye 59 tablas públicas, ledger Drizzle e historial Supabase: 61 relaciones, no 60. La prueba ahora contrasta cada hash, ID y timestamp con las migraciones reales, además del inventario explícito.
- Companion: MongoDB 8.0.34 aborta al iniciar por kernel, mensaje fatal ID 12257600 / SERVER-121912; no alcanza las pruebas y no existen sus XML. No era un problema de URI o puerto. La imagen 8.0.35 aún no estaba publicada al consultar el registro.

## Cambios y garantías

`scripts/application-backup.ts` restaura dentro de una transacción y bajo el lock de migraciones. Comprueba el destino efectivo de `pg.Client` y `current_database()`: solo loopback y nombre `p0_*`. Rechaza bases con esquemas u objetos existentes. Exige roles seguros ya aprovisionados y sin membresías heredadas. Este guard evita que la migración histórica 0003 revoque membresías globales de `siii_app`, hallazgo detectado y corregido en revisión independiente.

Valida manifiesto externo, conjuntos exactos de tablas/columnas y hashes de cada arreglo antes de reconstruir. Solo ejecuta el prefijo de migraciones del repositorio con hashes verificados y DDL auxiliar fijo. Las sentencias históricas de Supabase se insertan como datos. Conserva las ACL/RLS definidas por esas migraciones.

El JSON descifrado se mantiene en RAM del llamador y en una relación temporal PostgreSQL hasta el commit/rollback; no se interpreta con `JSON.parse` para restaurar filas. Esto preserva enteros mayores de 2^53, decimales JSON, timestamps y bytea. CHECK, NOT NULL, PK y UNIQUE permanecen activos. La carga masiva omite temporalmente triggers FK para admitir ciclos; después escanea explícitamente **todas** las FK simples/compuestas y MATCH FULL, independientemente de `convalidated`. Antes de commit compara los hashes ordenados por PK, el ledger y los registros de perfil/apéndice; ajusta la secuencia del ledger. Los errores de base se convierten en códigos estables sin datos privados.

La conexión local de recuperación necesita privilegios DDL y permiso para `SET LOCAL session_replication_role`. Si faltan, la operación falla y revierte; no eleva privilegios ni modifica la cuenta de aplicación.

El workflow fija `mongo:7.0.45` por digest `sha256:8bb4442761a63a8dda452744082cdac9644b429807eb977b42324a63cef59ca4`, mantiene loopback/puerto/URI y las cinco suites obligatorias (1+1+9+11+5). El health check hace ping real con ventana inicial de 20 s, timeout de 10 s y 20 intentos. Un fallo no se convierte en skip ni éxito: el gate informa los XML ausentes y el artifact incluye estado/health/logs acotados de servicios desechables.

Referencias oficiales: [matriz de compatibilidad](https://jira.mongodb.org/browse/SERVER-125742), [corrección del reconocimiento de kernels Ubuntu](https://jira.mongodb.org/browse/SERVER-131779). MongoDB 7.0 es compatible según esa matriz; el contrato se ejecuta contra persistencia real.

## Evidencia local

- PostgreSQL 17 en contenedor dedicado `siii-pr120-postgres`, solo `127.0.0.1:55439`; bases de recuperación aleatorias `p0_app_recovery_*` creadas y eliminadas por la suite.
- MongoDB 7.0.45 en contenedor `siii-pr120-mongo`, solo `127.0.0.1:27017`, ping real y estado `healthy`.
- Receptor fijo `127e7dfa1c6ac760652859f78df226b47d01f08e` en copia aislada; bases separadas para integración SIII y Companion.
- `npm run lint`: código 0.
- `npm run typecheck`: código 0, con Next.js detenido para evitar escrituras simultáneas de tipos generados.
- `npm test`: 74 archivos, 953/953 pruebas, incluida la regresión de avisos.
- `npm audit`: 0 vulnerabilidades.
- `npm run build`: compilación de producción aprobada. Typecheck y lint finales también aprobados antes de iniciar Playwright.
- Recuperación original: RED 7 fallos/3 éxitos; GREEN final 15/15, incluidos casos negativos de PK, historial, destino, sobrescritura y preservación de membresías globales. La regresión de membresías también se observó en RED antes del guard.

Una primera ejecución local simultánea de integración y contrato compitió por el servidor HTTP/archivo de conexión compartidos del harness. Se detuvo la integración afectada y se repiten secuencialmente en bases separadas; esa ejecución parcial no acredita el resultado final. Los jobs de GitHub ya usan máquinas separadas.

- Companion final: Gradle `BUILD SUCCESSFUL`, 27/27 pruebas. Los cinco XML reales confirman 1+1+9+11+5 tests, cero failures/errors/skipped; receptor sin modificaciones.
- `npm run test:integration`: 48 archivos aprobados, 682 pruebas aprobadas y 35 condicionadas por el perfil outbox desactivado, 745.75 s. Los cuatro archivos de outbox/autoridad/operaciones se vuelven a ejecutar con `SIII_ACADEMIC_OUTBOX_ENABLED=true`, como exige el workflow.
- Perfil outbox activado: cuatro archivos aprobados, 100 pruebas aprobadas, un caso del perfil OFF omitido (ya ejecutado en la batería general), 35.23 s. Las 35 pruebas de autoridad condicionadas se ejecutaron con éxito. Companion no tiene skips.
- `npm run test:ui`: 185/185 aprobadas, 16.0 min, bundle de producción y Chromium real. Incluye permisos, MFA, teclado, axe, dos temas y anchos móvil/escritorio. Ocho capturas nuevas: `.p0-local/pr120-evidence/{student,teacher}-*.png`, revisadas visualmente; el job UI las sube como artifact. Son datos sintéticos de PostgreSQL aislado, no usuarios de producción.
- `SIII_HTTP_TEST_PRODUCTION=1 npm run test:financial-legacy`: 1/1 aprobada en proceso dedicado, con validación HTTP y migración fail-closed del perfil financiero 0024.
- Revisión independiente: corrigió también un recorte funcional de avisos estudiantiles desde el cuarto elemento. Se retiró únicamente `.slice(0,3)`; regresión con render real del componente y cuatro avisos observada en RED antes de corregir. Se conserva el diseño existente. Revisión final aprobada sin hallazgos importantes/críticos pendientes; condicionada a CI verde.

Todos los checks locales requeridos están aprobados. Los [checks del PR #120](https://github.com/ErickRFM/Siii/pull/120/checks) registran la validación remota del commit publicado. La evidencia de fusión y disponibilidad productiva debe enlazar el SHA exacto de GitHub y Vercel después de completarse esos pasos. No se rediseñaron Estudiante ni Docente, no se modificó el receptor y no hay migraciones nuevas.
