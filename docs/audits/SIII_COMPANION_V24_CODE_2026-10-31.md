# V24 — código de historial e integración Compañero

Base SIII: `f19d8a0eacf37960aba95e9d09000ce6d4992f7f`.
Receptor de contrato fijado: `ErickRFM/Compa-ero-de-esc@190a8d7a0472edba0206168862ecf76a65c39ab5`.

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
