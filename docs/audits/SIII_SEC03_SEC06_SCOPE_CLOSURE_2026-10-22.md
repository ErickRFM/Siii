# SEC-03 y SEC-06: cierre del alcance original (2026-10-22)

Estado: corregidos en codigo integrado; no certifica todos los escritores ni RLS productiva.

Revision independiente de /root/audit_frontend sobre main 5cb49f75f2731f0f2df1b35f4e034c75792fc59e, sin defecto concreto abierto en el alcance original. main fc65c14982f97bd4a0a4bc28781f2f7c19e91bb0 conserva esos consumidores y completo CI posterior verde: [run 39862602189](https://github.com/ErickRFM/Siii/actions/runs/39862602189), verify 120116781054 y ui 120116780811. Salidas leidas: 826/826 unitarias, 539/539 integracion, lint, typecheck, build, audit 0 vulnerabilidades; 121/121 UI y 1/1 gate financiero legacy. No se ejecutaron migraciones productivas.

## Matriz de evidencia

Rutas relativas a `src/app/api/v1/institutions/[institutionId]/`; numeros de linea referidos al SHA revisado. La revision fue de fuente; la ejecucion corresponde a CI, no al revisor.

| Alcance | Causa y correccion verificada | Evidencia negativa existente |
|---|---|---|
| SEC-03 POST financials/orders | Autoridad al inicio (66), transaccion (81), referencias tenant (82/85/89), auditoria (103), comprobacion final compartida | tests/integration/financial-write-authority-http.test.ts: MFA 61, auditoria rollback 85, revocacion antes del lock 90 y final 102, expiracion 114, referencias cruzadas 125, requestId 82 |
| SEC-03 POST financials/fee-types | Autoridad 51, transaccion 64, auditoria 73 y comprobacion final | Misma suite parametrizada para ambas rutas financieras |
| SEC-03 POST admissions/cycles | Autoridad 33, transaccion 46, auditoria 55 y comprobacion final | tests/integration/admissions-write-authority-http.test.ts: MFA/contexto 43/50, revocacion 57, expiracion final 61, fallo auditoria 67, requestId 47 |
| SEC-03 POST admissions/applications/[applicationId]/decision | Autoridad 19, transaccion 32, lock tenant 34, update scoped 51, auditoria before/after 53 | Misma suite de admisiones; recurso cruzado 74 y decisiones serializadas 75 |
| SEC-06 orders y decision | Registro y mutacion comparten transaccion; fallo audit revierte negocio; requestId generado en servidor | Rollbacks y correlacion anteriores, sin aceptar el requestId arbitrario del cliente |
| SEC-06 POST student-links/claim | Autoridad 20, transaccion 26, estudiante tenant 35, auditoria en ambas ramas 52/57, catch fuera de transaccion 62 | tests/integration/student-claim-authority-http.test.ts: contexto/MFA 78, tenant 85, correlacion 117/63, rollback audit 118, revocacion inicial 122, expiracion final ambas ramas 128, revocacion final auto-link 133 |

## Limites de este cierre

Helpers revisados: src/shared/auth/session.ts:43, write-access.ts:11/26/33/36, src/modules/financials/write-transaction.ts:17/19, src/modules/consolidation/domain-boundary.ts:33, prueba tests/unit/domain-boundary-capability.test.ts:46 y src/middleware.ts:4/14/16. La reproduccion y correcciones previas permanecen en sus reportes originales; esta matriz vincula esos resultados con el codigo integrado y su nueva regresion.

Permanecen pendientes la verificacion de grants/RLS y prerrequisitos de despliegue en el entorno aprobado, asi como cualquier escritor fuera de estas rutas. INT-04A trata un productor especifico de eventos y no cierra por si solo revocaciones globales, reconciliacion ni sincronizacion SIII-Companero completa.
