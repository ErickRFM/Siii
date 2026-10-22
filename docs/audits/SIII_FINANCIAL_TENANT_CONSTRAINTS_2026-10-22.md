# SEC-04 — Integridad de pagadores financieros (22 octubre 2026)

## Alcance y base

Rama fix/financial-tenant-constraints-20261022, iniciada en main63c237fa y reconciliada por fast-forward con main809c526d2deedff99b6425f07ddab7a514bb7f19 antes de los gates finales. Ownership exclusivo de0025. No modifica F2, helper83, claim, UI ni hashes/manifest/appendix históricos. PR82/83/84 ya están integrados en esa base; el CI postmerge de main809c seguía pendiente según coordinación. Esta rama requiere su propio CI y publicación.

El hueco DB financiero de SEC-04 queda implementado y verificado **localmente**. No acredita despliegue productivo, reparación automática de históricos, cierre global de SEC-03/06 ni un flujo universitario completo.

## Migración y contrato

0025_financial_payer_tenants.sql añade dos FK SQL autoritativas:

- (payer_student_id,institution_id) → institutional_students(id,institution_id), ON DELETE SET NULL (payer_student_id).
- (institution_id,payer_user_id) → institution_memberships(institution_id,user_id), ON DELETE SET NULL (payer_user_id).

Ambas usan MATCH SIMPLE, ON UPDATE NO ACTION y validación completa antes de commit. Conservan las FK escalares. Borrar alumno/membresía sólo limpia su payer; conserva institución, otro payer, importes y resto de la orden. El usuario global sigue sujeto a las restricciones de ciclo de vida existentes. Ambos payers pueden ser null o coexistir; no agrega elegibilidad académica. Graduados y membresías suspendidas siguen siendo referencias válidas.

Reutiliza las claves únicas padre existentes y añade índices hijos payment_orders_payer_student_tenant_idx(payer_student_id,institution_id) y payment_orders_payer_user_tenant_idx(institution_id,payer_user_id). Drizzle describe los índices y documenta las dos FK como SQL-only:0.45.4 no admite la lista de columnas SET NULL. No hay casts ni una FK compuesta con metadata falsa que también anule institution_id.

Requiere PostgreSQL>=15. Bajo el migrador/ledger vigente, establece lock_timeout5s y toma locks en orden fijo memberships → students → orders. Comprueba históricos con NOT EXISTS antes del DDL; cualquier inválida aborta sin borrar, nulificar, reasignar tenant ni backfill. DDL, índices y ledger revierten juntos. No confirma una fase NOT VALID.

El journal sólo anexa idx25; SQL con LF estable según .gitattributes. canonical y supabase-v1 ejecutan la misma0025 adicional. Manifest y appendix frozen permanecen intactos; el transporte existente anexa migraciones canónicas posteriores. Resultado esperado26 entradas0000–0025. No se generaron snapshots ni se invocó db:generate; futuras generaciones deben conservar las FK SQL-only.

Referencias: [column list SET NULL en PostgreSQL15](https://www.postgresql.org/docs/15/ddl-constraints.html#DDL-CONSTRAINTS-FK) y [confdelsetcols/convalidated](https://www.postgresql.org/docs/17/catalog-pg-constraint.html).

## Preflight de sólo lectura

scripts/db-preflight.ts utiliza db/financial-payer-preflight.ts: sólo SELECT y lectura de definiciones locales. Informa counts y catálogo sin IDs de órdenes/personas ni PII.

- PRE_0025 / PREPARED_FOR_0025: datos y claves padre aptos en la instantánea leída. **Exit0 previo no certifica FK instaladas.** El migrador repite la comprobación bajo locks.
- POST_0025 / VERIFIED_0025: ledger real validado mediante assertMigrationLedger, incluido perfil managed, entrada/hash0025 y forma exacta de ambas FK. Exige convalidated, MATCH SIMPLE, acciones, columnas hijo/padre y confdelsetcols limitadas al payer.
- LEDGER_DRIFT / BASELINE_REQUIRED, padre incorrecto, FK ausente/no validada/SET NULL incorrecto o referencias inválidas: BLOCKED y exit2. Cambiar timestamp/hash o borrar la entrada0025 no permite degradar un esquema instalado a preparación.

Verifica claves padre por nombre, schema, tabla, columnas, unicidad válida/completa **e inmediata**. UNIQUE DEFERRABLE no certifica preparación para FK. No ejecuta DDL ni remedia datos.

## TDD y evidencia final

PostgreSQL17.11 local127.0.0.1:55439, SIII_DATABASE_ENV=test. Las nuevas pruebas usan siii_financial_fk_*_test. Las suites existentes generan p0_migration_* / p0_managed_* UUID, autorizados por coordinación y eliminados por fixture. No se tocó siii_financial_test histórica, otra DB existente, producción ni Supabase.

RED inicial contra0000–0024:15 fallos esperados y8 controles aprobados (23 casos). INSERT/UPDATE cruzados se aceptaban; DELETE membership no limpiaba payer_user_id; faltaban catálogo/ledger26 y detección de históricos. Preflight adicional:7 RED de fase/índices/FK,2 RED de timestamp/fila de ledger. El Minor de revisión reprodujo1 RED ante UNIQUE DEFERRABLE, resuelto con indimmediate.

| Gate final sobre809c + delta revisado | Resultado |
|---|---|
| npm ci |375 paquetes; lockfile sin cambios |
| npm run lint / npm run typecheck | exit0 / exit0 |
| npm test |826/826,56 archivos,11.14s |
| npm run build | exit0; compilación16.4s,31/31 páginas; aviso basal del plugin Next en ESLint |
| npm audit --audit-level=moderate |0 vulnerabilidades |
| Integración conjunta, bundle producción3201 |144/144,115.07s:36DB +22financieros +27SEC02 +30Admisiones +29claim |
| migration-hardening + release-profile |19/19,30.27s; incluye fresh/populated/connector con migrador LOGIN NOSUPERUSER/NOBYPASSRLS y roles de migración autorizados |
| npm run test:financial-legacy |1/1,4.32s; mismo bundle producción, proceso separado |
| npm run db:preflight sobre final26 | exit0; POST_0025/VERIFIED_0025; inválidas0/0; padres/FK verificados |

Se verificó igualdad SHA256 entre SQL final en disco, SQL staged y hash0025 del ledger canónico local (26 entradas). El diff pasa la comprobación de espacios; se repitieron los gates tras normalizar el EOF del SQL nuevo.

Los36 DB usan credencial administradora de fixture para DML/catálogos/ensayos. HTTP usa LOGIN NOSUPERUSER/NOBYPASSRLS heredando siii_app, creado por el harness vigente. El gate19 es la evidencia separada del migrador managed sin superusuario; no se atribuye esa propiedad a los36 DB.

Cubre fresh/poblada0024→25 en ambos perfiles, idempotencia/ledger, rollback de DDL posterior, históricos preservados, lock_timeout, INSERT/UPDATE cruzados/inexistentes, usuario global sin membresía, cambios de tenant/key, nulls/ambos payers, graduado/suspendido y DELETE exacto sin cambiar importes/institución. Drift sólo mediante DDL sintético explícito en bases desechables.

Comandos focales, con URLs exclusivamente del cluster local:

    npm run test:integration -- tests/integration/financial-tenant-constraints.test.ts tests/integration/financial-write-authority-http.test.ts tests/integration/sensitive-institutional-lists-http.test.ts tests/integration/admissions-write-authority-http.test.ts tests/integration/student-claim-authority-http.test.ts
    npx vitest run --config vitest.outbox.config.ts tests/integration/migration-hardening.test.ts tests/integration/release-profile.test.ts
    npm run test:financial-legacy

## Legado y descubrimiento CI

La última regresión financiera plenamente migrada exige23503 al insertar directamente como fixture admin. Ya no intenta sembrar una fila prohibida por0025.

El GET histórico conserva cobertura en tests/legacy/financial-payer-http.test.ts: nueva DB baseline0000–0024; fila administrativa tenantA→alumnoB permitida por la antigua FK escalar; GET con nombres/matrícula null y0025 abortada conservando fila/ledger25. No desactiva constraints ni simula corrupción en una DB plenamente migrada.

test:integration descubre36 DB y22 financieros una sola vez por sus globs actuales. tests/legacy queda fuera de esos globs y del unitario. El nuevo comando y paso explícito verify.yml ejecutan legacy después de test:ui, reutilizando su bundle producción y con servidor global ya cerrado. No se omite ni duplica.

El setup corre en proceso Vitest dedicado, conserva handshake x-siii-test-instance, timeout y stop original; crea/retira DB UUID y rol propios. Restaura todas las variables mutadas por http-setup y los archivos fijos app-connection.json/http-server.log, incluso ante fallo de arranque. Verificación final: archivos restaurados byte a byte, sin DB/sesiones legacy remanentes. HTTP/build secuenciales.

## Revisión y límites de release

Revisión independiente sin Critical/Important; Minor indimmediate resuelto con RED→GREEN y confirmado cerrado por revisor/coordinador. Sin hallazgos abiertos. Documentación y OPmatrix se añaden sin reemplazar informes históricos.

No se ejecutó UI completa ni toda integración localmente; el gate remoto sigue obligatorio. CI nueva incluye legacy explícito, todavía pendiente de ejecutar para esta rama. Se ensayó PostgreSQL17; el mínimo15 se basa en SQL documentado, no en una matriz local de versiones.

Antes de release real: preflight sin históricos inválidos, ledger/perfil/roles revisados, backup/restauración ensayada, ventana medida para locks/indexación/validación sobre volumen real, CI/revisión y aprobación de operación. Históricos inválidos requieren reconciliación humana separada. Fallo durante0025 revierte TX; reversa posterior requiere otra migración revisada que quite sólo estas FK/índices, sin borrar filas ni reescribir historia. Sin push, PR, merge ni acción productiva desde esta tarea.

## Revalidación incremental sobre maina1c6e8c (22 octubre 2026)

Merge normal local516f374fadbdab36284e10fffdd71840d3e850f9:47f8ae82 + maina1c6e8c4117a477c2d0d75f5233e7f96870a9f80, reparación de contraste PR87. Según coordinación, dos Actions de PR87 aprobaron826unitarias/485integraciones/88UI y preview; CI postmerge39821829240 seguía en curso al reconciliar. La auditoría de main quedó íntegra como prefijo y se conservó nuestro apéndice; OPmatrix no tuvo conflicto. Ninguna modificación de0025, journal, manifest ni SQL histórico respecto a47; igualdad byte a byte comprobada.

Gates repetidos sobre esta composición: lint/typecheck exit0;826/826 unitarias en56 archivos (7.97s); build exit0, compilación8.8s y31/31 páginas. Integración conjunta144/144 en104.41s:36DB +108HTTP (22financieros+27SEC02+30Admisiones+29claim). Aclaración aritmética del apéndice histórico: donde dice36DB+114HTTP=144, el subtotal HTTP correcto es108; los144 y el desglose de la tabla anterior son correctos. El caso legacy24 es adicional:1/1 en4.82s, después del cierre del servidor global y con el mismo bundle producción3201. Los dos archivos fijos del harness se restauraron byte a byte;0 bases legacy remanentes.

Destino verificado por SELECT: DB sintética propia siii_financial_fk_verified_test en127.0.0.1:55439;26 entradas. Migración idempotente y preflight exit0 POST_0025/VERIFIED_0025, inválidas0/0, claves padre inmediatas y ambas FK completamente validadas con columnas SET NULL exactas. SHA256 del SQL en disco/47/ledger:854d99883ca76d681d57be9befeebaa45156702a3bb0475ecc6a3885ba3a9da0. El ensayo previo19 migrador/perfil conserva su evidencia sobre SQL idéntico; no se cuenta como repetido en esta corrida.

Sólo evidencia incremental local. CI de la rama y reconciliación posterior del delta de pruebas MFA/logout siguen pendientes. Sin push, PR ni operación productiva.


## Composición preparatoria PR88/89, todavía NO main (22 octubre 2026)

Merge normal local68f07622 integra0834b3525fcf30c632a08fc7e242a82fd0573b0e sobre f70283d7: guard de navegación MFA/logout de PR88, Next15.5.28 de PR89 y documentación. Son cambios revisados por coordinación, todavía no acreditados como integrados en main al preparar esta composición; CI89 estaba en curso y la publicación financiera permanece detenida. No se tocó la rama del coordinador. Se conservan ambos apéndices de auditoría; OPmatrix previa íntegra.

npm ci instaló375 paquetes y reportó0 vulnerabilidades; lockfile equivalente al SHA recibido. Lint/typecheck exit0,826/826 unitarias en56 archivos (15.34s), build Next15.5.28 exit0, compilación21.6s y31/31 páginas. Bundle nuevo, ejecución secuencial en3201:144/144 conjuntos en178.09s=36DB+108HTTP (22financieros+27SEC02+30Admisiones+29claim); legacy24 separado1/1 en6.01s. Harness restaurado byte a byte y0 DB legacy remanentes. No se atribuye a estos gates una nueva corrida UI del guard MFA: su fuente coincide con0834b352 y su gate UI pertenece a la integración de PR88.

Preflight local propio exit0 POST_0025/VERIFIED_0025, inválidas0/0 y26 entradas. Hash0025 de disco/47/ledger idéntico854d99883ca76d681d57be9befeebaa45156702a3bb0475ecc6a3885ba3a9da0. Sin diff en SQL/journal/manifest, migrador, preflight ni schema financiero respecto a f702;19 migrador/perfil conservan su evidencia anterior sobre fuentes idénticas y no se repitieron. El lockfile y tests/ui/mfa-flows.spec.ts son equivalentes a0834b352. Sólo se anexó este reporte incremental; integración real tras CI89/88 en main y CI financiero siguen pendientes. SIN PUSH ni operación productiva.


## Reconciliación con main real y gate CI aislado (22 octubre 2026)

mainf34c76fe integró PR88 y mainbe9036b6 integró PR91; los merges locales efcbcbe8 y364fec8 preservan la historia financiera. Sobre364fec8 se reconstruyó Next15.5.28 (31/31 páginas) y se ejecutaron162/162 pruebas en5 archivos (177.79s):36DB +126HTTP,22 financieras+27SEC02+30Admisiones+47claim/lectura propia. Legacy0024 separado1/1 (8.85s) reutilizó el bundle después del cierre del servidor global. Logs ignorados financial-be-build/integration/legacy/preflight.log en .p0-local. No se repitieron los19 casos previos del perfil restringido: sus fuentes permanecen idénticas.

Preflight SELECT-only de la DB sintética siii_financial_fk_verified_test en127.0.0.1:55439: exit0,VERIFIED_0025,constraintsVerified=true,blocked=false,0/0 referencias inválidas,26 entradas de ledger. SHA2560025 inalterado854d99883ca76d681d57be9befeebaa45156702a3bb0475ecc6a3885ba3a9da0. Ninguna URL productiva ni cambio de datos institucionales.

Merge normal74b8343c añade exclusivamente el workflow/documentación de main4614b320 (PR99). Se comprobó igualdad estructural completa de verify/ui contra main excepto un único paso legado, idéntico al probado, ahora en ui inmediatamente después de test:ui con SIII_HTTP_TEST_PRODUCTION=1; se preservan timeout25, artefactos obligatorios, triggers, permisos, acciones fijadas y todos los gates. SQL/API/tests permanecen idénticos al SHA364fec8 ensayado; no se atribuye una nueva ejecución a esta reconciliación de CI. La corrida remota completa y revisión del SHA publicado siguen siendo requisitos antes del merge.
