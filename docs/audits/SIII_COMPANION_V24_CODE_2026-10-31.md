# V24 — código de historial e integración Compañero

Se reconciliaron los cambios HMAC de `main@7150280` (#158), sin modificar su activación ni secretos.

Base inicial SIII: `f19d8a0eacf37960aba95e9d09000ce6d4992f7f`.
Receptor de contrato fijado: `ErickRFM/Compa-ero-de-esc@c0ccd27b0eec9bd1a0f583be5e0b0fd484e8a00b`.

Corrección verificada (2026-11-03): `a08244d001d8a65cac9b09ec166e4fbb1e1c6175` fue un SHA intermedio y quedó **superado** por `c0ccd27…` (compare GitHub `a08244d...c0ccd27`: `status ahead`, `ahead_by 7`, `behind_by 0`). El receptor real fijado por el código está en `.github/workflows/verify.yml` (`ref` de checkout y `rev-parse HEAD`), no en este documento.

El usuario reservó las pruebas para sí: «Solo trabaja en codigo, las pruebas las hago yo». No se ejecutaron suites, piloto, migraciones ni despliegues en esta entrega.

| Función | Archivos | Validación de código | Pruebas preparadas |
| --- | --- | --- | --- |
| Etiquetas oficiales revalidadas | `src/integrations/companion/attendance-subject.ts`, endpoint `companion-attendance/mine` | Materia, grupo, docente y periodo solo de inscripciones autorizadas; revalidación antes/después y auditoría existentes | `personal-attendance-route.test.ts`, `personal-attendance.test.ts` |
| Historial y filtros | `src/components/personal-attendance.tsx`, `src/integrations/companion/attendance-view.ts` | Filtros por materia/periodo, búsqueda y tabla responsive; etiquetas solo coinciden por sección y versión | `attendance-view.test.ts` |
| Contrato real cruzado | `.github/workflows/verify.yml` | Fija receptor V24 y exige además cuatro regresiones de avisos oficiales sin omisiones | Job `Companion live contract`, pendiente de ejecución |

Ejecutados y aprobados: `npm run typecheck`, `npm run lint`, `npm run build` y revisión estática independiente. Las pruebas escritas no se ejecutaron localmente.

No se almacena asistencia en SIII: Ktor sigue siendo la única autoridad del registro, decisión docente y corrección. El payload HMAC entre servicios conserva su contrato estricto; las etiquetas se agregan al resultado personal SIII tras revalidar autoridad. No expone matrícula, identidad nativa, enlace de cuenta ni configuración privada.

El alcance histórico sigue limitado a inscripciones vigentes y 100 registros. La disponibilidad de periodos en filtros depende de los registros y autoridad actuales. No se afirma archivo ilimitado ni lectura productiva.

El receptor V24 incorpora QR docente/alumno, ingreso requerido para iniciar pase, destinatarios elegibles, revalidación de FCM, ausencias al cierre, revisión histórica y avisos oficiales durables. Los avisos son genéricos; recibirlos no confirma asistencia. Las APK locales de referencia requieren configuración pública Firebase autorizada para probar FCM en Académica; Gestión conserva FCM deshabilitado por aislamiento.

Pruebas funcionales, matrices Android API 31/35, FCM real y piloto físico: a cargo del usuario. No fusionar antes de CI verde y revisión. V24 no está desplegado por esta entrega.

## Estado de evidencia verificable (2026-11-03)

- **Verificado (CI de `main`):** el job `Companion live contract` del run `verify.yml` `41586201078` sobre `1d7d799` pasó con las **7 suites nativas** exigidas (`tests=1,1,9,11,5,8,4`; `failures=0 errors=0 skipped=0`), receptor fijado `c0ccd27…` y artefacto `companion-live-contract` adjunto. Los jobs `verify` y `ui` también pasaron.
- **Verificado (local):** `npm run typecheck`, `npm run lint`, `npm test` (1060 unitarias) en verde.
- **No verificado:** las afirmaciones de "ejecutados y aprobados" sin artefacto (línea 18) no se acreditan por sí mismas; el conteo real de unitarias es responsabilidad del CI. FCM real, dispositivos físicos, Firebase y E2E remoto permanecen **PENDIENTES**.
- **SHA del receptor:** fuente única de verdad en `.github/workflows/verify.yml` (`ref` de checkout y `rev-parse HEAD`), no en este documento.
